import { NextResponse } from 'next/server';
import { getApiActor } from '@/lib/auth/api-actor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  const { id } = await context.params;
  const url = new URL(request.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 80));

  const { data: conversation } = await actor.supabase
    .from('lead_conversations')
    .select('id')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', id)
    .maybeSingle();
  if (!conversation) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });

  const { data, error } = await actor.supabase
    .from('conversation_events')
    .select(`
      id,
      event_type,
      payload,
      created_at,
      actor_id,
      actor:profiles!conversation_events_actor_id_fkey(id, full_name, avatar_url, role)
    `)
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('conversation_id', id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Conversation event timeline failed:', error.message);
    return NextResponse.json({ error: 'Unable to load conversation history.' }, { status: 500 });
  }

  const events = (data || []).map((e) => ({
    ...e,
    payload: (e.payload || {}) as Record<string, unknown>,
  }));

  const assigneeIds = Array.from(new Set(
    events
      .filter((e) => e.event_type === 'assigned' && typeof e.payload.assigned_to === 'string')
      .map((e) => e.payload.assigned_to as string)
  ));

  if (assigneeIds.length > 0) {
    const { data: profiles } = await actor.supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', assigneeIds);

    const profileMap = new Map((profiles || []).map((p) => [p.id, p.full_name]));
    for (const e of events) {
      if (e.event_type === 'assigned' && typeof e.payload.assigned_to === 'string') {
        const name = profileMap.get(e.payload.assigned_to);
        if (name) {
          e.payload.assigned_to_name = name;
        }
      }
    }
  }

  return NextResponse.json({ events }, { headers: { 'Cache-Control': 'private, no-store' } });
}
