import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

type ChatwootEventJob = {
  id: string;
  delivery_key: string;
  workspace_id: string;
  chatwoot_account_link_id: string;
  chatwoot_account_id: number | string;
  event_type: string;
  payload: unknown;
  attempts: number;
  received_at: string;
};

type EventResult = {
  disposition: 'processed' | 'ignored';
  conversationId?: number | null;
  inboxId?: number | null;
  contactId?: number | null;
  messageId?: number | null;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function positiveInteger(value: unknown) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function eventConversation(eventType: string, payload: Record<string, unknown>) {
  const nested = record(payload.conversation);
  if (positiveInteger(nested.id)) return nested;
  if (eventType.startsWith('conversation_') && positiveInteger(payload.id)) return payload;
  return nested;
}

function conversationId(eventType: string, payload: Record<string, unknown>) {
  return positiveInteger(eventConversation(eventType, payload).id)
    ?? positiveInteger(payload.conversation_id);
}

function inboxId(eventType: string, payload: Record<string, unknown>) {
  const conversation = eventConversation(eventType, payload);
  return positiveInteger(record(payload.inbox).id)
    ?? positiveInteger(record(conversation.inbox).id)
    ?? positiveInteger(conversation.inbox_id)
    ?? positiveInteger(payload.inbox_id);
}

function contactId(eventType: string, payload: Record<string, unknown>) {
  const conversation = eventConversation(eventType, payload);
  const meta = record(conversation.meta);
  return positiveInteger(record(meta.sender).id)
    ?? positiveInteger(record(payload.contact).id)
    ?? (eventType.startsWith('contact_') ? positiveInteger(payload.id) : null);
}

function messageId(eventType: string, payload: Record<string, unknown>) {
  if (!eventType.startsWith('message_')) return null;
  return positiveInteger(payload.id) ?? positiveInteger(record(payload.message).id);
}

function messageDirection(payload: Record<string, unknown>) {
  const value = payload.message_type ?? record(payload.message).message_type;
  if (value === 'incoming' || value === 0 || value === '0') return 'inbound' as const;
  if (value === 'outgoing' || value === 1 || value === '1') return 'outbound' as const;
  return null;
}

function eventTime(payload: Record<string, unknown>) {
  const value = payload.created_at ?? payload.updated_at ?? record(payload.message).created_at;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const millis = value < 10_000_000_000 ? value * 1000 : value;
    return new Date(millis).toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) return date.toISOString();
  }
  return new Date().toISOString();
}

function messagePreview(payload: Record<string, unknown>) {
  const direct = typeof payload.content === 'string' ? payload.content : null;
  const nested = typeof record(payload.message).content === 'string' ? String(record(payload.message).content) : null;
  const value = (direct ?? nested)?.replace(/\s+/g, ' ').trim();
  return value ? value.slice(0, 500) : null;
}

function scrubbedPayload(job: ChatwootEventJob, result: EventResult) {
  return {
    event: job.event_type,
    account_id: Number(job.chatwoot_account_id),
    conversation_id: result.conversationId ?? null,
    inbox_id: result.inboxId ?? null,
    contact_id: result.contactId ?? null,
    message_id: result.messageId ?? null,
    processed_from_webhook: true,
  };
}

