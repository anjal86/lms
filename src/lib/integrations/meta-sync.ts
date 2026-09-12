import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { decryptIntegrationSecret, decryptSecretPayload } from '@/lib/integrations/secrets';
import { metaFetchJson } from '@/lib/integrations/meta-http';

export type MetaSyncProvider = 'facebook' | 'instagram';

type SyncThread = {
  provider: MetaSyncProvider;
  connectionId: string;
  accountId: string;
  accountName: string;
  externalThreadId: string;
  externalContactId: string;
  customerName: string;
  customerEmail: string | null;
  customerAvatarUrl: string | null;
  updatedAt: string;
  snippet: string | null;
  unreadCount: number;
  metadata: Record<string, unknown>;
  messages: Array<{
    id: string;
    direction: 'inbound' | 'outbound';
    sentAt: string;
    body: string | null;
    messageType: string;
    metadata: Record<string, unknown>;
  }>;
};

export type MetaSyncResult = {
  success: boolean;
  pagesCount: number;
  conversationsCount: number;
  messagesCount: number;
  errors: string[];
};

function asArray(value: unknown) {
  return Array.isArray(value) ? value as Array<Record<string, any>> : [];
}

function attachmentDetails(message: Record<string, any>) {
  const attachList = asArray(message.attachments?.data);
  const first = attachList[0];
  let messageType = 'text';
  let body = typeof message.message === 'string' ? message.message.trim() : '';
  let attachmentUrl: string | null = null;
  let previewUrl: string | null = null;
  let fileName: string | null = null;
  let fileSize: number | null = null;
  let mimeType: string | null = null;

  if (first) {
    const imageData = first.image_data as Record<string, unknown> | undefined;
    const videoData = first.video_data as Record<string, unknown> | undefined;
    mimeType = typeof first.mime_type === 'string' ? first.mime_type : null;
    fileName = typeof first.name === 'string' ? first.name : null;
    fileSize = typeof first.size === 'number' ? first.size : null;
    if (imageData?.url) {
      messageType = 'image';
      attachmentUrl = String(imageData.url);
      previewUrl = String(imageData.preview_url || imageData.url);
      if (!body) body = '[Photo]';
    } else if (videoData?.url || mimeType?.startsWith('video/')) {
      messageType = 'video';
      attachmentUrl = String(videoData?.url || first.file_url || '');
      previewUrl = attachmentUrl;
      if (!body) body = '[Video]';
    } else if (mimeType?.startsWith('audio/') || fileName?.includes('audioclip')) {
      messageType = 'audio';
      attachmentUrl = String(first.file_url || '');
      previewUrl = attachmentUrl;
      if (!body) body = '[Voice message]';
    } else if (first.file_url) {
      messageType = 'file';
      attachmentUrl = String(first.file_url);
      if (!body) body = `[File: ${fileName || 'Attachment'}]`;
    } else {
      messageType = 'media';
      if (!body) body = '[Media Attachment]';
    }
  }

  return {
    body: body || null,
    messageType,
    metadata: {
      from: message.from,
      to: message.to,
      tags: asArray(message.tags?.data).map((tag) => tag.name).filter(Boolean),
      attachments: message.attachments,
      attachment_url: attachmentUrl,
      preview_url: previewUrl,
      file_name: fileName,
      file_size: fileSize,
      mime_type: mimeType,
      synced_from_history: true,
    },
  };
}

async function pagedGraph(url: URL, maxPages = 8) {
  const items: Array<Record<string, any>> = [];
  let next: string | null = url.toString();
  for (let page = 0; page < maxPages && next; page += 1) {
    const { response, data } = await metaFetchJson<Record<string, any>>(next);
    if (!response.ok) {
      const providerError = data.error as Record<string, unknown> | undefined;
      throw new Error(typeof providerError?.message === 'string' ? providerError.message : `Meta request failed (${response.status}).`);
    }
    items.push(...asArray(data.data));
    next = typeof data.paging?.next === 'string' ? data.paging.next : null;
  }
  return items;
}

