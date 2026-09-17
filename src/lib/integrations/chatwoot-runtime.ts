import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export type ActiveChatwootRuntime = {
  accountLinkId: string;
  accountId: number;
  inboxLinkId: string;
  inboxId: number;
  conversationId: number;
  integrationConnectionId: string;
};

const CACHE_TTL_MS = 30_000;
const runtimeCache = new Map<string, { expiresAt: number; value: ActiveChatwootRuntime | null }>();

function cacheKey(workspaceId: string, conversationId: string) {
  return `${workspaceId}:${conversationId}`;
}

function positiveInteger(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function clearActiveChatwootRuntimeCache(workspaceId: string, conversationId?: string) {
  if (conversationId) {
    runtimeCache.delete(cacheKey(workspaceId, conversationId));
    return;
  }
  for (const key of runtimeCache.keys()) {
    if (key.startsWith(`${workspaceId}:`)) runtimeCache.delete(key);
  }
}

export async function resolveActiveChatwootRuntime(
  workspaceId: string,
  leadConversationId: string
): Promise<ActiveChatwootRuntime | null> {
  const key = cacheKey(workspaceId, leadConversationId);
  const cached = runtimeCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const admin = createSupabaseAdminClient();
  const { data: link, error: linkError } = await admin
    .from('chatwoot_conversation_links')
    .select('chatwoot_account_link_id,chatwoot_conversation_id,chatwoot_inbox_id')
    .eq('workspace_id', workspaceId)
    .eq('lead_conversation_id', leadConversationId)
    .maybeSingle();
  if (linkError) throw linkError;

  const chatwootConversationId = positiveInteger(link?.chatwoot_conversation_id);
  const chatwootInboxId = positiveInteger(link?.chatwoot_inbox_id);
  if (!link || !chatwootConversationId || !chatwootInboxId) {
    runtimeCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value: null });
    return null;
  }

  const { data: inbox, error: inboxError } = await admin
    .from('chatwoot_inboxes')
    .select('id,chatwoot_account_link_id,integration_connection_id,chatwoot_inbox_id,status,traffic_mode')
    .eq('workspace_id', workspaceId)
    .eq('chatwoot_account_link_id', link.chatwoot_account_link_id)
    .eq('chatwoot_inbox_id', chatwootInboxId)
    .maybeSingle();
  if (inboxError) throw inboxError;
  if (
    !inbox
    || inbox.status !== 'active'
    || inbox.traffic_mode !== 'active'
    || !inbox.integration_connection_id
  ) {
    runtimeCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value: null });
    return null;
  }

  const { data: account, error: accountError } = await admin
    .from('chatwoot_accounts')
    .select('id,chatwoot_account_id,status')
    .eq('workspace_id', workspaceId)
    .eq('id', link.chatwoot_account_link_id)
    .maybeSingle();
  if (accountError) throw accountError;
  const accountId = positiveInteger(account?.chatwoot_account_id);
  if (!account || account.status !== 'active' || !accountId) {
    runtimeCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value: null });
    return null;
  }

  const value: ActiveChatwootRuntime = {
    accountLinkId: String(link.chatwoot_account_link_id),
    accountId,
    inboxLinkId: String(inbox.id),
    inboxId: chatwootInboxId,
    conversationId: chatwootConversationId,
    integrationConnectionId: String(inbox.integration_connection_id),
  };
  runtimeCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}
