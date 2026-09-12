import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor } from '@/lib/auth/api-actor';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { ChannelDeliveryError, sendChannelText } from '@/lib/integrations/channel-sender';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OutboundMessageSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  direction: z.enum(['outbound', 'internal']).default('outbound'),
  clientRequestId: z.string().trim().min(8).max(160).optional(),
});

const MESSAGE_SELECT = `
  id,
  conversation_id,
  lead_id,
  connection_id,
  provider,
  external_message_id,
  provider_message_id,
  direction,
  message_type,
  body,
  metadata,
  delivery_status,
  client_request_id,
  failure_code,
  failure_message,
  delivered_at,
  read_at,
  sent_at,
  created_by,
  created_at,
  author_profile:profiles!lead_messages_created_by_fkey(id, full_name, avatar_url, role)
`;

async function findExistingRequest(conversationId: string, clientRequestId: string) {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from('lead_messages')
    .select(MESSAGE_SELECT)
    .eq('conversation_id', conversationId)
    .eq('client_request_id', clientRequestId)
    .maybeSingle();
  return data || null;
}

async function updateConversationAndLead(input: {
  conversationId: string;
  leadId: string | null;
  actorId: string;
  provider: string;
  body: string;
  direction: 'outbound' | 'internal';
  externalMessageId?: string | null;
  now: string;
}) {
  const admin = createSupabaseAdminClient();
  await admin
    .from('lead_conversations')
    .update({
      last_message_at: input.now,
      last_message_preview: input.direction === 'internal' ? `[Note] ${input.body.slice(0, 160)}` : input.body.slice(0, 180),
      status: 'open',
    })
    .eq('id', input.conversationId);

  if (!input.leadId) return;

  await admin.from('activity_logs').insert({
    lead_id: input.leadId,
    agent_id: input.actorId,
    activity_type: input.direction === 'internal'
      ? 'note'
      : input.provider === 'whatsapp'
        ? 'whatsapp'
        : input.provider === 'email'
          ? 'email'
          : 'system',
    title: input.direction === 'internal' ? 'Internal Note' : `Replied via ${input.provider}`,
    notes: input.body,
    metadata: {
      conversation_id: input.conversationId,
      external_message_id: input.externalMessageId || null,
      direction: input.direction,
    },
  });

  await admin
    .from('leads')
    .update({
      last_contacted_at: input.now,
      last_activity_type: input.provider === 'whatsapp' ? 'whatsapp' : input.provider === 'email' ? 'email' : 'system',
    })
    .eq('id', input.leadId);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  const { id: conversationId } = await context.params;
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = OutboundMessageSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Message body cannot be empty.', details: parsed.error.flatten() }, { status: 400 });
  }

  // This user-scoped query is the authorization boundary. Service-role work only happens
  // after RLS has proved that the actor can access this exact conversation.
  const { data: conversation, error: convError } = await actor.supabase
    .from('lead_conversations')
    .select('id,lead_id,provider,connection_id,external_thread_id,external_contact_id,status')
    .eq('id', conversationId)
    .maybeSingle();

  if (convError || !conversation) {
    return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  }

  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const clientRequestId = parsed.data.clientRequestId || request.headers.get('idempotency-key')?.trim() || randomUUID();
  if (clientRequestId.length > 160) {
    return NextResponse.json({ error: 'Idempotency key is too long.' }, { status: 400 });
  }

  const existing = await findExistingRequest(conversationId, clientRequestId);
  if (existing) {
    return NextResponse.json({ message: existing, duplicate: true }, { status: 200 });
  }

  if (parsed.data.direction === 'internal') {
    const { data: message, error } = await admin
      .from('lead_messages')
      .insert({
        conversation_id: conversation.id,
        lead_id: conversation.lead_id || null,
        connection_id: conversation.connection_id || null,
        provider: conversation.provider,
        direction: 'internal',
        message_type: 'internal_note',
        body: parsed.data.body,
        metadata: {},
        delivery_status: 'sent',
        client_request_id: clientRequestId,
        created_by: actor.user.id,
        sent_at: now,
      })
      .select(MESSAGE_SELECT)
      .single();

    if (error) {
      if (error.code === '23505') {
        const duplicate = await findExistingRequest(conversationId, clientRequestId);
        if (duplicate) return NextResponse.json({ message: duplicate, duplicate: true }, { status: 200 });
      }
      console.error('Failed to save internal note:', error.message);
      return NextResponse.json({ error: 'Unable to save note.' }, { status: 500 });
    }

    await updateConversationAndLead({
      conversationId: conversation.id,
      leadId: conversation.lead_id,
      actorId: actor.user.id,
      provider: conversation.provider,
      body: parsed.data.body,
      direction: 'internal',
      now,
    });

    return NextResponse.json({ message }, { status: 201 });
  }

  const { data: pending, error: pendingError } = await admin
    .from('lead_messages')
    .insert({
      conversation_id: conversation.id,
      lead_id: conversation.lead_id || null,
      connection_id: conversation.connection_id || null,
      provider: conversation.provider,
      direction: 'outbound',
      message_type: 'text',
      body: parsed.data.body,
      metadata: { sent_via: 'travel_lms' },
      delivery_status: 'sending',
      client_request_id: clientRequestId,
      created_by: actor.user.id,
      sent_at: now,
    })
    .select('id')
    .single();

  if (pendingError || !pending) {
    if (pendingError?.code === '23505') {
      const duplicate = await findExistingRequest(conversationId, clientRequestId);
      if (duplicate) return NextResponse.json({ message: duplicate, duplicate: true }, { status: 200 });
    }
    console.error('Failed to claim outbound message:', pendingError?.message);
    return NextResponse.json({ error: 'Unable to queue message.' }, { status: 500 });
  }

  try {
    const delivered = await sendChannelText({
      provider: conversation.provider,
      connectionId: conversation.connection_id,
      externalThreadId: conversation.external_thread_id,
      externalContactId: conversation.external_contact_id,
      body: parsed.data.body,
    });

    const { data: finalizedId, error: finalizeError } = await admin.rpc('finalize_outbound_message', {
      p_message_id: pending.id,
      p_external_message_id: delivered.externalMessageId,
      p_sent_at: now,
    });
    if (finalizeError) throw finalizeError;

    const messageId = String(finalizedId || pending.id);
    await admin
      .from('lead_messages')
      .update({
        provider_message_id: delivered.externalMessageId,
        delivery_status: 'sent',
        failure_code: null,
        failure_message: null,
      })
      .eq('id', messageId);

    const { data: message, error: messageError } = await admin
      .from('lead_messages')
      .select(MESSAGE_SELECT)
      .eq('id', messageId)
      .single();
    if (messageError) throw messageError;

    await updateConversationAndLead({
      conversationId: conversation.id,
      leadId: conversation.lead_id,
      actorId: actor.user.id,
      provider: conversation.provider,
      body: parsed.data.body,
      direction: 'outbound',
      externalMessageId: delivered.externalMessageId,
      now,
    });

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    const deliveryError = error instanceof ChannelDeliveryError
      ? error
      : new ChannelDeliveryError(error instanceof Error ? error.message : 'Provider delivery failed.');

    await admin
      .from('lead_messages')
      .update({
        delivery_status: 'failed',
        failure_code: deliveryError.code,
        failure_message: deliveryError.message.slice(0, 1000),
        metadata: { sent_via: 'travel_lms', delivery_error: deliveryError.message },
      })
      .eq('id', pending.id);

    const failedMessage = await findExistingRequest(conversationId, clientRequestId);
    return NextResponse.json(
      {
        error: deliveryError.message,
        code: deliveryError.code,
        message: failedMessage,
      },
      { status: deliveryError.status }
    );
  }
}
