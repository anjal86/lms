import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { processMetaHistorySyncJob } from '@/lib/integrations/meta-history-worker';
import { processAiAgentJob } from '@/lib/ai/agent-worker';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
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

async function processOneAiJob() {
  const admin = createSupabaseAdminClient();

  await admin.from('ai_agent_jobs').update({
    status: 'queued',
    locked_at: null,
    next_attempt_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_error: 'Recovered after an interrupted AI worker cycle.',
  })
    .eq('status', 'processing')
    .lt('locked_at', new Date(Date.now() - 5 * 60_000).toISOString());

  const { data, error } = await admin.rpc('claim_ai_agent_job');
  if (error) {
    // Older databases may not have the AI migration yet while a deployment is rolling out.
    if (error.code !== 'PGRST202' && error.code !== '42883') console.error('AI worker claim failed:', error.message);
    return null;
  }
  const job = Array.isArray(data) ? data[0] : data;
  if (!job) return null;
  return { jobId: job.id, result: await processAiAgentJob(job) };
}

export async function POST(request: Request) {
  if (!safeSecretMatch(request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || null, process.env.INTEGRATION_SYNC_SECRET?.trim())) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const aiResults = [];
  for (let i = 0; i < 4; i++) {
    const aiJob = await processOneAiJob();
    if (!aiJob) break;
    aiResults.push(aiJob);
  }
  const ai = aiResults[0] || null;

  if (!isRedisConfigured()) {
    return NextResponse.json({ success: true, processed: aiResults.length, ai: aiResults[0] || null, aiResults, warning: 'Redis is not configured; integration history sync is unavailable.' }, { status: 200 });
  }

  const recovered = await recoverStaleIntegrationSyncJobs(20);
  const claimed = await claimIntegrationSyncJob();
  if (!claimed) {
    return NextResponse.json({ success: true, processed: aiResults.length, ai: aiResults[0] || null, aiResults, recovered });
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
      processed: 1 + (ai ? 1 : 0),
      ai,
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
      processed: 1 + (ai ? 1 : 0),
      ai,
      recovered,
      jobId: claimed.job.id,
      error: message,
      retry,
    }, { status: retry.retried ? 202 : 500 });
  }
}
