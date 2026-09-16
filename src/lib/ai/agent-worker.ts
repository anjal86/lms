import 'server-only';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { sendChannelText } from '@/lib/integrations/channel-sender';
import { attributionFromConversationMetadata, resolveAdKnowledge } from './ad-context';
import {
  decideWithAiProviderDetailed,
  type AiAgentDecision,
  type AiKnowledgeChunk,
  type AiProviderDecisionResult,
} from './llm-provider';

type AiJob = {
  id: string;
  workspace_id: string;
  agent_id: string;
  conversation_id: string;
  source_message_id: string;
  attempt_count: number;
  max_attempts: number;
  phase?: 'decide' | 'send';
  scheduled_decision?: AiAgentDecision | null;
  send_due_at?: string | null;
  run_id?: string | null;
};

type AgentRow = {
  id: string;
  workspace_id: string;
  name: string;
  provider: string;
  provider_config_id: string | null;
  model: string;
  instructions: string;
  tone: string;
  languages: string[] | null;
  mode: 'off' | 'assist' | 'auto' | 'auto_handoff';
  is_active: boolean;
  temperature: number | string;
  confidence_threshold: number | string;
  response_delay_min_seconds: number;
  response_delay_max_seconds: number;
  handoff_team_key: string | null;
  handoff_keywords: string[] | null;
  allow_when_human_assigned: boolean;
};

type ConversationRow = {
  id: string;
  workspace_id: string;
  lead_id: string | null;
  contact_id: string | null;
  connection_id: string | null;
  provider: string;
  external_thread_id: string | null;
  external_contact_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  assigned_to: string | null;
  workflow_state: string;
  team_key: string | null;
  metadata: Record<string, unknown> | null;
};

type MessageRow = {
  id: string;
  direction: 'inbound' | 'outbound' | 'internal';
  body: string | null;
  sent_at: string;
  metadata: Record<string, unknown> | null;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isAiMessage(message: MessageRow) {
  const metadata = record(message.metadata);
  return metadata.ai_generated === true || typeof metadata.ai_agent_id === 'string';
}

function latestInbound(messages: MessageRow[]) {
  return [...messages].reverse().find((message) => message.direction === 'inbound') || null;
}

function humanOutboundAfter(messages: MessageRow[], timestamp: string) {
  const boundary = new Date(timestamp).getTime();
  return messages.some((message) => {
    if (message.direction !== 'outbound' || isAiMessage(message)) return false;
    return new Date(message.sent_at).getTime() > boundary;
  });
}

function keywordHandoff(agent: AgentRow, body: string | null) {
  const text = (body || '').toLowerCase();
  if (!text) return null;
  for (const keyword of agent.handoff_keywords || []) {
    const normalized = keyword.trim().toLowerCase();
    if (normalized && text.includes(normalized)) return `Customer message matched handoff keyword: ${keyword}`;
  }
  return null;
}

async function writeEvent(input: {
  workspaceId: string;
  conversationId: string;
  contactId: string | null;
  eventType: string;
  payload?: Record<string, unknown>;
}) {
  const admin = createSupabaseAdminClient();
  await admin.from('conversation_events').insert({
    workspace_id: input.workspaceId,
    conversation_id: input.conversationId,
    contact_id: input.contactId,
    event_type: input.eventType,
    actor_id: null,
    payload: input.payload || {},
  });
}

async function createRun(job: AiJob, agent: AgentRow, knowledge: AiKnowledgeChunk[]) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from('ai_runs').insert({
    workspace_id: job.workspace_id,
    agent_id: agent.id,
    conversation_id: job.conversation_id,
    source_message_id: job.source_message_id,
    job_id: job.id,
    provider_config_id: agent.provider_config_id,
    provider: agent.provider,
    model: agent.model,
    status: 'running',
    knowledge_chunk_ids: knowledge.map((chunk) => chunk.chunkId),
  }).select('id').single();
  if (error || !data) throw error || new Error('Unable to create AI run telemetry.');
  job.run_id = data.id;
  await admin.from('ai_agent_jobs').update({ run_id: data.id, updated_at: new Date().toISOString() }).eq('id', job.id);
  return String(data.id);
}

