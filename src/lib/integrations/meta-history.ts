import 'server-only';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { decryptIntegrationSecret, decryptSecretPayload } from '@/lib/integrations/secrets';
import { metaFetchJson } from '@/lib/integrations/meta-http';

type MetaRecord = Record<string, unknown>;
type Provider = 'facebook' | 'instagram';

type ConnectionState = {
  id: string;
  provider: Provider;
  displayName: string;
  config: Record<string, unknown>;
  pageTokens: Array<Record<string, unknown>>;
  fallbackToken: string | null;
};

export type MetaHistoryResult = {
  conversationsDiscovered: number;
  messagesInserted: number;
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

function errorMessage(payload: MetaRecord, status: number) {
  const error = record(payload.error);
  return typeof error.message === 'string' ? error.message : `Meta request failed (${status}).`;
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
  return result;
}

function pageTokenForAccount(state: ConnectionState, accountId: string) {
  const pages = rows(state.config.pages);
  const owningPage = pages.find((page) => {
    if (String(page.id || '') === accountId) return true;
    const instagram = record(page.instagram_business_account);
    return String(instagram.id || '') === accountId;
  });
  const pageId = String(owningPage?.id || accountId);
  const tokenRow = state.pageTokens.find((row) => String(row.id || '') === pageId);
  return typeof tokenRow?.access_token === 'string' ? tokenRow.access_token : state.fallbackToken;
}

async function loadConnectionState(connectionId: string): Promise<ConnectionState | null> {
  const admin = createSupabaseAdminClient();
  const [{ data: connection }, { data: secret }] = await Promise.all([
    admin
      .from('integration_connections')
      .select('id,provider,display_name,config,status')
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
    id: connection.id,
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

function accountDescriptor(state: ConnectionState, page: MetaRecord) {
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

function conversationListUrl(provider: Provider, accountId: string, token: string, version: string, includePreviewMessage: boolean) {
  const url = new URL(`https://graph.facebook.com/${version}/${accountId}/conversations`);
  if (provider === 'instagram') url.searchParams.set('platform', 'instagram');
  const messageFields = provider === 'facebook'
    ? 'id,created_time,from,to,message,tags,attachments{id,mime_type,name,size,image_data,video_data,file_url}'
    : 'id,created_time,from,to,message,attachments{id,mime_type,name,size,image_data,video_data,file_url}';
  const baseFields = provider === 'facebook'
    ? 'id,updated_time,snippet,participants,link,can_reply,is_subscribed,message_count,scoped_thread_key'
    : 'id,updated_time,participants';
  url.searchParams.set('fields', includePreviewMessage ? `${baseFields},messages.limit(1){${messageFields}}` : baseFields);
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

  let inserted = 0;
  for (let start = 0; start < mapped.length; start += 100) {
    const chunk = mapped.slice(start, start + 100);
    if (!chunk.length) continue;
    const ids = chunk.map((row) => row.external_message_id);
    const { data: existing } = await admin
      .from('lead_messages')
      .select('external_message_id')
      .eq('provider', input.provider)
      .in('external_message_id', ids);
    const existingIds = new Set((existing || []).map((row) => row.external_message_id));
    const fresh = chunk.filter((row) => !existingIds.has(row.external_message_id));
    if (!fresh.length) continue;
    const { error } = await admin.from('lead_messages').insert(fresh);
    if (error) throw error;
    inserted += fresh.length;
  }
  return inserted;
}

export async function discoverMetaConversationHistory(options?: { maxPages?: number }): Promise<MetaHistoryResult> {
  const admin = createSupabaseAdminClient();
  const version = process.env.META_GRAPH_VERSION?.trim() || 'v26.0';
  const maxPages = Math.max(1, Math.min(options?.maxPages || 12, 20));
  const errors: string[] = [];
  let conversationsDiscovered = 0;
  let messagesInserted = 0;

  const { data: connections, error } = await admin
    .from('integration_connections')
    .select('id')
    .in('status', ['connected', 'token_expiring'])
    .in('provider', ['facebook', 'instagram']);
  if (error) throw error;

  for (const connectionRow of connections || []) {
    const state = await loadConnectionState(connectionRow.id);
    if (!state) continue;
    const pages = rows(state.config.pages);

    for (const page of pages) {
      const descriptor = accountDescriptor(state, page);
      if (!descriptor) continue;
      const token = pageTokenForAccount(state, descriptor.accountId);
      if (!token) continue;

      try {
        const conversations = await pagedGraph(
          conversationListUrl(state.provider, descriptor.accountId, token, version, true),
          maxPages
        );

        for (const metaConversation of conversations) {
          const customer = customerFromParticipants(metaConversation.participants, descriptor.accountId);
          const customerId = String(customer?.id || '');
          if (!customerId || customerId === descriptor.accountId) continue;
          const externalThreadId = `${descriptor.accountId}:${customerId}`;

          let { data: localConversation } = await admin
            .from('lead_conversations')
            .select('id,lead_id,last_message_at')
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
                  message_count: metaConversation.message_count || null,
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
                connection_id: state.id,
                provider: state.provider,
                external_thread_id: externalThreadId,
                external_contact_id: customerId,
                customer_name: String(customer?.name || customer?.username || (state.provider === 'facebook' ? 'Messenger Traveler' : 'Instagram Traveler')),
                customer_phone: `${state.provider}:${customerId}`,
                last_message_preview: detail.body,
                last_message_at: updatedAt,
                status: 'open',
                unread_count: 0,
                metadata,
              })
              .select('id,lead_id,last_message_at')
              .single();
            if (createError || !created) {
              if (createError?.code === '23505') {
                const retry = await admin
                  .from('lead_conversations')
                  .select('id,lead_id,last_message_at')
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

          if (localConversation && preview) {
            messagesInserted += await insertMessages({
              conversationId: localConversation.id,
              leadId: localConversation.lead_id,
              connectionId: state.id,
              provider: state.provider,
              accountId: descriptor.accountId,
              messages: [preview],
            });
          }
        }
      } catch (pageError) {
        errors.push(`${state.provider}:${descriptor.accountId}: ${pageError instanceof Error ? pageError.message : String(pageError)}`);
      }
    }
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
    .select('id,lead_id,connection_id,provider,external_thread_id,external_contact_id,metadata,last_message_at')
    .eq('id', conversationId)
    .maybeSingle();
  if (error) throw error;
  if (!conversation || !conversation.connection_id || !['facebook', 'instagram'].includes(conversation.provider)) {
    return { conversationsDiscovered: 0, messagesInserted: 0, errors: [] };
  }

  const state = await loadConnectionState(conversation.connection_id);
  if (!state) return { conversationsDiscovered: 0, messagesInserted: 0, errors: ['Connection credentials unavailable.'] };

  const metadata = (conversation.metadata || {}) as Record<string, unknown>;
  const prefix = String(conversation.external_thread_id || '').split(':')[0];
  const accountId = state.provider === 'instagram'
    ? String(metadata.instagram_business_account_id || prefix || '')
    : String(metadata.meta_page_id || prefix || '');
  if (!accountId) return { conversationsDiscovered: 0, messagesInserted: 0, errors: ['Provider account ID unavailable.'] };

  const token = pageTokenForAccount(state, accountId);
  if (!token) return { conversationsDiscovered: 0, messagesInserted: 0, errors: ['Provider token unavailable.'] };

  try {
    let metaConversationId = typeof metadata.meta_conversation_id === 'string' ? metadata.meta_conversation_id : '';
    if (!metaConversationId) {
      const list = await pagedGraph(conversationListUrl(state.provider, accountId, token, version, false), 20);
      const matched = list.find((item) => {
        const customer = customerFromParticipants(item.participants, accountId);
        return String(customer?.id || '') === String(conversation.external_contact_id || '');
      });
      metaConversationId = String(matched?.id || '');
      if (!metaConversationId) return { conversationsDiscovered: 0, messagesInserted: 0, errors: ['Meta conversation could not be resolved.'] };
      await admin.from('lead_conversations').update({
        metadata: { ...metadata, meta_conversation_id: metaConversationId },
      }).eq('id', conversation.id);
    }

    const history = await pagedGraph(messageHistoryUrl(state.provider, metaConversationId, token, version), maxPages);
    const inserted = await insertMessages({
      conversationId: conversation.id,
      leadId: conversation.lead_id,
      connectionId: state.id,
      provider: state.provider,
      accountId,
      messages: history,
    });

    return { conversationsDiscovered: 0, messagesInserted: inserted, errors };
  } catch (historyError) {
    errors.push(historyError instanceof Error ? historyError.message : String(historyError));
    return { conversationsDiscovered: 0, messagesInserted: 0, errors };
  }
}
