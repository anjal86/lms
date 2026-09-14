import { NextResponse } from 'next/server';
import { getApiActor } from '@/lib/auth/api-actor';
import { actorHasPermission } from '@/lib/auth/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!(await actorHasPermission(actor, 'automations.view'))) return NextResponse.json({ error: 'Automation access required.' }, { status: 403 });

  const url = new URL(request.url);
  const workflowId = url.searchParams.get('workflowId')?.trim() || '';
  const status = url.searchParams.get('status')?.trim() || '';
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 50));

  let query = actor.supabase
    .from('automation_runs')
    .select('id,workflow_id,event_id,conversation_id,status,result,error,started_at,completed_at,created_at,workflow:automation_workflows(name),conversation:lead_conversations(customer_name,provider,workflow_state)')
    .eq('workspace_id', actor.profile.workspace_id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (workflowId) query = query.eq('workflow_id', workflowId);
  if (['pending','running','succeeded','failed','skipped'].includes(status)) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) {
    console.error('Automation run history failed:', error.message);
    return NextResponse.json({ error: 'Unable to load automation history.' }, { status: 500 });
  }

  return NextResponse.json({ runs: data || [] }, { headers: { 'Cache-Control': 'private, no-store' } });
}
