import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { ingestNormalizedLead } from '@/lib/integrations/ingest';
import { decryptIntegrationSecret, decryptSecretPayload } from '@/lib/integrations/secrets';
import { metaFetchJson } from '@/lib/integrations/meta-http';
import { mergeReferralObjects, normalizeMetaAdAttribution } from '@/lib/integrations/ad-attribution';
import {
  extractLeadFormDemographics,
  detectLocationFromText,
  type CustomerDemographics,
} from '@/lib/integrations/customer-profile';
import { mergeCustomerDemographics } from '@/lib/integrations/customer-profile-merge';
import { fetchMetaCustomerProfile } from '@/lib/integrations/meta-profile';

export const runtime = 'nodejs';

type LeadFormField = { name?: string; values?: string[] };

type ConnectionRow = {
  id: string;
  workspace_id: string | null;
  provider: string;
  external_account_id: string | null;
  config: Record<string, unknown> | null;
  status: string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function validSignature(raw: string, header: string | null) {
  const secret = process.env.META_APP_SECRET?.trim();
  if (!secret || !header?.startsWith('sha256=')) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function normalizeLeadFields(value: unknown): LeadFormField[] {
  if (!Array.isArray(value)) return [];
  const fields: LeadFormField[] = [];
  for (const item of value) {
    const field = record(item);
    if (typeof field.name !== 'string' || !field.name.trim()) continue;
    const values = Array.isArray(field.values)
      ? field.values.filter((entry): entry is string => typeof entry === 'string')
      : [];
    fields.push({ name: field.name.trim(), values });
  }
  return fields;
}

function valueFor(fields: LeadFormField[] | null | undefined, names: string[]) {
  const normalized = new Set(names.map((name) => name.toLowerCase()));
  for (const field of Array.isArray(fields) ? fields : []) {
    const fieldName = typeof field.name === 'string' ? field.name.toLowerCase() : '';
    if (!fieldName || !normalized.has(fieldName)) continue;
    const value = Array.isArray(field.values)
      ? field.values.find((entry) => typeof entry === 'string' && Boolean(entry.trim()))?.trim()
      : undefined;
    if (value) return value;
  }
  return null;
}

function safeTimestamp(value: unknown, multiplier = 1) {
  if (value === null || value === undefined || value === '') return new Date().toISOString();
  const numeric = typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value)
    ? Number(value) * multiplier
    : typeof value === 'number'
      ? value * multiplier
      : value;
  const date = new Date(numeric as string | number | Date);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

async function getConnections(provider: 'facebook' | 'instagram' | 'whatsapp') {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('integration_connections')
    .select('id,workspace_id,provider,external_account_id,config,status')
    .eq('provider', provider)
    .in('status', ['connected', 'token_expiring']);
  if (error) throw error;
  return (data || []) as ConnectionRow[];
}

function legacyMetaOwnsAccount(connection: ConnectionRow, accountId: string) {
  const config = record(connection.config);
  const pages = Array.isArray(config.pages) ? config.pages.map(record) : [];
  return pages.some((page) => {
    if (String(page.id || '') === accountId) return true;
    const instagram = record(page.instagram_business_account);
    return String(instagram.id || '') === accountId;
  });
}

async function findMetaConnection(provider: 'facebook' | 'instagram', accountId: string) {
  const connections = await getConnections(provider);
  const exact = connections.filter((connection) => connection.external_account_id === accountId);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) throw new Error(`${provider} account ${accountId} is connected more than once.`);

  const legacy = connections.filter((connection) => legacyMetaOwnsAccount(connection, accountId));
  if (legacy.length === 1) return legacy[0];
  if (legacy.length > 1) throw new Error(`${provider} account ${accountId} matches multiple legacy connections.`);
  return null;
}

function legacyWhatsAppOwnsAccount(connection: ConnectionRow, phoneNumberId: string | null, wabaId: string) {
  const config = record(connection.config);
  const wabas = Array.isArray(config.whatsapp_business_accounts)
    ? config.whatsapp_business_accounts.map(record)
    : [];
  return wabas.some((waba) => {
    if (String(waba.id || '') !== wabaId) return false;
    if (!phoneNumberId) return true;
    const phones = Array.isArray(waba.phone_numbers) ? waba.phone_numbers.map(record) : [];
    return phones.some((phone) => String(phone.id || '') === phoneNumberId);
  });
}

async function findWhatsAppConnection(phoneNumberId: string | null, wabaId: string) {
  const connections = await getConnections('whatsapp');
  if (phoneNumberId) {
    const exact = connections.filter((connection) => connection.external_account_id === phoneNumberId);
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) throw new Error(`WhatsApp phone ${phoneNumberId} is connected more than once.`);
  }

  const legacy = connections.filter((connection) => legacyWhatsAppOwnsAccount(connection, phoneNumberId, wabaId));
  if (legacy.length === 1) return legacy[0];
  if (legacy.length > 1) {
    throw new Error(`WhatsApp WABA ${wabaId} is ambiguous without a unique phone_number_id.`);
  }
  return null;
}