async function updateRun(runId: string | null | undefined, patch: Record<string, unknown>) {
  if (!runId) return;
  const admin = createSupabaseAdminClient();
  await admin.from('ai_runs').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', runId);
}

async function recordProviderResult(runId: string, result: AiProviderDecisionResult) {
  await updateRun(runId, {
    provider_config_id: result.providerConfigId,
    provider: result.provider,
    model: result.model,
    latency_ms: result.latencyMs,
    prompt_tokens: result.usage.promptTokens,
    completion_tokens: result.usage.completionTokens,
    total_tokens: result.usage.totalTokens,
    action: result.decision.action,
    confidence: result.decision.confidence,
    intent: result.decision.intent,
    handoff_reason: result.decision.handoff_reason,
    metadata: { provider_label: result.providerLabel, provider_retries: result.retries },
  });
}

async function finishRun(runId: string | null | undefined, status: string, patch: Record<string, unknown> = {}) {
  await updateRun(runId, { status, completed_at: new Date().toISOString(), ...patch });
}

async function completeJob(job: AiJob, result: Record<string, unknown>) {
  const admin = createSupabaseAdminClient();
  await admin.from('ai_agent_jobs').update({
    status: 'completed',
    completed_at: new Date().toISOString(),
    locked_at: null,
    updated_at: new Date().toISOString(),
    last_error: null,
    result,
  }).eq('id', job.id);
}

async function completeSiblingJobs(conversationId: string, processedMessageIds: string[]) {
  if (!processedMessageIds.length) return;
  const admin = createSupabaseAdminClient();
  const { data: siblings } = await admin.from('ai_agent_jobs')
    .select('id,run_id')
    .eq('conversation_id', conversationId)
    .eq('status', 'queued')
    .in('source_message_id', processedMessageIds);
  const runIds = (siblings || []).map((row) => row.run_id).filter(Boolean) as string[];
  if (runIds.length) {
    await admin.from('ai_runs').update({ status: 'cancelled', completed_at: new Date().toISOString(), updated_at: new Date().toISOString(), metadata: { reason: 'coalesced_by_newer_inbound' } }).in('id', runIds);
  }
  await admin.from('ai_agent_jobs').update({
    status: 'completed',
    completed_at: new Date().toISOString(),
    locked_at: null,
    updated_at: new Date().toISOString(),
    result: { coalesced: true },
  }).eq('conversation_id', conversationId).eq('status', 'queued').in('source_message_id', processedMessageIds);
}

async function failJob(job: AiJob, error: unknown) {
  const admin = createSupabaseAdminClient();
  const message = error instanceof Error ? error.message : String(error);
  const attempts = Number(job.attempt_count || 0) + 1;
  const retry = attempts < Number(job.max_attempts || 4);
  const delaySeconds = Math.min(300, 10 * (2 ** Math.max(0, attempts - 1)));
  const sendPhase = (job.phase || 'decide') === 'send';

  await admin.from('ai_agent_jobs').update({
    status: retry ? 'queued' : 'failed',
    attempt_count: attempts,
    next_attempt_at: retry ? new Date(Date.now() + delaySeconds * 1000).toISOString() : new Date().toISOString(),
    locked_at: null,
    run_id: !sendPhase && retry ? null : (job.run_id || null),
    updated_at: new Date().toISOString(),
    last_error: message.slice(0, 1000),
  }).eq('id', job.id);

  if (job.run_id) {
    if (sendPhase && retry) {
      await updateRun(job.run_id, { status: 'scheduled', error_message: message.slice(0, 1000), metadata: { send_retry: attempts } });
    } else {
      await finishRun(job.run_id, 'failed', { error_message: message.slice(0, 1000), metadata: { attempt: attempts, phase: job.phase || 'decide' } });
    }
  }

  await admin.from('conversation_ai_states').upsert({
    conversation_id: job.conversation_id,
    workspace_id: job.workspace_id,
    agent_id: job.agent_id,
    state: retry ? 'active' : 'failed',
    failure_count: attempts,
    last_error: message.slice(0, 1000),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'conversation_id' });

  if (!retry) {
    const { data: conversation } = await admin.from('lead_conversations').select('contact_id').eq('workspace_id', job.workspace_id).eq('id', job.conversation_id).maybeSingle();
    await writeEvent({
      workspaceId: job.workspace_id,
      conversationId: job.conversation_id,
      contactId: conversation?.contact_id || null,
      eventType: 'ai_failed',
      payload: { agent_id: job.agent_id, error: message.slice(0, 500), attempts, phase: job.phase || 'decide' },
    });
  }
  return { retry, attempts, error: message };
}

