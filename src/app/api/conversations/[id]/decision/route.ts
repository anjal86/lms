import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor } from '@/lib/auth/api-actor';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PatchSchema = z.object({
  next_action_at: z.string().datetime({ offset: true }).nullable(),
});

const DECISION_SELECT = `
  id,
  workspace_id,
  contact_id,
  lead_id,
  team_key,
  workflow_state,
  priority,
  needs_reply,
  snoozed_until,
  first_response_due_at,
  next_action_at,
  first_responded_at,
  last_inbound_at,
  last_outbound_at,
  assigned_to,
  assigned_profile:profiles!lead_conversations_assigned_to_fkey(id, full_name, email, role, status),
  contact:contacts(id, lifecycle_key, tags)
`;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  const { id } = await context.params;
  const { data, error } = await actor.supabase
    .from('lead_conversations')
    .select(DECISION_SELECT)
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', id)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  }

  return NextResponse.json({ decision: data }, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid next action.', details: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await context.params;
  const { data: existing, error: readError } = await actor.supabase
    .from('lead_conversations')
    .select('id,workspace_id,contact_id,next_action_at')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', id)
    .maybeSingle();

  if (readError || !existing) {
    return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  }

  const { error: updateError } = await actor.supabase
    .from('lead_conversations')
    .update({ next_action_at: parsed.data.next_action_at, updated_at: new Date().toISOString() })
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', id);

  if (updateError) {
    console.error('Conversation next-action update failed:', updateError.message);
    return NextResponse.json({ error: 'Unable to update next action.' }, { status: 500 });
  }

  if (existing.next_action_at !== parsed.data.next_action_at) {
    const admin = createSupabaseAdminClient();
    await admin.from('conversation_events').insert({
      workspace_id: actor.profile.workspace_id,
      conversation_id: id,
      contact_id: existing.contact_id,
      event_type: 'next_action_changed',
      actor_id: actor.user.id,
      payload: {
        from: existing.next_action_at,
        next_action_at: parsed.data.next_action_at,
      },
    });
  }

  const { data: updated } = await actor.supabase
    .from('lead_conversations')
    .select(DECISION_SELECT)
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', id)
    .maybeSingle();

  return NextResponse.json({ decision: updated });
}
