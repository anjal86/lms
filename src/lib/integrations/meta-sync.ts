import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { decryptIntegrationSecret, decryptSecretPayload } from '@/lib/integrations/secrets';
import { metaFetchJson } from '@/lib/integrations/meta-http';
import { fetchMetaCustomerProfile, type MetaCustomerProfile } from '@/lib/integrations/meta-profile';

export type MetaSyncProvider = 'facebook' | 'instagram';

type MetaRecord = Record<string, unknown>;
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
  avatarResolved: boolean;
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

export type MetaAvatarRefreshResult = {
  attempted: number;
  updated: number;
  unavailable: number;
  errors: string[];
};

function record(value: unknown): MetaRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as MetaRecord : {};
}

function asArray(value: unknown): MetaRecord[] {
  return Array.isArray(value)
    ? value.filter((item): item is MetaRecord => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : [];
}

function attachmentDetails(message: MetaRecord) {
  const attachmentsRecord = record(message.attachments);
  const attachList = asArray(attachmentsRecord.data);
  const first = attachList[0];
  let messageType = 'text';
  let body = typeof message.message === 'string' ? message.message.trim() : '';
  let attachmentUrl: string | null = null;
  let previewUrl: string | null = null;
  let fileName: string | null = null;
  let fileSize: number | null = null;
  let mimeType: string | null = null;

  if (first) {
    const imageData = record(first.image_data);
    const videoData = record(first.video_data);
    mimeType = typeof first.mime_type === 'string' ? first.mime_type : null;
    fileName = typeof first.name === 'string' ? first.name : null;
    fileSize = typeof first.size === 'number' ? first.size : null;
    if (typeof imageData.url === 'string') {
      messageType = 'image';
      attachmentUrl = imageData.url;
      previewUrl = typeof imageData.preview_url === 'string' ? imageData.preview_url : imageData.url;
      if (!body) body = '[Photo]';
    } else if (typeof videoData.url === 'string' || mimeType?.startsWith('video/')) {
      messageType = 'video';
      attachmentUrl = typeof videoData.url === 'string' ? videoData.url : typeof first.file_url === 'string' ? first.file_url : '';
      previewUrl = attachmentUrl;
      if (!body) body = '[Video]';
    } else if (mimeType?.startsWith('audio/') || fileName?.includes('audioclip')) {
      messageType = 'audio';
      attachmentUrl = typeof first.file_url === 'string' ? first.file_url : '';
      previewUrl = attachmentUrl;
      if (!body) body = '[Voice message]';
    } else if (typeof first.file_url === 'string') {
      messageType = 'file';
      attachmentUrl = first.file_url;
      if (!body) body = `[File: ${fileName || 'Attachment'}]`;
    } else {
      messageType = 'media';
      if (!body) body = '[Media Attachment]';
    }
  }

  const tagsRecord = record(message.tags);
  return {
    body: body || null,
    messageType,
    metadata: {
      from: message.from,
      to: message.to,
      tags: asArray(tagsRecord.data).map((tag) => tag.name).filter((name): name is string => typeof name === 'string'),
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
  const items: MetaRecord[] = [];
  let next: string | null = url.toString();
  for (let page = 0; page < maxPages && next; page += 1) {
    const { response, data: payload } = await metaFetchJson<MetaRecord>(next);
    if (!response.ok) {
      const providerError = record(payload.error);
      throw new Error(typeof providerError.message === 'string' ? providerError.message : `Meta request failed (${response.status}).`);
    }
    items.push(...asArray(payload.data));
    const paging = record(payload.paging);
    next = typeof paging.next === 'string' ? paging.next : null;
  }
  return items;
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function run() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => run()));
  return results;
}

async function resolveProfiles(input: {
  provider: MetaSyncProvider;
  accountId: string;
  token: string;
  version: string;
  customerIds: string[];
}) {
  const uniqueIds = Array.from(new Set(input.customerIds.filter((id) => id && id !== input.accountId)));
  const rows = await mapWithConcurrency(uniqueIds, 6, async (customerId) => {
    try {
      const profile = await fetchMetaCustomerProfile({
        provider: input.provider,
        customerId,
        accountId: input.accountId,
        token: input.token,
        version: input.version,
      });
      return [customerId, profile] as const;
    } catch {
      return [customerId, null] as const;
    }
  });
  return new Map<string, MetaCustomerProfile | null>(rows);
}

async function facebookThreads(input: {
  connectionId: string;
  pageId: string;
  pageName: string;
  token: string;
  version: string;
  since?: string | null;
  pageSize?: number;
  maxPages?: number;
}): Promise<SyncThread[]> {
  const pageSize = input.pageSize || 15;
  const maxPages = input.maxPages || 1;
  const url = new URL(`https://graph.facebook.com/${input.version}/${input.pageId}/conversations`);
  url.searchParams.set(
    'fields',
    `id,updated_time,snippet,unread_count,participants,link,can_reply,is_subscribed,message_count,scoped_thread_key,messages.limit(${pageSize}){id,created_time,from,to,message,tags,attachments{id,mime_type,name,size,image_data,video_data,file_url}}`
  );
  url.searchParams.set('limit', String(pageSize));
  if (input.since) url.searchParams.set('since', Math.floor(new Date(input.since).getTime() / 1000).toString());
  url.searchParams.set('access_token', input.token);

  let conversations: MetaRecord[] = [];
  try {
    conversations = await pagedGraph(url, maxPages);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/reduce the amount of data|unknown error|timed out|exceeded/i.test(message)) {
      console.warn(`[Meta Sync] Facebook Page ${input.pageId} hit data threshold (${message}). Retrying with compact limit...`);
      const fallbackUrl = new URL(`https://graph.facebook.com/${input.version}/${input.pageId}/conversations`);
      fallbackUrl.searchParams.set(
        'fields',
        'id,updated_time,snippet,unread_count,participants,link,can_reply,is_subscribed,message_count,scoped_thread_key,messages.limit(5){id,created_time,from,to,message,tags,attachments{id,mime_type,name,size,image_data,video_data,file_url}}'
      );
      fallbackUrl.searchParams.set('limit', '10');
      if (input.since) fallbackUrl.searchParams.set('since', Math.floor(new Date(input.since).getTime() / 1000).toString());
      fallbackUrl.searchParams.set('access_token', input.token);
      conversations = await pagedGraph(fallbackUrl, 1);
    } else {
      throw err;
    }
  }

  const customerIds = conversations.map((conversation) => {
    const participants = asArray(record(conversation.participants).data);
    const customer = participants.find((participant) => String(participant.id || '') !== input.pageId) || participants[0];
    return customer?.id ? String(customer.id) : '';
  }).filter(Boolean);
  const profiles = await resolveProfiles({
    provider: 'facebook',
    accountId: input.pageId,
    token: input.token,
    version: input.version,
    customerIds,
  });

  const threads: SyncThread[] = [];
  for (const conversation of conversations) {
    const participants = asArray(record(conversation.participants).data);
    const customer = participants.find((participant) => String(participant.id || '') !== input.pageId) || participants[0];
    const customerId = customer?.id ? String(customer.id) : '';
    if (!customerId || customerId === input.pageId) continue;
    const profile = profiles.get(customerId) || null;
    const messages = asArray(record(conversation.messages).data);
    const mapped = messages.filter((message) => message.id).map((message) => {
      const details = attachmentDetails(message);
      const senderId = String(record(message.from).id || '');
      return {
        id: String(message.id),
        direction: senderId === input.pageId ? 'outbound' as const : 'inbound' as const,
        sentAt: typeof message.created_time === 'string' ? new Date(message.created_time).toISOString() : new Date().toISOString(),
        body: details.body,
        messageType: details.messageType,
        metadata: {
          ...details.metadata,
          sent_via: senderId === input.pageId ? 'meta_business_suite' : 'customer',
        },
      };
    });
    const updatedAt = typeof conversation.updated_time === 'string'
      ? new Date(conversation.updated_time).toISOString()
      : new Date().toISOString();
    threads.push({
      provider: 'facebook',
      connectionId: input.connectionId,
      accountId: input.pageId,
      accountName: input.pageName,
      externalThreadId: `${input.pageId}:${customerId}`,
      externalContactId: customerId,
      customerName: profile?.name || String(customer?.name || 'Messenger Traveler'),
      customerEmail: typeof customer?.email === 'string' ? customer.email : null,
      customerAvatarUrl: profile?.avatarUrl || null,
      avatarResolved: Boolean(profile),
      updatedAt,
      snippet: typeof conversation.snippet === 'string' ? conversation.snippet : mapped[0]?.body || null,
      unreadCount: Number(conversation.unread_count) || 0,
      metadata: {
        meta_page_id: input.pageId,
        meta_page_name: input.pageName,
        meta_link: typeof conversation.link === 'string' ? `https://business.facebook.com${conversation.link}` : null,
        can_reply: conversation.can_reply ?? true,
        is_subscribed: conversation.is_subscribed ?? true,
        message_count: conversation.message_count ?? mapped.length,
        scoped_thread_key: conversation.scoped_thread_key || conversation.id,
        customer_id: customerId,
        avatar_profile_id: profile?.id || null,
        avatar_source: profile ? 'meta_profile' : null,
        avatar_synced_at: profile ? new Date().toISOString() : null,
        synced_at: new Date().toISOString(),
      },
      messages: mapped,
    });
  }
  return threads;
}

