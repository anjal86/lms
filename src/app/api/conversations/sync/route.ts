import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getApiActor, isManagement } from '@/lib/auth/api-actor';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { syncMetaConversations, type MetaSyncResult } from '@/lib/integrations/meta-sync';
import {
  backfillMetaConversationHistoryBatch,
  discoverMetaConversationHistory,
  type MetaHistoryBatchResult,
  type MetaHistoryResult,
} from '@/lib/integrations/meta-history';
import { discoverSelectedMetaPageHistory, type SelectedPageHistoryResult } from '@/lib/integrations/meta-page-history';
import { scanPhoneLeadHistoryBatch } from '@/lib/integrations/phone-lead-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LIVE_SYNC_MIN_INTERVAL_MS = 6_000;
const liveSyncPromises = new Map<string, Promise<MetaSyncResult>>();
const lastLiveSyncCompletedAt = new Map<string, number>();

type ProviderScope = {
  provider: 'facebook' | 'instagram';
  accountId: string;
  connectionId: string;
  pageId: string;
};

function safeSecretMatch(actual: string | null, expected: string | undefined) {
  if (!actual || !expected) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const PROVIDERS = new Set(['facebook', 'instagram', 'whatsapp', 'tiktok', 'email', 'website', 'api']);

function sanitizeProvider(value: string | null) {
  const provider = (value || '').toLowerCase();
  return PROVIDERS.has(provider) ? provider : '';
}

function sanitizeUuid(value: string | null) {
  const trimmed = value?.trim() || '';
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)
    ? trimmed
    : '';
}

function referrerScope(request: Request) {
  const referrer = request.headers.get('referer');
  if (!referrer) return { accountId: '', accountProvider: '' };
  try {
    const requestUrl = new URL(request.url);
    const referrerUrl = new URL(referrer);
    if (referrerUrl.origin !== requestUrl.origin || referrerUrl.pathname !== '/inbox') {
      return { accountId: '', accountProvider: '' };
    }
    return {
      accountId: sanitizeUuid(referrerUrl.searchParams.get('accountId')),
      accountProvider: sanitizeProvider(referrerUrl.searchParams.get('accountProvider')),
    };
  } catch {
    return { accountId: '', accountProvider: '' };
  }
}

function readCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get('cookie') || '';
  for (const pair of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = pair.trim().split('=');
    if (rawName !== name) continue;
    try {
      return decodeURIComponent(rawValue.join('='));
    } catch {
      return rawValue.join('=');
    }
  }
  return '';
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isAuthorizationContainer(config: unknown) {
  const value = record(config);
  return value.authorization_container === true
    || value.legacy_container === true
    || value.hidden_from_account_picker === true;
}

async function workspaceMetaConnectionIds(workspaceId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('integration_connections')
    .select('id,config')
    .eq('workspace_id', workspaceId)
    .in('status', ['connected', 'token_expiring'])
    .in('provider', ['facebook', 'instagram']);
  if (error) throw error;
  return (data || [])
    .filter((connection) => !isAuthorizationContainer(connection.config))
    .map((connection) => connection.id);
}

async function resolveRequestedScope(
  request: Request,
  workspaceId: string
): Promise<{ requested: boolean; scope: ProviderScope | null }> {
  const ref = referrerScope(request);
  const admin = createSupabaseAdminClient();

  if (ref.accountId) {
    const { data: connection } = await admin
      .from('integration_connections')
      .select('id,provider,config,external_account_id')
      .eq('workspace_id', workspaceId)
      .eq('id', ref.accountId)
      .in('status', ['connected', 'token_expiring'])
      .maybeSingle();

    if (connection && (connection.provider === 'facebook' || connection.provider === 'instagram')) {
      if (ref.accountProvider && ref.accountProvider !== 'all' && ref.accountProvider !== connection.provider) {
        return { requested: true, scope: null };
      }
      const provider = connection.provider;
      const accountId = connection.external_account_id;
      const pageId = String(record(connection.config).page_id || '');
      if (accountId && pageId) {
        return {
          requested: true,
          scope: {
            provider: provider as 'facebook' | 'instagram',
            accountId,
            connectionId: connection.id,
            pageId,
          },
        };
      }
    }
    return { requested: true, scope: null };
  }

  // Legacy cookie fallback. It is still tenant-scoped before resolving the concrete row.
  const cookieValue = readCookie(request, 'inbox_page_filter');
  if (!cookieValue || cookieValue === 'all') return { requested: false, scope: null };

  const separator = cookieValue.indexOf(':');
  if (separator <= 0) return { requested: true, scope: null };
  const provider = cookieValue.slice(0, separator);
  const accountId = cookieValue.slice(separator + 1).trim();
  if ((provider !== 'facebook' && provider !== 'instagram') || !/^[A-Za-z0-9:_-]{1,128}$/.test(accountId)) {
    return { requested: true, scope: null };
  }

  const { data: connections, error } = await admin
    .from('integration_connections')
    .select('id,provider,config,external_account_id')
    .eq('workspace_id', workspaceId)
    .eq('provider', provider)
    .eq('external_account_id', accountId)
    .in('status', ['connected', 'token_expiring']);
  if (error) throw error;

  for (const connection of connections || []) {
    if (isAuthorizationContainer(connection.config)) continue;
    const pageId = String(record(connection.config).page_id || '');
    if (connection.external_account_id && pageId) {
      return {
        requested: true,
        scope: {
          provider: provider as 'facebook' | 'instagram',
          accountId: connection.external_account_id,
          connectionId: connection.id,
          pageId,
        },
      };
    }
  }

  return { requested: true, scope: null };
}

