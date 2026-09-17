import { NextResponse } from 'next/server';
import { getApiActor } from '@/lib/auth/api-actor';
import { actorHasPermission } from '@/lib/auth/permissions';
import { cacheResponseHeaders, readRedisJson, scopedRedisCacheKey, writeRedisJson, type RedisCacheStatus } from '@/lib/redis/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DASHBOARD_EXCEPTIONS_TTL_SECONDS = 12;

type ExceptionPayload = {
  workspaceId: string;
  exceptions: {
    needs_reply: number;
    sla_overdue: number;
    unassigned: number;
    urgent: number;
    next_actions_due: number;
    automation_failures_24h: number;
  } | null;
};

export async function GET(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  const canViewInbox = await actorHasPermission(actor, 'inbox.view');
  if (!canViewInbox) {
    return NextResponse.json({ exceptions: null }, { headers: cacheResponseHeaders('BYPASS') });
  }

  const workspaceId = actor.profile.workspace_id;
  const canViewAutomations = await actorHasPermission(actor, 'automations.view');
  const requestUrl = new URL(request.url);
  const forceRefresh = requestUrl.searchParams.get('refresh') === '1';
  const cacheKey = await scopedRedisCacheKey({
    workspaceId,
    namespace: 'dashboard:conversation-exceptions',
    userId: actor.user.id,
    dimensions: { canViewAutomations },
  });

  let cacheStatus: RedisCacheStatus = 'BYPASS';
  if (!forceRefresh) {
    const cached = await readRedisJson<ExceptionPayload>(cacheKey);
    cacheStatus = cached.status;
    if (cached.value) {
      return NextResponse.json(cached.value, { headers: cacheResponseHeaders('HIT') });
    }
  }

  const now = new Date().toISOString();
  const base = () => actor.supabase
    .from('lead_conversations')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId);

  const [needsReply, overdue, unassigned, urgent, nextAction] = await Promise.all([
    base().eq('needs_reply', true).neq('workflow_state', 'closed'),
    base().is('first_responded_at', null).neq('workflow_state', 'closed').lt('first_response_due_at', now),
    base().is('assigned_to', null).neq('workflow_state', 'closed'),
    base().eq('priority', 'urgent').neq('workflow_state', 'closed'),
    base().neq('workflow_state', 'closed').not('next_action_at', 'is', null).lte('next_action_at', now),
  ]);

  const conversationError = [
    needsReply.error,
    overdue.error,
    unassigned.error,
    urgent.error,
    nextAction.error,
  ].find(Boolean);
  if (conversationError) {
    console.error('Dashboard conversation exceptions failed:', conversationError.message);
    return NextResponse.json({ error: 'Unable to load Inbox exception metrics.' }, { status: 500 });
  }

  let automationFailures = 0;
  if (canViewAutomations) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const failureResult = await actor.supabase
      .from('automation_runs')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('status', 'failed')
      .gte('created_at', since);

    if (failureResult.error) {
      console.error('Dashboard automation exception count failed:', failureResult.error.message);
      return NextResponse.json({ error: 'Unable to load automation exception metrics.' }, { status: 500 });
    }
    automationFailures = failureResult.count || 0;
  }

  const payload: ExceptionPayload = {
    workspaceId,
    exceptions: {
      needs_reply: needsReply.count || 0,
      sla_overdue: overdue.count || 0,
      unassigned: unassigned.count || 0,
      urgent: urgent.count || 0,
      next_actions_due: nextAction.count || 0,
      automation_failures_24h: automationFailures,
    },
  };

  await writeRedisJson(cacheKey, payload, DASHBOARD_EXCEPTIONS_TTL_SECONDS);
  return NextResponse.json(payload, { headers: cacheResponseHeaders(forceRefresh ? 'BYPASS' : cacheStatus) });
}