async function instagramThreads(input: {
  connectionId: string;
  instagramId: string;
  accountName: string;
  token: string;
  version: string;
  since?: string | null;
  pageSize?: number;
  maxPages?: number;
}): Promise<SyncThread[]> {
  const pageSize = input.pageSize || 15;
  const maxPages = input.maxPages || 1;
  const url = new URL(`https://graph.facebook.com/${input.version}/${input.instagramId}/conversations`);
  url.searchParams.set('platform', 'instagram');
  url.searchParams.set(
    'fields',
    `id,updated_time,participants,messages.limit(${pageSize}){id,created_time,from,to,message,attachments{id,mime_type,name,size,image_data,video_data,file_url}}`
  );
  url.searchParams.set('limit', String(pageSize));
  if (input.since) url.searchParams.set('since', Math.floor(new Date(input.since).getTime() / 1000).toString());
  url.searchParams.set('access_token', input.token);

  let conversations: MetaRecord[] = [];
  try {
    conversations = await pagedGraph(url, maxPages);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/reduce the amount of data|unknown error|timed out|exceeded/i.test(message)) {
      console.warn(`[Meta Sync] Instagram ${input.instagramId} hit data threshold (${message}). Retrying with compact limit...`);
      const fallbackUrl = new URL(`https://graph.facebook.com/${input.version}/${input.instagramId}/conversations`);
      fallbackUrl.searchParams.set('platform', 'instagram');
      fallbackUrl.searchParams.set(
        'fields',
        'id,updated_time,participants,messages.limit(5){id,created_time,from,to,message,attachments{id,mime_type,name,size,image_data,video_data,file_url}}'
      );
      fallbackUrl.searchParams.set('limit', '10');
      if (input.since) fallbackUrl.searchParams.set('since', Math.floor(new Date(input.since).getTime() / 1000).toString());
      fallbackUrl.searchParams.set('access_token', input.token);
      conversations = await pagedGraph(fallbackUrl, 1);
    } else {
      throw err;
    }
  }

  const customerIds = conversations.map((conversation) => {
    const participants = asArray(record(conversation.participants).data);
    const customer = participants.find((participant) => String(participant.id || '') !== input.instagramId) || participants[0];
    return customer?.id ? String(customer.id) : '';
  }).filter(Boolean);
  const profiles = await resolveProfiles({
    provider: 'instagram',
    accountId: input.instagramId,
    token: input.token,
    version: input.version,
    customerIds,
  });

  const threads: SyncThread[] = [];
  for (const conversation of conversations) {
    const participants = asArray(record(conversation.participants).data);
    const customer = participants.find((participant) => String(participant.id || '') !== input.instagramId) || participants[0];
    const customerId = customer?.id ? String(customer.id) : '';
    if (!customerId || customerId === input.instagramId) continue;
    const profile = profiles.get(customerId) || null;
    const messages = asArray(record(conversation.messages).data);
    const mapped = messages.filter((message) => message.id).map((message) => {
      const details = attachmentDetails(message);
      const outbound = String(record(message.from).id || '') === input.instagramId;
      return {
        id: String(message.id),
        direction: outbound ? 'outbound' as const : 'inbound' as const,
        sentAt: typeof message.created_time === 'string' ? new Date(message.created_time).toISOString() : new Date().toISOString(),
        body: details.body,
        messageType: details.messageType,
        metadata: { ...details.metadata, sent_via: outbound ? 'meta_business_suite' : 'customer' },
      };
    });
    const updatedAt = typeof conversation.updated_time === 'string'
      ? new Date(conversation.updated_time).toISOString()
      : new Date().toISOString();
    threads.push({
      provider: 'instagram',
      connectionId: input.connectionId,
      accountId: input.instagramId,
      accountName: input.accountName,
      externalThreadId: `${input.instagramId}:${customerId}`,
      externalContactId: customerId,
      customerName: profile?.username || profile?.name || String(customer?.username || customer?.name || 'Instagram Traveler'),
      customerEmail: null,
      customerAvatarUrl: profile?.avatarUrl || null,
      avatarResolved: Boolean(profile),
      updatedAt,
      snippet: mapped[0]?.body || null,
      unreadCount: 0,
      metadata: {
        instagram_business_account_id: input.instagramId,
        account_name: input.accountName,
        customer_id: customerId,
        avatar_profile_id: profile?.id || null,
        avatar_source: profile ? 'meta_profile' : null,
        avatar_synced_at: profile ? new Date().toISOString() : null,
        synced_at: new Date().toISOString(),
      },
      messages: mapped,
    });
  }
  return threads;
}

