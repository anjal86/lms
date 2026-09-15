import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { fetchWhatsappBridgeMedia, verifyWhatsappBridgeSignature } from '@/lib/integrations/whatsapp-baileys';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type BridgeEnvelope = {
  instanceId?: string;
  event?: string;
  emittedAt?: string;
  data?: Record<string, unknown>;
};

type ConnectionRow = {
  id: string;
  provider: string;
  display_name: string;
  config: unknown;
  workspace_id: string | null;
  connected_by: string | null;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'attachment';
}

function mimeExtension(mime: string): string {
  const lower = mime.toLowerCase();
  if (lower.includes('jpeg') || lower.includes('jpg')) return 'jpg';
  if (lower.includes('png')) return 'png';
  if (lower.includes('webp')) return 'webp';
  if (lower.includes('gif')) return 'gif';
  if (lower.includes('mp4')) return 'mp4';
  if (lower.includes('quicktime')) return 'mov';
  if (lower.includes('ogg') || lower.includes('opus')) return 'ogg';
  if (lower.includes('mpeg') || lower.includes('mp3')) return 'mp3';
  if (lower.includes('pdf')) return 'pdf';
  return 'bin';
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

function boundedProgress(value: unknown) {
  const progress = Number(value);
  if (!Number.isFinite(progress)) return null;
  return Math.min(100, Math.max(0, Math.round(progress)));
}

function timestampRange(messages: unknown[]) {
  const timestamps = messages
    .map((item) => record(item).timestamp)
    .filter((value): value is string => typeof value === 'string')
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  if (!timestamps.length) return { oldest: null, newest: null };
  return {
    oldest: new Date(timestamps[0]).toISOString(),
    newest: new Date(timestamps[timestamps.length - 1]).toISOString(),
  };
}

async function resolveWorkspaceId(
  connection: ConnectionRow,
  admin: ReturnType<typeof createSupabaseAdminClient>
) {
  if (connection.workspace_id) return connection.workspace_id;
  if (!connection.connected_by) return null;
  const { data } = await admin
    .from('profiles')
    .select('workspace_id')
    .eq('id', connection.connected_by)
    .maybeSingle();
  return data?.workspace_id || null;
}

async function updateHistoryJob(
  instanceId: string,
  batchData: Record<string, unknown>,
  rawMessages: unknown[],
  admin: ReturnType<typeof createSupabaseAdminClient>,
  now: string
) {
  const { data: job } = await admin
    .from('whatsapp_history_sync_jobs')
    .select('*')
    .eq('connection_id', instanceId)
    .in('status', ['queued', 'requested', 'receiving'])
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!job) return;

  const progress = boundedProgress(batchData.progress);
  const batchIndex = Number(batchData.batch_index);
  const batchTotal = Number(batchData.batch_total);
  const isLatest = batchData.is_latest === true;
  const finalChunk = isLatest && (
    !Number.isFinite(batchTotal)
    || batchTotal <= 1
    || (Number.isFinite(batchIndex) && batchIndex >= batchTotal - 1)
  );
  const complete = finalChunk || progress === 100;
  const range = timestampRange(rawMessages);

  const oldest = [job.oldest_message_at, range.oldest]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);
  const newest = [job.newest_message_at, range.newest]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);

  await admin
    .from('whatsapp_history_sync_jobs')
    .update({
      status: complete ? 'completed' : 'receiving',
      messages_received: Number(job.messages_received || 0) + rawMessages.length,
      sync_type: typeof batchData.sync_type === 'string' ? batchData.sync_type : job.sync_type,
      progress: progress ?? job.progress,
      is_latest: isLatest || Boolean(job.is_latest),
      oldest_message_at: oldest.length ? new Date(Math.min(...oldest)).toISOString() : null,
      newest_message_at: newest.length ? new Date(Math.max(...newest)).toISOString() : null,
      completed_at: complete ? now : null,
      updated_at: now,
      error: null,
    })
    .eq('id', job.id);
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
    .select('id,provider,display_name,config,workspace_id,connected_by')
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

  const typedConnection = connection as ConnectionRow;
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

  if (event === 'lid-mapping.update') {
    const lid = String(data.lid || '');
    const pn = String(data.pn || '');
    const workspaceId = await resolveWorkspaceId(typedConnection, admin);
    if (workspaceId && lid && pn) {
      const phone = pn.replace(/@.*$/, '').replace(/\D/g, '');
      await admin
        .from('whatsapp_identity_mappings')
        .upsert({
          workspace_id: workspaceId,
          connection_id: instanceId,
          lid_jid: lid,
          pn_jid: pn.includes('@') ? pn : `${pn}@s.whatsapp.net`,
          phone_number: phone || null,
          last_seen_at: now,
        }, { onConflict: 'connection_id,lid_jid' });
    }
    await admin.from('integration_connections').update({ last_event_at: now }).eq('id', instanceId);
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

  if (event === 'messages.batch') {
    const rawMessages = Array.isArray(data.messages) ? data.messages : [];
    let count = 0;
    for (const item of rawMessages) {
      const msgData = record(item);
      const result = await ingestSingleMessage(msgData, instanceId, admin, now, true, data.sync_type);
      if (result) count += 1;
    }
    await updateHistoryJob(instanceId, data, rawMessages, admin, now);
    await admin
      .from('integration_connections')
      .update({ last_event_at: now, last_sync_at: now, last_error: null })
      .eq('id', instanceId);
    return NextResponse.json({ ok: true, count });
  }

  if (event !== 'message') return NextResponse.json({ ignored: true });

  const result = await ingestSingleMessage(data, instanceId, admin, now, false, null);
  await admin.from('integration_connections').update({ last_event_at: now, last_error: null }).eq('id', instanceId);
  return NextResponse.json({ ok: true, result });
}

