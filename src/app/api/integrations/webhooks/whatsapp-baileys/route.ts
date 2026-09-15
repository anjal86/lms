import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { verifyWhatsappBridgeSignature } from '@/lib/integrations/whatsapp-baileys';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type BridgeEnvelope = {
  instanceId?: string;
  event?: string;
  emittedAt?: string;
  data?: Record<string, unknown>;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function connectionConfig(value: unknown) {
  const config = record(value);
  return config.transport === 'baileys' ? config : null;
}

function deliveryStatus(value: unknown) {
  const status = Number(value);
  if (status >= 4) return { delivery_status: 'read', read_at: new Date().toISOString(), delivered_at: new Date().toISOString() };
  if (status === 3) return { delivery_status: 'delivered', delivered_at: new Date().toISOString() };
  if (status === 2) return { delivery_status: 'sent' };
  if (status === 0) return { delivery_status: 'failed', failure_code: 'whatsapp_delivery_failed' };
  return null;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  let verified = false;
  try {
    verified = verifyWhatsappBridgeSignature(rawBody, request.headers.get('x-whatsapp-signature'));
  } catch (error) {
    console.error('Baileys webhook verification configuration error:', error);
    return NextResponse.json({ error: 'WhatsApp bridge webhook is not configured.' }, { status: 503 });
  }
  if (!verified) return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 401 });

  let payload: BridgeEnvelope;
  try {
    payload = JSON.parse(rawBody) as BridgeEnvelope;
  } catch {
    return NextResponse.json({ error: 'Invalid webhook payload.' }, { status: 400 });
  }

  const instanceId = String(payload.instanceId || '');
  const event = String(payload.event || '');
  const data = record(payload.data);
  if (!instanceId || !event) return NextResponse.json({ error: 'Incomplete webhook payload.' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: connection, error: connectionError } = await admin
    .from('integration_connections')
    .select('id,provider,display_name,config')
    .eq('id', instanceId)
    .eq('provider', 'whatsapp')
    .maybeSingle();
  if (connectionError) {
    console.error('Baileys webhook connection lookup failed:', connectionError.message);
    return NextResponse.json({ error: 'Unable to resolve WhatsApp connection.' }, { status: 500 });
  }
  if (!connection || !connectionConfig(connection.config)) {
    return NextResponse.json({ ignored: true, reason: 'Unknown Baileys connection.' });
  }

  const now = new Date().toISOString();

  if (event === 'connection.update') {
    const bridgeStatus = String(data.status || '');
    const status = bridgeStatus === 'connected'
      ? 'connected'
      : bridgeStatus === 'qr' || bridgeStatus === 'connecting'
        ? 'pending'
        : bridgeStatus === 'disconnected'
          ? 'disconnected'
          : 'needs_attention';
    const patch: Record<string, unknown> = {
      status,
      last_event_at: now,
      last_error: typeof data.error === 'string' ? data.error : null,
    };
    const phone = String(data.phone || '').replace(/\D/g, '');
    if (phone) patch.external_account_id = phone;
    if (status === 'connected') patch.last_sync_at = now;
    await admin.from('integration_connections').update(patch).eq('id', instanceId);
    return NextResponse.json({ ok: true });
  }

  if (event === 'message.status') {
    const messageId = String(data.id || '');
    const patch = deliveryStatus(data.status);
    if (messageId && patch) {
      await admin
        .from('lead_messages')
        .update(patch)
        .eq('connection_id', instanceId)
        .eq('provider', 'whatsapp')
        .eq('external_message_id', messageId);
    }
    await admin.from('integration_connections').update({ last_event_at: now }).eq('id', instanceId);
    return NextResponse.json({ ok: true });
  }

  if (event !== 'message') return NextResponse.json({ ignored: true });

  const externalMessageId = String(data.id || '');
  const phone = String(data.phone || '').replace(/\D/g, '');
  const origin = String(data.origin || 'customer');
  const fromMe = Boolean(data.fromMe);
  if (!externalMessageId || !phone) return NextResponse.json({ ignored: true, reason: 'Message has no ID or phone number.' });

  // Messages sent by the CRM are inserted before transport delivery and finalized with
  // the provider ID, so the echo from Baileys must not create a second timeline row.
  if (fromMe && origin === 'bridge_api') {
    await admin.from('integration_connections').update({ last_event_at: now }).eq('id', instanceId);
    return NextResponse.json({ ok: true, echo: true });
  }

  const { data: existing } = await admin
    .from('lead_messages')
    .select('id')
    .eq('provider', 'whatsapp')
    .eq('connection_id', instanceId)
    .eq('external_message_id', externalMessageId)
    .maybeSingle();
  if (existing) return NextResponse.json({ ok: true, duplicate: true });

  const sentAt = typeof data.timestamp === 'string' && !Number.isNaN(new Date(data.timestamp).getTime())
    ? new Date(data.timestamp).toISOString()
    : now;
  const messageType = typeof data.messageType === 'string' ? data.messageType : 'text';
  const body = typeof data.body === 'string' ? data.body : null;
  const jid = String(data.jid || `${phone}@s.whatsapp.net`);
  const customerName = typeof data.pushName === 'string' && data.pushName.trim()
    ? data.pushName.trim()
    : `WhatsApp ${phone}`;
  const metadata = {
    transport: 'baileys',
    jid,
    origin,
    file_name: typeof data.fileName === 'string' ? data.fileName : null,
    mime_type: typeof data.mimeType === 'string' ? data.mimeType : null,
    media_available_on_device: data.mediaAvailableOnDevice === true,
    synced_realtime: true,
  };

  const { data: ingestResult, error: ingestError } = await admin.rpc('ingest_channel_message', {
    p_lead_id: null,
    p_connection_id: instanceId,
    p_provider: 'whatsapp',
    p_external_thread_id: `baileys:${instanceId}:${phone}`,
    p_external_contact_id: phone,
    p_customer_name: customerName,
    p_customer_phone: `+${phone}`,
    p_customer_email: null,
    p_customer_avatar_url: null,
    p_external_message_id: externalMessageId,
    p_direction: fromMe ? 'outbound' : 'inbound',
    p_message_type: messageType,
    p_body: body,
    p_sent_at: sentAt,
    p_message_metadata: metadata,
    p_conversation_metadata: { transport: 'baileys', instance_id: instanceId, whatsapp_jid: jid },
    p_source_label: 'WhatsApp',
  });

  if (ingestError) {
    console.error('Baileys WhatsApp message ingest failed:', ingestError.message);
    return NextResponse.json({ error: 'Unable to log WhatsApp message.' }, { status: 500 });
  }

  await admin.from('integration_connections').update({ last_event_at: now, last_error: null }).eq('id', instanceId);
  return NextResponse.json({ ok: true, result: ingestResult || null });
}
