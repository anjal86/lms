import { NextResponse } from 'next/server';
import { getApiActor, isManagement } from '@/lib/auth/api-actor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!isManagement(actor.profile)) return NextResponse.json({ error: 'Manager access required.' }, { status: 403 });

  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get('limit') || 100);
  const limit = Math.max(20, Math.min(Number.isFinite(rawLimit) ? rawLimit : 100, 250));
  const { data, error } = await actor.supabase
    .from('ai_runs')
    .select('id,agent_id,conversation_id,provider_config_id,provider,model,status,action,confidence,intent,handoff_reason,latency_ms,prompt_tokens,completion_tokens,total_tokens,estimated_cost_usd,knowledge_chunk_ids,error_code,error_message,metadata,started_at,completed_at,created_at')
    .eq('workspace_id', actor.profile.workspace_id)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return NextResponse.json({ error: 'Unable to load AI run history.' }, { status: 500 });

  const runs = data || [];
  const finished = runs.filter((run) => run.status !== 'running' && run.status !== 'scheduled');
  const succeeded = finished.filter((run) => ['succeeded','draft','noop'].includes(run.status));
  const failed = finished.filter((run) => run.status === 'failed');
  const handoffs = finished.filter((run) => run.status === 'handoff');
  const latencyValues = finished.map((run) => Number(run.latency_ms)).filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  const medianLatencyMs = latencyValues.length ? latencyValues[Math.floor(latencyValues.length / 2)] : null;
  const totalTokens = runs.reduce((sum, run) => sum + (Number(run.total_tokens) || 0), 0);
  const estimatedCost = runs.reduce((sum, run) => sum + (Number(run.estimated_cost_usd) || 0), 0);

  return NextResponse.json({
    runs,
    summary: {
      sampled_runs: runs.length,
      finished_runs: finished.length,
      success_rate: finished.length ? succeeded.length / finished.length : null,
      failed_runs: failed.length,
      handoff_runs: handoffs.length,
      median_latency_ms: medianLatencyMs,
      total_tokens: totalTokens,
      estimated_cost_usd: estimatedCost,
    },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