async function handoffConversation(agent: AgentRow, conversation: ConversationRow, reason: string) {
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  await admin.from('conversation_ai_states').upsert({
    conversation_id: conversation.id,
    workspace_id: conversation.workspace_id,
    agent_id: agent.id,
    state: 'handed_off',
    draft_reply: null,
    handoff_reason: reason.slice(0, 1000),
    handed_off_at: now,
    failure_count: 0,
    last_error: null,
    updated_at: now,
  }, { onConflict: 'conversation_id' });

  if (agent.handoff_team_key) {
    await admin.from('lead_conversations').update({ team_key: agent.handoff_team_key, assigned_to: null, updated_at: now })
      .eq('workspace_id', conversation.workspace_id).eq('id', conversation.id);
    const { error } = await admin.rpc('assign_conversation_worker', { p_conversation_id: conversation.id, p_strategy: null });
    if (error) console.warn('AI handoff routing failed:', error.message);
  }
  await writeEvent({ workspaceId: conversation.workspace_id, conversationId: conversation.id, contactId: conversation.contact_id, eventType: 'ai_handoff', payload: { agent_id: agent.id, reason, team_key: agent.handoff_team_key } });
}

async function sendAiReply(agent: AgentRow, conversation: ConversationRow, sourceMessageId: string, body: string) {
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const clientRequestId = `ai:${agent.id}:${sourceMessageId}`;
  const { data: existing } = await admin.from('lead_messages')
    .select('id,delivery_status,provider_message_id')
    .eq('conversation_id', conversation.id).eq('client_request_id', clientRequestId).maybeSingle();

  if (existing?.id && (existing.provider_message_id || ['sent','delivered','read'].includes(String(existing.delivery_status)))) return String(existing.id);
  if (existing?.id && existing.delivery_status === 'sending') throw new Error('AI outbound message is still pending delivery; refusing a duplicate send.');

  let pendingId = existing?.id ? String(existing.id) : null;
  if (pendingId) {
    const { error } = await admin.from('lead_messages').update({
      body,
      delivery_status: 'sending',
      failure_code: null,
      failure_message: null,
      sent_at: now,
      metadata: { sent_via: 'workspace_ai_agent', ai_generated: true, ai_agent_id: agent.id, source_message_id: sourceMessageId, retrying_failed_send: true },
    }).eq('id', pendingId);
    if (error) throw error;
  } else {
    const { data: pending, error: insertError } = await admin.from('lead_messages').insert({
      workspace_id: conversation.workspace_id,
      conversation_id: conversation.id,
      lead_id: conversation.lead_id,
      connection_id: conversation.connection_id,
      provider: conversation.provider,
      direction: 'outbound',
      message_type: 'text',
      body,
      metadata: { sent_via: 'workspace_ai_agent', ai_generated: true, ai_agent_id: agent.id, source_message_id: sourceMessageId },
      delivery_status: 'sending',
      client_request_id: clientRequestId,
      created_by: null,
      sent_at: now,
    }).select('id').single();
    if (insertError || !pending) throw insertError || new Error('Unable to queue AI reply.');
    pendingId = String(pending.id);
  }

  try {
    const delivered = await sendChannelText({
      provider: conversation.provider,
      connectionId: conversation.connection_id,
      externalThreadId: conversation.external_thread_id,
      externalContactId: conversation.external_contact_id,
      body,
    });
    const { data: finalizedId, error: finalizeError } = await admin.rpc('finalize_outbound_message', {
      p_message_id: pendingId,
      p_external_message_id: delivered.externalMessageId,
      p_sent_at: now,
    });
    if (finalizeError) throw finalizeError;
    const messageId = String(finalizedId || pendingId);
    await admin.from('lead_messages').update({ provider_message_id: delivered.externalMessageId, delivery_status: 'sent', failure_code: null, failure_message: null }).eq('id', messageId);
    await admin.from('lead_conversations').update({ last_message_at: now, last_message_preview: body.slice(0, 180), status: 'open', updated_at: now }).eq('workspace_id', conversation.workspace_id).eq('id', conversation.id);
    if (conversation.lead_id) {
      await admin.from('activity_logs').insert({
        lead_id: conversation.lead_id,
        agent_id: null,
        activity_type: conversation.provider === 'whatsapp' ? 'whatsapp' : 'system',
        title: `AI replied via ${conversation.provider}`,
        notes: body,
        metadata: { conversation_id: conversation.id, ai_agent_id: agent.id, ai_generated: true },
      });
    }
    return messageId;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await admin.from('lead_messages').update({ delivery_status: 'failed', failure_code: 'ai_delivery_failed', failure_message: message.slice(0, 1000) }).eq('id', pendingId);
    throw error;
  }
}