async function findMessageConnection(provider: string, externalMessageId: string) {
  if (!externalMessageId) return null;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('lead_messages')
    .select('connection_id')
    .eq('provider', provider)
    .or(`external_message_id.eq.${externalMessageId},provider_message_id.eq.${externalMessageId}`)
    .not('connection_id', 'is', null)
    .limit(2);
  if (error) throw error;
  const ids = Array.from(new Set((data || []).map((row) => row.connection_id).filter(Boolean)));
  return ids.length === 1 ? String(ids[0]) : null;
}

async function pageToken(connectionId: string, accountId: string) {
  const admin = createSupabaseAdminClient();
  const [{ data: connection }, { data: secrets }] = await Promise.all([
    admin.from('integration_connections').select('config').eq('id', connectionId).maybeSingle(),
    admin.from('integration_secrets').select('secret_payload,access_token').eq('connection_id', connectionId).maybeSingle(),
  ]);

  const payload = decryptSecretPayload(secrets?.secret_payload || {}) as Record<string, unknown>;
  const pageTokens = Array.isArray(payload.page_access_tokens)
    ? payload.page_access_tokens.map(record)
    : [];
  const config = record(connection?.config);
  const pages = Array.isArray(config.pages) ? config.pages.map(record) : [];
  const owningPage = pages.find((page) => {
    if (String(page.id || '') === accountId) return true;
    const instagram = record(page.instagram_business_account);
    return String(instagram.id || '') === accountId;
  });
  const pageId = String(owningPage?.id || config.page_id || accountId);
  const page = pageTokens.find((item) => String(item.id || '') === pageId);
  const storedPageToken = typeof page?.access_token === 'string' ? page.access_token : null;
  return storedPageToken || decryptIntegrationSecret(secrets?.access_token) || '';
}

async function updateDelivery(
  connectionId: string,
  provider: string,
  externalMessageId: string,
  status: string,
  timestamp?: string | number,
  error?: Record<string, unknown>
) {
  const normalized = ['sent', 'delivered', 'read', 'failed'].includes(status) ? status : null;
  if (!normalized || !externalMessageId || !connectionId) return;
  const eventAt = timestamp === undefined
    ? new Date().toISOString()
    : safeTimestamp(timestamp, typeof timestamp === 'string' && /^\d+$/.test(timestamp) ? 1000 : 1);
  const admin = createSupabaseAdminClient();
  const { error: rpcError } = await admin.rpc('update_message_delivery_scoped', {
    p_connection_id: connectionId,
    p_provider: provider,
    p_external_message_id: externalMessageId,
    p_status: normalized,
    p_event_at: eventAt,
    p_failure_code: error?.code ? String(error.code) : null,
    p_failure_message: error?.message ? String(error.message).slice(0, 1000) : null,
  });
  if (rpcError) throw rpcError;
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
  const { response, data: lead } = await metaFetchJson<Record<string, unknown>>(url);
  if (!response.ok) {
    const providerError = record(lead.error);
    throw new Error(typeof providerError.message === 'string' ? providerError.message : 'Unable to fetch Facebook lead details.');
  }

  const fields = normalizeLeadFields(lead.field_data);
  const demographics = extractLeadFormDemographics(fields);
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
    customerCity: demographics.city || null,
    customerCountry: demographics.country || null,
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
      account_id: pageId,
      leadgen_id: leadgenId,
      campaign_id: lead.campaign_id || value.campaign_id || null,
      ad_id: lead.ad_id || value.ad_id || null,
      adset_id: lead.adset_id || value.adset_id || null,
      created_time: lead.created_time || value.created_time || null,
      field_data: fields,
      customer_profile: demographics,
    },
  });
}

