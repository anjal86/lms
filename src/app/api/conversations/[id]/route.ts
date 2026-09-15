import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor, isManagement } from '@/lib/auth/api-actor';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { backfillMetaConversationMessages } from '@/lib/integrations/meta-history';
import { fetchWhatsappHistory } from '@/lib/integrations/whatsapp-baileys';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HISTORY_BACKFILL_INTERVAL_MS = 30 * 60 * 1000;
const WHATSAPP_REPAIR_INTERVAL_MS = 5 * 60 * 1000;
const historyBackfillAt = new Map<string, number>();
const historyBackfillPromises = new Map<string, Promise<void>>();
const whatsappRepairAt = new Map<string, number>();
const whatsappRepairPromises = new Map<string, Promise<void>>();

const PatchConversationSchema = z.object({
  status: z.enum(['open', 'closed', 'archived']).optional(),
  workflow_state: z.enum(['open', 'waiting', 'snoozed', 'closed']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  snoozed_until: z.string().datetime().nullable().optional(),
  resolution_code: z.string().trim().max(80).nullable().optional(),
  closing_note: z.string().trim().max(4000).nullable().optional(),
  next_action_at: z.string().datetime().nullable().optional(),
  assigned_to: uuidSchema.nullable().optional(),
  assign_strategy: z.enum(['least_open', 'workload_balanced', 'round_robin', 'conversion_weighted']).optional(),
  mark_read: z.boolean().optional(),
  lifecycle_key: z.string().trim().min(1).max(80).optional(),
  customer_city: z.string().trim().max(120).optional().or(z.literal('')),
  customer_country: z.string().trim().max(120).optional().or(z.literal('')),
});

type LocationUpdateResult = {
  conversation?: Record<string, unknown>;
  lead_id?: string | null;
};

type WhatsappRepairMessage = {
  external_message_id?: string | null;
  direction?: string | null;
  sent_at?: string | null;
  message_type?: string | null;
  body?: string | null;
  metadata?: unknown;
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function whatsappMessageNeedsRepair(message: WhatsappRepairMessage) {
  if (typeof message.body === 'string' && /^\[WhatsApp message\]$/i.test(message.body.trim())) return true;
  const metadata = objectValue(message.metadata);
  const hasAttachment = Boolean(metadata.attachment_url || metadata.storage_path);
  const mediaAvailable = metadata.media_available_on_device === true;
  const messageType = String(message.message_type || '').toLowerCase();
  return !hasAttachment && (mediaAvailable || ['image', 'video', 'audio', 'file'].includes(messageType));
}

async function maybeRepairWhatsappHistory(input: {
  conversationId: string;
  provider: string;
  connectionId: string | null;
  conversationMetadata: unknown;
  messages: WhatsappRepairMessage[];
}) {
  if (input.provider !== 'whatsapp' || !input.connectionId || input.messages.length < 2) return false;
  if (!input.messages.some(whatsappMessageNeedsRepair)) return false;

  const lastAttempt = whatsappRepairAt.get(input.conversationId) || 0;
  if (Date.now() - lastAttempt < WHATSAPP_REPAIR_INTERVAL_MS) return false;
  if (whatsappRepairPromises.has(input.conversationId)) return false;

  const anchor = input.messages.find((message) => Boolean(message.external_message_id && message.sent_at));
  if (!anchor?.external_message_id || !anchor.sent_at) return false;

  const conversationMetadata = objectValue(input.conversationMetadata);
  const anchorMetadata = objectValue(anchor.metadata);
  const remoteJid = typeof anchorMetadata.jid === 'string'
    ? anchorMetadata.jid
    : typeof conversationMetadata.whatsapp_jid === 'string'
      ? conversationMetadata.whatsapp_jid
      : null;
  if (!remoteJid) return false;

  const count = Math.min(100, Math.max(25, input.messages.length));
  const promise = fetchWhatsappHistory(input.connectionId, {
    count,
    oldestMsgId: anchor.external_message_id,
    oldestMsgRemoteJid: remoteJid,
    oldestMsgFromMe: anchor.direction === 'outbound',
    oldestMsgTimestamp: new Date(anchor.sent_at).getTime(),
  })
    .then(() => undefined)
    .catch((error) => {
      console.warn(`WhatsApp repair request failed for ${input.conversationId}:`, error instanceof Error ? error.message : error);
    })
    .finally(() => {
      whatsappRepairAt.set(input.conversationId, Date.now());
      whatsappRepairPromises.delete(input.conversationId);
    });

  whatsappRepairPromises.set(input.conversationId, promise);
  void promise;
  return true;
}

async function maybeBackfillHistory(input: {
  conversationId: string;
  provider: string;
  expectedMessageCount: number | null;
  localMessageCount: number;
}) {
  if (!['facebook', 'instagram'].includes(input.provider)) return;
  if (input.expectedMessageCount !== null && input.localMessageCount >= input.expectedMessageCount) return;

  const lastAttempt = historyBackfillAt.get(input.conversationId) || 0;
  if (Date.now() - lastAttempt < HISTORY_BACKFILL_INTERVAL_MS) return;

  let promise = historyBackfillPromises.get(input.conversationId);
  if (!promise) {
    promise = backfillMetaConversationMessages(input.conversationId, { maxPages: 20 })
      .then((result) => {
        if (result.errors.length) {
          console.warn(`Meta history backfill for ${input.conversationId} completed with warnings:`, result.errors[0]);
        }
      })
      .catch((error) => {
        console.warn(`Meta history backfill failed for ${input.conversationId}:`, error);
      })
      .finally(() => {
        historyBackfillAt.set(input.conversationId, Date.now());
        historyBackfillPromises.delete(input.conversationId);
      });
    historyBackfillPromises.set(input.conversationId, promise);
  }

  await promise;
}

const CONVERSATION_SELECT = `
  id,
  workspace_id,
  contact_id,
  lead_id,
  connection_id,
  provider,
  external_thread_id,
  external_contact_id,
  customer_name,
  customer_phone,
  customer_email,
  customer_avatar_url,
  last_message_preview,
  status,
  workflow_state,
  priority,
  snoozed_until,
  first_response_due_at,
  next_action_at,
  first_responded_at,
  last_inbound_at,
  last_outbound_at,
  closed_at,
  closed_by,
  resolution_code,
  closing_note,
  team_key,
  unread_count,
  assigned_to,
  last_message_at,
  created_at,
  updated_at,
  converted_at,
  metadata,
  contact:contacts(id, display_name, primary_phone, primary_email, lifecycle_key, owner_id, tags, custom_data, last_seen_at),
  lead:leads(id, lead_code, customer_name, customer_city, customer_country, destination, stage, priority, budget_range, travel_dates, assigned_to, created_at),
  assigned_profile:profiles!lead_conversations_assigned_to_fkey(id, full_name, email, role, status)
`;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  const { id } = await context.params;
  const url = new URL(request.url);
  const messageLimit = Math.min(2000, Math.max(50, Number(url.searchParams.get('messageLimit')) || 1000));

  const { data: conversation, error: convError } = await actor.supabase
    .from('lead_conversations')
    .select(CONVERSATION_SELECT)
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', id)
    .maybeSingle();

  if (convError || !conversation) {
    return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  }

  // Ensure this conversation belongs to an active connected account in this workspace
  if (conversation.connection_id) {
    const { data: connection } = await actor.supabase
      .from('integration_connections')
      .select('id, status')
      .eq('workspace_id', actor.profile.workspace_id)
      .eq('id', conversation.connection_id)
      .maybeSingle();
    if (!connection || connection.status === 'disconnected') {
      return NextResponse.json({ error: 'This conversation belongs to a disconnected channel account.' }, { status: 404 });
    }
  } else {
    const { data: activeProviderConnection } = await actor.supabase
      .from('integration_connections')
      .select('id')
      .eq('workspace_id', actor.profile.workspace_id)
      .eq('provider', conversation.provider)
      .in('status', ['connected', 'paused'])
      .limit(1)
      .maybeSingle();
    if (!activeProviderConnection) {
      return NextResponse.json({ error: 'This conversation belongs to a disconnected channel account.' }, { status: 404 });
    }
  }

  const { count: beforeBackfillCount } = await actor.supabase
    .from('lead_messages')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('conversation_id', id);

  const metadata = (conversation.metadata || {}) as Record<string, unknown>;
  const rawExpectedCount = Number(metadata.message_count);
  const expectedMessageCount = Number.isFinite(rawExpectedCount) && rawExpectedCount > 0 ? rawExpectedCount : null;

  await maybeBackfillHistory({
    conversationId: id,
    provider: conversation.provider,
    expectedMessageCount,
    localMessageCount: beforeBackfillCount || 0,
  });

  const { data: messageRows, error: msgError, count: messageTotal } = await actor.supabase
    .from('lead_messages')
    .select(`
      id,
      conversation_id,
      lead_id,
      connection_id,
      provider,
      external_message_id,
      direction,
      message_type,
      body,
      metadata,
      delivery_status,
      client_request_id,
      sent_at,
      created_by,
      created_at,
      author_profile:profiles!lead_messages_created_by_fkey(id, full_name, avatar_url, role)
    `, { count: 'exact' })
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('conversation_id', id)
    .order('sent_at', { ascending: false })
    .limit(messageLimit);

  if (msgError) {
    console.error('Failed to load conversation messages:', msgError.message);
    return NextResponse.json({ error: 'Unable to load messages.' }, { status: 500 });
  }

  const whatsappRepairRequested = await maybeRepairWhatsappHistory({
    conversationId: id,
    provider: conversation.provider,
    connectionId: conversation.connection_id,
    conversationMetadata: conversation.metadata,
    messages: (messageRows || []) as WhatsappRepairMessage[],
  });

  const messages = [...(messageRows || [])].reverse();

  return NextResponse.json({
    conversation,
    messages,
    messageTotal: messageTotal || 0,
    hasOlderMessages: (messageTotal || 0) > messages.length,
    whatsappRepairRequested,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  const { id } = await context.params;
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = PatchConversationSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed.', details: parsed.error.flatten() }, { status: 400 });
  }

  const { data: existing, error: existingError } = await actor.supabase
    .from('lead_conversations')
    .select('id,workspace_id,contact_id,assigned_to,priority,workflow_state')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', id)
    .maybeSingle();
  if (existingError || !existing) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });

  if (parsed.data.assigned_to !== undefined && !isManagement(actor.profile) && parsed.data.assigned_to !== actor.user.id) {
    return NextResponse.json({ error: 'Agents may only claim a conversation for themselves.' }, { status: 403 });
  }
  if (parsed.data.assign_strategy && !isManagement(actor.profile)) {
    return NextResponse.json({ error: 'Only managers can run automatic assignment.' }, { status: 403 });
  }

  let changed = false;
  const locationRequested = parsed.data.customer_city !== undefined || parsed.data.customer_country !== undefined;
  if (locationRequested) {
    const { data: locationData, error: locationError } = await actor.supabase.rpc('update_conversation_location', {
      p_conversation_id: id,
      p_customer_city: parsed.data.customer_city ?? '',
      p_customer_country: parsed.data.customer_country ?? '',
    });
    if (locationError) {
      console.error('Failed to update conversation location:', locationError.message);
      if (locationError.code === '42501') return NextResponse.json({ error: 'You do not have access to update this conversation.' }, { status: 403 });
      if (locationError.code === 'P0002') return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
      return NextResponse.json({ error: 'Unable to update customer location.' }, { status: 500 });
    }
    void (locationData as LocationUpdateResult | null);
    changed = true;
  }

  if (parsed.data.assigned_to !== undefined || parsed.data.assign_strategy) {
    const { error: assignmentError } = await actor.supabase.rpc('assign_conversation', {
      p_conversation_id: id,
      p_assignee_id: parsed.data.assigned_to ?? null,
      p_strategy: parsed.data.assign_strategy ?? null,
      p_automation_run_id: null,
    });
    if (assignmentError) {
      console.error('Conversation assignment failed:', assignmentError.message);
      const status = assignmentError.code === '42501' ? 403 : assignmentError.code === 'P0002' ? 404 : 400;
      return NextResponse.json({ error: assignmentError.message || 'Unable to assign conversation.' }, { status });
    }
    changed = true;
  }

  const requestedState = parsed.data.workflow_state
    ?? (parsed.data.status === 'closed' || parsed.data.status === 'archived' ? 'closed' : parsed.data.status === 'open' ? 'open' : undefined);
  if (requestedState) {
    const { error: transitionError } = await actor.supabase.rpc('transition_conversation', {
      p_conversation_id: id,
      p_state: requestedState,
      p_snoozed_until: parsed.data.snoozed_until ?? null,
      p_resolution_code: parsed.data.resolution_code ?? null,
      p_closing_note: parsed.data.closing_note ?? null,
      p_next_action_at: parsed.data.next_action_at ?? null,
      p_automation_run_id: null,
    });
    if (transitionError) {
      console.error('Conversation transition failed:', transitionError.message);
      const status = transitionError.code === '42501' ? 403 : transitionError.code === 'P0002' ? 404 : 400;
      return NextResponse.json({ error: transitionError.message || 'Unable to change conversation state.' }, { status });
    }
    changed = true;
  }

  const directPatch: Record<string, unknown> = {};
  if (parsed.data.mark_read === true) directPatch.unread_count = 0;
  if (parsed.data.priority !== undefined) directPatch.priority = parsed.data.priority;
  if (Object.keys(directPatch).length > 0) {
    const { error: directError } = await actor.supabase
      .from('lead_conversations')
      .update(directPatch)
      .eq('workspace_id', actor.profile.workspace_id)
      .eq('id', id);
    if (directError) {
      console.error('Failed to update conversation:', directError.message);
      return NextResponse.json({ error: 'Unable to update conversation.' }, { status: 500 });
    }
    changed = true;

    if (parsed.data.priority && parsed.data.priority !== existing.priority) {
      const admin = createSupabaseAdminClient();
      await admin.from('conversation_events').insert({
        workspace_id: actor.profile.workspace_id,
        conversation_id: id,
        contact_id: existing.contact_id,
        event_type: 'priority_changed',
        actor_id: actor.user.id,
        payload: { from: existing.priority, priority: parsed.data.priority },
      });
    }
  }

  if (parsed.data.lifecycle_key !== undefined) {
    if (!existing.contact_id) return NextResponse.json({ error: 'Conversation contact is not initialized.' }, { status: 409 });
    const { error: lifecycleError } = await actor.supabase
      .from('contacts')
      .update({ lifecycle_key: parsed.data.lifecycle_key, updated_at: new Date().toISOString() })
      .eq('workspace_id', actor.profile.workspace_id)
      .eq('id', existing.contact_id);
    if (lifecycleError) return NextResponse.json({ error: 'Unable to update contact lifecycle.' }, { status: 500 });

    const admin = createSupabaseAdminClient();
    await admin.from('conversation_events').insert({
      workspace_id: actor.profile.workspace_id,
      conversation_id: id,
      contact_id: existing.contact_id,
      event_type: 'lifecycle_changed',
      actor_id: actor.user.id,
      payload: { lifecycle_key: parsed.data.lifecycle_key },
    });
    changed = true;
  }

  if (!changed) return NextResponse.json({ error: 'No changes requested.' }, { status: 400 });

  const { data: updated, error } = await actor.supabase
    .from('lead_conversations')
    .select(CONVERSATION_SELECT)
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', id)
    .maybeSingle();
  if (error || !updated) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });

  return NextResponse.json({ conversation: updated });
}
