import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor, isManagement } from '@/lib/auth/api-actor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PatchConversationSchema = z.object({
  status: z.enum(['open', 'closed', 'archived']).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  mark_read: z.boolean().optional(),
  customer_city: z.string().trim().max(120).optional().or(z.literal('')),
  customer_country: z.string().trim().max(120).optional().or(z.literal('')),
});

type LocationUpdateResult = {
  conversation?: Record<string, unknown>;
  lead_id?: string | null;
};

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  const { id } = await context.params;
  const { data: conversation, error: convError } = await actor.supabase
    .from('lead_conversations')
    .select(`
      id,
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
      unread_count,
      assigned_to,
      last_message_at,
      created_at,
      updated_at,
      converted_at,
      metadata,
      lead:leads(id, lead_code, customer_name, customer_city, customer_country, destination, stage, priority, budget_range, travel_dates, assigned_to, created_at),
      assigned_profile:profiles!lead_conversations_assigned_to_fkey(id, full_name, email, role)
    `)
    .eq('id', id)
    .maybeSingle();

  if (convError || !conversation) {
    return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  }

  const { data: messages, error: msgError } = await actor.supabase
    .from('lead_messages')
    .select(`
      id,
      conversation_id,
      lead_id,
      provider,
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
    `)
    .eq('conversation_id', id)
    .order('sent_at', { ascending: true })
    .limit(300);

  if (msgError) {
    console.error('Failed to load conversation messages:', msgError.message);
    return NextResponse.json({ error: 'Unable to load messages.' }, { status: 500 });
  }

  return NextResponse.json({ conversation, messages: messages || [] }, { headers: { 'Cache-Control': 'no-store' } });
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

  if (parsed.data.assigned_to !== undefined && !isManagement(actor.profile) && parsed.data.assigned_to !== actor.user.id) {
    return NextResponse.json({ error: 'Agents may only claim a conversation for themselves.' }, { status: 403 });
  }

  const patch: Record<string, unknown> = {};
  if (parsed.data.status !== undefined) patch.status = parsed.data.status;
  if (parsed.data.assigned_to !== undefined) patch.assigned_to = parsed.data.assigned_to;
  if (parsed.data.mark_read === true) patch.unread_count = 0;

  const locationRequested = parsed.data.customer_city !== undefined || parsed.data.customer_country !== undefined;
  let locationConversation: Record<string, unknown> | null = null;

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

    const result = (locationData || {}) as LocationUpdateResult;
    locationConversation = result.conversation || null;
  }

  if (Object.keys(patch).length === 0) {
    if (locationRequested && locationConversation) {
      return NextResponse.json({ conversation: locationConversation });
    }
    return NextResponse.json({ error: 'No changes requested.' }, { status: 400 });
  }

  const { data: updated, error } = await actor.supabase
    .from('lead_conversations')
    .update(patch)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) {
    console.error('Failed to update conversation:', error.message);
    return NextResponse.json({ error: 'Unable to update conversation.' }, { status: 500 });
  }
  if (!updated) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });

  return NextResponse.json({ conversation: updated });
}
