import 'server-only';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { syncMetaConversations } from '@/lib/integrations/meta-sync';
import { backfillMetaConversationHistoryBatch } from '@/lib/integrations/meta-history';
import { discoverSelectedMetaPageHistory } from '@/lib/integrations/meta-page-history';
import type { IntegrationSyncJob } from '@/lib/redis/integration-sync-queue';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export type MetaHistoryWorkerResult = {
  shouldContinue: boolean;
  totals: IntegrationSyncJob['totals'];
  result: Record<string, unknown>;
};

export async function processMetaHistorySyncJob(job: IntegrationSyncJob): Promise<MetaHistoryWorkerResult> {
  const admin = createSupabaseAdminClient();
  const { data: connection, error } = await admin
    .from('integration_connections')
    .select('id,workspace_id,provider,status,external_account_id,config')
    .eq('id', job.connectionId)
    .eq('workspace_id', job.workspaceId)
    .maybeSingle();

  if (error) throw error;
  if (!connection) throw new Error('Connection is no longer available in this workspace.');
  if (!['facebook', 'instagram'].includes(connection.provider)) throw new Error('Only Facebook and Instagram history jobs are supported.');
  if (!['connected', 'token_expiring', 'paused'].includes(connection.status)) throw new Error('Connection is not available for history synchronization.');

  const config = record(connection.config);
  const provider = connection.provider as 'facebook' | 'instagram';
  const accountId = provider === 'facebook'
    ? String(config.page_id || connection.external_account_id || '')
    : String(config.instagram_business_account_id || connection.external_account_id || '');
  const pageId = String(config.page_id || (provider === 'facebook' ? accountId : '') || accountId);
  if (!accountId || !pageId) throw new Error('Concrete Meta account identity is incomplete.');

  const live = job.cycle === 0
    ? await syncMetaConversations({ liveMode: true, connectionId: connection.id, pageId })
    : { success: true, pagesCount: 0, conversationsCount: 0, messagesCount: 0, errors: [] as string[] };

  const discovery = await discoverSelectedMetaPageHistory({
    provider,
    accountId,
    connectionId: connection.id,
    pageId,
    maxPages: 1,
  });

  const backfill = await backfillMetaConversationHistoryBatch({
    workspaceId: job.workspaceId,
    connectionIds: [connection.id],
    batchSize: 6,
    concurrency: 2,
    maxPages: 10,
  });

  const errors = [...live.errors, ...discovery.errors, ...backfill.errors].filter(Boolean).slice(0, 20);
  const totals = {
    conversationsDiscovered: job.totals.conversationsDiscovered + live.conversationsCount + discovery.conversationsDiscovered,
    messagesInserted: job.totals.messagesInserted + live.messagesCount + discovery.previewMessagesInserted + backfill.messagesInserted,
    conversationsCompleted: job.totals.conversationsCompleted + backfill.conversationsCompleted,
  };

  const shouldContinue = job.cycle + 1 < job.maxCycles
    && (!discovery.historyComplete || backfill.remaining > 0);

  await admin
    .from('integration_connections')
    .update({
      last_sync_at: new Date().toISOString(),
      last_error: errors[0] || null,
    })
    .eq('workspace_id', job.workspaceId)
    .eq('id', connection.id);

  if (errors.length && !discovery.conversationsScanned && !backfill.conversationsScanned && !live.conversationsCount) {
    throw new Error(errors[0]);
  }

  return {
    shouldContinue,
    totals,
    result: {
      provider,
      accountId,
      live,
      discovery,
      backfill,
      errors,
      maintenanceContinues: shouldContinue,
    },
  };
}