async function ingestSingleMessage(
  data: Record<string, unknown>,
  instanceId: string,
  admin: ReturnType<typeof createSupabaseAdminClient>,
  now: string,
  historical: boolean,
  syncType: unknown
) {
  const externalMessageId = String(data.id || '');
  const phone = String(data.phone || '').replace(/\D/g, '');
  const origin = String(data.origin || 'customer');
  const fromMe = Boolean(data.fromMe);
  if (!externalMessageId || !phone) return null;

  if (fromMe && origin === 'bridge_api') {
    return { echo: true };
  }

  const { data: existing } = await admin
    .from('lead_messages')
    .select('id')
    .eq('provider', 'whatsapp')
    .eq('connection_id', instanceId)
    .eq('external_message_id', externalMessageId)
    .maybeSingle();
  if (existing) return { duplicate: true };

  const sentAt = typeof data.timestamp === 'string' && !Number.isNaN(new Date(data.timestamp).getTime())
    ? new Date(data.timestamp).toISOString()
    : now;
  const messageType = typeof data.messageType === 'string' ? data.messageType : 'text';
  const body = typeof data.body === 'string' ? data.body : null;
  const jid = String(data.jid || `${phone}@s.whatsapp.net`);
  const customerName = typeof data.pushName === 'string' && data.pushName.trim()
    ? data.pushName.trim()
    : `WhatsApp ${phone}`;
  const metadata: Record<string, unknown> = {
    transport: 'baileys',
    jid,
    origin,
    file_name: typeof data.fileName === 'string' ? data.fileName : null,
    mime_type: typeof data.mimeType === 'string' ? data.mimeType : null,
    media_available_on_device: data.mediaAvailableOnDevice === true,
    synced_realtime: !historical,
    history_sync_type: historical && typeof syncType === 'string' ? syncType : null,
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
    return null;
  }

  const ingested = record(ingestResult);
  const conversationId = typeof ingested.conversation_id === 'string' ? ingested.conversation_id : null;
  const messageId = typeof ingested.message_id === 'string' ? ingested.message_id : null;

  if (conversationId && messageId && messageType !== 'text') {
    let mediaBuffer: Buffer | null = null;
    let resolvedMimeType = typeof data.mimeType === 'string' ? data.mimeType : 'application/octet-stream';

    if (typeof data.mediaBase64 === 'string' && data.mediaBase64.length > 0) {
      try {
        mediaBuffer = Buffer.from(data.mediaBase64, 'base64');
      } catch {
        // Fallback to fetch from bridge
      }
    }

    if (!mediaBuffer && data.mediaAvailableOnDevice) {
      const fetched = await fetchWhatsappBridgeMedia(instanceId, externalMessageId);
      if (fetched) {
        mediaBuffer = fetched.buffer;
        if (fetched.contentType) resolvedMimeType = fetched.contentType;
      }
    }

    if (mediaBuffer && mediaBuffer.length > 0) {
      try {
        const { data: convData } = await admin
          .from('lead_conversations')
          .select('workspace_id')
          .eq('id', conversationId)
          .maybeSingle();

        const workspaceId = convData?.workspace_id || 'global';
        const rawFileName = typeof data.fileName === 'string' ? data.fileName : null;
        const ext = mimeExtension(resolvedMimeType) || 'bin';
        const cleanName = safeName(rawFileName || `whatsapp-${messageType}-${externalMessageId.slice(-8)}.${ext}`);
        const storagePath = `${workspaceId}/${conversationId}/${randomUUID()}-${cleanName}`;

        const { error: uploadError } = await admin.storage
          .from('conversation-media')
          .upload(storagePath, mediaBuffer, {
            contentType: resolvedMimeType,
            upsert: false,
          });

        if (!uploadError) {
          const attachmentUrl = `/api/conversations/${conversationId}/attachments?path=${encodeURIComponent(storagePath)}`;
          await admin
            .from('lead_messages')
            .update({
              metadata: {
                ...metadata,
                storage_path: storagePath,
                attachment_url: attachmentUrl,
                preview_url: messageType === 'image' ? attachmentUrl : null,
                file_name: cleanName,
                mime_type: resolvedMimeType,
                size: mediaBuffer.length,
              },
            })
            .eq('id', messageId);
        }
      } catch (storageErr) {
        console.warn('Error handling inbound WhatsApp media upload:', storageErr);
      }
    }
  }

  return ingestResult;
}
