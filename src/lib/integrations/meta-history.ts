import 'server-only';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { decryptIntegrationSecret, decryptSecretPayload } from '@/lib/integrations/secrets';
import { metaFetchJson } from '@/lib/integrations/meta-http';
import { persistConnectionScopedMetaMessages } from '@/lib/integrations/meta-message-persistence';

type MetaRecord = Record<string, unknown>;
type Provider = 'facebook' | 'instagram';
const DISCOVERY_MESSAGE_SEED_LIMIT = 25;

type ConnectionState = {
  id: string;
  workspaceId: string;
  externalAccountId: string | null;
  provider: Provider;
  displayName: string;
  config: Record<string, unknown>;
  pageTokens: Array<Record<string, unknown>>;
  fallbackToken: string | null;
};

type AccountDescriptor = {
  accountId: string;
  accountName: string;
};

export type MetaHistoryResult = {
  conversationsDiscovered: number;
  messagesInserted: number;
  errors: string[];
};

export type MetaHistoryBatchResult = {
  conversationsScanned: number;
  conversationsCompleted: number;
  messagesInserted: number;
  remaining: number;
  errors: string[];
};

function record(value: unknown): MetaRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as MetaRecord : {};
}

function rows(value: unknown): MetaRecord[] {
  return Array.isArray(value)
    ? value.filter((item): item is MetaRecord => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : [];
}

function describeError(error: unknown) {
  if (error instanceof Error) return error.message;
  const payload = record(error);
  if (typeof payload.message === 'string') {
    return typeof payload.details === 'string' && payload.details
      ? `${payload.message}: ${payload.details}`
      : payload.message;
  }
  return String(error);
}

function errorMessage(payload: MetaRecord, status: number) {
  const error = record(payload.error);
  return typeof error.message === 'string' ? error.message : `Meta request failed (${status}).`;
}

function isAuthorizationContainer(config: Record<string, unknown>) {
  if (config.authorization_container === true || config.legacy_container === true) return true;
  if (config.hidden_from_account_picker !== true) return false;
  return Array.isArray(config.discovered_accounts)
    || Array.isArray(config.pages)
    || Array.isArray(config.whatsapp_business_accounts)
    || Array.isArray(config.advertisers);
}

async function pagedGraph(url: URL, maxPages: number) {
  const result: MetaRecord[] = [];
  let next: string | null = url.toString();
  for (let page = 0; page < maxPages && next; page += 1) {
    const { response, data } = await metaFetchJson<MetaRecord>(next, {}, { timeoutMs: 15_000, retries: 2 });
    if (!response.ok) throw new Error(errorMessage(data, response.status));
    result.push(...rows(data.data));
    const paging = record(data.paging);
    next = typeof paging.next === 'string' ? paging.next : null;
  }
  return { items: result, complete: next === null };
}

function pageTokenForAccount(state: ConnectionState, accountId: string) {
  const pages = rows(state.config.pages);
  const owningPage = pages.find((page) => {
    if (String(page.id || '') === accountId) return true;
    const instagram = record(page.instagram_business_account);
    return String(instagram.id || '') === accountId;
  });
  const configuredPageId = typeof state.config.page_id === 'string' ? state.config.page_id : '';
  const pageId = String(owningPage?.id || configuredPageId || accountId);
  const tokenRow = state.pageTokens.find((row) => String(row.id || '') === pageId);
  return typeof tokenRow?.access_token === 'string' ? tokenRow.access_token : state.fallbackToken;
}

async function loadConnectionState(connectionId: string): Promise<ConnectionState | null> {
  const admin = createSupabaseAdminClient();
  const [{ data: connection }, { data: secret }] = await Promise.all([
    admin
      .from('integration_connections')
      .select('id,workspace_id,provider,display_name,external_account_id,config,status')
      .eq('id', connectionId)
      .maybeSingle(),
    admin
      .from('integration_secrets')
      .select('access_token,secret_payload')
      .eq('connection_id', connectionId)
      .maybeSingle(),
  ]);

  if (
    !connection
    || !connection.workspace_id
    || !secret
    || !['facebook', 'instagram'].includes(connection.provider)
    || !['connected', 'token_expiring', 'paused'].includes(connection.status)
  ) return null;

  const payload = decryptSecretPayload(secret.secret_payload || {}) as Record<string, unknown>;
  return {
    id: connection.id,
    workspaceId: connection.workspace_id,
    externalAccountId: connection.external_account_id || null,
    provider: connection.provider as Provider,
    displayName: connection.display_name || connection.provider,
    config: (connection.config || {}) as Record<string, unknown>,
    pageTokens: Array.isArray(payload.page_access_tokens) ? payload.page_access_tokens as Array<Record<string, unknown>> : [],
    fallbackToken: decryptIntegrationSecret(secret.access_token),
  };
}

function customerFromParticipants(participantsValue: unknown, accountId: string) {
  const participants = rows(record(participantsValue).data);
  return participants.find((participant) => String(participant.id || '') !== accountId) || participants[0] || null;
}

function messageDetails(message: MetaRecord) {
  let body = typeof message.message === 'string' ? message.message.trim() : '';
  let messageType = 'text';
  const attachments = rows(record(message.attachments).data);
  const first = attachments[0];

  if (first) {
    const image = record(first.image_data);
    const video = record(first.video_data);
    const mime = typeof first.mime_type === 'string' ? first.mime_type : '';
    if (typeof image.url === 'string' || mime.startsWith('image/')) {
      messageType = 'image';
      if (!body) body = '[Photo]';
    } else if (typeof video.url === 'string' || mime.startsWith('video/')) {
      messageType = 'video';
      if (!body) body = '[Video]';
    } else if (mime.startsWith('audio/') || String(first.name || '').includes('audioclip')) {
      messageType = 'audio';
      if (!body) body = '[Voice message]';
    } else {
      messageType = 'file';
      if (!body) body = '[Attachment]';
    }
  }

  return {
    body: body || null,
    messageType,
    metadata: {
      from: message.from,
      to: message.to,
      tags: message.tags,
      attachments: message.attachments,
      history_backfill: true,
    },
  };
}

function legacyAccountDescriptor(state: ConnectionState, page: MetaRecord): AccountDescriptor | null {
  if (state.provider === 'instagram') {
    const instagram = record(page.instagram_business_account);
    const accountId = String(instagram.id || '');
    return accountId ? {
      accountId,
      accountName: String(instagram.username || page.name || state.displayName || 'Instagram'),
    } : null;
  }
  const accountId = String(page.id || '');
  return accountId ? {
    accountId,
    accountName: String(page.name || state.displayName || 'Facebook Page'),
  } : null;
}

function accountDescriptors(state: ConnectionState): AccountDescriptor[] {
  if (state.provider === 'facebook') {
    const accountId = String(state.config.page_id || state.externalAccountId || '');
    if (accountId) {
      return [{
        accountId,
        accountName: String(state.config.page_name || state.displayName || 'Facebook Page'),
      }];
    }
  } else {
    const accountId = String(state.config.instagram_business_account_id || state.externalAccountId || '');
    if (accountId) {
      return [{
        accountId,
        accountName: String(state.config.instagram_username || state.config.account_name || state.displayName || 'Instagram'),
      }];
    }
  }

  return rows(state.config.pages)
    .map((page) => legacyAccountDescriptor(state, page))
    .filter((descriptor): descriptor is AccountDescriptor => Boolean(descriptor));
}

function conversationListUrl(provider: Provider, accountId: string, token: string, version: string, includePreviewMessage: boolean) {
  const url = new URL(`https://graph.facebook.com/${version}/${accountId}/conversations`);
  if (provider === 'instagram') url.searchParams.set('platform', 'instagram');
  const messageFields = provider === 'facebook'
    ? 'id,created_time,from,to,message,tags,attachments{id,mime_type,name,size,image_data,video_data,file_url}'
    : 'id,created_time,from,to,message,attachments{id,mime_type,name,size,image_data,video_data,file_url}';
  const baseFields = provider === 'facebook'
    ? 'id,updated_time,snippet,participants,link,can_reply,is_subscribed,message_count,scoped_thread_key'
    : 'id,updated_time,participants';
  url.searchParams.set('fields', includePreviewMessage ? `${baseFields},messages.limit(${DISCOVERY_MESSAGE_SEED_LIMIT}){${messageFields}}` : baseFields);
  url.searchParams.set('limit', '50');
  url.searchParams.set('access_token', token);
  return url;
}

function messageHistoryUrl(provider: Provider, conversationId: string, token: string, version: string) {
  const url = new URL(`https://graph.facebook.com/${version}/${conversationId}/messages`);
  const fields = provider === 'facebook'
    ? 'id,created_time,from,to,message,tags,attachments{id,mime_type,name,size,image_data,video_data,file_url}'
    : 'id,created_time,from,to,message,attachments{id,mime_type,name,size,image_data,video_data,file_url}';
  url.searchParams.set('fields', fields);
  url.searchParams.set('limit', '50');
  url.searchParams.set('access_token', token);
  return url;
}

async function insertMessages(input: {
  workspaceId: string;
  conversationId: string;
  leadId: string | null;
  connectionId: string;
  provider: Provider;
  accountId: string;
  messages: MetaRecord[];
}) {
  const admin = createSupabaseAdminClient();
  const mapped = input.messages
    .filter((message) => message.id)
    .map((message) => {
      const detail = messageDetails(message);
      const senderId = String(record(message.from).id || '');
      return {
        workspace_id: input.workspaceId,
        conversation_id: input.conversationId,
        lead_id: input.leadId,
        connection_id: input.connectionId,
        provider: input.provider,
        external_message_id: String(message.id),
        direction: senderId === input.accountId ? 'outbound' : 'inbound',
        message_type: detail.messageType,
        body: detail.body,
        metadata: detail.metadata,
        delivery_status: 'sent',
        sent_at: typeof message.created_time === 'string' ? new Date(message.created_time).toISOString() : new Date().toISOString(),
      };
    });

  return persistConnectionScopedMetaMessages({
    workspaceId: input.workspaceId,
    conversationId: input.conversationId,
    leadId: input.leadId,
    connectionId: input.connectionId,
    provider: input.provider,
    messages: mapped,
  }, admin);
}

async function discoverConnectionHistory(state: ConnectionState, maxPages: number): Promise<MetaHistoryResult> {
  const admin = createSupabaseAdminClient();
  const version = process.env.META_GRAPH_VERSION?.trim() || 'v26.0';
  const errors: string[] = [];
  let conversationsDiscovered = 0;
  let messagesInserted = 0;

  if (isAuthorizationContainer(state.config)) {
    return { conversationsDiscovered, messagesInserted, errors };
  }

  for (const descriptor of accountDescriptors(state)) {
    const token = pageTokenForAccount(state, descriptor.accountId);
    if (!token) continue;

    try {
      const conversations = await pagedGraph(
        conversationListUrl(state.provider, descriptor.accountId, token, version, true),
        maxPages
      );

      for (const metaConversation of conversations.items) {
        const customer = customerFromParticipants(metaConversation.participants, descriptor.accountId);
        const customerId = String(customer?.id || '');
        if (!customerId || customerId === descriptor.accountId) continue;
        const externalThreadId = `${descriptor.accountId}:${customerId}`;

        let { data: localConversation } = await admin
          .from('lead_conversations')
          .select('id,workspace_id,lead_id,last_message_at')
          .eq('workspace_id', state.workspaceId)
          .eq('connection_id', state.id)
          .eq('provider', state.provider)
          .eq('external_thread_id', externalThreadId)
          .maybeSingle();

        const previewMessages = rows(record(metaConversation.messages).data);
        const preview = previewMessages[0];
        const updatedAt = typeof metaConversation.updated_time === 'string'
          ? new Date(metaConversation.updated_time).toISOString()
          : preview && typeof preview.created_time === 'string'
            ? new Date(preview.created_time).toISOString()
            : new Date().toISOString();

        if (!localConversation) {
          const metadata = state.provider === 'facebook'
            ? {
                meta_page_id: descriptor.accountId,
                meta_page_name: descriptor.accountName,
                meta_conversation_id: String(metaConversation.id || ''),
                scoped_thread_key: metaConversation.scoped_thread_key || metaConversation.id,
                message_count: null,
                provider_message_count_hint: metaConversation.message_count || null,
                history_discovered_at: new Date().toISOString(),
              }
            : {
                instagram_business_account_id: descriptor.accountId,
                account_name: descriptor.accountName,
                meta_conversation_id: String(metaConversation.id || ''),
                history_discovered_at: new Date().toISOString(),
              };
          const detail = preview ? messageDetails(preview) : { body: null, messageType: 'text' };
          const { data: created, error: createError } = await admin
            .from('lead_conversations')
            .insert({
              workspace_id: state.workspaceId,
              connection_id: state.id,
              provider: state.provider,
              external_thread_id: externalThreadId,
              external_contact_id: customerId,
              customer_name: String(customer?.name || customer?.username || (state.provider === 'facebook' ? 'Messenger Customer' : 'Instagram Customer')),
              customer_phone: null,
              last_message_preview: detail.body,
              last_message_at: updatedAt,
              status: 'open',
              unread_count: 0,
              metadata,
            })
            .select('id,workspace_id,lead_id,last_message_at')
            .single();
          if (createError || !created) {
            if (createError?.code === '23505') {
              const retry = await admin
                .from('lead_conversations')
                .select('id,workspace_id,lead_id,last_message_at')
                .eq('workspace_id', state.workspaceId)
                .eq('connection_id', state.id)
                .eq('provider', state.provider)
                .eq('external_thread_id', externalThreadId)
                .maybeSingle();
              localConversation = retry.data;
            } else {
              throw createError || new Error('Unable to create historical conversation.');
            }
          } else {
            localConversation = created;
            conversationsDiscovered += 1;
          }
        }

        if (localConversation && previewMessages.length) {
          messagesInserted += await insertMessages({
            workspaceId: state.workspaceId,
            conversationId: localConversation.id,
            leadId: localConversation.lead_id,
            connectionId: state.id,
            provider: state.provider,
            accountId: descriptor.accountId,
            messages: previewMessages,
          });
        }
      }
    } catch (pageError) {
      errors.push(`${state.provider}:${descriptor.accountId}: ${describeError(pageError)}`);
    }
  }

  return { conversationsDiscovered, messagesInserted, errors: errors.slice(0, 50) };
}

export async function discoverMetaConversationHistory(options?: { maxPages?: number; connectionIds?: string[] }): Promise<MetaHistoryResult> {
  const admin = createSupabaseAdminClient();
  const maxPages = Math.max(1, Math.min(options?.maxPages || 12, 20));
  const errors: string[] = [];
  let conversationsDiscovered = 0;
  let messagesInserted = 0;

  let connectionQuery = admin
    .from('integration_connections')
    .select('id')
    .in('status', ['connected', 'token_expiring'])
    .in('provider', ['facebook', 'instagram']);

  if (options?.connectionIds?.length) {
    connectionQuery = connectionQuery.in('id', options.connectionIds);
  }

  const { data: connections, error } = await connectionQuery;
  if (error) throw error;

  for (const connectionRow of connections || []) {
    const state = await loadConnectionState(connectionRow.id);
    if (!state) continue;
    const result = await discoverConnectionHistory(state, maxPages);
    conversationsDiscovered += result.conversationsDiscovered;
    messagesInserted += result.messagesInserted;
    errors.push(...result.errors);
  }

  return { conversationsDiscovered, messagesInserted, errors: errors.slice(0, 50) };
}

export async function backfillMetaConversationMessages(conversationId: string, options?: { maxPages?: number }): Promise<MetaHistoryResult> {
  const admin = createSupabaseAdminClient();
  const version = process.env.META_GRAPH_VERSION?.trim() || 'v26.0';
  const maxPages = Math.max(1, Math.min(options?.maxPages || 20, 30));
  const errors: string[] = [];

  const { data: conversation, error } = await admin
    .from('lead_conversations')
    .select('id,workspace_id,lead_id,connection_id,provider,external_thread_id,external_contact_id,metadata,last_message_at')
    .eq('id', conversationId)
    .maybeSingle();
  if (error) throw error;
  if (!conversation || !conversation.connection_id || !['facebook', 'instagram'].includes(conversation.provider)) {
    return { conversationsDiscovered: 0, messagesInserted: 0, errors: [] };
  }

  const state = await loadConnectionState(conversation.connection_id);
  if (!state) return { conversationsDiscovered: 0, messagesInserted: 0, errors: ['Connection credentials unavailable.'] };
  if (state.workspaceId !== conversation.workspace_id) {
    return { conversationsDiscovered: 0, messagesInserted: 0, errors: ['Conversation and channel account belong to different workspaces.'] };
  }

  const metadata = (conversation.metadata || {}) as Record<string, unknown>;
  const prefix = String(conversation.external_thread_id || '').split(':')[0];
  const accountId = state.provider === 'instagram'
    ? String(metadata.instagram_business_account_id || state.config.instagram_business_account_id || state.externalAccountId || prefix || '')
    : String(metadata.meta_page_id || state.config.page_id || state.externalAccountId || prefix || '');
  if (!accountId) return { conversationsDiscovered: 0, messagesInserted: 0, errors: ['Provider account ID unavailable.'] };

  const token = pageTokenForAccount(state, accountId);
  if (!token) return { conversationsDiscovered: 0, messagesInserted: 0, errors: ['Provider token unavailable.'] };

  try {
    let metaConversationId = typeof metadata.meta_conversation_id === 'string' ? metadata.meta_conversation_id : '';
    if (!metaConversationId) {
      const list = await pagedGraph(conversationListUrl(state.provider, accountId, token, version, false), 20);
      const matched = list.items.find((item) => {
        const customer = customerFromParticipants(item.participants, accountId);
        return String(customer?.id || '') === String(conversation.external_contact_id || '');
      });
      metaConversationId = String(matched?.id || '');
      if (!metaConversationId) return { conversationsDiscovered: 0, messagesInserted: 0, errors: ['Meta conversation could not be resolved.'] };
      await admin.from('lead_conversations').update({
        metadata: { ...metadata, meta_conversation_id: metaConversationId },
      }).eq('workspace_id', conversation.workspace_id).eq('id', conversation.id);
    }

    const history = await pagedGraph(messageHistoryUrl(state.provider, metaConversationId, token, version), maxPages);
    const inserted = await insertMessages({
      workspaceId: conversation.workspace_id,
      conversationId: conversation.id,
      leadId: conversation.lead_id,
      connectionId: state.id,
      provider: state.provider,
      accountId,
      messages: history.items,
    });

    const { error: completionError } = await admin
      .from('lead_conversations')
      .update({
        meta_history_complete: history.complete,
        meta_history_synced_at: new Date().toISOString(),
        meta_history_error: null,
      })
      .eq('workspace_id', conversation.workspace_id)
      .eq('connection_id', conversation.connection_id)
      .eq('id', conversation.id);
    if (completionError) throw completionError;

    return { conversationsDiscovered: 0, messagesInserted: inserted, errors };
  } catch (historyError) {
    errors.push(describeError(historyError));
    return { conversationsDiscovered: 0, messagesInserted: 0, errors };
  }
}

export async function backfillMetaConversationHistoryBatch(options?: {
  workspaceId?: string;
  connectionIds?: string[];
  batchSize?: number;
  concurrency?: number;
  maxPages?: number;
}): Promise<MetaHistoryBatchResult> {
  const admin = createSupabaseAdminClient();
  const batchSize = Math.max(1, Math.min(options?.batchSize || 12, 1000));
  const concurrency = Math.max(1, Math.min(options?.concurrency || 4, 12));
  const maxPages = Math.max(1, Math.min(options?.maxPages || 30, 30));

  let query = admin
    .from('lead_conversations')
    .select('id')
    .in('provider', ['facebook', 'instagram'])
    .not('connection_id', 'is', null)
    .eq('meta_history_complete', false)
    .order('meta_history_synced_at', { ascending: true, nullsFirst: true })
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(batchSize);
  if (options?.workspaceId) query = query.eq('workspace_id', options.workspaceId);
  if (options?.connectionIds?.length) query = query.in('connection_id', options.connectionIds);

  const { data: conversations, error } = await query;
  if (error) throw error;

  let cursor = 0;
  let conversationsCompleted = 0;
  let messagesInserted = 0;
  const errors: string[] = [];
  const rowsToProcess = conversations || [];

  async function worker() {
    while (cursor < rowsToProcess.length) {
      const index = cursor;
      cursor += 1;
      const conversation = rowsToProcess[index];
      const result = await backfillMetaConversationMessages(conversation.id, { maxPages });
      messagesInserted += result.messagesInserted;
      if (result.errors.length) {
        errors.push(`${conversation.id}: ${result.errors[0]}`);
        await admin
          .from('lead_conversations')
          .update({
            meta_history_synced_at: new Date().toISOString(),
            meta_history_error: result.errors[0],
          })
          .eq('id', conversation.id)
          .eq('meta_history_complete', false);
      } else {
        const { data: refreshed } = await admin
          .from('lead_conversations')
          .select('meta_history_complete')
          .eq('id', conversation.id)
          .maybeSingle();
        if (refreshed?.meta_history_complete) conversationsCompleted += 1;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, rowsToProcess.length) }, () => worker())
  );

  let remainingQuery = admin
    .from('lead_conversations')
    .select('id', { count: 'exact', head: true })
    .in('provider', ['facebook', 'instagram'])
    .not('connection_id', 'is', null)
    .eq('meta_history_complete', false);
  if (options?.workspaceId) remainingQuery = remainingQuery.eq('workspace_id', options.workspaceId);
  if (options?.connectionIds?.length) remainingQuery = remainingQuery.in('connection_id', options.connectionIds);
  const { count: remaining, error: remainingError } = await remainingQuery;
  if (remainingError) throw remainingError;

  return {
    conversationsScanned: rowsToProcess.length,
    conversationsCompleted,
    messagesInserted,
    remaining: remaining || 0,
    errors: errors.slice(0, 50),
  };
}
