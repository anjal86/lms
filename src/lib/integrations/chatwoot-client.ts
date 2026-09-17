import 'server-only';

export class ChatwootApiError extends Error {
  status: number;
  responseBody: string;

  constructor(status: number, responseBody: string) {
    super(`Chatwoot API request failed with status ${status}.`);
    this.name = 'ChatwootApiError';
    this.status = status;
    this.responseBody = responseBody;
  }
}

export type ChatwootServerConfig = {
  baseUrl: string;
  accessToken: string;
  webhookMaxAgeSeconds: number;
};

export type ChatwootInbox = {
  id: number;
  name?: string | null;
  channel_type?: string | null;
  provider_name?: string | null;
  provider?: string | null;
  page_id?: string | number | null;
  instagram_id?: string | number | null;
  business_id?: string | number | null;
  email?: string | null;
  phone_number?: string | null;
  website_url?: string | null;
};

export type ChatwootConversationListMeta = {
  mine_count?: number;
  assigned_count?: number;
  unassigned_count?: number;
  all_count?: number;
};

type ChatwootInboxListResponse = {
  payload?: ChatwootInbox[];
};

type ChatwootConversationListResponse = {
  data?: {
    meta?: ChatwootConversationListMeta;
    payload?: Array<Record<string, unknown>>;
  };
};

