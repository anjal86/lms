import 'server-only';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { decryptIntegrationSecret, decryptSecretPayload } from '@/lib/integrations/secrets';
import { metaFetchJson } from '@/lib/integrations/meta-http';
import { extractPhoneNumbers } from '@/lib/integrations/phone-extractor';

type Provider = 'facebook' | 'instagram';
type MetaRecord = Record<string, unknown>;

type ScanScope = {
  provider?: Provider | null;
  accountId?: string | null;
  connectionId?: string | null;
};

type ConversationRow = {
  id: string;
  lead_id: string | null;
  provider: Provider;
  connection_id: string | null;
  external_contact_id: string | null;
  external_thread_id: string | null;
  customer_phone: string | null;
  metadata: Record<string, unknown> | null;
};

type ConnectionState = {
  provider: Provider;
  config: Record<string, unknown>;
  pageTokens: Array<Record<string, unknown>>;
  fallbackToken: string | null;
};

export type PhoneLeadHistoryScanResult = {
  scanned: number;
  phoneLeadsFound: number;
  remaining: number;
  errors: string[];
};

function record(value: unknown): MetaRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as MetaRecord
    : {};
}

function rows(value: unknown): MetaRecord[] {
  return Array.isArray(value)
    ? value.filter((item): item is MetaRecord => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : [];
}

function errorMessage(payload: MetaRecord, status: number) {
  const error = record(payload.error);
  return typeof error.message === 'string'
    ? error.message
    : `Meta request failed (${status}).`;
}

async function loadConnectionState(connectionId: string): Promise<ConnectionState | null> {
  const admin = createSupabaseAdminClient();
  const [{ data: connection }, { data: secret }] = await Promise.all([
    admin
      .from('integration_connections')
      .select('provider,config,status')
      .eq('id', connectionId)
      .maybeSingle(),
    admin
      .from('integration_secrets')
      .select('access_token,secret_payload')
      .eq('connection_id', connectionId)
      .maybeSingle(),
  ]);

  if (!connection || !secret || !['facebook', 'instagram'].includes(connection.provider)) return null;
  const payload = decryptSecretPayload(secret.secret_payload || {}) as Record<string, unknown>;
  return {
    provider: connection.provider as Provider,
    config: (connection.config || {}) as Record<string, unknown>,
    pageTokens: Array.isArray(payload.page_access_tokens)
      ? payload.page_access_tokens as Array<Record<string, unknown>>
      : [],
    fallbackToken: decryptIntegrationSecret(secret.access_token),
  };
}

function pageTokenForAccount(state: ConnectionState, accountId: string) {
  const pages = rows(state.config.pages);
  const owningPage = pages.find((page) => {
    if (String(page.id || '') === accountId) return true;
    return String(record(page.instagram_business_account).id || '') === accountId;
  });
  const pageId = String(owningPage?.id || accountId);
  const row = state.pageTokens.find((item) => String(item.id || '') === pageId);
  return typeof row?.access_token === 'string' ? row.access_token : state.fallbackToken;
}

function accountIdForConversation(conversation: ConversationRow) {
  const metadata = record(conversation.metadata);
  const prefix = String(conversation.external_thread_id || '').split(':')[0];
  return conversation.provider === 'instagram'
    ? String(metadata.instagram_business_account_id || prefix || '')
    : String(metadata.meta_page_id || prefix || '');
}

function lightweightConversationListUrl(provider: Provider, accountId: string, token: string, version: string) {
  const url = new URL(`https://graph.facebook.com/${version}/${accountId}/conversations`);
  if (provider === 'instagram') url.searchParams.set('platform', 'instagram');
  url.searchParams.set('fields', 'id,participants');
  url.searchParams.set('limit', '50');
  url.searchParams.set('access_token', token);
  return url;
}

function lightweightMessageHistoryUrl(provider: Provider, conversationId: string, token: string, version: string) {
  const url = new URL(`https://graph.facebook.com/${version}/${conversationId}/messages`);
  if (provider === 'instagram') {
    // Conversation IDs already encode the Instagram platform; only the list
    // endpoint requires the explicit platform parameter.
  }
  url.searchParams.set('fields', 'id,created_time,from,to,message');
  url.searchParams.set('limit', '100');
  url.searchParams.set('access_token', token);
  return url;
}

function customerFromParticipants(value: unknown, accountId: string) {
  const participants = rows(record(value).data);
  return participants.find((participant) => String(participant.id || '') !== accountId) || participants[0] || null;
}

async function resolveMetaConversationId(input: {
  provider: Provider;
  accountId: string;
  customerId: string;
  token: string;
  version: string;
  maxPages?: number;
}) {
  let next: string | null = lightweightConversationListUrl(input.provider, input.accountId, input.token, input.version).toString();
  const maxPages = Math.max(1, Math.min(input.maxPages || 30, 40));

  for (let page = 0; page < maxPages && next; page += 1) {
    const { response, data } = await metaFetchJson<MetaRecord>(next, {}, { timeoutMs: 12_000, retries: 1 });
    if (!response.ok) throw new Error(errorMessage(data, response.status));
    for (const conversation of rows(data.data)) {
      const customer = customerFromParticipants(conversation.participants, input.accountId);
      if (String(customer?.id || '') === input.customerId) {
        return String(conversation.id || '');
      }
    }
    const paging = record(data.paging);
    next = typeof paging.next === 'string' ? paging.next : null;
  }

  return '';
}

function isProviderSyntheticPhone(value: string | null | undefined, provider: Provider) {
  const trimmed = value?.trim() || '';
  return !trimmed || trimmed.startsWith(`${provider}:`);
}

async function writeDetectedPhone(input: {
  conversation: ConversationRow;
  phones: string[];
  body: string;
  sentAt: string;
  pagesScanned: number;
  scanComplete: boolean;
}) {
  const admin = createSupabaseAdminClient();
  const { data: fresh } = await admin
    .from('lead_conversations')
    .select('metadata,customer_phone,provider')
    .eq('id', input.conversation.id)
    .maybeSingle();
  if (!fresh) return;

  const metadata = record(fresh.metadata);
  const existingPhones = Array.isArray(metadata.detected_phones)
    ? metadata.detected_phones.filter((value): value is string => typeof value === 'string')
    : [];
  const mergedPhones = Array.from(new Set([...input.phones, ...existingPhones]));

  const nextMetadata = {
    ...metadata,
    detected_phone: input.phones[0],
    detected_phones: mergedPhones,
    detected_phone_at: input.sentAt,
    detected_phone_snippet: input.body.slice(0, 160),
    detected_phone_source: 'meta_history_scan',
    phone_history_scanned_at: new Date().toISOString(),
    phone_history_scan_complete: input.scanComplete,
    phone_history_pages_scanned: input.pagesScanned,
  };

  const patch: Record<string, unknown> = { metadata: nextMetadata };
  if (isProviderSyntheticPhone(fresh.customer_phone, input.conversation.provider)) {
    patch.customer_phone = input.phones[0];
  }

  const { error } = await admin
    .from('lead_conversations')
    .update(patch)
    .eq('id', input.conversation.id);
  if (error) throw error;

  // If this conversation has already been converted, repair the actual CRM lead
  // too, but never overwrite a real/manual phone number with a detected value.
  if (input.conversation.lead_id) {
    const { data: lead } = await admin
      .from('leads')
      .select('customer_phone')
      .eq('id', input.conversation.lead_id)
      .maybeSingle();
    if (lead && isProviderSyntheticPhone(lead.customer_phone, input.conversation.provider)) {
      const { error: leadError } = await admin
        .from('leads')
        .update({ customer_phone: input.phones[0] })
        .eq('id', input.conversation.lead_id);
      if (leadError) throw leadError;
    }
  }
}

async function markScanComplete(input: {
  conversationId: string;
  pagesScanned: number;
  complete: boolean;
  error?: string | null;
}) {
  const admin = createSupabaseAdminClient();
  const { data: fresh } = await admin
    .from('lead_conversations')
    .select('metadata')
    .eq('id', input.conversationId)
    .maybeSingle();
  if (!fresh) return;
  const metadata = record(fresh.metadata);
  const nextMetadata: Record<string, unknown> = {
    ...metadata,
    phone_history_scanned_at: new Date().toISOString(),
    phone_history_scan_complete: input.complete,
    phone_history_pages_scanned: input.pagesScanned,
  };
  if (input.error) nextMetadata.phone_history_scan_error = input.error.slice(0, 500);
  else delete nextMetadata.phone_history_scan_error;

  await admin
    .from('lead_conversations')
    .update({ metadata: nextMetadata })
    .eq('id', input.conversationId);
}

async function scanConversationForPhone(conversation: ConversationRow, maxPages: number) {
  if (!conversation.connection_id || !conversation.external_contact_id) {
    await markScanComplete({ conversationId: conversation.id, pagesScanned: 0, complete: false, error: 'Missing provider connection/contact identifier.' });
    return { found: false, error: 'Missing provider connection/contact identifier.' };
  }

  const existingPhone = isProviderSyntheticPhone(conversation.customer_phone, conversation.provider)
    ? []
    : extractPhoneNumbers(conversation.customer_phone);
  if (existingPhone.length) {
    await writeDetectedPhone({
      conversation,
      phones: existingPhone,
      body: conversation.customer_phone || existingPhone[0],
      sentAt: new Date().toISOString(),
      pagesScanned: 0,
      scanComplete: true,
    });
    return { found: true, error: null };
  }

  const state = await loadConnectionState(conversation.connection_id);
  if (!state) {
    await markScanComplete({ conversationId: conversation.id, pagesScanned: 0, complete: false, error: 'Provider credentials unavailable.' });
    return { found: false, error: 'Provider credentials unavailable.' };
  }

  const accountId = accountIdForConversation(conversation);
  if (!accountId) {
    await markScanComplete({ conversationId: conversation.id, pagesScanned: 0, complete: false, error: 'Provider account ID unavailable.' });
    return { found: false, error: 'Provider account ID unavailable.' };
  }

  const token = pageTokenForAccount(state, accountId);
  if (!token) {
    await markScanComplete({ conversationId: conversation.id, pagesScanned: 0, complete: false, error: 'Provider token unavailable.' });
    return { found: false, error: 'Provider token unavailable.' };
  }

  const version = process.env.META_GRAPH_VERSION?.trim() || 'v26.0';
  const metadata = record(conversation.metadata);
  let metaConversationId = typeof metadata.meta_conversation_id === 'string'
    ? metadata.meta_conversation_id
    : '';

  try {
    if (!metaConversationId) {
      metaConversationId = await resolveMetaConversationId({
        provider: conversation.provider,
        accountId,
        customerId: conversation.external_contact_id,
        token,
        version,
      });
      if (!metaConversationId) {
        await markScanComplete({ conversationId: conversation.id, pagesScanned: 0, complete: false, error: 'Meta conversation could not be resolved.' });
        return { found: false, error: 'Meta conversation could not be resolved.' };
      }

      const admin = createSupabaseAdminClient();
      const { data: freshMetadata } = await admin
        .from('lead_conversations')
        .select('metadata')
        .eq('id', conversation.id)
        .maybeSingle();
      await admin
        .from('lead_conversations')
        .update({ metadata: { ...record(freshMetadata?.metadata), meta_conversation_id: metaConversationId } })
        .eq('id', conversation.id);
    }

    let next: string | null = lightweightMessageHistoryUrl(conversation.provider, metaConversationId, token, version).toString();
    let pagesScanned = 0;

    while (next && pagesScanned < maxPages) {
      const { response, data } = await metaFetchJson<MetaRecord>(next, {}, { timeoutMs: 12_000, retries: 1 });
      if (!response.ok) throw new Error(errorMessage(data, response.status));
      pagesScanned += 1;

      for (const message of rows(data.data)) {
        const senderId = String(record(message.from).id || '');
        if (senderId === accountId) continue;
        const body = typeof message.message === 'string' ? message.message.trim() : '';
        if (!body) continue;
        const phones = extractPhoneNumbers(body);
        if (!phones.length) continue;
        const sentAt = typeof message.created_time === 'string'
          ? new Date(message.created_time).toISOString()
          : new Date().toISOString();
        await writeDetectedPhone({
          conversation,
          phones,
          body,
          sentAt,
          pagesScanned,
          scanComplete: true,
        });
        return { found: true, error: null };
      }

      const paging = record(data.paging);
      next = typeof paging.next === 'string' ? paging.next : null;
    }

    await markScanComplete({
      conversationId: conversation.id,
      pagesScanned,
      complete: !next,
    });
    return { found: false, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markScanComplete({ conversationId: conversation.id, pagesScanned: 0, complete: false, error: message });
    return { found: false, error: message };
  }
}

async function countRemaining(scope?: ScanScope) {
  const admin = createSupabaseAdminClient();
  let query = admin
    .from('lead_conversations')
    .select('id', { count: 'exact', head: true })
    .in('provider', ['facebook', 'instagram'])
    .is('metadata->>detected_phone', null)
    .is('metadata->>phone_history_scanned_at', null);

  if (scope?.connectionId) query = query.eq('connection_id', scope.connectionId);
  if (scope?.provider === 'facebook' && scope.accountId) {
    query = query.eq('metadata->>meta_page_id', scope.accountId);
  } else if (scope?.provider === 'instagram' && scope.accountId) {
    query = query.eq('metadata->>instagram_business_account_id', scope.accountId);
  }

  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

export async function scanPhoneLeadHistoryBatch(options?: {
  scope?: ScanScope | null;
  batchSize?: number;
  maxHistoryPages?: number;
}): Promise<PhoneLeadHistoryScanResult> {
  const admin = createSupabaseAdminClient();
  const scope = options?.scope || undefined;
  const batchSize = Math.max(1, Math.min(options?.batchSize || 1, 12));
  const maxHistoryPages = Math.max(1, Math.min(options?.maxHistoryPages || 20, 30));

  let query = admin
    .from('lead_conversations')
    .select('id,lead_id,provider,connection_id,external_contact_id,external_thread_id,customer_phone,metadata')
    .in('provider', ['facebook', 'instagram'])
    .is('metadata->>detected_phone', null)
    .is('metadata->>phone_history_scanned_at', null)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(batchSize);

  if (scope?.connectionId) query = query.eq('connection_id', scope.connectionId);
  if (scope?.provider === 'facebook' && scope.accountId) {
    query = query.eq('metadata->>meta_page_id', scope.accountId);
  } else if (scope?.provider === 'instagram' && scope.accountId) {
    query = query.eq('metadata->>instagram_business_account_id', scope.accountId);
  }

  const { data, error } = await query;
  if (error) throw error;
  const conversations = (data || []) as ConversationRow[];

  let cursor = 0;
  let phoneLeadsFound = 0;
  const errors: string[] = [];
  const concurrency = Math.min(3, conversations.length);

  const workers = Array.from({ length: concurrency }, async () => {
    while (cursor < conversations.length) {
      const index = cursor;
      cursor += 1;
      const conversation = conversations[index];
      const result = await scanConversationForPhone(conversation, maxHistoryPages);
      if (result.found) phoneLeadsFound += 1;
      if (result.error) errors.push(`${conversation.id}: ${result.error}`);
    }
  });
  await Promise.all(workers);

  return {
    scanned: conversations.length,
    phoneLeadsFound,
    remaining: await countRemaining(scope),
    errors: errors.slice(0, 25),
  };
}