async function processMetaMessage(provider: 'facebook' | 'instagram', accountId: string, messaging: Record<string, unknown>) {
  const connection = await findMetaConnection(provider, accountId);
  if (!connection) throw new Error(`No connected ${provider} account matches ${accountId}.`);

  const delivery = record(messaging.delivery);
  if (Object.keys(delivery).length > 0) {
    const mids = Array.isArray(delivery.mids) ? delivery.mids : [];
    for (const mid of mids) {
      await updateDelivery(connection.id, provider, String(mid), 'delivered', delivery.watermark as string | number | undefined);
    }
  }

  const sender = record(messaging.sender);
  const recipient = record(messaging.recipient);
  const message = record(messaging.message);
  if (!message.mid) return;

  const isEcho = message.is_echo === true;
  const customerId = isEcho ? String(recipient.id || '') : String(sender.id || '');
  if (!customerId) return;

  const postback = record(messaging.postback);
  const referralPayload = mergeReferralObjects(
    messaging.referral,
    postback.referral,
    message.referral,
  );
  const adAttribution = isEcho ? null : normalizeMetaAdAttribution(referralPayload, provider);
  const sentAt = safeTimestamp(messaging.timestamp);
  const text = typeof message.text === 'string' ? message.text : null;
  const threadId = `${accountId}:${customerId}`;

  let customerName: string | null = null;
  let customerAvatarUrl: string | null = null;
  let demographics: CustomerDemographics | null = null;
  try {
    const token = await pageToken(connection.id, accountId);
    if (token) {
      const version = process.env.META_GRAPH_VERSION?.trim() || 'v26.0';
      const profile = await fetchMetaCustomerProfile({
        provider,
        customerId,
        accountId,
        token,
        version,
        timeoutMs: 1_500,
        retries: 0,
      });
      if (profile) {
        customerName = profile.name;
        customerAvatarUrl = profile.avatarUrl;
        demographics = profile.demographics || null;
      }
    }
  } catch {
    // Profile enrichment is optional and must never block durable message ingestion.
  }

  if (text) {
    try {
      const detected = detectLocationFromText(text);
      if (detected.city || detected.country) {
        demographics = mergeCustomerDemographics(demographics, {
          city: detected.city,
          country: detected.country,
          inferredFromText: true,
          locationSource: 'chat_heuristic',
        });
      }
    } catch {
      // Heuristic parsing is optional and fails open.
    }
  }

  const attachments = Array.isArray(message.attachments)
    ? message.attachments.map(record)
    : [];
  let messageType: 'text' | 'image' | 'audio' | 'video' | 'file' | 'media' = text ? 'text' : 'media';
  let attachmentUrl: string | null = null;
  let previewUrl: string | null = null;
  let fileName: string | null = null;

  if (attachments.length > 0) {
    const firstAttach = attachments[0];
    const attachType = String(firstAttach.type || '');
    const attachmentPayload = record(firstAttach.payload);
    attachmentUrl = typeof attachmentPayload.url === 'string' ? attachmentPayload.url : null;
    previewUrl = attachmentUrl;
    fileName = typeof attachmentPayload.title === 'string' ? attachmentPayload.title : null;
    if (attachType === 'image') messageType = 'image';
    else if (attachType === 'audio') messageType = 'audio';
    else if (attachType === 'video') messageType = 'video';
    else if (attachType === 'file') messageType = 'file';
  }

  const sourceLabel = adAttribution
    ? provider === 'instagram' ? 'Instagram Ad → DM' : 'Facebook Ad → Messenger'
    : provider === 'instagram' ? 'Instagram DM' : 'Facebook Messenger';

  await ingestNormalizedLead({
    provider,
    connectionId: connection.id,
    externalEventId: `${provider}:message:${String(message.mid)}`,
    eventType: 'message',
    externalThreadId: threadId,
    externalContactId: customerId,
    customerName: customerName || `${provider === 'instagram' ? 'Instagram' : 'Messenger'} User`,
    customerPhone: null,
    customerCity: demographics?.city || null,
    customerCountry: demographics?.country || null,
    destination: 'Not specified',
    sourceLabel,
    notes: isEcho ? 'Outbound message sent through Meta.' : adAttribution ? 'Conversation started from a paid Meta ad.' : 'Conversation started from an inbound social message.',
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
        ...(adAttribution ? { ad_attribution: adAttribution } : {}),
      },
    },
    metadata: {
      account_id: accountId,
      connection_id: connection.id,
      customer_id: customerId,
      is_echo: isEcho,
      customer_avatar_url: customerAvatarUrl,
      ...(adAttribution ? { ad_attribution: adAttribution } : {}),
      ...(demographics ? { customer_profile: demographics } : {}),
    },
  });
}

