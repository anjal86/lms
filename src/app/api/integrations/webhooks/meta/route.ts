import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { ingestNormalizedLead } from '@/lib/integrations/ingest';
import { decryptIntegrationSecret, decryptSecretPayload } from '@/lib/integrations/secrets';

export const runtime = 'nodejs';

function validSignature(raw: string, header: string | null) {
  const secret = process.env.META_APP_SECRET?.trim();
  if (!secret || !header?.startsWith('sha256=')) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function valueFor(fields: Array<{ name?: string; values?: string[] }> | undefined, names: string[]) {
  const normalized = new Set(names.map((name) => name.toLowerCase()));
  for (const field of fields || []) {
    if (field.name && normalized.has(field.name.toLowerCase())) {
      const value = field.values?.[0]?.trim();
      if (value) return value;
    }
  }
  return null;
}

async function getConnections(provider: 'facebook' | 'instagram' | 'whatsapp') {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from('integration_connections')
    .select('id,provider,external_account_id,config')
    .eq('provider', provider)
    .eq('status', 'connected');
  return data || [];
}

async function findMetaConnection(provider: 'facebook' | 'instagram', accountId: string) {
  const connections = await getConnections(provider);
  return connections.find((connection) => {
    if (connection.external_account_id === accountId) return true;
    const config = (connection.config || {}) as Record<string, unknown>;
    const pages = Array.isArray(config.pages) ? config.pages as Array<Record<string, unknown>> : [];
    return pages.some((page) => {
      if (String(page.id || '') === accountId) return true;
      const instagram = page.instagram_business_account as Record<string, unknown> | undefined;
      return String(instagram?.id || '') === accountId;
    });
  }) || null;
}

async function findWhatsAppConnection(wabaId: string) {
  const connections = await getConnections('whatsapp');
  return connections.find((connection) => {
    const config = (connection.config || {}) as Record<string, unknown>;
    const wabas = Array.isArray(config.whatsapp_business_accounts)
      ? config.whatsapp_business_accounts as Array<Record<string, unknown>>
      : [];
    return wabas.some((waba) => String(waba.id || '') === wabaId);
  }) || connections[0] || null;
}

async function pageToken(connectionId: string, pageId: string) {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from('integration_secrets')
    .select('secret_payload,access_token')
    .eq('connection_id', connectionId)
    .maybeSingle();

  const payload = decryptSecretPayload(data?.secret_payload || {}) as Record<string, unknown>;
  const pageTokens = Array.isArray(payload.page_access_tokens)
    ? payload.page_access_tokens as Array<Record<string, unknown>>
    : [];
  const page = pageTokens.find((item) => String(item.id || '') === pageId);
  const storedPageToken = typeof page?.access_token === 'string' ? page.access_token : null;
  if (storedPageToken) return storedPageToken;
  return decryptIntegrationSecret(data?.access_token) || '';
}

async function processLeadgen(pageId: string, value: Record<string, unknown>) {
  const leadgenId = String(value.leadgen_id || '');
  if (!leadgenId) return;
  const connection = await findMetaConnection('facebook', pageId);
  if (!connection) throw new Error(`No connected Facebook account owns page ${pageId}.`);
  const token = await pageToken(connection.id, pageId);
  if (!token) throw new Error(`No Page access token is stored for ${pageId}.`);

  const version = process.env.META_GRAPH_VERSION?.trim() || 'v26.0';
  const url = new URL(`https://graph.facebook.com/${version}/${leadgenId}`);
  url.searchParams.set('fields', 'id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,field_data');
  url.searchParams.set('access_token', token);
  const response = await fetch(url, { cache: 'no-store' });
  const lead = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(lead?.error?.message || 'Unable to fetch Facebook lead details.');

  const fields = lead.field_data as Array<{ name?: string; values?: string[] }> | undefined;
  const firstName = valueFor(fields, ['first_name', 'first name']);
  const lastName = valueFor(fields, ['last_name', 'last name']);
  const fullName = valueFor(fields, ['full_name', 'full name', 'name']) || [firstName, lastName].filter(Boolean).join(' ') || null;

  await ingestNormalizedLead({
    provider: 'facebook',
    connectionId: connection.id,
    externalEventId: `facebook:leadgen:${leadgenId}`,
    eventType: 'lead',
    externalLeadId: leadgenId,
    customerName: fullName,
    customerPhone: valueFor(fields, ['phone_number', 'phone', 'mobile_number', 'mobile']),
    customerEmail: valueFor(fields, ['email', 'email_address']),
    destination: valueFor(fields, ['destination', 'travel_destination', 'where_do_you_want_to_travel']),
    travelDates: valueFor(fields, ['travel_dates', 'travel_date', 'departure_date']),
    budgetRange: valueFor(fields, ['budget', 'budget_range', 'travel_budget']),
    sourceLabel: 'Facebook Lead Ads',
    campaign: String(lead.campaign_name || value.campaign_id || '') || null,
    ad: String(lead.ad_name || value.ad_id || '') || null,
    form: String(lead.form_id || value.form_id || '') || null,
    notes: 'Imported automatically from a Facebook Instant Form.',
    metadata: {
      page_id: pageId,
      leadgen_id: leadgenId,
      campaign_id: lead.campaign_id || value.campaign_id || null,
      ad_id: lead.ad_id || value.ad_id || null,
      adset_id: lead.adset_id || value.adset_id || null,
      created_time: lead.created_time || value.created_time || null,
      field_data: fields || [],
    },
  });
}

async function processMetaMessage(provider: 'facebook' | 'instagram', accountId: string, messaging: Record<string, unknown>) {
  const sender = messaging.sender as Record<string, unknown> | undefined;
  const recipient = messaging.recipient as Record<string, unknown> | undefined;
  const message = messaging.message as Record<string, unknown> | undefined;
  if (!message?.mid) return;

  const isEcho = message.is_echo === true;
  // If echo, the message was sent from Meta Business Suite (page is sender, customer is recipient)
  // If not echo, the customer sent the message to the page
  const customerId = isEcho ? String(recipient?.id || '') : String(sender?.id || '');
  if (!customerId) return;

  const connection = await findMetaConnection(provider, accountId);
  if (!connection) throw new Error(`No connected ${provider} account matches ${accountId}.`);

  const sentAt = messaging.timestamp ? new Date(Number(messaging.timestamp)).toISOString() : new Date().toISOString();
  const text = typeof message.text === 'string' ? message.text : null;
  const threadId = `${accountId}:${customerId}`;

  // Attempt to fetch traveler's profile name & photo from Meta Graph API
  let customerName: string | null = null;
  let customerAvatarUrl: string | null = null;
  try {
    const token = await pageToken(connection.id, accountId);
    if (token) {
      const version = process.env.META_GRAPH_VERSION?.trim() || 'v26.0';
      const profRes = await fetch(
        `https://graph.facebook.com/${version}/${customerId}?fields=first_name,last_name,name,profile_pic&access_token=${token}`,
        { cache: 'no-store' }
      );
      if (profRes.ok) {
        const prof = await profRes.json();
        customerName = prof.name || [prof.first_name, prof.last_name].filter(Boolean).join(' ') || null;
        customerAvatarUrl = prof.profile_pic || null;
      }
    }
  } catch {
    // Non-fatal if user profile permissions are restricted
  }

  // Parse rich attachments (photos, voice notes, files)
  const attachments = Array.isArray(message.attachments)
    ? (message.attachments as Array<Record<string, unknown>>)
    : [];
  let messageType: 'text' | 'image' | 'audio' | 'video' | 'file' | 'media' = text ? 'text' : 'media';
  let attachmentUrl: string | null = null;
  let previewUrl: string | null = null;
  let fileName: string | null = null;

  if (attachments.length > 0) {
    const firstAttach = attachments[0];
    const attachType = String(firstAttach.type || '');
    const payload = (firstAttach.payload || {}) as Record<string, unknown>;
    attachmentUrl = typeof payload.url === 'string' ? payload.url : null;
    previewUrl = attachmentUrl;
    fileName = typeof payload.title === 'string' ? payload.title : null;

    if (attachType === 'image') {
      messageType = 'image';
      if (!isEcho && attachmentUrl && !customerAvatarUrl) {
        customerAvatarUrl = attachmentUrl;
      }
    } else if (attachType === 'audio') {
      messageType = 'audio';
    } else if (attachType === 'video') {
      messageType = 'video';
    } else if (attachType === 'file') {
      messageType = 'file';
    }
  }

  if (!customerAvatarUrl && customerName) {
    customerAvatarUrl = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(customerName)}&backgroundColor=0f172a,1e293b,1e1b4b,172554,064e3b&textColor=ffffff&fontWeight=600`;
  }

  await ingestNormalizedLead({
    provider,
    connectionId: connection.id,
    externalEventId: `${provider}:message:${String(message.mid)}`,
    eventType: 'message',
    externalLeadId: null,
    externalThreadId: threadId,
    externalContactId: customerId,
    customerName: customerName || `${provider === 'instagram' ? 'Instagram' : 'Messenger'} User`,
    customerPhone: `${provider}:${customerId}`,
    destination: 'Not specified',
    sourceLabel: provider === 'instagram' ? 'Instagram DM' : 'Facebook Messenger',
    notes: isEcho
      ? 'Outbound message sent via Meta Business Suite.'
      : 'Conversation started automatically from an inbound social message.',
    message: {
      externalMessageId: String(message.mid),
      direction: isEcho ? 'outbound' : 'inbound',
      type: messageType,
      body: text || (messageType === 'image' ? '[Photo]' : messageType === 'audio' ? '[Voice message]' : null),
      sentAt,
      metadata: {
        message,
        sender,
        recipient,
        attachments,
        attachment_url: attachmentUrl,
        preview_url: previewUrl,
        file_name: fileName,
        is_echo: isEcho,
        sent_via: isEcho ? 'meta_business_suite' : 'customer',
      },
    },
    metadata: {
      account_id: accountId,
      customer_id: customerId,
      is_echo: isEcho,
      customer_avatar_url: customerAvatarUrl,
    },
  });
}

async function processWhatsApp(entry: Record<string, unknown>) {
  const wabaId = String(entry.id || '');
  if (!wabaId) return;
  const connection = await findWhatsAppConnection(wabaId);
  if (!connection) throw new Error(`No connected WhatsApp account matches ${wabaId}.`);
  const changes = Array.isArray(entry.changes) ? entry.changes as Array<Record<string, unknown>> : [];

  for (const change of changes) {
    const value = (change.value || {}) as Record<string, unknown>;
    const messages = Array.isArray(value.messages) ? value.messages as Array<Record<string, unknown>> : [];
    const contacts = Array.isArray(value.contacts) ? value.contacts as Array<Record<string, unknown>> : [];
    for (const message of messages) {
      const from = String(message.from || '');
      const id = String(message.id || '');
      if (!from || !id) continue;
      const contact = contacts.find((item) => String(item.wa_id || '') === from) || contacts[0];
      const profile = contact?.profile as Record<string, unknown> | undefined;
      const textObject = message.text as Record<string, unknown> | undefined;
      const buttonObject = message.button as Record<string, unknown> | undefined;
      const interactive = message.interactive as Record<string, unknown> | undefined;
      const body = typeof textObject?.body === 'string'
        ? textObject.body
        : typeof buttonObject?.text === 'string'
          ? buttonObject.text
          : interactive ? JSON.stringify(interactive) : null;
      const sentAt = message.timestamp
        ? new Date(Number(message.timestamp) * 1000).toISOString()
        : new Date().toISOString();

      await ingestNormalizedLead({
        provider: 'whatsapp',
        connectionId: connection.id,
        externalEventId: `whatsapp:message:${id}`,
        eventType: 'message',
        externalThreadId: `${wabaId}:${from}`,
        externalContactId: from,
        customerName: typeof profile?.name === 'string' ? profile.name : 'WhatsApp inquiry',
        customerPhone: from.startsWith('+') ? from : `+${from}`,
        destination: 'Not specified',
        sourceLabel: 'WhatsApp Business',
        notes: 'Conversation started automatically from WhatsApp Business.',
        message: {
          externalMessageId: id,
          type: String(message.type || 'text'),
          body,
          sentAt,
          metadata: { message, contact, metadata: value.metadata || null },
        },
        metadata: { waba_id: wabaId, phone_number_id: (value.metadata as Record<string, unknown> | undefined)?.phone_number_id || null },
      });
    }
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim();

  if (mode === 'subscribe' && expected && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }
  return NextResponse.json({ error: 'Webhook verification failed.' }, { status: 403 });
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!validSignature(raw, request.headers.get('x-hub-signature-256'))) {
    return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const entries = Array.isArray(payload.entry) ? payload.entry as Array<Record<string, unknown>> : [];
  try {
    if (payload.object === 'whatsapp_business_account') {
      for (const entry of entries) await processWhatsApp(entry);
    } else {
      const provider: 'facebook' | 'instagram' = payload.object === 'instagram' ? 'instagram' : 'facebook';
      for (const entry of entries) {
        const accountId = String(entry.id || '');
        const changes = Array.isArray(entry.changes) ? entry.changes as Array<Record<string, unknown>> : [];
        for (const change of changes) {
          if (change.field === 'leadgen') await processLeadgen(accountId, (change.value || {}) as Record<string, unknown>);
        }
        const messaging = Array.isArray(entry.messaging) ? entry.messaging as Array<Record<string, unknown>> : [];
        for (const event of messaging) await processMetaMessage(provider, accountId, event);
      }
    }
  } catch (error) {
    console.error('Meta webhook processing failed:', error);
    return NextResponse.json({ received: true, processed: false });
  }

  return NextResponse.json({ received: true, processed: true });
}
