import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor, type ApiActor } from '@/lib/auth/api-actor';
import { actorHasPermission } from '@/lib/auth/permissions';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CollaboratorSchema = z.object({ user_id: uuidSchema });

async function conversationExists(actor: ApiActor, id: string) {
  const { data } = await actor.supabase
    .from('lead_conversations')
    .select('id,assigned_to,contact_id')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', id)
    .maybeSingle();
  return data;
}

async function canManageOtherCollaborators(actor: ApiActor) {
  return actorHasPermission(actor, 'inbox.assign');
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


  const { data: member } = await actor.supabase
    .from('profiles')
    .select('id,full_name,email')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', parsed.data.user_id)
    .eq('is_active', true)
    .maybeSingle();
  if (!member) return NextResponse.json({ error: 'Collaborator is not an active workspace member.' }, { status: 400 });

  const { data: existingCollaborator } = await actor.supabase
    .from('conversation_collaborators')
    .select('user_id')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('conversation_id', id)
    .eq('user_id', parsed.data.user_id)
    .maybeSingle();
  if (existingCollaborator) return NextResponse.json({ ok: true, changed: false });

  const { error } = await actor.supabase.from('conversation_collaborators').insert({
    workspace_id: actor.profile.workspace_id,
    conversation_id: id,
    user_id: parsed.data.user_id,
    created_by: actor.user.id,
  });
  if (error) return NextResponse.json({ error: 'Unable to add collaborator.' }, { status: 500 });

  const admin = createSupabaseAdminClient();
  const { error: eventError } = await admin.from('conversation_events').insert({
    workspace_id: actor.profile.workspace_id,
    conversation_id: id,
    contact_id: conversation.contact_id,
    event_type: 'collaborator_added',
    actor_id: actor.user.id,
    payload: {
      collaborator_id: member.id,
      collaborator_name: member.full_name || member.email || 'Team member',
    },
  });
  if (eventError) console.error('Unable to log collaborator addition:', eventError.message);
  return NextResponse.json({ ok: true, changed: true });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  const { id } = await context.params;
  const conversation = await conversationExists(actor, id);
  if (!conversation) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });

  const url = new URL(request.url);
  const userId = url.searchParams.get('userId') || actor.user.id;
  if (userId !== actor.user.id && !(await canManageOtherCollaborators(actor))) {
    return NextResponse.json({ error: 'You do not have permission to remove another staff member from collaborators.' }, { status: 403 });
  }

  const { data: existingCollaborator } = await actor.supabase
    .from('conversation_collaborators')
    .select('user_id')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('conversation_id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (!existingCollaborator) return NextResponse.json({ ok: true, changed: false });

  const { data: member } = await actor.supabase
    .from('profiles')
    .select('id,full_name,email')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', userId)
    .maybeSingle();

  const { error } = await actor.supabase
    .from('conversation_collaborators')
    .delete()
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('conversation_id', id)
    .eq('user_id', userId);
  if (error) return NextResponse.json({ error: 'Unable to remove collaborator.' }, { status: 500 });

  const admin = createSupabaseAdminClient();
  const { error: eventError } = await admin.from('conversation_events').insert({
    workspace_id: actor.profile.workspace_id,
    conversation_id: id,
    contact_id: conversation.contact_id,
    event_type: 'collaborator_removed',
    actor_id: actor.user.id,
    payload: {
      collaborator_id: userId,
      collaborator_name: member?.full_name || member?.email || 'Team member',
    },
  });
  if (eventError) console.error('Unable to log collaborator removal:', eventError.message);
  return NextResponse.json({ ok: true, changed: true });
}
