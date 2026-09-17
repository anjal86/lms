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

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
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
  const response = await fetch(`${config.baseUrl}${path.startsWith('/') ? path : `/${path}`}`, {
    ...init,
    cache: 'no-store',
    signal: init.signal ?? AbortSignal.timeout(15_000),
    headers: {
      Accept: 'application/json',
      api_access_token: config.accessToken,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  const raw = await response.text();
  if (!response.ok) throw new ChatwootApiError(response.status, raw.slice(0, 4000));
  if (!raw) return undefined as T;
  return JSON.parse(raw) as T;
}

export function chatwootAccountPath(accountId: number, suffix = '') {
  if (!Number.isSafeInteger(accountId) || accountId <= 0) throw new Error('Invalid Chatwoot account ID.');
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
  return chatwootRequest<Array<Record<string, unknown>>>(chatwootAccountPath(accountId, 'inboxes'));
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
  if (!Number.isSafeInteger(conversationId) || conversationId <= 0) throw new Error('Invalid Chatwoot conversation ID.');
  return chatwootRequest<Record<string, unknown>>(
    chatwootAccountPath(accountId, `conversations/${conversationId}`)
  );
}

export async function createChatwootMessage(input: {
  accountId: number;
  conversationId: number;
  content: string;
  private?: boolean;
}) {
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