async function facebookThreads(input: {
  connectionId: string;
  pageId: string;
  pageName: string;
  token: string;
  version: string;
  since?: string | null;
}): Promise<SyncThread[]> {
  const url = new URL(`https://graph.facebook.com/${input.version}/${input.pageId}/conversations`);
  url.searchParams.set('fields', 'id,updated_time,snippet,unread_count,participants,link,can_reply,is_subscribed,message_count,scoped_thread_key,messages.limit(100){id,created_time,from,to,message,tags,attachments{id,mime_type,name,size,image_data,video_data,file_url}}');
  url.searchParams.set('limit', '100');
  if (input.since) url.searchParams.set('since', Math.floor(new Date(input.since).getTime() / 1000).toString());
  url.searchParams.set('access_token', input.token);
  const conversations = await pagedGraph(url);

  return conversations.flatMap((conversation) => {
    const participants = asArray(conversation.participants?.data);
    const customer = participants.find((p) => String(p.id || '') !== input.pageId) || participants[0];
    const customerId = customer?.id ? String(customer.id) : '';
    if (!customerId) return [];
    const messages = asArray(conversation.messages?.data);
    const mapped = messages.filter((message) => message.id).map((message) => {
      const details = attachmentDetails(message);
      return {
        id: String(message.id),
        direction: String(message.from?.id || '') === input.pageId ? 'outbound' as const : 'inbound' as const,
        sentAt: message.created_time ? new Date(message.created_time).toISOString() : new Date().toISOString(),
        body: details.body,
        messageType: details.messageType,
        metadata: {
          ...details.metadata,
          sent_via: String(message.from?.id || '') === input.pageId ? 'meta_business_suite' : 'customer',
        },
      };
    });
    const updatedAt = conversation.updated_time ? new Date(conversation.updated_time).toISOString() : new Date().toISOString();
    return [{
      provider: 'facebook' as const,
      connectionId: input.connectionId,
      accountId: input.pageId,
      accountName: input.pageName,
      externalThreadId: `${input.pageId}:${customerId}`,
      externalContactId: customerId,
      customerName: String(customer?.name || 'Messenger Traveler'),
      customerEmail: typeof customer?.email === 'string' ? customer.email : null,
      customerAvatarUrl: null,
      updatedAt,
      snippet: typeof conversation.snippet === 'string' ? conversation.snippet : mapped[0]?.body || null,
      unreadCount: Number(conversation.unread_count) || 0,
      metadata: {
        meta_page_id: input.pageId,
        meta_page_name: input.pageName,
        meta_link: conversation.link ? `https://business.facebook.com${conversation.link}` : null,
        can_reply: conversation.can_reply ?? true,
        is_subscribed: conversation.is_subscribed ?? true,
        message_count: conversation.message_count ?? mapped.length,
        scoped_thread_key: conversation.scoped_thread_key || conversation.id,
        customer_id: customerId,
        synced_at: new Date().toISOString(),
      },
      messages: mapped,
    }];
  });
}

async function instagramThreads(input: {
  connectionId: string;
  instagramId: string;
  accountName: string;
  token: string;
  version: string;
  since?: string | null;
}): Promise<SyncThread[]> {
  const url = new URL(`https://graph.facebook.com/${input.version}/${input.instagramId}/conversations`);
  url.searchParams.set('platform', 'instagram');
  url.searchParams.set('fields', 'id,updated_time,participants,messages.limit(100){id,created_time,from,to,message,attachments{id,mime_type,name,size,image_data,video_data,file_url}}');
  url.searchParams.set('limit', '100');
  if (input.since) url.searchParams.set('since', Math.floor(new Date(input.since).getTime() / 1000).toString());
  url.searchParams.set('access_token', input.token);
  const conversations = await pagedGraph(url);

  return conversations.flatMap((conversation) => {
    const participants = asArray(conversation.participants?.data);
    const customer = participants.find((p) => String(p.id || '') !== input.instagramId) || participants[0];
    const customerId = customer?.id ? String(customer.id) : '';
    if (!customerId) return [];
    const messages = asArray(conversation.messages?.data);
    const mapped = messages.filter((message) => message.id).map((message) => {
      const details = attachmentDetails(message);
      const outbound = String(message.from?.id || '') === input.instagramId;
      return {
        id: String(message.id),
        direction: outbound ? 'outbound' as const : 'inbound' as const,
        sentAt: message.created_time ? new Date(message.created_time).toISOString() : new Date().toISOString(),
        body: details.body,
        messageType: details.messageType,
        metadata: { ...details.metadata, sent_via: outbound ? 'meta_business_suite' : 'customer' },
      };
    });
    const updatedAt = conversation.updated_time ? new Date(conversation.updated_time).toISOString() : new Date().toISOString();
    return [{
      provider: 'instagram' as const,
      connectionId: input.connectionId,
      accountId: input.instagramId,
      accountName: input.accountName,
      externalThreadId: `${input.instagramId}:${customerId}`,
      externalContactId: customerId,
      customerName: String(customer?.username || customer?.name || 'Instagram Traveler'),
      customerEmail: null,
      customerAvatarUrl: null,
      updatedAt,
      snippet: mapped[0]?.body || null,
      unreadCount: 0,
      metadata: {
        instagram_business_account_id: input.instagramId,
        account_name: input.accountName,
        customer_id: customerId,
        synced_at: new Date().toISOString(),
      },
      messages: mapped,
    }];
  });
}