type ChatwootMessageListResponse = {
  meta?: Record<string, unknown>;
  payload?: Array<Record<string, unknown>>;
};

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function positiveInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Invalid ${label}.`);
  return value;
}

export function chatwootWebhookMaxAgeSeconds() {
  const parsed = Number(process.env.CHATWOOT_WEBHOOK_MAX_AGE_SECONDS || '300');
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 300;
}

export function chatwootServerConfig(): ChatwootServerConfig {
  return {
    baseUrl: required('CHATWOOT_BASE_URL').replace(/\/$/, ''),
    accessToken: required('CHATWOOT_API_ACCESS_TOKEN'),
    webhookMaxAgeSeconds: chatwootWebhookMaxAgeSeconds(),
  };
}

export function chatwootConfigured() {
  return Boolean(
    process.env.CHATWOOT_BASE_URL?.trim()
    && process.env.CHATWOOT_API_ACCESS_TOKEN?.trim()
  );
}

export async function chatwootRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const config = chatwootServerConfig();
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  const response = await fetch(`${config.baseUrl}${path.startsWith('/') ? path : `/${path}`}`, {
    ...init,
    cache: 'no-store',
    signal: init.signal ?? AbortSignal.timeout(15_000),
    headers: {
      Accept: 'application/json',
      api_access_token: config.accessToken,
      ...(init.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  const raw = await response.text();
  if (!response.ok) throw new ChatwootApiError(response.status, raw.slice(0, 4000));
  if (!raw) return undefined as T;
  return JSON.parse(raw) as T;
}

export function chatwootAccountPath(accountId: number, suffix = '') {
  positiveInteger(accountId, 'Chatwoot account ID');
  const normalizedSuffix = suffix ? (suffix.startsWith('/') ? suffix : `/${suffix}`) : '';
  return `/api/v1/accounts/${accountId}${normalizedSuffix}`;
}

export async function listChatwootAgents(accountId: number) {
  return chatwootRequest<Array<Record<string, unknown>>>(chatwootAccountPath(accountId, 'agents'));
}

export async function listChatwootTeams(accountId: number) {
  return chatwootRequest<Array<Record<string, unknown>>>(chatwootAccountPath(accountId, 'teams'));
}

export async function listChatwootInboxes(accountId: number) {
  const response = await chatwootRequest<ChatwootInboxListResponse>(chatwootAccountPath(accountId, 'inboxes'));
  if (!response || !Array.isArray(response.payload)) {
    throw new Error('Chatwoot inbox response did not contain a payload array.');
  }
  return response.payload;
}

export async function listChatwootConversations(input: {
  accountId: number;
  inboxId: number;
  status?: 'open' | 'resolved' | 'pending' | 'snoozed' | 'all';
  assigneeType?: 'me' | 'unassigned' | 'assigned' | 'all';
  page?: number;
}) {
  positiveInteger(input.inboxId, 'Chatwoot inbox ID');
  const page = Math.max(1, Math.floor(input.page || 1));
  const params = new URLSearchParams({
    inbox_id: String(input.inboxId),
    status: input.status || 'all',
    page: String(page),
  });
  if (input.assigneeType && input.assigneeType !== 'all') params.set('assignee_type', input.assigneeType);

  const response = await chatwootRequest<ChatwootConversationListResponse>(
    `${chatwootAccountPath(input.accountId, 'conversations')}?${params.toString()}`
  );
  if (!response?.data || !Array.isArray(response.data.payload)) {
    throw new Error('Chatwoot conversation response did not contain a data.payload array.');
  }
  return {
    conversations: response.data.payload,
    meta: response.data.meta || {},
    page,
  };
}

export async function filterChatwootConversations(
  accountId: number,
  payload: Array<Record<string, unknown>>
) {
  return chatwootRequest<Record<string, unknown>>(chatwootAccountPath(accountId, 'conversations/filter'), {
    method: 'POST',
    body: JSON.stringify({ payload }),
  });
}

export async function getChatwootConversation(accountId: number, conversationId: number) {
  positiveInteger(conversationId, 'Chatwoot conversation ID');
  return chatwootRequest<Record<string, unknown>>(
    chatwootAccountPath(accountId, `conversations/${conversationId}`)
  );
}

export async function listChatwootMessages(input: {
  accountId: number;
  conversationId: number;
  before?: number | null;
  after?: number | null;
}) {
  positiveInteger(input.conversationId, 'Chatwoot conversation ID');
  const params = new URLSearchParams();
  if (input.before != null) params.set('before', String(positiveInteger(input.before, 'Chatwoot before message ID')));
  if (input.after != null) params.set('after', String(positiveInteger(input.after, 'Chatwoot after message ID')));
  const query = params.size ? `?${params.toString()}` : '';
  const response = await chatwootRequest<ChatwootMessageListResponse>(
    `${chatwootAccountPath(input.accountId, `conversations/${input.conversationId}/messages`)}${query}`
  );
  if (!response || !Array.isArray(response.payload)) {
    throw new Error('Chatwoot message response did not contain a payload array.');
  }
  return {
    messages: response.payload,
    meta: response.meta || {},
  };
}

export async function createChatwootMessage(input: {
  accountId: number;
  conversationId: number;
  content: string;
  private?: boolean;
}) {
  positiveInteger(input.conversationId, 'Chatwoot conversation ID');
  const content = input.content.trim();
  if (!content) throw new Error('Chatwoot message content cannot be empty.');
  return chatwootRequest<Record<string, unknown>>(
    chatwootAccountPath(input.accountId, `conversations/${input.conversationId}/messages`),
    {
      method: 'POST',
      body: JSON.stringify({ content, message_type: 'outgoing', private: Boolean(input.private) }),
    }
  );
}

export async function createChatwootAttachmentMessage(input: {
  accountId: number;
  conversationId: number;
  file: Blob;
  fileName: string;
  content?: string | null;
}) {
  positiveInteger(input.conversationId, 'Chatwoot conversation ID');
  const fileName = input.fileName.trim();
  if (!fileName) throw new Error('Chatwoot attachment file name cannot be empty.');
  if (!input.file.size) throw new Error('Chatwoot attachment cannot be empty.');

  const form = new FormData();
  if (input.content?.trim()) form.append('content', input.content.trim());
  form.append('message_type', 'outgoing');
  form.append('private', 'false');
  form.append('attachments[]', input.file, fileName);

  return chatwootRequest<Record<string, unknown>>(
    chatwootAccountPath(input.accountId, `conversations/${input.conversationId}/messages`),
    {
      method: 'POST',
      body: form,
    }
  );
}