async function saveDraft(agent: AgentRow, conversation: ConversationRow, decision: AiAgentDecision, sourceMessageId: string) {
  const admin = createSupabaseAdminClient();
  await admin.from('conversation_ai_states').upsert({
    conversation_id: conversation.id,
    workspace_id: conversation.workspace_id,
    agent_id: agent.id,
    state: 'active',
    draft_reply: decision.reply,
    last_processed_message_id: sourceMessageId,
    failure_count: 0,
    last_error: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'conversation_id' });
  await writeEvent({ workspaceId: conversation.workspace_id, conversationId: conversation.id, contactId: conversation.contact_id, eventType: 'ai_draft_ready', payload: { agent_id: agent.id, confidence: decision.confidence, intent: decision.intent } });
}

async function loadMessages(workspaceId: string, conversationId: string, limit = 40) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from('lead_messages')
    .select('id,direction,body,sent_at,metadata')
    .eq('workspace_id', workspaceId).eq('conversation_id', conversationId)
    .order('sent_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return ([...(data || [])].reverse()) as MessageRow[];
}

async function retrieveKnowledge(job: AiJob, inbound: MessageRow, adAttribution: ReturnType<typeof attributionFromConversationMetadata>) {
  const admin = createSupabaseAdminClient();
  const ad = adAttribution ? record(adAttribution) : {};
  const query = [inbound.body, ad.headline, ad.body, ad.ad_name].filter((value) => typeof value === 'string' && value.trim()).join(' ').slice(0, 1000);
  if (!query.trim()) return [] as AiKnowledgeChunk[];
  const { data, error } = await admin.rpc('search_ai_agent_knowledge', {
    p_workspace_id: job.workspace_id,
    p_agent_id: job.agent_id,
    p_query: query,
    p_limit: 6,
  });
  if (error) {
    if (error.code !== 'PGRST202' && error.code !== '42883') console.warn('AI knowledge retrieval failed:', error.message);
    return [] as AiKnowledgeChunk[];
  }
  return (data || []).map((row: Record<string, unknown>) => ({
    chunkId: String(row.chunk_id),
    sourceId: String(row.source_id),
    sourceName: String(row.source_name || 'Knowledge'),
    sourceType: String(row.source_type || 'manual'),
    sourceUrl: typeof row.source_url === 'string' ? row.source_url : null,
    content: String(row.content || ''),
    score: Number(row.score) || 0,
  })).filter((row: AiKnowledgeChunk) => row.content);
}

