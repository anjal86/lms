import { NextResponse } from 'next/server';
import { getApiActor } from '@/lib/auth/api-actor';
import { backfillMetaConversationMessages } from '@/lib/integrations/meta-history';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HISTORY_BACKFILL_INTERVAL_MS = 2 * 60 * 1000;
const historyBackfillAt = new Map<string, number>();
const historyBackfillPromises = new Map<string, Promise<void>>();

async function maybeBackfillMetaHistory(
  conversationId: string,
  provider: string,
  localMessageCount: number,
  expectedMessageCount: number | null
) {
  if (!['facebook', 'instagram'].includes(provider)) return;
  if (expectedMessageCount !== null && localMessageCount >= expectedMessageCount) return;

  const lastAttempt = historyBackfillAt.get(conversationId) || 0;
  if (Date.now() - lastAttempt < HISTORY_BACKFILL_INTERVAL_MS) return;

  let promise = historyBackfillPromises.get(conversationId);
  if (!promise) {
    promise = backfillMetaConversationMessages(conversationId, { maxPages: 20 })
      .then((result) => {
        if (result.errors.length) {
          console.warn(`Meta history backfill for ${conversationId} completed with warnings:`, result.errors[0]);
        }
      })
      .catch((error) => {
        console.warn(`Meta history backfill failed for ${conversationId}:`, error);
      })
      .finally(() => {
        historyBackfillAt.set(conversationId, Date.now());
        historyBackfillPromises.delete(conversationId);
      });
    historyBackfillPromises.set(conversationId, promise);
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
  needs_reply,
  snoozed_until,
  first_response_due_at,
  next_action_at,
  first_responded_at,
  last_inbound_at,
  last_outbound_at,
  closed_at,
  resolution_code,
  closing_note,
  unread_count,
  assigned_to,
  last_message_at,
  created_at,
  updated_at,
  converted_at,
  metadata,
  connection:integration_connections(id, provider, display_name, external_account_id, visibility_scope, connected_by, config),
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
  const messageLimit = Math.min(1000, Math.max(40, Number(url.searchParams.get('messageLimit')) || 160));

  const [conversationResult, messageResult] = await Promise.all([
    actor.supabase
      .from('lead_conversations')
      .select(CONVERSATION_SELECT)
      .eq('workspace_id', actor.profile.workspace_id)
      .eq('id', id)
      .maybeSingle(),
    actor.supabase
      .from('lead_messages')
      .select(`
        id,
        conversation_id,
        direction,
        message_type,
        body,
        metadata,
        delivery_status,
        failure_message,
        sent_at,
        created_at,
        author_profile:profiles!lead_messages_created_by_fkey(id, full_name, avatar_url, role)
      `, { count: 'exact' })
      .eq('workspace_id', actor.profile.workspace_id)
      .eq('conversation_id', id)
      .order('sent_at', { ascending: false })
      .limit(messageLimit),
  ]);

  if (conversationResult.error || !conversationResult.data) {
    return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  }
  if (messageResult.error) {
    console.error('Fast thread load failed:', messageResult.error.message);
    return NextResponse.json({ error: 'Unable to load messages.' }, { status: 500 });
  }

  let messages = [...(messageResult.data || [])].reverse();
  let messageTotal = messageResult.count || 0;

  const conversation = conversationResult.data;
  const metadata = (conversation.metadata || {}) as Record<string, unknown>;
  const rawExpectedCount = Number(metadata.message_count);
  const expectedMessageCount = Number.isFinite(rawExpectedCount) && rawExpectedCount > 0 ? rawExpectedCount : null;

  if (
    ['facebook', 'instagram'].includes(conversation.provider) &&
    conversation.connection_id &&
    (messageTotal <= 1 || (expectedMessageCount !== null && messageTotal < expectedMessageCount))
  ) {
    await maybeBackfillMetaHistory(id, conversation.provider, messageTotal, expectedMessageCount);

    const refreshed = await actor.supabase
      .from('lead_messages')
      .select(`
        id,
        conversation_id,
        direction,
        message_type,
        body,
        metadata,
        delivery_status,
        failure_message,
        sent_at,
        created_at,
        author_profile:profiles!lead_messages_created_by_fkey(id, full_name, avatar_url, role)
      `, { count: 'exact' })
      .eq('workspace_id', actor.profile.workspace_id)
      .eq('conversation_id', id)
      .order('sent_at', { ascending: false })
      .limit(messageLimit);

    if (!refreshed.error && refreshed.data) {
      messages = [...refreshed.data].reverse();
      messageTotal = refreshed.count || 0;
    }
  }

  return NextResponse.json({
    conversation,
    messages,
    messageTotal,
    hasOlderMessages: messageTotal > messages.length,
    messageLimit,
  }, {
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Inbox-Path': 'fast',
    },
  });
}
