import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor } from '@/lib/auth/api-actor';
import { actorHasPermission } from '@/lib/auth/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WorkflowSchema = z.object({
  name: z.string().trim().min(1).max(120),
  trigger_key: z.string().trim().min(1).max(80),
  conditions: z.record(z.string(), z.unknown()).default({}),
  actions: z.array(z.record(z.string(), z.unknown())).min(1).max(25),
  is_enabled: z.boolean().default(true),
  sort_order: z.number().int().min(0).max(10000).default(100),
});

export async function GET(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!(await actorHasPermission(actor, 'automations.view'))) return NextResponse.json({ error: 'Automation access required.' }, { status: 403 });

  const { data, error } = await actor.supabase
    .from('automation_workflows')
    .select('id,name,trigger_key,conditions,actions,is_enabled,sort_order,created_by,created_at,updated_at')
    .eq('workspace_id', actor.profile.workspace_id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: 'Unable to load automations.' }, { status: 500 });

  const { data: runRows } = await actor.supabase
    .from('automation_runs')
    .select('workflow_id,status,created_at,error')
    .eq('workspace_id', actor.profile.workspace_id)
    .order('created_at', { ascending: false })
    .limit(100);

  const latestRuns = new Map<string, unknown>();
  for (const run of runRows || []) if (!latestRuns.has(run.workflow_id)) latestRuns.set(run.workflow_id, run);

  const workflowNames = new Map((data || []).map((workflow) => [workflow.id, workflow.name]));
  const recentRuns = (runRows || []).slice(0, 30).map((run) => ({
    ...run,
    workflow_name: workflowNames.get(run.workflow_id) || 'Deleted workflow',
  }));

  return NextResponse.json({
    workflows: (data || []).map((workflow) => ({ ...workflow, latest_run: latestRuns.get(workflow.id) || null })),
    recent_runs: recentRuns,
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!(await actorHasPermission(actor, 'automations.edit'))) return NextResponse.json({ error: 'Automation edit permission required.' }, { status: 403 });

  let raw: unknown;
  try { raw = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }); }
  const parsed = WorkflowSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed.', details: parsed.error.flatten() }, { status: 400 });
  if (parsed.data.is_enabled && !(await actorHasPermission(actor, 'automations.publish'))) {
    return NextResponse.json({ error: 'Automation publish permission required to enable a workflow.' }, { status: 403 });
  }

  const { data, error } = await actor.supabase
    .from('automation_workflows')
    .insert({ workspace_id: actor.profile.workspace_id, ...parsed.data, created_by: actor.user.id })
    .select()
    .single();
  if (error) {
    console.error('Create automation failed:', error.message);
    return NextResponse.json({ error: 'Unable to create automation.' }, { status: 500 });
  }
  return NextResponse.json({ workflow: data }, { status: 201 });
}