async function scheduleReply(job: AiJob, decision: AiAgentDecision, runId: string, delaySeconds: number) {
  const admin = createSupabaseAdminClient();
  const due = new Date(Date.now() + Math.max(0, Math.round(delaySeconds * 1000))).toISOString();
  await admin.from('ai_agent_jobs').update({
    status: 'queued',
    phase: 'send',
    scheduled_decision: decision,
    send_due_at: due,
    next_attempt_at: due,
    locked_at: null,
    run_id: runId,
    last_error: null,
    updated_at: new Date().toISOString(),
    result: { scheduled: true, send_due_at: due, decision },
  }).eq('id', job.id);
  job.phase = 'send';
  job.scheduled_decision = decision;
  job.send_due_at = due;
  await updateRun(runId, { status: 'scheduled', action: 'reply', confidence: decision.confidence, intent: decision.intent, metadata: { send_due_at: due } });
  return due;
}

async function sendScheduledReply(job: AiJob, agent: AgentRow, conversation: ConversationRow, messages: MessageRow[]) {
  const admin = createSupabaseAdminClient();
  const decision = job.scheduled_decision;
  if (!decision || decision.action !== 'reply' || !decision.reply) throw new Error('Scheduled AI reply payload is missing or invalid.');
  const source = messages.find((message) => message.id === job.source_message_id) || null;
  if (!source) {
    await finishRun(job.run_id, 'cancelled', { metadata: { reason: 'source_message_missing' } });
    await completeJob(job, { skipped: true, reason: 'source_message_missing' });
    return { processed: true, skipped: true };
  }

  const latest = latestInbound(messages);
  if (latest && latest.id !== source.id && new Date(latest.sent_at).getTime() > new Date(source.sent_at).getTime()) {
    await finishRun(job.run_id, 'cancelled', { metadata: { reason: 'newer_customer_message', newer_message_id: latest.id } });
    await completeJob(job, { skipped: true, reason: 'newer_customer_message' });
    return { processed: true, skipped: true };
  }
  if (humanOutboundAfter(messages, source.sent_at)) {
    await admin.from('conversation_ai_states').upsert({
      conversation_id: conversation.id, workspace_id: conversation.workspace_id, agent_id: agent.id, state: 'paused', last_human_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: 'conversation_id' });
    await finishRun(job.run_id, 'cancelled', { metadata: { reason: 'human_replied_before_ai_send' } });
    await completeJob(job, { skipped: true, reason: 'human_replied_before_ai_send' });
    return { processed: true, skipped: true };
  }

  const { data: stateBeforeSend } = await admin.from('conversation_ai_states').select('state').eq('conversation_id', conversation.id).maybeSingle();
  if (stateBeforeSend && ['paused','handed_off','disabled'].includes(String(stateBeforeSend.state))) {
    await finishRun(job.run_id, 'cancelled', { metadata: { reason: `state_${stateBeforeSend.state}_before_send` } });
    await completeJob(job, { skipped: true, reason: `state_${stateBeforeSend.state}_before_send` });
    return { processed: true, skipped: true };
  }

  const aiMessageId = await sendAiReply(agent, conversation, source.id, decision.reply);
  await admin.from('conversation_ai_states').upsert({
    conversation_id: conversation.id,
    workspace_id: conversation.workspace_id,
    agent_id: agent.id,
    state: 'active',
    draft_reply: null,
    last_processed_message_id: source.id,
    last_ai_message_id: aiMessageId,
    last_ai_at: new Date().toISOString(),
    failure_count: 0,
    last_error: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'conversation_id' });
  await writeEvent({ workspaceId: conversation.workspace_id, conversationId: conversation.id, contactId: conversation.contact_id, eventType: 'ai_replied', payload: { agent_id: agent.id, message_id: aiMessageId, confidence: decision.confidence, intent: decision.intent } });
  await finishRun(job.run_id, 'succeeded', { action: 'reply', confidence: decision.confidence, intent: decision.intent });
  await completeJob(job, decision as unknown as Record<string, unknown>);
  return { processed: true, action: 'reply', messageId: aiMessageId };
}