async function persistThread(thread: SyncThread) {
  const admin = createSupabaseAdminClient();
  const { data: conversation, error: conversationError } = await admin
    .from('lead_conversations')
    .upsert({
      provider: thread.provider,
      connection_id: thread.connectionId,
      external_thread_id: thread.externalThreadId,
      external_contact_id: thread.externalContactId,
      customer_name: thread.customerName,
      customer_email: thread.customerEmail,
      last_message_preview: thread.snippet,
      status: 'open',
      last_message_at: thread.updatedAt,
      metadata: thread.metadata,
    }, { onConflict: 'provider,external_thread_id' })
    .select('id,lead_id')
    .single();
  if (conversationError || !conversation) throw conversationError || new Error('Conversation upsert failed.');

  let inserted = 0;
  for (const message of [...thread.messages].reverse()) {
    const { data, error } = await admin.rpc('ingest_channel_message', {
      p_lead_id: conversation.lead_id || null,
      p_connection_id: thread.connectionId,
      p_provider: thread.provider,
      p_external_thread_id: thread.externalThreadId,
      p_external_contact_id: thread.externalContactId,
      p_customer_name: thread.customerName,
      p_customer_phone: `${thread.provider}:${thread.externalContactId}`,
      p_customer_email: thread.customerEmail,
      p_customer_avatar_url: thread.customerAvatarUrl,
      p_external_message_id: message.id,
      p_direction: message.direction,
      p_message_type: message.messageType,
      p_body: message.body,
      p_sent_at: message.sentAt,
      p_message_metadata: message.metadata,
      p_conversation_metadata: thread.metadata,
      p_source_label: thread.provider === 'instagram' ? 'Instagram DM' : 'Facebook Messenger',
    });
    if (error) throw error;
    const result = (data || {}) as Record<string, unknown>;
    if (result.message_inserted === true) inserted += 1;
  }

  // Provider unread values are authoritative during history synchronization.
  await admin
    .from('lead_conversations')
    .update({ unread_count: thread.unreadCount })
    .eq('id', conversation.id);

  return { inserted };
}

export async function syncMetaConversations(options?: { connectionId?: string; pageId?: string }): Promise<MetaSyncResult> {
  const admin = createSupabaseAdminClient();
  const errors: string[] = [];
  let pagesCount = 0;
  let conversationsCount = 0;
  let messagesCount = 0;

  let query = admin
    .from('integration_connections')
    .select('id,provider,display_name,config,status,last_external_timestamp')
    .in('status', ['connected', 'token_expiring'])
    .in('provider', ['facebook', 'instagram']);
  if (options?.connectionId) query = query.eq('id', options.connectionId);

  const { data: connections, error } = await query;
  if (error) throw error;
  if (!connections?.length) return { success: true, pagesCount: 0, conversationsCount: 0, messagesCount: 0, errors: [] };

  const version = process.env.META_GRAPH_VERSION?.trim() || 'v26.0';

  for (const connection of connections) {
    try {
      const { data: secrets } = await admin
        .from('integration_secrets')
        .select('access_token,secret_payload')
        .eq('connection_id', connection.id)
        .maybeSingle();
      if (!secrets) throw new Error('Connection credentials are missing.');
      const payload = decryptSecretPayload(secrets.secret_payload || {}) as Record<string, unknown>;
      const fallbackToken = decryptIntegrationSecret(secrets.access_token);
      const pageTokens = Array.isArray(payload.page_access_tokens)
        ? payload.page_access_tokens as Array<Record<string, unknown>>
        : [];
      const config = (connection.config || {}) as Record<string, unknown>;
      const pages = Array.isArray(config.pages) ? config.pages as Array<Record<string, any>> : [];
      let newestTimestamp = connection.last_external_timestamp as string | null;

      for (const page of pages) {
        const pageId = String(page.id || '');
        if (!pageId || (options?.pageId && options.pageId !== pageId)) continue;
        const pageTokenRow = pageTokens.find((item) => String(item.id || '') === pageId);
        const token = typeof pageTokenRow?.access_token === 'string' ? pageTokenRow.access_token : fallbackToken;
        if (!token) continue;

        let threads: SyncThread[] = [];
        if (connection.provider === 'instagram') {
          const instagramId = String(page.instagram_business_account?.id || '');
          if (!instagramId) continue;
          threads = await instagramThreads({
            connectionId: connection.id,
            instagramId,
            accountName: String(page.instagram_business_account?.username || page.name || connection.display_name || 'Instagram'),
            token,
            version,
            since: connection.last_external_timestamp,
          });
        } else {
          threads = await facebookThreads({
            connectionId: connection.id,
            pageId,
            pageName: String(page.name || connection.display_name || 'Facebook Page'),
            token,
            version,
            since: connection.last_external_timestamp,
          });
        }

        pagesCount += 1;
        for (const thread of threads) {
          const result = await persistThread(thread);
          conversationsCount += 1;
          messagesCount += result.inserted;
          if (!newestTimestamp || new Date(thread.updatedAt) > new Date(newestTimestamp)) newestTimestamp = thread.updatedAt;
        }
      }

      await admin
        .from('integration_connections')
        .update({
          last_sync_at: new Date().toISOString(),
          last_external_timestamp: newestTimestamp,
          last_error: null,
          last_health_check_at: new Date().toISOString(),
        })
        .eq('id', connection.id);
    } catch (connectionError) {
      const message = connectionError instanceof Error ? connectionError.message : String(connectionError);
      errors.push(`${connection.provider} ${connection.display_name || connection.id}: ${message}`);
      await admin
        .from('integration_connections')
        .update({ last_error: message.slice(0, 1000), last_health_check_at: new Date().toISOString() })
        .eq('id', connection.id);
    }
  }

  return {
    success: errors.length === 0,
    pagesCount,
    conversationsCount,
    messagesCount,
    errors,
  };
}
