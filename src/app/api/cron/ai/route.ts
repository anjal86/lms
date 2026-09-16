import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { processAiAgentJob } from '@/lib/ai/agent-worker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeSecretMatch(actual: string | null, expected: string | undefined) {
  if (!actual || !expected) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || null;
  if (!safeSecretMatch(provided, process.env.AI_WORKER_SECRET?.trim())) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();

  // Recover interrupted jobs after five minutes. This is deliberately conservative so
  // a slow provider response is not processed twice by concurrent workers.
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
    console.error('AI worker claim failed:', error.message);
    return NextResponse.json({ error: 'Unable to claim AI work.' }, { status: 500 });
  }

  const job = Array.isArray(data) ? data[0] : data;
  if (!job) return NextResponse.json({ success: true, processed: 0 });

  const result = await processAiAgentJob(job);
  return NextResponse.json({ success: result.processed !== false, processed: 1, jobId: job.id, result }, { status: result.processed === false && !result.retry ? 500 : 200 });
}
