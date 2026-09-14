import { NextResponse } from 'next/server';
import { getApiActor } from '@/lib/auth/api-actor';
import { actorHasPermission } from '@/lib/auth/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!(await actorHasPermission(actor, 'inbox.view'))) {
    return NextResponse.json({ exceptions: null }, { headers: { 'Cache-Control': 'private, no-store' } });
  }

  const workspaceId = actor.profile.workspace_id;
  const now = new Date().toISOString();
  const base = () => actor.supabase.from('lead_conversations').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId);

  const [needsReply, overdue, unassigned, urgent, nextAction] = await Promise.all([
    base().eq('needs_reply', true).neq('workflow_state', 'closed'),
    base().is('first_responded_at', null).neq('workflow_state', 'closed').lt('first_response_due_at', now),
    base().is('assigned_to', null).neq('workflow_state', 'closed'),
    base().eq('priority', 'urgent').neq('workflow_state', 'closed'),
    base().neq('workflow_state', 'closed').not('next_action_at', 'is', null).lte('next_action_at', now),
  ]);

  let automationFailures = 0;
  if (await actorHasPermission(actor, 'automations.view')) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const failureResult = await actor.supabase
      .from('automation_runs')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('status', 'failed')
      .gte('created_at', since);
    automationFailures = failureResult.count || 0;
  }

  return NextResponse.json({
    exceptions: {
      needs_reply: needsReply.count || 0,
      sla_overdue: overdue.count || 0,
      unassigned: unassigned.count || 0,
      urgent: urgent.count || 0,
      next_actions_due: nextAction.count || 0,
      automation_failures_24h: automationFailures,
    },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