function mergeSyncResults(results: MetaSyncResult[]): MetaSyncResult {
  return {
    success: results.every((result) => result.success),
    pagesCount: results.reduce((sum, result) => sum + result.pagesCount, 0),
    conversationsCount: results.reduce((sum, result) => sum + result.conversationsCount, 0),
    messagesCount: results.reduce((sum, result) => sum + result.messagesCount, 0),
    errors: results.flatMap((result) => result.errors).slice(0, 50),
  };
}

async function runScopedMetaSync(input: {
  scope: ProviderScope | null;
  workspaceId?: string;
  workspaceConnectionIds?: string[];
}) {
  if (input.scope) {
    return syncMetaConversations({
      liveMode: true,
      connectionId: input.scope.connectionId,
      pageId: input.scope.pageId,
    });
  }

  if (input.workspaceId) {
    const ids = input.workspaceConnectionIds || [];
    if (!ids.length) {
      return { success: true, pagesCount: 0, conversationsCount: 0, messagesCount: 0, errors: [] } satisfies MetaSyncResult;
    }
    const results = await Promise.all(ids.map((connectionId) => syncMetaConversations({
      liveMode: true,
      connectionId,
    })));
    return mergeSyncResults(results);
  }

  // Internal maintenance is the only path allowed to operate across all workspaces.
  return syncMetaConversations({ liveMode: true });
}

async function runLiveSync(input: {
  scope: ProviderScope | null;
  workspaceId?: string;
  workspaceConnectionIds?: string[];
}) {
  const key = input.scope
    ? `${input.workspaceId || 'internal'}:${input.scope.provider}:${input.scope.connectionId}:${input.scope.pageId}`
    : `${input.workspaceId || 'internal'}:all`;
  const now = Date.now();
  const existing = liveSyncPromises.get(key);
  const lastCompleted = lastLiveSyncCompletedAt.get(key) || 0;

  if (!existing && now - lastCompleted < LIVE_SYNC_MIN_INTERVAL_MS) {
    return {
      success: true,
      pagesCount: 0,
      conversationsCount: 0,
      messagesCount: 0,
      errors: [],
      skipped: true,
    };
  }

  let promise = existing;
  if (!promise) {
    promise = runScopedMetaSync(input).finally(() => {
      lastLiveSyncCompletedAt.set(key, Date.now());
      liveSyncPromises.delete(key);
    });
    liveSyncPromises.set(key, promise);
  }

  const result = await promise;
  return { ...result, skipped: false };
}

function phoneScanScope(scope: ProviderScope | null) {
  return scope
    ? {
        provider: scope.provider,
        accountId: scope.accountId,
        connectionId: scope.connectionId,
      }
    : null;
}

function noConversationDiscovery(): SelectedPageHistoryResult {
  return {
    conversationsDiscovered: 0,
    conversationsScanned: 0,
    previewMessagesInserted: 0,
    historyComplete: true,
    nextCursor: null,
    errors: [],
  };
}

function noHistoryDiscovery(): MetaHistoryResult {
  return { conversationsDiscovered: 0, messagesInserted: 0, errors: [] };
}

function noMessageBackfill(): MetaHistoryBatchResult {
  return {
    conversationsScanned: 0,
    conversationsCompleted: 0,
    messagesInserted: 0,
    remaining: 0,
    errors: [],
  };
}

const NO_PHONE_SCAN = { scanned: 0, phoneLeadsFound: 0, remaining: 0, errors: [] as string[] };