async function persistThread(thread: SyncThread) {
  const admin = createSupabaseAdminClient();
  const conversationPatch: Record<string, unknown> = {
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
  };
  if (thread.avatarResolved) conversationPatch.customer_avatar_url = thread.customerAvatarUrl;

  const { data: conversation, error: conversationError } = await admin
    .from('lead_conversations')
    .upsert(conversationPatch, { onConflict: 'provider,external_thread_id' })
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
      p_customer_avatar_url: thread.avatarResolved ? thread.customerAvatarUrl : null,
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

  await admin.from('lead_conversations').update({ unread_count: thread.unreadCount }).eq('id', conversation.id);
  return { inserted };
}

function pageTokenForAccount(input: {
  config: Record<string, unknown>;
  pageTokens: Array<Record<string, unknown>>;
  fallbackToken: string | null;
  accountId: string;
}) {
  const pages = asArray(input.config.pages);
  const owningPage = pages.find((page) => {
    if (String(page.id || '') === input.accountId) return true;
    const instagram = record(page.instagram_business_account);
    return String(instagram.id || '') === input.accountId;
  });
  const pageId = String(owningPage?.id || input.accountId);
  const row = input.pageTokens.find((item) => String(item.id || '') === pageId);
  return typeof row?.access_token === 'string' ? row.access_token : input.fallbackToken;
}

