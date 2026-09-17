import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor, isManagement } from '@/lib/auth/api-actor';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PatchSchema = z.object({
  action: z.enum(['pause','takeover','resume']),
});

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getApiActor(request);
    if ('error' in actor) return actor.error;
    const { id } = await context.params;

    const { data: conversation, error: convError } = await actor.supabase
      .from('lead_conversations')
      .select('id,workspace_id,assigned_to')
      .eq('workspace_id', actor.profile.workspace_id)
      .eq('id', id)
      .maybeSingle();
    if (convError) throw convError;
    if (!conversation) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });

    const { data: state, error: stateError } = await actor.supabase
      .from('conversation_ai_states')
      .select('conversation_id,agent_id,state,draft_reply,last_ai_at,last_human_at,handoff_reason,handed_off_at,failure_count,last_error,updated_at,agent:ai_agents(id,name,model,mode,is_active)')
      .eq('workspace_id', actor.profile.workspace_id)
      .eq('conversation_id', id)
      .maybeSingle();
    if (stateError) throw stateError;

    return NextResponse.json({ ai: state || null }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error: any) {
    console.error('GET AI STATE ERROR:', error);
    return NextResponse.json({ error: String(error.message || error), details: error }, { status: 500 });
  }
}

async function requeueLatestUnansweredInbound(input: {
  workspaceId: string;
  conversationId: string;
  agentId: string;
}) {
  const admin = createSupabaseAdminClient();
  const { data: rows, error } = await admin
    .from('lead_messages')
    .select('id,direction,sent_at,delivery_status')
    .eq('workspace_id', input.workspaceId)
    .eq('conversation_id', input.conversationId)
    .in('direction', ['inbound','outbound'])
    .order('sent_at', { ascending: false })
    .limit(30);
  if (error) throw error;

  const messages = rows || [];
  const latestInbound = messages.find((message) => message.direction === 'inbound');
  if (!latestInbound) return false;

  const inboundAt = new Date(latestInbound.sent_at).getTime();
  const hasLaterDeliveredOutbound = messages.some((message) => (
    message.direction === 'outbound'
    && message.delivery_status !== 'failed'
    && new Date(message.sent_at).getTime() > inboundAt
  ));
  if (hasLaterDeliveredOutbound) return false;

  const { data: existingJob, error: jobReadError } = await admin
    .from('ai_agent_jobs')
    .select('id')
    .eq('workspace_id', input.workspaceId)
    .eq('conversation_id', input.conversationId)
    .eq('source_message_id', latestInbound.id)
    .maybeSingle();
  if (jobReadError) throw jobReadError;

  const now = new Date().toISOString();
  if (existingJob?.id) {
    const { error: resetError } = await admin.from('ai_agent_jobs').update({
      workspace_id: input.workspaceId,
      agent_id: input.agentId,
      conversation_id: input.conversationId,
      status: 'queued',
      attempt_count: 0,
      next_attempt_at: now,
      locked_at: null,
      completed_at: null,
      last_error: null,
      result: {},
      updated_at: now,
    }).eq('id', existingJob.id);
    if (resetError) throw resetError;
  } else {
    const { error: insertError } = await admin.from('ai_agent_jobs').insert({
      workspace_id: input.workspaceId,
      agent_id: input.agentId,
      conversation_id: input.conversationId,
      source_message_id: latestInbound.id,
      status: 'queued',
      next_attempt_at: now,
    });
    if (insertError) throw insertError;
  }

  return true;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
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

  let agentId = existing?.agent_id || null;
  if (!agentId && conversation.connection_id) {
    const { data: binding, error: bindingError } = await actor.supabase
      .from('ai_agent_connections')
      .select('agent_id')
      .eq('workspace_id', actor.profile.workspace_id)
      .eq('connection_id', conversation.connection_id)
      .eq('is_enabled', true)
      .limit(1)
      .maybeSingle();
    if (bindingError) return NextResponse.json({ error: 'Unable to resolve the channel AI agent.' }, { status: 500 });
    agentId = binding?.agent_id || null;
  }

  if (parsed.data.action === 'resume') {
    if (!isManagement(actor.profile)) return NextResponse.json({ error: 'Manager access required to return a conversation to AI.' }, { status: 403 });
    if (!agentId) return NextResponse.json({ error: 'No AI agent is attached or bound to this conversation channel.' }, { status: 409 });

    const { data: agent } = await actor.supabase
      .from('ai_agents')
      .select('id,is_active,mode')
      .eq('workspace_id', actor.profile.workspace_id)
      .eq('id', agentId)
      .maybeSingle();
    if (!agent?.is_active || agent.mode === 'off') {
      return NextResponse.json({ error: 'The attached AI agent is not active.' }, { status: 409 });
    }

    if (agent.mode !== 'assist') {
      const { error: unassignError } = await actor.supabase
        .from('lead_conversations')
        .update({ assigned_to: null, updated_at: new Date().toISOString() })
        .eq('workspace_id', actor.profile.workspace_id)
        .eq('id', id);
      if (unassignError) return NextResponse.json({ error: 'Unable to release human ownership.' }, { status: 500 });
    }

    const { error } = await actor.supabase.from('conversation_ai_states').upsert({
      conversation_id: id,
      workspace_id: actor.profile.workspace_id,
      agent_id: agent.id,
      state: 'active',
      handoff_reason: null,
      handed_off_at: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'conversation_id' });
    if (error) return NextResponse.json({ error: 'Unable to resume AI.' }, { status: 500 });

    try {
      await requeueLatestUnansweredInbound({
        workspaceId: actor.profile.workspace_id,
        conversationId: id,
        agentId: agent.id,
      });
    } catch (queueError) {
      console.error('Unable to requeue conversation for AI after resume:', queueError);
      return NextResponse.json({ error: 'AI was resumed, but the latest customer message could not be queued.' }, { status: 500 });
    }
  } else {
    if (!agentId) return NextResponse.json({ error: 'No AI agent is attached or bound to this conversation.' }, { status: 409 });

    const patch: Record<string, unknown> = {
      conversation_id: id,
      workspace_id: actor.profile.workspace_id,
      agent_id: agentId,
      state: 'paused',
      last_human_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (parsed.data.action === 'takeover') {
      patch.handoff_reason = 'Human agent took over the conversation.';
      patch.handed_off_at = new Date().toISOString();
    }
    const { error } = await actor.supabase.from('conversation_ai_states').upsert(patch, { onConflict: 'conversation_id' });
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

  const { data: state, error: stateError } = await actor.supabase
    .from('conversation_ai_states')
    .select('conversation_id,agent_id,state,draft_reply,last_ai_at,last_human_at,handoff_reason,handed_off_at,failure_count,last_error,updated_at,agent:ai_agents(id,name,model,mode,is_active)')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('conversation_id', id)
    .single();
  if (stateError) throw stateError;

  return NextResponse.json({ ai: state });
  } catch (error: any) {
    console.error('PATCH AI STATE ERROR:', error);
    return NextResponse.json({ error: String(error.message || error) }, { status: 500 });
  }
}
