import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ConvertToLeadSchema = z.object({
  customerName: z.string().trim().min(2).max(120).optional(),
  customerPhone: z.string().trim().min(3).max(60).optional(),
  customerEmail: z.string().trim().email().optional().or(z.literal('')),
  destination: z.string().trim().min(2).max(120),
  travelDates: z.string().trim().max(120).optional().or(z.literal('')),
  budgetRange: z.string().trim().max(120).optional().or(z.literal('')),
  paxAdults: z.number().int().min(1).max(100).default(2),
  paxChildren: z.number().int().min(0).max(50).default(0),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  assignedTo: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
});

async function getActor(request: Request) {
  const supabase = await createSupabaseServerClient();
  let { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const admin = createSupabaseAdminClient();
      const { data: adminUser } = await admin.auth.getUser(token);
      if (adminUser?.user) user = adminUser.user;
    }
  }

  if (!user) return { error: NextResponse.json({ error: 'Unauthorized.' }, { status: 401 }) } as const;

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('id,role,is_active,full_name')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.is_active) return { error: NextResponse.json({ error: 'Account disabled.' }, { status: 403 }) } as const;
  return { supabase, user, profile } as const;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const actor = await getActor(request);
  if ('error' in actor) return actor.error;

  const { id: conversationId } = await context.params;
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = ConvertToLeadSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed.', fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: conversation, error: convError } = await admin
    .from('lead_conversations')
    .select('id,lead_id,provider,connection_id,external_thread_id,external_contact_id,last_message_at,customer_name,customer_phone,customer_email')
    .eq('id', conversationId)
    .maybeSingle();

  if (convError || !conversation) {
    return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  }

  if (conversation.lead_id) {
    return NextResponse.json({ error: 'This conversation has already been converted to a lead.', leadId: conversation.lead_id }, { status: 409 });
  }

  const now = new Date().toISOString();
  const assignedToId = parsed.data.assignedTo || (actor.profile.role === 'agent' ? actor.user.id : null);

  // 1. Create the lead
  const leadPayload = {
    customer_name: parsed.data.customerName || conversation.customer_name || 'Traveler',
    customer_phone: parsed.data.customerPhone || conversation.customer_phone || `${conversation.provider}:${conversation.id.slice(0, 8)}`,
    customer_email: parsed.data.customerEmail || conversation.customer_email || null,
    destination: parsed.data.destination,
    travel_dates: parsed.data.travelDates || null,
    budget_range: parsed.data.budgetRange || null,
    pax_adults: parsed.data.paxAdults,
    pax_children: parsed.data.paxChildren,
    pax_infants: 0,
    travel_type: 'custom',
    special_notes: parsed.data.notes || 'Converted from omnichannel chat conversation.',
    source: parsed.data.notes ? `${conversation.provider} chat` : conversation.provider,
    source_channel: conversation.provider,
    source_connection_id: conversation.connection_id || null,
    stage: 'new',
    priority: parsed.data.priority,
    assigned_to: assignedToId,
    assigned_at: assignedToId ? now : null,
    last_contacted_at: conversation.last_message_at || now,
    last_activity_type: conversation.provider === 'whatsapp' ? 'whatsapp' : 'system',
  };

  const { data: newLead, error: leadError } = await admin
    .from('leads')
    .insert(leadPayload)
    .select('*')
    .single();

  if (leadError) {
    console.error('Failed to create lead from conversation:', leadError.message);
    return NextResponse.json({ error: 'Failed to create lead.' }, { status: 500 });
  }

  // 2. Link the conversation and all existing messages to this new lead
  await Promise.all([
    admin
      .from('lead_conversations')
      .update({
        lead_id: newLead.id,
        customer_name: parsed.data.customerName,
        customer_phone: parsed.data.customerPhone,
        customer_email: parsed.data.customerEmail || null,
        assigned_to: assignedToId,
        updated_at: now,
      })
      .eq('id', conversation.id),
    admin
      .from('lead_messages')
      .update({ lead_id: newLead.id })
      .eq('conversation_id', conversation.id),
  ]);

  // 3. Record conversion activity log
  await admin.from('activity_logs').insert({
    lead_id: newLead.id,
    agent_id: actor.user.id,
    activity_type: 'system',
    title: `Converted from ${conversation.provider} chat`,
    notes: `Qualified and converted by ${actor.profile.full_name || actor.user.email}. Conversation history attached.`,
    metadata: {
      conversation_id: conversation.id,
      provider: conversation.provider,
      external_contact_id: conversation.external_contact_id,
    },
  });

  // 4. Notify assigned agent if assigned to another user
  if (assignedToId && assignedToId !== actor.user.id) {
    await admin.from('notifications').insert({
      user_id: assignedToId,
      title: 'New lead assigned from chat',
      message: `${newLead.customer_name} (${newLead.destination}) was converted from ${conversation.provider} and assigned to you.`,
      type: 'lead_assigned',
      link: `/leads/${newLead.id}/workspace`,
    });
  }

  return NextResponse.json({
    lead: newLead,
    conversationId: conversation.id,
    workspaceUrl: `/leads/${newLead.id}/workspace`,
  }, { status: 201 });
}