async function linkConversation(job: ChatwootEventJob, payload: Record<string, unknown>) {
  const conversation = conversationId(job.event_type, payload);
  const inbox = inboxId(job.event_type, payload);
  const contact = contactId(job.event_type, payload);
  const message = messageId(job.event_type, payload);
  if (!conversation) {
    return { disposition: 'ignored', conversationId: null, inboxId: inbox, contactId: contact, messageId: message } satisfies EventResult;
  }

  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const row: Record<string, unknown> = {
    workspace_id: job.workspace_id,
    chatwoot_account_link_id: job.chatwoot_account_link_id,
    chatwoot_conversation_id: conversation,
    last_synced_at: now,
    updated_at: now,
  };
  if (inbox) row.chatwoot_inbox_id = inbox;
  if (contact) row.chatwoot_contact_id = contact;
  if (message) row.last_message_id = message;

  const { data: link, error } = await admin
    .from('chatwoot_conversation_links')
    .upsert(row, { onConflict: 'chatwoot_account_link_id,chatwoot_conversation_id' })
    .select('id,lead_conversation_id')
    .single();
  if (error) throw error;

  if (inbox) {
    await admin
      .from('chatwoot_inboxes')
      .update({ last_synced_at: now, updated_at: now })
      .eq('chatwoot_account_link_id', job.chatwoot_account_link_id)
      .eq('chatwoot_inbox_id', inbox);
  }

  // During migration, keep only the tiny summary fields needed by the existing
  // CRM shell. The full message remains authoritative in Chatwoot.
  if (link?.lead_conversation_id && job.event_type === 'message_created') {
    const direction = messageDirection(payload);
    const patch: Record<string, unknown> = {
      last_message_at: eventTime(payload),
      inbox_activity_at: eventTime(payload),
    };
    const preview = messagePreview(payload);
    if (preview) patch.last_message_preview = preview;
    if (direction === 'inbound') patch.needs_reply = true;
    if (direction === 'outbound') patch.needs_reply = false;

    const { error: summaryError } = await admin
      .from('lead_conversations')
      .update(patch)
      .eq('id', link.lead_conversation_id)
      .eq('workspace_id', job.workspace_id);
    if (summaryError) throw summaryError;
  }

  return {
    disposition: 'processed',
    conversationId: conversation,
    inboxId: inbox,
    contactId: contact,
    messageId: message,
  } satisfies EventResult;
}

async function processEvent(job: ChatwootEventJob): Promise<EventResult> {
  const payload = record(job.payload);
  if (job.event_type.startsWith('conversation_') || job.event_type.startsWith('message_')) {
    return linkConversation(job, payload);
  }

  // Contact/account events will gain dedicated CRM synchronization later. They
  // are acknowledged now so unsupported event types never block the queue.
  return {
    disposition: 'ignored',
    conversationId: conversationId(job.event_type, payload),
    inboxId: inboxId(job.event_type, payload),
    contactId: contactId(job.event_type, payload),
    messageId: messageId(job.event_type, payload),
  };
}

export async function processOneChatwootWebhookEvent() {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc('claim_chatwoot_webhook_event');
  if (error) {
    if (error.code !== 'PGRST202' && error.code !== '42883' && error.code !== '42P01') {
      console.error('Chatwoot webhook claim failed:', error.message);
    }
    return null;
  }

  const job = (Array.isArray(data) ? data[0] : data) as ChatwootEventJob | null;
  if (!job?.id) return null;

  try {
    const result = await processEvent(job);
    const now = new Date().toISOString();
    const { error: completeError } = await admin
      .from('chatwoot_webhook_events')
      .update({
        status: result.disposition,
        payload: scrubbedPayload(job, result),
        error: null,
        locked_at: null,
        processed_at: now,
        updated_at: now,
      })
      .eq('id', job.id)
      .eq('status', 'processing');
    if (completeError) throw completeError;
    return { eventId: job.id, eventType: job.event_type, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const attempts = Math.max(1, Number(job.attempts || 1));
    const delaySeconds = Math.min(3600, 5 * (2 ** Math.min(attempts - 1, 9)));
    const nextAttemptAt = new Date(Date.now() + delaySeconds * 1000).toISOString();
    const { error: failError } = await admin
      .from('chatwoot_webhook_events')
      .update({
        status: 'failed',
        error: message.slice(0, 2000),
        locked_at: null,
        next_attempt_at: nextAttemptAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id)
      .eq('status', 'processing');
    if (failError) console.error('Chatwoot webhook failure state update failed:', failError.message);
    return { eventId: job.id, eventType: job.event_type, failed: true, retryAt: nextAttemptAt, error: message };
  }
}
