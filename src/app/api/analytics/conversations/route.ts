import { NextResponse } from 'next/server';
import { getApiActor } from '@/lib/auth/api-actor';
import { actorHasPermission } from '@/lib/auth/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function average(values: number[]) {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

export async function GET(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!(await actorHasPermission(actor, 'reports.view'))) {
    return NextResponse.json({ error: 'Reports access required.' }, { status: 403 });
  }

  const url = new URL(request.url);
  const requestedDays = Number(url.searchParams.get('days') || '30');
  const days = Number.isFinite(requestedDays) ? Math.min(180, Math.max(1, Math.round(requestedDays))) : 30;
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: sessions, error: sessionError } = await actor.supabase
    .from('conversation_sessions')
    .select('id,conversation_id,owner_id,opened_at,first_response_seconds,closed_at,resolution_code')
    .eq('workspace_id', actor.profile.workspace_id)
    .gte('opened_at', start)
    .order('opened_at', { ascending: false })
    .limit(10000);
  if (sessionError) {
    console.error('Conversation analytics session query failed:', sessionError.message);
    return NextResponse.json({ error: 'Unable to load conversation analytics.' }, { status: 500 });
  }

  const rows = sessions || [];
  const conversationIds = [...new Set(rows.map((row) => row.conversation_id))];
  const ownerIds = [...new Set(rows.map((row) => row.owner_id).filter((value): value is string => Boolean(value)))];

  const conversationResult = conversationIds.length
    ? await actor.supabase
        .from('lead_conversations')
        .select('id,provider,assigned_to,workflow_state,sla_breached_at')
        .eq('workspace_id', actor.profile.workspace_id)
        .in('id', conversationIds)
    : { data: [], error: null };
  if (conversationResult.error) console.error('Conversation analytics transport query failed:', conversationResult.error.message);

  const profileResult = ownerIds.length
    ? await actor.supabase
        .from('profiles')
        .select('id,full_name,email')
        .eq('workspace_id', actor.profile.workspace_id)
        .in('id', ownerIds)
    : { data: [], error: null };
  const profileById = new Map((profileResult.data || []).map((profile) => [profile.id, profile]));
  const conversationById = new Map((conversationResult.data || []).map((conversation) => [conversation.id, conversation]));

  const responseTimes = rows.map((row) => row.first_response_seconds).filter((value): value is number => typeof value === 'number' && value >= 0);
  const resolvedRows = rows.filter((row) => Boolean(row.closed_at));
  const resolutionTimes = resolvedRows.map((row) => Math.max(0, Math.round((new Date(row.closed_at as string).getTime() - new Date(row.opened_at).getTime()) / 1000)));

  const sessionCountByConversation = new Map<string, number>();
  for (const row of rows) sessionCountByConversation.set(row.conversation_id, (sessionCountByConversation.get(row.conversation_id) || 0) + 1);
  const reopenedConversations = [...sessionCountByConversation.values()].filter((count) => count > 1).length;

  const byProviderMap = new Map<string, number>();
  for (const row of rows) {
    const provider = conversationById.get(row.conversation_id)?.provider || 'unknown';
    byProviderMap.set(provider, (byProviderMap.get(provider) || 0) + 1);
  }

  const resolutionMap = new Map<string, number>();
  for (const row of resolvedRows) {
    const reason = row.resolution_code || 'unspecified';
    resolutionMap.set(reason, (resolutionMap.get(reason) || 0) + 1);
  }

  const byAgent = new Map<string, { id: string; name: string; sessions: number; resolved: number; response: number[]; resolution: number[] }>();
  for (const row of rows) {
    if (!row.owner_id) continue;
    const profile = profileById.get(row.owner_id);
    const current = byAgent.get(row.owner_id) || {
      id: row.owner_id,
      name: profile?.full_name || profile?.email || 'Unknown user',
      sessions: 0,
      resolved: 0,
      response: [],
      resolution: [],
    };
    current.sessions += 1;
    if (typeof row.first_response_seconds === 'number') current.response.push(row.first_response_seconds);
    if (row.closed_at) {
      current.resolved += 1;
      current.resolution.push(Math.max(0, Math.round((new Date(row.closed_at).getTime() - new Date(row.opened_at).getTime()) / 1000)));
    }
    byAgent.set(row.owner_id, current);
  }

  const { data: activeRows } = await actor.supabase
    .from('lead_conversations')
    .select('assigned_to,workflow_state')
    .eq('workspace_id', actor.profile.workspace_id)
    .neq('workflow_state', 'closed');
  const workload = new Map<string, number>();
  for (const row of activeRows || []) {
    if (row.assigned_to) workload.set(row.assigned_to, (workload.get(row.assigned_to) || 0) + 1);
  }

  const slaBreaches = [...conversationById.values()].filter((conversation) => Boolean(conversation.sla_breached_at)).length;

  return NextResponse.json({
    range: { days, start, end: new Date().toISOString() },
    metrics: {
      sessions: rows.length,
      resolved: resolvedRows.length,
      resolution_rate: rows.length ? Math.round((resolvedRows.length / rows.length) * 1000) / 10 : 0,
      average_first_response_seconds: average(responseTimes),
      median_first_response_seconds: median(responseTimes),
      average_resolution_seconds: average(resolutionTimes),
      median_resolution_seconds: median(resolutionTimes),
      reopened_conversations: reopenedConversations,
      reopen_rate: conversationIds.length ? Math.round((reopenedConversations / conversationIds.length) * 1000) / 10 : 0,
      sla_breaches: slaBreaches,
      sla_breach_rate: conversationIds.length ? Math.round((slaBreaches / conversationIds.length) * 1000) / 10 : 0,
    },
    by_provider: [...byProviderMap.entries()].map(([provider, count]) => ({ provider, count })).sort((a, b) => b.count - a.count),
    resolutions: [...resolutionMap.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    agents: [...byAgent.values()].map((row) => ({
      id: row.id,
      name: row.name,
      sessions: row.sessions,
      resolved: row.resolved,
      resolution_rate: row.sessions ? Math.round((row.resolved / row.sessions) * 1000) / 10 : 0,
      average_first_response_seconds: average(row.response),
      average_resolution_seconds: average(row.resolution),
      active_workload: workload.get(row.id) || 0,
    })).sort((a, b) => b.sessions - a.sessions),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