export async function refreshMetaConversationProfiles(options?: { limit?: number }): Promise<MetaAvatarRefreshResult> {
  const admin = createSupabaseAdminClient();
  const limit = Math.max(1, Math.min(options?.limit || 50, 200));
  const errors: string[] = [];
  let attempted = 0;
  let updated = 0;
  let unavailable = 0;

  const { data: conversations, error } = await admin
    .from('lead_conversations')
    .select('id,provider,connection_id,external_thread_id,external_contact_id,customer_name,customer_avatar_url,metadata,last_message_at')
    .in('provider', ['facebook', 'instagram'])
    .not('connection_id', 'is', null)
    .not('external_contact_id', 'is', null)
    .is('customer_avatar_url', null)
    .order('last_message_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  if (!conversations?.length) return { attempted, updated, unavailable, errors };

  const connectionIds = Array.from(new Set(conversations.map((conversation) => String(conversation.connection_id || '')).filter(Boolean)));
  const connectionState = new Map<string, {
    config: Record<string, unknown>;
    pageTokens: Array<Record<string, unknown>>;
    fallbackToken: string | null;
  }>();

  for (const connectionId of connectionIds) {
    const [{ data: connection }, { data: secrets }] = await Promise.all([
      admin.from('integration_connections').select('config').eq('id', connectionId).maybeSingle(),
      admin.from('integration_secrets').select('access_token,secret_payload').eq('connection_id', connectionId).maybeSingle(),
    ]);
    if (!connection || !secrets) continue;
    const payload = decryptSecretPayload(secrets.secret_payload || {}) as Record<string, unknown>;
    connectionState.set(connectionId, {
      config: (connection.config || {}) as Record<string, unknown>,
      pageTokens: Array.isArray(payload.page_access_tokens) ? payload.page_access_tokens as Array<Record<string, unknown>> : [],
      fallbackToken: decryptIntegrationSecret(secrets.access_token),
    });
  }

  const version = process.env.META_GRAPH_VERSION?.trim() || 'v26.0';
  await mapWithConcurrency(conversations, 6, async (conversation) => {
    const provider = conversation.provider as MetaSyncProvider;
    const connectionId = String(conversation.connection_id || '');
    const customerId = String(conversation.external_contact_id || '');
    const state = connectionState.get(connectionId);
    if (!state || !customerId) {
      unavailable += 1;
      return;
    }

    const metadata = (conversation.metadata || {}) as Record<string, unknown>;
    const threadAccountId = String(conversation.external_thread_id || '').split(':', 1)[0];
    const accountId = provider === 'instagram'
      ? String(metadata.instagram_business_account_id || metadata.account_id || threadAccountId || '')
      : String(metadata.meta_page_id || metadata.account_id || threadAccountId || '');
    if (!accountId || accountId === customerId) {
      unavailable += 1;
      return;
    }

    const token = pageTokenForAccount({ ...state, accountId });
    if (!token) {
      unavailable += 1;
      return;
    }

    attempted += 1;
    try {
      const profile = await fetchMetaCustomerProfile({ provider, customerId, accountId, token, version });
      if (!profile) {
        unavailable += 1;
        return;
      }

      const genericName = !conversation.customer_name || /^(Messenger|Instagram) (User|Traveler)$/i.test(conversation.customer_name);
      const patch: Record<string, unknown> = {
        customer_avatar_url: profile.avatarUrl,
        metadata: {
          ...metadata,
          avatar_profile_id: profile.id,
          avatar_source: 'meta_profile',
          avatar_synced_at: new Date().toISOString(),
        },
      };
      if (genericName && (profile.username || profile.name)) patch.customer_name = profile.username || profile.name;

      const { error: updateError } = await admin.from('lead_conversations').update(patch).eq('id', conversation.id);
      if (updateError) throw updateError;
      updated += 1;
    } catch (profileError) {
      unavailable += 1;
      errors.push(`${provider}:${customerId}: ${profileError instanceof Error ? profileError.message : String(profileError)}`);
    }
  });

  return { attempted, updated, unavailable, errors: errors.slice(0, 50) };
}

export async function syncMetaConversations(options?: {
  connectionId?: string;
  pageId?: string;
  liveMode?: boolean;
}): Promise<MetaSyncResult> {
  const admin = createSupabaseAdminClient();
  const errors: string[] = [];
  let pagesCount = 0;
  let conversationsCount = 0;
  let messagesCount = 0;
  const isLive = options?.liveMode ?? false;
  const pageSize = isLive ? 15 : 25;
  const maxPages = isLive ? 1 : 2;

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
      const pages = asArray(config.pages);
      let newestTimestamp = connection.last_external_timestamp as string | null;

      for (const page of pages) {
        const pageId = String(page.id || '');
        if (!pageId || (options?.pageId && options.pageId !== pageId)) continue;
        const pageTokenRow = pageTokens.find((item) => String(item.id || '') === pageId);
        const token = typeof pageTokenRow?.access_token === 'string' ? pageTokenRow.access_token : fallbackToken;
        if (!token) continue;

        try {
          let threads: SyncThread[] = [];
          if (connection.provider === 'instagram') {
            const instagramAccount = record(page.instagram_business_account);
            const instagramId = String(instagramAccount.id || '');
            if (!instagramId) continue;
            threads = await instagramThreads({
              connectionId: connection.id,
              instagramId,
              accountName: String(instagramAccount.username || page.name || connection.display_name || 'Instagram'),
              token,
              version,
              since: connection.last_external_timestamp,
              pageSize,
              maxPages,
            });
          } else {
            threads = await facebookThreads({
              connectionId: connection.id,
              pageId,
              pageName: String(page.name || connection.display_name || 'Facebook Page'),
              token,
              version,
              since: connection.last_external_timestamp,
              pageSize,
              maxPages,
            });
          }

          pagesCount += 1;
          for (const thread of threads) {
            const result = await persistThread(thread);
            conversationsCount += 1;
            messagesCount += result.inserted;
            if (!newestTimestamp || new Date(thread.updatedAt) > new Date(newestTimestamp)) newestTimestamp = thread.updatedAt;
          }
        } catch (pageError) {
          const message = pageError instanceof Error ? pageError.message : String(pageError);
          errors.push(`Page ${page.name || pageId}: ${message}`);
          console.warn(`[Meta Sync] Warning syncing page ${pageId}:`, message);
        }
      }

      await admin
        .from('integration_connections')
        .update({
          last_sync_at: new Date().toISOString(),
          last_external_timestamp: newestTimestamp,
          last_error: errors.length > 0 ? errors[0].slice(0, 1000) : null,
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

  return { success: errors.length === 0, pagesCount, conversationsCount, messagesCount, errors };
}
