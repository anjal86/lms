import { NextResponse } from 'next/server';
import { getApiActor } from '@/lib/auth/api-actor';
import { normalizeChatwootMessage } from '@/lib/integrations/chatwoot-adapter';
import { listChatwootMessages } from '@/lib/integrations/chatwoot-client';
import { resolveActiveChatwootRuntime } from '@/lib/integrations/chatwoot-runtime';
import { backfillMetaConversationMessages } from '@/lib/integrations/meta-history';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HISTORY_BACKFILL_INTERVAL_MS = 2 * 60 * 1000;
const historyBackfillAt = new Map<string, number>();
const historyBackfillPromises = new Map<string, Promise<void>>();

function maybeBackfillMetaHistory(
  conversationId: string,
  provider: string,
  localMessageCount: number,
  expectedMessageCount: number | null
) {
  if (!['facebook', 'instagram'].includes(provider)) return false;
  if (expectedMessageCount !== null && localMessageCount >= expectedMessageCount) return false;

  const lastAttempt = historyBackfillAt.get(conversationId) || 0;
  if (Date.now() - lastAttempt < HISTORY_BACKFILL_INTERVAL_MS) return false;

  let promise = historyBackfillPromises.get(conversationId);
  if (!promise) {
    // History repair is maintenance work. Never make the operator wait for it
    // before rendering the locally available thread.
    promise = backfillMetaConversationMessages(conversationId, { maxPages: 4 })
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

  return true;
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
  const requestedMessageLimit = Math.min(1000, Math.max(40, Number(url.searchParams.get('messageLimit')) || 160));

  const [conversationResult, chatwootRuntime] = await Promise.all([
    actor.supabase
      .from('lead_conversations')
      .select(CONVERSATION_SELECT)
      .eq('workspace_id', actor.profile.workspace_id)
      .eq('id', id)
      .maybeSingle(),
    resolveActiveChatwootRuntime(actor.profile.workspace_id, id).catch((error) => {
      console.error('Active Chatwoot runtime resolution failed:', error);
      return null;
    }),
  ]);

  if (conversationResult.error || !conversationResult.data) {
    return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  }

  const conversation = conversationResult.data;

  if (chatwootRuntime) {
    try {
      // Active Chatwoot threads intentionally load only the newest provider page.
      // This keeps the six-second operator refresh path O(1); older Chatwoot history
      // is paged separately rather than replaying 160+ messages on every poll.
      const result = await listChatwootMessages({
        accountId: chatwootRuntime.accountId,
        conversationId: chatwootRuntime.conversationId,
      });
      const messages = result.messages
        .map((message) => normalizeChatwootMessage(message, conversation.id))
        .sort((a, b) => Date.parse(a.sent_at) - Date.parse(b.sent_at));
      const firstRaw = result.messages[0] as Record<string, unknown> | undefined;
      const firstId = firstRaw ? Number(firstRaw.id) : 0;
      const historyCursor = Number.isSafeInteger(firstId) && firstId > 0 ? firstId : null;
      const metadata = (conversation.metadata || {}) as Record<string, unknown>;

      return NextResponse.json({
        conversation: {
          ...conversation,
          metadata: {
            ...metadata,
            chatwoot_active: true,
            chatwoot_account_id: chatwootRuntime.accountId,
            chatwoot_inbox_id: chatwootRuntime.inboxId,
            chatwoot_conversation_id: chatwootRuntime.conversationId,
          },
        },
        messages,
        messageTotal: messages.length,
        hasOlderMessages: messages.length >= 20,
        messageLimit: Math.min(20, Math.max(1, messages.length || 20)),
        historyCursor,
        historyBackfillScheduled: false,
        messageSource: 'chatwoot',
      }, {
        headers: {
          'Cache-Control': 'private, no-store',
          'X-Inbox-Path': 'fast-chatwoot',
          'X-Inbox-Source': 'chatwoot',
        },
      });
    } catch (error) {
      console.error('Active Chatwoot thread load failed:', error);
      return NextResponse.json({ error: 'Unable to load Chatwoot messages.' }, { status: 502 });
    }
  }

  const messageResult = await actor.supabase
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
    .limit(requestedMessageLimit);

  if (messageResult.error) {
    console.error('Fast thread load failed:', messageResult.error.message);
    return NextResponse.json({ error: 'Unable to load messages.' }, { status: 500 });
  }

  const messages = [...(messageResult.data || [])].reverse();
  const messageTotal = messageResult.count || 0;
  const metadata = (conversation.metadata || {}) as Record<string, unknown>;
  const rawExpectedCount = Number(metadata.message_count);
  const expectedMessageCount = Number.isFinite(rawExpectedCount) && rawExpectedCount > 0 ? rawExpectedCount : null;

  const historyBackfillScheduled = Boolean(
    conversation.connection_id
    && (messageTotal <= 1 || (expectedMessageCount !== null && messageTotal < expectedMessageCount))
    && maybeBackfillMetaHistory(id, conversation.provider, messageTotal, expectedMessageCount)
  );

  return NextResponse.json({
    conversation,
    messages,
    messageTotal,
    hasOlderMessages: messageTotal > messages.length,
    messageLimit: requestedMessageLimit,
    historyBackfillScheduled,
    messageSource: 'database',
  }, {
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Inbox-Path': 'fast',
    },
  });
}