async function discoverSelectedPageChunk(scope: ProviderScope | null, maxPages: number) {
  if (!scope) return noConversationDiscovery();
  return discoverSelectedMetaPageHistory({
    provider: scope.provider,
    accountId: scope.accountId,
    connectionId: scope.connectionId,
    pageId: scope.pageId,
    maxPages,
  });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const liveMode = url.searchParams.get('mode') === 'live';
  const internalSync = safeSecretMatch(
    request.headers.get('x-integration-sync-secret'),
    process.env.INTEGRATION_SYNC_SECRET?.trim()
  );
  let canRunHistoryMaintenance = internalSync;
  let workspaceId: string | undefined;

  if (!internalSync) {
    const actor = await getApiActor(request);
    if ('error' in actor) return actor.error;
    canRunHistoryMaintenance = isManagement(actor.profile);
    workspaceId = actor.profile.workspace_id;
    if (!liveMode && !canRunHistoryMaintenance) {
      return NextResponse.json({ error: 'Only managers can run provider history sync.' }, { status: 403 });
    }
  }

  try {
    const workspaceConnectionIds = workspaceId ? await workspaceMetaConnectionIds(workspaceId) : undefined;
    const requestedScope = internalSync
      ? { requested: false, scope: null }
      : await resolveRequestedScope(request, workspaceId!);

    if (requestedScope.requested && !requestedScope.scope) {
      return NextResponse.json({
        success: true,
        pagesCount: 0,
        conversationsCount: 0,
        messagesCount: 0,
        errors: [],
        skipped: true,
        reason: 'Selected Page inbox is no longer connected to this workspace.',
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (liveMode) {
      const result = await runLiveSync({
        scope: requestedScope.scope,
        workspaceId,
        workspaceConnectionIds,
      });

      const [conversationDiscovery, messageBackfill, phoneScan] = canRunHistoryMaintenance
        ? await Promise.all([
            discoverSelectedPageChunk(requestedScope.scope, 1),
            backfillMetaConversationHistoryBatch({
              workspaceId,
              connectionIds: requestedScope.scope ? [requestedScope.scope.connectionId] : undefined,
              batchSize: 12,
              concurrency: 4,
              maxPages: 30,
            }),
            requestedScope.scope || internalSync
              ? scanPhoneLeadHistoryBatch({
                  scope: phoneScanScope(requestedScope.scope),
                  batchSize: 1,
                  maxHistoryPages: 1,
                  timeBudgetMs: 3_000,
                  requestTimeoutMs: 2_500,
                })
              : Promise.resolve(NO_PHONE_SCAN),
          ])
        : [
            noConversationDiscovery(),
            noMessageBackfill(),
            NO_PHONE_SCAN,
          ];

      return NextResponse.json({
        ...result,
        conversationsCount: result.conversationsCount + conversationDiscovery.conversationsDiscovered,
        messagesCount: result.messagesCount + conversationDiscovery.previewMessagesInserted + messageBackfill.messagesInserted,
        conversationDiscovery,
        messageBackfill,
        phoneScan,
        maintenanceContinues: !conversationDiscovery.historyComplete || messageBackfill.remaining > 0 || phoneScan.remaining > 0,
        scope: requestedScope.scope
          ? { provider: requestedScope.scope.provider, accountId: requestedScope.scope.accountId }
          : null,
      }, {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    const result = await runScopedMetaSync({
      scope: requestedScope.scope,
      workspaceId,
      workspaceConnectionIds,
    });

    const selectedHistory = requestedScope.scope
      ? await discoverSelectedPageChunk(requestedScope.scope, 2)
      : null;

    const history = requestedScope.scope
      ? {
          conversationsDiscovered: selectedHistory?.conversationsDiscovered || 0,
          messagesInserted: selectedHistory?.previewMessagesInserted || 0,
          errors: selectedHistory?.errors || [],
        }
      : workspaceId
        ? workspaceConnectionIds?.length
          ? await discoverMetaConversationHistory({ maxPages: 2, connectionIds: workspaceConnectionIds })
          : noHistoryDiscovery()
        : await discoverMetaConversationHistory({ maxPages: 2 });

    const messageBackfill = await backfillMetaConversationHistoryBatch({
      workspaceId,
      connectionIds: requestedScope.scope ? [requestedScope.scope.connectionId] : undefined,
      batchSize: 24,
      concurrency: 6,
      maxPages: 30,
    });

    const phoneScan = requestedScope.scope || internalSync
      ? await scanPhoneLeadHistoryBatch({
          scope: phoneScanScope(requestedScope.scope),
          batchSize: 2,
          maxHistoryPages: 1,
          timeBudgetMs: 4_000,
          requestTimeoutMs: 2_500,
        })
      : NO_PHONE_SCAN;

    const conversationDiscovery = selectedHistory || noConversationDiscovery();

    return NextResponse.json(
      {
        ...result,
        conversationsCount: result.conversationsCount + history.conversationsDiscovered,
        messagesCount: result.messagesCount + history.messagesInserted + messageBackfill.messagesInserted,
        olderConversationsDiscovered: history.conversationsDiscovered,
        historyPreviewMessagesInserted: history.messagesInserted,
        historyConversationsScanned: conversationDiscovery.conversationsScanned,
        historyErrors: history.errors,
        conversationDiscovery,
        messageBackfill,
        phoneScan,
        maintenanceContinues: !conversationDiscovery.historyComplete || messageBackfill.remaining > 0 || phoneScan.remaining > 0,
        scope: requestedScope.scope
          ? { provider: requestedScope.scope.provider, accountId: requestedScope.scope.accountId }
          : null,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Meta conversation sync failed:', error);
    return NextResponse.json(
      {
        success: false,
        pagesCount: 0,
        conversationsCount: 0,
        messagesCount: 0,
        error: error instanceof Error ? error.message : 'Meta conversation sync failed.',
      },
      { status: 500 }
    );
  }
}
