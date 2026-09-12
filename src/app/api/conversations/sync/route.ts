import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getApiActor, isManagement } from '@/lib/auth/api-actor';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { syncMetaConversations, type MetaSyncResult } from '@/lib/integrations/meta-sync';
import { discoverMetaConversationHistory } from '@/lib/integrations/meta-history';
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

function rows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : [];
}

async function resolveRequestedScope(request: Request): Promise<{ requested: boolean; scope: ProviderScope | null }> {
  const cookieValue = readCookie(request, 'inbox_page_filter');
  if (!cookieValue || cookieValue === 'all') return { requested: false, scope: null };

  const separator = cookieValue.indexOf(':');
  if (separator <= 0) return { requested: true, scope: null };
  const provider = cookieValue.slice(0, separator);
  const accountId = cookieValue.slice(separator + 1).trim();
  if ((provider !== 'facebook' && provider !== 'instagram') || !/^[A-Za-z0-9:_-]{1,128}$/.test(accountId)) {
    return { requested: true, scope: null };
  }

  const admin = createSupabaseAdminClient();
  const { data: connections, error } = await admin
    .from('integration_connections')
    .select('id,provider,config')
    .eq('provider', provider)
    .in('status', ['connected', 'token_expiring']);
  if (error) throw error;

  for (const connection of connections || []) {
    const pages = rows(record(connection.config).pages);
    for (const page of pages) {
      const pageId = String(page.id || '');
      if (!pageId) continue;
      if (provider === 'facebook' && pageId === accountId) {
        return {
          requested: true,
          scope: { provider, accountId, connectionId: connection.id, pageId },
        };
      }
      if (provider === 'instagram') {
        const instagramId = String(record(page.instagram_business_account).id || '');
        if (instagramId === accountId) {
          return {
            requested: true,
            scope: { provider, accountId, connectionId: connection.id, pageId },
          };
        }
      }
    }
  }

  return { requested: true, scope: null };
}

async function runLiveSync(scope: ProviderScope | null) {
  const key = scope ? `${scope.provider}:${scope.connectionId}:${scope.pageId}` : 'all';
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
    promise = syncMetaConversations({
      liveMode: true,
      connectionId: scope?.connectionId,
      pageId: scope?.pageId,
    }).finally(() => {
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

  if (!internalSync) {
    const actor = await getApiActor(request);
    if ('error' in actor) return actor.error;
    canRunHistoryMaintenance = isManagement(actor.profile);
    if (!liveMode && !canRunHistoryMaintenance) {
      return NextResponse.json({ error: 'Only managers can run provider history sync.' }, { status: 403 });
    }
  }

  try {
    const requestedScope = internalSync
      ? { requested: false, scope: null }
      : await resolveRequestedScope(request);

    if (requestedScope.requested && !requestedScope.scope) {
      return NextResponse.json({
        success: true,
        pagesCount: 0,
        conversationsCount: 0,
        messagesCount: 0,
        errors: [],
        skipped: true,
        reason: 'Selected Page inbox is no longer connected.',
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (liveMode) {
      const result = await runLiveSync(requestedScope.scope);

      // Historical customer-chat discovery and phone extraction are distinct jobs.
      // The former advances the Page's Meta conversation cursor; the latter scans
      // message history for phones. Run small bounded chunks so the request stays responsive.
      const [conversationDiscovery, phoneScan] = canRunHistoryMaintenance
        ? await Promise.all([
            discoverSelectedPageChunk(requestedScope.scope, 1),
            scanPhoneLeadHistoryBatch({
              scope: phoneScanScope(requestedScope.scope),
              batchSize: 1,
              maxHistoryPages: 1,
              timeBudgetMs: 3_000,
              requestTimeoutMs: 2_500,
            }),
          ])
        : [
            noConversationDiscovery(),
            { scanned: 0, phoneLeadsFound: 0, remaining: 0, errors: [] as string[] },
          ];

      return NextResponse.json({
        ...result,
        conversationsCount: result.conversationsCount + conversationDiscovery.conversationsDiscovered,
        messagesCount: result.messagesCount + conversationDiscovery.previewMessagesInserted,
        conversationDiscovery,
        phoneScan,
        maintenanceContinues: !conversationDiscovery.historyComplete || phoneScan.remaining > 0,
        scope: requestedScope.scope
          ? { provider: requestedScope.scope.provider, accountId: requestedScope.scope.accountId }
          : null,
      }, {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    // Foreground Sync refreshes recent activity, then advances the selected Page's
    // historical conversation cursor by a small bounded chunk. Repeated live cycles
    // continue automatically from the saved cursor until all Page chats are discovered.
    const result = await syncMetaConversations({
      liveMode: true,
      connectionId: requestedScope.scope?.connectionId,
      pageId: requestedScope.scope?.pageId,
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
      : await discoverMetaConversationHistory({ maxPages: 2 });

    const phoneScan = await scanPhoneLeadHistoryBatch({
      scope: phoneScanScope(requestedScope.scope),
      batchSize: 2,
      maxHistoryPages: 1,
      timeBudgetMs: 4_000,
      requestTimeoutMs: 2_500,
    });

    const conversationDiscovery = selectedHistory || noConversationDiscovery();

    return NextResponse.json(
      {
        ...result,
        conversationsCount: result.conversationsCount + history.conversationsDiscovered,
        messagesCount: result.messagesCount + history.messagesInserted,
        olderConversationsDiscovered: history.conversationsDiscovered,
        historyPreviewMessagesInserted: history.messagesInserted,
        historyConversationsScanned: conversationDiscovery.conversationsScanned,
        historyErrors: history.errors,
        conversationDiscovery,
        phoneScan,
        maintenanceContinues: !conversationDiscovery.historyComplete || phoneScan.remaining > 0,
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
