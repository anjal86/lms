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

  return NextResponse.json({ events: data || [] }, { headers: { 'Cache-Control': 'private, no-store' } });
}