export async function processAiAgentJob(job: AiJob) {
  const admin = createSupabaseAdminClient();
  try {
    const [{ data: agentData }, { data: conversationData }, { data: workspace }] = await Promise.all([
      admin.from('ai_agents').select('*').eq('workspace_id', job.workspace_id).eq('id', job.agent_id).maybeSingle(),
      admin.from('lead_conversations').select('id,workspace_id,lead_id,contact_id,connection_id,provider,external_thread_id,external_contact_id,customer_name,customer_phone,customer_email,assigned_to,workflow_state,team_key,metadata').eq('workspace_id', job.workspace_id).eq('id', job.conversation_id).maybeSingle(),
      admin.from('workspaces').select('id,name').eq('id', job.workspace_id).maybeSingle(),
    ]);
    const agent = agentData as AgentRow | null;
    const conversation = conversationData as ConversationRow | null;
    if (!agent || !conversation || !workspace) {
      await finishRun(job.run_id, 'cancelled', { metadata: { reason: 'agent_or_conversation_missing' } });
      await completeJob(job, { skipped: true, reason: 'agent_or_conversation_missing' });
      return { processed: true, skipped: true };
    }
    if (!agent.is_active || agent.mode === 'off') {
      await finishRun(job.run_id, 'cancelled', { metadata: { reason: 'agent_inactive' } });
      await completeJob(job, { skipped: true, reason: 'agent_inactive' });
      return { processed: true, skipped: true };
    }
    if (conversation.assigned_to && !agent.allow_when_human_assigned) {
      await finishRun(job.run_id, 'cancelled', { metadata: { reason: 'human_owned' } });
      await completeJob(job, { skipped: true, reason: 'human_owned' });
      return { processed: true, skipped: true };
    }

    const { data: state } = await admin.from('conversation_ai_states').select('*').eq('conversation_id', conversation.id).maybeSingle();
    if (state && ['paused','handed_off','disabled'].includes(String(state.state))) {
      await finishRun(job.run_id, 'cancelled', { metadata: { reason: `state_${state.state}` } });
      await completeJob(job, { skipped: true, reason: `state_${state.state}` });
      return { processed: true, skipped: true };
    }

    const messages = await loadMessages(job.workspace_id, conversation.id, 40);
    if ((job.phase || 'decide') === 'send') return await sendScheduledReply(job, agent, conversation, messages);

    const inbound = latestInbound(messages);
    if (!inbound) {
      await completeJob(job, { skipped: true, reason: 'no_inbound_message' });
      return { processed: true, skipped: true };
    }
    if (humanOutboundAfter(messages, inbound.sent_at)) {
      await admin.from('conversation_ai_states').upsert({
        conversation_id: conversation.id, workspace_id: conversation.workspace_id, agent_id: agent.id, state: 'paused', last_human_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }, { onConflict: 'conversation_id' });
      await completeJob(job, { skipped: true, reason: 'human_replied_after_customer' });
      return { processed: true, skipped: true };
    }

    const explicitHandoff = keywordHandoff(agent, inbound.body);
    if (explicitHandoff) {
      await handoffConversation(agent, conversation, explicitHandoff);
      await completeJob(job, { action: 'handoff', reason: explicitHandoff });
      return { processed: true, action: 'handoff' };
    }

    const [{ data: contact }, { data: lead }] = await Promise.all([
      conversation.contact_id ? admin.from('contacts').select('id,lifecycle_key,tags,custom_data').eq('workspace_id', job.workspace_id).eq('id', conversation.contact_id).maybeSingle() : Promise.resolve({ data: null }),
      conversation.lead_id ? admin.from('leads').select('id,stage,priority,destination,travel_dates,budget_range,custom_data').eq('workspace_id', job.workspace_id).eq('id', conversation.lead_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);

    const adAttribution = attributionFromConversationMetadata(conversation.metadata);
    let adKnowledge = null;
    try { adKnowledge = await resolveAdKnowledge(job.workspace_id, adAttribution); }
    catch (error) { console.warn('AI ad knowledge lookup failed:', error instanceof Error ? error.message : error); }
    const knowledge = await retrieveKnowledge(job, inbound, adAttribution);
    const runId = await createRun(job, agent, knowledge);

    const providerResult = await decideWithAiProviderDetailed(job.workspace_id, {
      name: agent.name,
      model: agent.model,
      instructions: agent.instructions,
      tone: agent.tone,
      languages: agent.languages || ['auto'],
      temperature: Number(agent.temperature) || 0.3,
      providerConfigId: agent.provider_config_id,
    }, {
      workspaceName: workspace.name,
      customerName: conversation.customer_name,
      customerPhone: conversation.customer_phone,
      customerEmail: conversation.customer_email,
      lifecycle: contact?.lifecycle_key || null,
      opportunity: lead ? record(lead) : null,
      adAttribution,
      adKnowledge,
      knowledge,
      conversation: messages.map((message) => ({ direction: message.direction, body: message.body, sentAt: message.sent_at, aiGenerated: isAiMessage(message) })),
    });
    await recordProviderResult(runId, providerResult);
    const decision = providerResult.decision;

    const threshold = Number(agent.confidence_threshold) || 0.65;
    if (decision.action === 'handoff' || (agent.mode === 'auto_handoff' && decision.confidence < threshold)) {
      const reason = decision.handoff_reason || (decision.confidence < threshold ? `AI confidence ${decision.confidence.toFixed(2)} was below ${threshold.toFixed(2)}.` : 'AI requested handoff.');
      await handoffConversation(agent, conversation, reason);
      await finishRun(runId, 'handoff', { action: 'handoff', confidence: decision.confidence, intent: decision.intent, handoff_reason: reason });
      await completeJob(job, { ...decision, action: 'handoff', reason });
      return { processed: true, action: 'handoff' };
    }

    if (decision.action === 'noop') {
      await admin.from('conversation_ai_states').upsert({
        conversation_id: conversation.id, workspace_id: conversation.workspace_id, agent_id: agent.id, state: 'active', last_processed_message_id: inbound.id, failure_count: 0, last_error: null, updated_at: new Date().toISOString(),
      }, { onConflict: 'conversation_id' });
      await finishRun(runId, 'noop', { action: 'noop', confidence: decision.confidence, intent: decision.intent });
      await completeJob(job, decision as unknown as Record<string, unknown>);
      return { processed: true, action: 'noop' };
    }

    if (agent.mode === 'assist') {
      await saveDraft(agent, conversation, decision, inbound.id);
      await finishRun(runId, 'draft', { action: 'draft', confidence: decision.confidence, intent: decision.intent });
      await completeJob(job, { ...decision, mode: 'assist' });
      return { processed: true, action: 'draft' };
    }

    const minDelay = Math.max(0, Number(agent.response_delay_min_seconds) || 0);
    const maxDelay = Math.max(minDelay, Number(agent.response_delay_max_seconds) || minDelay);
    const delaySeconds = minDelay + Math.random() * (maxDelay - minDelay);
    if (delaySeconds > 0.25) {
      const due = await scheduleReply(job, decision, runId, delaySeconds);
      return { processed: true, action: 'scheduled', sendDueAt: due };
    }

    job.phase = 'send';
    job.scheduled_decision = decision;
    job.run_id = runId;
    const result = await sendScheduledReply(job, agent, conversation, messages);
    const processedInboundIds = messages.filter((message) => message.direction === 'inbound').map((message) => message.id);
    await completeSiblingJobs(conversation.id, processedInboundIds.filter((id) => id !== job.source_message_id));
    return result;
  } catch (error) {
    const failure = await failJob(job, error);
    return { processed: false, ...failure };
  }
}
