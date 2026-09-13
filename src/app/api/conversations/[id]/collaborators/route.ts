import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor, isManagement } from '@/lib/auth/api-actor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CollaboratorSchema = z.object({ user_id: z.string().uuid() });

async function conversationExists(
  actor: Exclude<Awaited<ReturnType<typeof getApiActor>>, { error: NextResponse }>,
  id: string,
) {
  const { data } = await actor.supabase
    .from('lead_conversations')
    .select('id,assigned_to')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', id)
    .maybeSingle();
  return data;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  const { id } = await context.params;
  if (!(await conversationExists(actor, id))) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });

  const { data, error } = await actor.supabase
    .from('conversation_collaborators')
    .select('user_id,created_at,user:profiles!conversation_collaborators_user_id_fkey(id,full_name,email,avatar_url,role,status)')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('conversation_id', id)
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: 'Unable to load collaborators.' }, { status: 500 });
  return NextResponse.json({ collaborators: data || [] }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  const { id } = await context.params;
  const conversation = await conversationExists(actor, id);
  if (!conversation) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });

  let raw: unknown;
  try { raw = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }); }
  const parsed = CollaboratorSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid collaborator.' }, { status: 400 });
  if (!isManagement(actor.profile) && parsed.data.user_id !== actor.user.id) {
    return NextResponse.json({ error: 'Agents may only add themselves as collaborators.' }, { status: 403 });
  }

  const { data: member } = await actor.supabase
    .from('profiles')
    .select('id')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', parsed.data.user_id)
    .eq('is_active', true)
    .maybeSingle();
  if (!member) return NextResponse.json({ error: 'Collaborator is not an active workspace member.' }, { status: 400 });

  const { error } = await actor.supabase.from('conversation_collaborators').upsert({
    workspace_id: actor.profile.workspace_id,
    conversation_id: id,
    user_id: parsed.data.user_id,
    created_by: actor.user.id,
  }, { onConflict: 'conversation_id,user_id' });
  if (error) return NextResponse.json({ error: 'Unable to add collaborator.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  const { id } = await context.params;
  if (!(await conversationExists(actor, id))) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });

  const url = new URL(request.url);
  const userId = url.searchParams.get('userId') || actor.user.id;
  if (!isManagement(actor.profile) && userId !== actor.user.id) {
    return NextResponse.json({ error: 'Agents may only remove themselves as collaborators.' }, { status: 403 });
  }

  const { error } = await actor.supabase
    .from('conversation_collaborators')
    .delete()
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('conversation_id', id)
    .eq('user_id', userId);
  if (error) return NextResponse.json({ error: 'Unable to remove collaborator.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
