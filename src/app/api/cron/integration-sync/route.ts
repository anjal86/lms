import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { processMetaHistorySyncJob } from '@/lib/integrations/meta-history-worker';
import {
  claimIntegrationSyncJob,
  completeIntegrationSyncJob,
  continueIntegrationSyncJob,
  failIntegrationSyncJob,
  recoverStaleIntegrationSyncJobs,
} from '@/lib/redis/integration-sync-queue';
import { isRedisConfigured } from '@/lib/redis/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeSecretMatch(actual: string | null, expected: string | undefined) {
  if (!actual || !expected) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!safeSecretMatch(request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || null, process.env.INTEGRATION_SYNC_SECRET?.trim())) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  if (!isRedisConfigured()) {
    return NextResponse.json({ error: 'Redis is not configured.' }, { status: 503 });
  }

  const recovered = await recoverStaleIntegrationSyncJobs(20);
  const claimed = await claimIntegrationSyncJob();
  if (!claimed) {
    return NextResponse.json({ success: true, processed: 0, recovered });
  }

  try {
    const output = await processMetaHistorySyncJob(claimed.job);
    if (output.shouldContinue) {
      await continueIntegrationSyncJob({
        job: claimed.job,
        raw: claimed.raw,
        totals: output.totals,
        result: output.result,
      });
    } else {
      await completeIntegrationSyncJob({
        job: claimed.job,
        raw: claimed.raw,
        totals: output.totals,
        result: output.result,
      });
    }

    return NextResponse.json({
      success: true,
      processed: 1,
      recovered,
      jobId: claimed.job.id,
      continuing: output.shouldContinue,
      totals: output.totals,
      result: output.result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const retry = await failIntegrationSyncJob({
      job: claimed.job,
      raw: claimed.raw,
      error: message,
    });
    return NextResponse.json({
      success: false,
      processed: 1,
      recovered,
      jobId: claimed.job.id,
      error: message,
      retry,
    }, { status: retry.retried ? 202 : 500 });
  }
}
