import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor, isManagement } from '@/lib/auth/api-actor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PatchSchema = z.object({
  action: z.enum(['pause','takeover','resume']),
});

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  const { id } = await context.params;

  const { data: conversation } = await actor.supabase
    .from('lead_conversations')
    .select('id,workspace_id,assigned_to')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', id)
    .maybeSingle();
  if (!conversation) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });

  const { data: state } = await actor.supabase
    .from('conversation_ai_states')
    .select('conversation_id,agent_id,state,draft_reply,last_ai_at,last_human_at,handoff_reason,handed_off_at,failure_count,last_error,updated_at,agent:ai_agents(id,name,model,mode,is_active)')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('conversation_id', id)
    .maybeSingle();

  return NextResponse.json({ ai: state || null }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid AI action.' }, { status: 400 });

  const { id } = await context.params;
  const { data: conversation } = await actor.supabase
    .from('lead_conversations')
    .select('id,workspace_id,assigned_to,connection_id')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', id)
    .maybeSingle();
  if (!conversation) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });

  const { data: existing } = await actor.supabase
    .from('conversation_ai_states')
    .select('conversation_id,agent_id,state')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('conversation_id', id)
    .maybeSingle();

  if (parsed.data.action === 'resume') {
    if (!isManagement(actor.profile)) return NextResponse.json({ error: 'Manager access required to return a conversation to AI.' }, { status: 403 });
    if (!existing?.agent_id) return NextResponse.json({ error: 'No AI agent is attached to this conversation.' }, { status: 409 });

    const { error: unassignError } = await actor.supabase
      .from('lead_conversations')
      .update({ assigned_to: null, updated_at: new Date().toISOString() })
      .eq('workspace_id', actor.profile.workspace_id)
      .eq('id', id);
    if (unassignError) return NextResponse.json({ error: 'Unable to release human ownership.' }, { status: 500 });

    const { error } = await actor.supabase.from('conversation_ai_states').update({
      state: 'active',
      handoff_reason: null,
      handed_off_at: null,
      handed_off_to: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    }).eq('workspace_id', actor.profile.workspace_id).eq('conversation_id', id);
    if (error) return NextResponse.json({ error: 'Unable to resume AI.' }, { status: 500 });
  } else {
    if (!existing?.agent_id) return NextResponse.json({ error: 'No AI agent is attached to this conversation.' }, { status: 409 });
    const nextState = parsed.data.action === 'takeover' ? 'paused' : 'paused';
    const patch: Record<string, unknown> = {
      state: nextState,
      last_human_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (parsed.data.action === 'takeover') {
      patch.handoff_reason = 'Human agent took over the conversation.';
      patch.handed_off_at = new Date().toISOString();
      patch.handed_off_to = actor.user.id;
    }
    const { error } = await actor.supabase.from('conversation_ai_states').update(patch)
      .eq('workspace_id', actor.profile.workspace_id)
      .eq('conversation_id', id);
    if (error) return NextResponse.json({ error: 'Unable to pause AI.' }, { status: 500 });

    if (parsed.data.action === 'takeover') {
      const { error: assignError } = await actor.supabase.rpc('assign_conversation', {
        p_conversation_id: id,
        p_assignee_id: actor.user.id,
        p_strategy: null,
        p_automation_run_id: null,
      });
      if (assignError) return NextResponse.json({ error: assignError.message || 'Unable to take ownership.' }, { status: assignError.code === '42501' ? 403 : 400 });
    }
  }

  const { data: state } = await actor.supabase
    .from('conversation_ai_states')
    .select('conversation_id,agent_id,state,draft_reply,last_ai_at,last_human_at,handoff_reason,handed_off_at,failure_count,last_error,updated_at,agent:ai_agents(id,name,model,mode,is_active)')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('conversation_id', id)
    .single();
  return NextResponse.json({ ai: state });
}