async function processWhatsApp(entry: Record<string, unknown>) {
  const wabaId = String(entry.id || '');
  if (!wabaId) return;
  const changes = Array.isArray(entry.changes) ? entry.changes.map(record) : [];

  for (const change of changes) {
    const value = record(change.value);
    const valueMetadata = record(value.metadata);
    const phoneNumberId = typeof valueMetadata.phone_number_id === 'string' && valueMetadata.phone_number_id
      ? valueMetadata.phone_number_id
      : null;
    let connection = await findWhatsAppConnection(phoneNumberId, wabaId);

    const statuses = Array.isArray(value.statuses) ? value.statuses.map(record) : [];
    for (const status of statuses) {
      const statusMessageId = String(status.id || '');
      let statusConnectionId = connection?.id || null;
      if (!statusConnectionId) statusConnectionId = await findMessageConnection('whatsapp', statusMessageId);
      if (!statusConnectionId) {
        throw new Error(`Unable to resolve WhatsApp delivery receipt ${statusMessageId} to a concrete phone connection.`);
      }
      const errors = Array.isArray(status.errors) ? status.errors.map(record) : [];
      await updateDelivery(
        statusConnectionId,
        'whatsapp',
        statusMessageId,
        String(status.status || ''),
        status.timestamp as string | number | undefined,
        errors[0]
      );
    }

    const messages = Array.isArray(value.messages) ? value.messages.map(record) : [];
    if (messages.length > 0 && !connection) {
      connection = await findWhatsAppConnection(phoneNumberId, wabaId);
      if (!connection) {
        throw new Error(`No unique WhatsApp phone connection matches WABA ${wabaId}${phoneNumberId ? ` / ${phoneNumberId}` : ''}.`);
      }
    }

    const contacts = Array.isArray(value.contacts) ? value.contacts.map(record) : [];
    for (const message of messages) {
      if (!connection) continue;
      const from = String(message.from || '');
      const id = String(message.id || '');
      if (!from || !id) continue;
      const contact = contacts.find((item) => String(item.wa_id || '') === from) || contacts[0];
      const profile = record(contact?.profile);
      const textObject = record(message.text);
      const buttonObject = record(message.button);
      const interactive = record(message.interactive);
      const body = typeof textObject.body === 'string'
        ? textObject.body
        : typeof buttonObject.text === 'string'
          ? buttonObject.text
          : Object.keys(interactive).length > 0 ? JSON.stringify(interactive) : null;
      const sentAt = safeTimestamp(message.timestamp, 1000);
      const adAttribution = normalizeMetaAdAttribution(message.referral, 'whatsapp');

      await ingestNormalizedLead({
        provider: 'whatsapp',
        connectionId: connection.id,
        externalEventId: `whatsapp:message:${id}`,
        eventType: 'message',
        externalThreadId: `${wabaId}:${from}`,
        externalContactId: from,
        customerName: typeof profile.name === 'string' ? profile.name : 'WhatsApp inquiry',
        customerPhone: from.startsWith('+') ? from : `+${from}`,
        destination: 'Not specified',
        sourceLabel: adAttribution ? 'WhatsApp Ad' : 'WhatsApp Business',
        notes: adAttribution ? 'Conversation started from a Click-to-WhatsApp ad.' : 'Conversation started automatically from WhatsApp Business.',
        message: {
          externalMessageId: id,
          type: String(message.type || 'text'),
          body,
          sentAt,
          metadata: {
            message,
            contact,
            metadata: value.metadata || null,
            ...(adAttribution ? { ad_attribution: adAttribution } : {}),
          },
        },
        metadata: {
          waba_id: wabaId,
          phone_number_id: phoneNumberId,
          connection_id: connection.id,
          ...(adAttribution ? { ad_attribution: adAttribution } : {}),
        },
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
    const parsed = JSON.parse(raw) as unknown;
    payload = record(parsed);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const entries = Array.isArray(payload.entry) ? payload.entry.map(record) : [];
  try {
    if (payload.object === 'whatsapp_business_account') {
      for (const entry of entries) await processWhatsApp(entry);
    } else {
      const provider: 'facebook' | 'instagram' = payload.object === 'instagram' ? 'instagram' : 'facebook';
      for (const entry of entries) {
        const accountId = String(entry.id || '');
        if (!accountId) continue;
        const changes = Array.isArray(entry.changes) ? entry.changes.map(record) : [];
        for (const change of changes) {
          if (change.field === 'leadgen') await processLeadgen(accountId, record(change.value));
        }
        const messaging = Array.isArray(entry.messaging) ? entry.messaging.map(record) : [];
        for (const event of messaging) await processMetaMessage(provider, accountId, event);
      }
    }
  } catch (error) {
    console.error('Meta webhook processing failed:', error);
    return NextResponse.json({ received: true, processed: false, retry: true }, { status: 500 });
  }

  return NextResponse.json({ received: true, processed: true });
}
