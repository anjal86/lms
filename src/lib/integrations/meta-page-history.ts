import 'server-only';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { decryptIntegrationSecret, decryptSecretPayload } from '@/lib/integrations/secrets';
import { metaFetchJson } from '@/lib/integrations/meta-http';

type Provider = 'facebook' | 'instagram';
type MetaRecord = Record<string, unknown>;

export type SelectedPageHistoryResult = {
  conversationsDiscovered: number;
  conversationsScanned: number;
  previewMessagesInserted: number;
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

function customerFromParticipants(value: unknown, accountId: string) {
  const participants = rows(record(value).data);
  return participants.find((participant) => String(participant.id || '') !== accountId) || participants[0] || null;
}

function previewBody(message: MetaRecord | null) {
  if (!message) return null;
  const text = typeof message.message === 'string' ? message.message.trim() : '';
  if (text) return text;
  const attachments = rows(record(message.attachments).data);
  if (!attachments.length) return null;
  const first = attachments[0];
  const mime = String(first.mime_type || '');
  if (mime.startsWith('image/') || Object.keys(record(first.image_data)).length) return '[Photo]';
  if (mime.startsWith('audio/') || String(first.name || '').includes('audioclip')) return '[Voice message]';
  if (mime.startsWith('video/') || Object.keys(record(first.video_data)).length) return '[Video]';
  return '[Attachment]';
}

function conversationUrl(provider: Provider, accountId: string, token: string, version: string) {
  const url = new URL(`https://graph.facebook.com/${version}/${accountId}/conversations`);
  if (provider === 'instagram') url.searchParams.set('platform', 'instagram');
  const messageFields = provider === 'facebook'
    ? 'id,created_time,from,to,message,tags,attachments{id,mime_type,name,size,image_data,video_data,file_url}'
    : 'id,created_time,from,to,message,attachments{id,mime_type,name,size,image_data,video_data,file_url}';
  const baseFields = provider === 'facebook'
    ? 'id,updated_time,snippet,participants,link,can_reply,is_subscribed,message_count,scoped_thread_key'
    : 'id,updated_time,participants';
  url.searchParams.set('fields', `${baseFields},messages.limit(1){${messageFields}}`);
  url.searchParams.set('limit', '50');
  url.searchParams.set('access_token', token);
  return url;
}

async function pagedGraph(url: URL, maxPages: number) {
  const result: MetaRecord[] = [];
  let next: string | null = url.toString();
  for (let page = 0; page < maxPages && next; page += 1) {
    const { response, data } = await metaFetchJson<MetaRecord>(next, {}, { timeoutMs: 15_000, retries: 2 });
    if (!response.ok) {
      const providerError = record(data.error);
      throw new Error(typeof providerError.message === 'string' ? providerError.message : `Meta request failed (${response.status}).`);
    }
    result.push(...rows(data.data));
    const paging = record(data.paging);
    next = typeof paging.next === 'string' ? paging.next : null;
  }
  return result;
}

export async function discoverSelectedMetaPageHistory(input: {
  provider: Provider;
  accountId: string;
  connectionId: string;
  pageId: string;
  maxPages?: number;
}): Promise<SelectedPageHistoryResult> {
  const admin = createSupabaseAdminClient();
  const version = process.env.META_GRAPH_VERSION?.trim() || 'v26.0';
  const maxPages = Math.max(1, Math.min(input.maxPages || 30, 40));
  const errors: string[] = [];
  let conversationsDiscovered = 0;
  let previewMessagesInserted = 0;

  const [{ data: connection, error: connectionError }, { data: secret, error: secretError }] = await Promise.all([
    admin
      .from('integration_connections')
      .select('id,provider,display_name,config,status')
      .eq('id', input.connectionId)
      .maybeSingle(),
    admin
      .from('integration_secrets')
      .select('access_token,secret_payload')
      .eq('connection_id', input.connectionId)
      .maybeSingle(),
  ]);
  if (connectionError) throw connectionError;
  if (secretError) throw secretError;
  if (!connection || !secret || connection.provider !== input.provider) {
    return { conversationsDiscovered: 0, conversationsScanned: 0, previewMessagesInserted: 0, errors: ['Selected provider connection is unavailable.'] };
  }

  const payload = decryptSecretPayload(secret.secret_payload || {}) as Record<string, unknown>;
  const pageTokens = Array.isArray(payload.page_access_tokens)
    ? payload.page_access_tokens as Array<Record<string, unknown>>
    : [];
  const pageToken = pageTokens.find((row) => String(row.id || '') === input.pageId);
  const token = typeof pageToken?.access_token === 'string'
    ? pageToken.access_token
    : decryptIntegrationSecret(secret.access_token);
  if (!token) {
    return { conversationsDiscovered: 0, conversationsScanned: 0, previewMessagesInserted: 0, errors: ['Selected Page access token is unavailable.'] };
  }

  const configPages = rows(record(connection.config).pages);
  const configuredPage = configPages.find((page) => String(page.id || '') === input.pageId);
  const pageName = input.provider === 'facebook'
    ? String(configuredPage?.name || connection.display_name || 'Facebook Page')
    : String(record(configuredPage?.instagram_business_account).username || configuredPage?.name || connection.display_name || 'Instagram');

  let metaConversations: MetaRecord[] = [];
  try {
    metaConversations = await pagedGraph(conversationUrl(input.provider, input.accountId, token, version), maxPages);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return { conversationsDiscovered, conversationsScanned: 0, previewMessagesInserted, errors };
  }

  for (const metaConversation of metaConversations) {
    try {
      const customer = customerFromParticipants(metaConversation.participants, input.accountId);
      const customerId = String(customer?.id || '');
      if (!customerId || customerId === input.accountId) continue;

      const externalThreadId = `${input.accountId}:${customerId}`;
      const preview = rows(record(metaConversation.messages).data)[0] || null;
      const body = previewBody(preview);
      const updatedAt = typeof metaConversation.updated_time === 'string'
        ? new Date(metaConversation.updated_time).toISOString()
        : preview && typeof preview.created_time === 'string'
          ? new Date(preview.created_time).toISOString()
          : new Date().toISOString();

      const { data: existing, error: existingError } = await admin
        .from('lead_conversations')
        .select('id,lead_id,metadata')
        .eq('provider', input.provider)
        .eq('external_thread_id', externalThreadId)
        .maybeSingle();
      if (existingError) throw existingError;

      const providerMetadata = input.provider === 'facebook'
        ? {
            meta_page_id: input.accountId,
            meta_page_name: pageName,
            meta_conversation_id: String(metaConversation.id || ''),
            scoped_thread_key: metaConversation.scoped_thread_key || metaConversation.id,
            message_count: metaConversation.message_count || null,
            history_discovered_at: new Date().toISOString(),
          }
        : {
            instagram_business_account_id: input.accountId,
            account_name: pageName,
            meta_conversation_id: String(metaConversation.id || ''),
            history_discovered_at: new Date().toISOString(),
          };

      let conversationId = existing?.id as string | undefined;
      let leadId = (existing?.lead_id as string | null | undefined) || null;

      if (!existing) {
        const { data: created, error: createError } = await admin
          .from('lead_conversations')
          .insert({
            connection_id: input.connectionId,
            provider: input.provider,
            external_thread_id: externalThreadId,
            external_contact_id: customerId,
            customer_name: String(customer?.name || customer?.username || (input.provider === 'facebook' ? 'Messenger Traveler' : 'Instagram Traveler')),
            customer_phone: `${input.provider}:${customerId}`,
            last_message_preview: body,
            last_message_at: updatedAt,
            status: 'open',
            unread_count: 0,
            metadata: providerMetadata,
          })
          .select('id,lead_id')
          .single();
        if (createError || !created) {
          if (createError?.code === '23505') continue;
          throw createError || new Error('Unable to create Page conversation.');
        }
        conversationId = created.id;
        leadId = created.lead_id;
        conversationsDiscovered += 1;
      } else {
        const existingMetadata = record(existing.metadata);
        const { error: updateError } = await admin
          .from('lead_conversations')
          .update({
            connection_id: input.connectionId,
            last_message_preview: body || undefined,
            last_message_at: updatedAt,
            metadata: { ...existingMetadata, ...providerMetadata },
          })
          .eq('id', existing.id);
        if (updateError) throw updateError;
      }

      if (conversationId && preview?.id) {
        const externalMessageId = String(preview.id);
        const { data: duplicate } = await admin
          .from('lead_messages')
          .select('id')
          .eq('provider', input.provider)
          .eq('external_message_id', externalMessageId)
          .maybeSingle();

        if (!duplicate) {
          const senderId = String(record(preview.from).id || '');
          const { error: insertError } = await admin.from('lead_messages').insert({
            conversation_id: conversationId,
            lead_id: leadId,
            connection_id: input.connectionId,
            provider: input.provider,
            external_message_id: externalMessageId,
            direction: senderId === input.accountId ? 'outbound' : 'inbound',
            message_type: 'text',
            body,
            metadata: {
              from: preview.from,
              to: preview.to,
              attachments: preview.attachments,
              history_preview: true,
            },
            delivery_status: 'sent',
            sent_at: typeof preview.created_time === 'string' ? new Date(preview.created_time).toISOString() : updatedAt,
          });
          if (insertError) throw insertError;
          previewMessagesInserted += 1;
        }
      }
    } catch (conversationError) {
      errors.push(conversationError instanceof Error ? conversationError.message : String(conversationError));
    }
  }

  return {
    conversationsDiscovered,
    conversationsScanned: metaConversations.length,
    previewMessagesInserted,
    errors: errors.slice(0, 50),
  };
}
