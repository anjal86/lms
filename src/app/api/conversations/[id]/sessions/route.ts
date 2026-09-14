import { NextResponse } from 'next/server';
import { getApiActor } from '@/lib/auth/api-actor';
import { actorHasPermission } from '@/lib/auth/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!(await actorHasPermission(actor, 'inbox.view'))) {
    return NextResponse.json({ error: 'Inbox access required.' }, { status: 403 });
  }

  const { id } = await context.params;
  const { data: conversation, error: conversationError } = await actor.supabase
    .from('lead_conversations')
    .select('id,current_session_id')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', id)
    .maybeSingle();
  if (conversationError) return NextResponse.json({ error: 'Unable to verify conversation.' }, { status: 500 });
  if (!conversation) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });

  const { data: sessions, error } = await actor.supabase
    .from('conversation_sessions')
    .select('id,owner_id,opened_at,first_inbound_at,first_outbound_at,last_message_at,first_response_seconds,closed_at,closed_by,resolution_code,closing_note,created_at,updated_at')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('conversation_id', id)
    .order('opened_at', { ascending: false });
  if (error) {
    console.error('Conversation session history failed:', error.message);
    return NextResponse.json({ error: 'Unable to load conversation history.' }, { status: 500 });
  }

  const profileIds = [...new Set((sessions || []).flatMap((session) => [session.owner_id, session.closed_by]).filter((value): value is string => Boolean(value)))];
  const profiles = profileIds.length
    ? await actor.supabase.from('profiles').select('id,full_name,email').eq('workspace_id', actor.profile.workspace_id).in('id', profileIds)
    : { data: [], error: null };
  const profileById = new Map((profiles.data || []).map((profile) => [profile.id, profile]));

  return NextResponse.json({
    current_session_id: conversation.current_session_id,
    sessions: (sessions || []).map((session) => ({
      ...session,
      is_current: session.id === conversation.current_session_id && !session.closed_at,
      owner: session.owner_id ? profileById.get(session.owner_id) || null : null,
      closed_by_profile: session.closed_by ? profileById.get(session.closed_by) || null : null,
      resolution_seconds: session.closed_at ? Math.max(0, Math.round((new Date(session.closed_at).getTime() - new Date(session.opened_at).getTime()) / 1000)) : null,
    })),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
