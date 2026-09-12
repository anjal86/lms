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
  external_thread_id: string | null;
  customer_phone: string | null;
  metadata: Record<string, unknown> | null;
};

type ConnectionState = {
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

function safeIso(value: unknown) {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isProviderSyntheticPhone(value: string | null | undefined, provider: Provider) {
  const trimmed = value?.trim() || '';
  return !trimmed || trimmed.startsWith(`${provider}:`);
}

function accountIdForConversation(conversation: ConversationRow) {
  const metadata = record(conversation.metadata);
  const prefix = String(conversation.external_thread_id || '').split(':')[0];
  return conversation.provider === 'instagram'
    ? String(metadata.instagram_business_account_id || prefix || '')
    : String(metadata.meta_page_id || prefix || '');
}

async function loadConnectionState(connectionId: string): Promise<ConnectionState | null> {
  const admin = createSupabaseAdminClient();
  const [{ data: connection }, { data: secret }] = await Promise.all([
    admin
      .from('integration_connections')
      .select('config,status')
      .eq('id', connectionId)
      .maybeSingle(),
    admin
      .from('integration_secrets')
      .select('access_token,secret_payload')
      .eq('connection_id', connectionId)
      .maybeSingle(),
  ]);

  if (!connection || !secret || !['connected', 'token_expiring'].includes(connection.status)) return null;
  const payload = decryptSecretPayload(secret.secret_payload || {}) as Record<string, unknown>;
  return {
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
  const tokenRow = state.pageTokens.find((row) => String(row.id || '') === pageId);
  return typeof tokenRow?.access_token === 'string' ? tokenRow.access_token : state.fallbackToken;
}

function messageHistoryUrl(input: {
  conversationId: string;
  token: string;
  version: string;
  afterCursor?: string | null;
}) {
  const url = new URL(`https://graph.facebook.com/${input.version}/${input.conversationId}/messages`);
  url.searchParams.set('fields', 'id,created_time,from,to,message');
  url.searchParams.set('limit', '100');
  if (input.afterCursor) url.searchParams.set('after', input.afterCursor);
  url.searchParams.set('access_token', input.token);
  return url;
}

function pagingAfterCursor(data: MetaRecord) {
  const paging = record(data.paging);
  const cursors = record(paging.cursors);
  if (typeof cursors.after === 'string' && cursors.after) return cursors.after;
  if (typeof paging.next === 'string' && paging.next) {
    try {
      return new URL(paging.next).searchParams.get('after');
    } catch {
      return null;
    }
  }
  return null;
}

async function updateScanState(input: {
  conversationId: string;
  pagesDelta: number;
  complete: boolean;
  afterCursor?: string | null;
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
  const previousPages = Math.max(0, Number(metadata.phone_history_pages_scanned) || 0);
  const now = new Date().toISOString();
  const nextMetadata: Record<string, unknown> = {
    ...metadata,
    phone_history_last_attempt_at: now,
    phone_history_scan_complete: input.complete,
    phone_history_pages_scanned: previousPages + Math.max(0, input.pagesDelta),
  };

  if (input.complete) {
    nextMetadata.phone_history_scanned_at = now;
    delete nextMetadata.phone_history_after_cursor;
  } else {
    delete nextMetadata.phone_history_scanned_at;
    if (input.afterCursor) nextMetadata.phone_history_after_cursor = input.afterCursor;
  }

  if (input.error) nextMetadata.phone_history_scan_error = input.error.slice(0, 500);
  else delete nextMetadata.phone_history_scan_error;

  await admin
    .from('lead_conversations')
    .update({ metadata: nextMetadata })
    .eq('id', input.conversationId);
}

async function writeDetectedPhone(input: {
  conversation: ConversationRow;
  phones: string[];
  body: string;
  sentAt: string;
  pagesDelta: number;
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
  const previousPages = Math.max(0, Number(metadata.phone_history_pages_scanned) || 0);
  const now = new Date().toISOString();

  const nextMetadata: Record<string, unknown> = {
    ...metadata,
    detected_phone: input.phones[0],
    detected_phones: mergedPhones,
    detected_phone_at: input.sentAt,
    detected_phone_snippet: input.body.slice(0, 160),
    detected_phone_source: 'meta_history_scan',
    phone_history_last_attempt_at: now,
    phone_history_scanned_at: now,
    phone_history_scan_complete: true,
    phone_history_pages_scanned: previousPages + Math.max(0, input.pagesDelta),
  };
  delete nextMetadata.phone_history_after_cursor;
  delete nextMetadata.phone_history_scan_error;

  const patch: Record<string, unknown> = { metadata: nextMetadata };
  if (isProviderSyntheticPhone(fresh.customer_phone, input.conversation.provider)) {
    patch.customer_phone = input.phones[0];
  }

  const { error } = await admin
    .from('lead_conversations')
    .update(patch)
    .eq('id', input.conversation.id);
  if (error) throw error;

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

async function scanConversationForPhone(input: {
  conversation: ConversationRow;
  maxPages: number;
  deadline: number;
  requestTimeoutMs: number;
}) {
  const { conversation } = input;
  if (Date.now() >= input.deadline) return { attempted: false, found: false, error: null };

  const existingPhone = isProviderSyntheticPhone(conversation.customer_phone, conversation.provider)
    ? []
    : extractPhoneNumbers(conversation.customer_phone);
  if (existingPhone.length) {
    await writeDetectedPhone({
      conversation,
      phones: existingPhone,
      body: conversation.customer_phone || existingPhone[0],
      sentAt: new Date().toISOString(),
      pagesDelta: 0,
    });
    return { attempted: true, found: true, error: null };
  }

  const metadata = record(conversation.metadata);
  const metaConversationId = typeof metadata.meta_conversation_id === 'string'
    ? metadata.meta_conversation_id
    : '';
  if (!metaConversationId) {
    await updateScanState({
      conversationId: conversation.id,
      pagesDelta: 0,
      complete: false,
      afterCursor: typeof metadata.phone_history_after_cursor === 'string' ? metadata.phone_history_after_cursor : null,
      error: 'Waiting for Meta conversation ID discovery.',
    });
    return { attempted: true, found: false, error: null };
  }

  if (!conversation.connection_id) {
    await updateScanState({ conversationId: conversation.id, pagesDelta: 0, complete: false, error: 'Provider connection unavailable.' });
    return { attempted: true, found: false, error: 'Provider connection unavailable.' };
  }

  const accountId = accountIdForConversation(conversation);
  if (!accountId) {
    await updateScanState({ conversationId: conversation.id, pagesDelta: 0, complete: false, error: 'Provider account ID unavailable.' });
    return { attempted: true, found: false, error: 'Provider account ID unavailable.' };
  }

  const state = await loadConnectionState(conversation.connection_id);
  if (!state) {
    await updateScanState({ conversationId: conversation.id, pagesDelta: 0, complete: false, error: 'Provider credentials unavailable.' });
    return { attempted: true, found: false, error: 'Provider credentials unavailable.' };
  }

  const token = pageTokenForAccount(state, accountId);
  if (!token) {
    await updateScanState({ conversationId: conversation.id, pagesDelta: 0, complete: false, error: 'Provider token unavailable.' });
    return { attempted: true, found: false, error: 'Provider token unavailable.' };
  }

  const version = process.env.META_GRAPH_VERSION?.trim() || 'v26.0';
  let afterCursor = typeof metadata.phone_history_after_cursor === 'string'
    ? metadata.phone_history_after_cursor
    : null;
  let pagesScanned = 0;

  try {
    while (pagesScanned < input.maxPages && Date.now() < input.deadline) {
      const remainingBudget = input.deadline - Date.now();
      if (remainingBudget < 400) break;
      const timeoutMs = Math.max(400, Math.min(input.requestTimeoutMs, remainingBudget));
      const url = messageHistoryUrl({
        conversationId: metaConversationId,
        token,
        version,
        afterCursor,
      });
      const { response, data } = await metaFetchJson<MetaRecord>(url.toString(), {}, { timeoutMs, retries: 0 });
      if (!response.ok) throw new Error(errorMessage(data, response.status));
      pagesScanned += 1;

      for (const message of rows(data.data)) {
        const senderId = String(record(message.from).id || '');
        if (senderId === accountId) continue;
        const body = typeof message.message === 'string' ? message.message.trim() : '';
        if (!body) continue;
        const phones = extractPhoneNumbers(body);
        if (!phones.length) continue;
        await writeDetectedPhone({
          conversation,
          phones,
          body,
          sentAt: safeIso(message.created_time) || new Date().toISOString(),
          pagesDelta: pagesScanned,
        });
        return { attempted: true, found: true, error: null };
      }

      const paging = record(data.paging);
      const hasNext = typeof paging.next === 'string' && Boolean(paging.next);
      const nextCursor = pagingAfterCursor(data);
      if (!hasNext || !nextCursor) {
        await updateScanState({
          conversationId: conversation.id,
          pagesDelta: pagesScanned,
          complete: true,
        });
        return { attempted: true, found: false, error: null };
      }
      afterCursor = nextCursor;
    }

    await updateScanState({
      conversationId: conversation.id,
      pagesDelta: pagesScanned,
      complete: false,
      afterCursor,
    });
    return { attempted: true, found: false, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateScanState({
      conversationId: conversation.id,
      pagesDelta: pagesScanned,
      complete: false,
      afterCursor,
      error: message,
    });
    return { attempted: true, found: false, error: message };
  }
}

function shouldDeferAfterError(metadata: MetaRecord) {
  if (!metadata.phone_history_scan_error) return false;
  const lastAttempt = safeIso(metadata.phone_history_last_attempt_at);
  if (!lastAttempt) return false;
  return Date.now() - new Date(lastAttempt).getTime() < 5 * 60 * 1000;
}

function lastAttemptTime(conversation: ConversationRow) {
  const value = safeIso(record(conversation.metadata).phone_history_last_attempt_at);
  return value ? new Date(value).getTime() : 0;
}

async function countRemaining(scope?: ScanScope) {
  const admin = createSupabaseAdminClient();
  let query = admin
    .from('lead_conversations')
    .select('id', { count: 'exact', head: true })
    .in('provider', ['facebook', 'instagram'])
    .is('metadata->>detected_phone', null)
    .or('metadata->>phone_history_scan_complete.is.null,metadata->>phone_history_scan_complete.eq.false');

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
  timeBudgetMs?: number;
  requestTimeoutMs?: number;
}): Promise<PhoneLeadHistoryScanResult> {
  const admin = createSupabaseAdminClient();
  const scope = options?.scope || undefined;
  const batchSize = Math.max(1, Math.min(options?.batchSize || 1, 6));
  const maxHistoryPages = Math.max(1, Math.min(options?.maxHistoryPages || 1, 3));
  const timeBudgetMs = Math.max(1_000, Math.min(options?.timeBudgetMs || 4_000, 12_000));
  const requestTimeoutMs = Math.max(750, Math.min(options?.requestTimeoutMs || 3_000, 5_000));
  const deadline = Date.now() + timeBudgetMs;

  let query = admin
    .from('lead_conversations')
    .select('id,lead_id,provider,connection_id,external_thread_id,customer_phone,metadata')
    .in('provider', ['facebook', 'instagram'])
    .is('metadata->>detected_phone', null)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(Math.max(20, batchSize * 8));

  if (scope?.connectionId) query = query.eq('connection_id', scope.connectionId);
  if (scope?.provider === 'facebook' && scope.accountId) {
    query = query.eq('metadata->>meta_page_id', scope.accountId);
  } else if (scope?.provider === 'instagram' && scope.accountId) {
    query = query.eq('metadata->>instagram_business_account_id', scope.accountId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const conversations = ((data || []) as ConversationRow[])
    .filter((conversation) => record(conversation.metadata).phone_history_scan_complete !== true)
    .filter((conversation) => !shouldDeferAfterError(record(conversation.metadata)))
    .sort((a, b) => lastAttemptTime(a) - lastAttemptTime(b))
    .slice(0, batchSize);

  let cursor = 0;
  let scanned = 0;
  let phoneLeadsFound = 0;
  const errors: string[] = [];
  const concurrency = Math.min(2, conversations.length);

  const workers = Array.from({ length: concurrency }, async () => {
    while (cursor < conversations.length && Date.now() < deadline) {
      const index = cursor;
      cursor += 1;
      const conversation = conversations[index];
      const result = await scanConversationForPhone({
        conversation,
        maxPages: maxHistoryPages,
        deadline,
        requestTimeoutMs,
      });
      if (result.attempted) scanned += 1;
      if (result.found) phoneLeadsFound += 1;
      if (result.error) errors.push(`${conversation.id}: ${result.error}`);
    }
  });
  await Promise.all(workers);

  return {
    scanned,
    phoneLeadsFound,
    remaining: await countRemaining(scope),
    errors: errors.slice(0, 25),
  };
}
