import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export type NormalizedChannelLead = {
  provider: string;
  connectionId?: string | null;
  externalEventId: string;
  eventType?: string;
  externalLeadId?: string | null;
  externalThreadId?: string | null;
  externalContactId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  destination?: string | null;
  travelDates?: string | null;
  budgetRange?: string | null;
  paxAdults?: number | null;
  paxChildren?: number | null;
  paxInfants?: number | null;
  travelType?: string | null;
  notes?: string | null;
  campaign?: string | null;
  ad?: string | null;
  form?: string | null;
  sourceLabel?: string | null;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  message?: {
    externalMessageId?: string | null;
    type?: string | null;
    body?: string | null;
    sentAt?: string | null;
    metadata?: Record<string, unknown>;
  } | null;
  metadata?: Record<string, unknown>;
};

type IngestionResult = {
  duplicate: boolean;
  created: boolean;
  lead: Record<string, unknown> | null;
  routed: boolean;
};

function activityType(provider: string) {
  if (provider === 'whatsapp') return 'whatsapp';
  if (provider === 'email') return 'email';
  return 'system';
}

async function findExistingLead(input: NormalizedChannelLead) {
  const admin = createSupabaseAdminClient();
  if (input.externalLeadId) {
    const { data } = await admin
      .from('leads')
      .select('*')
      .eq('source_channel', input.provider)
      .eq('external_id', input.externalLeadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }

  if (input.customerPhone?.trim()) {
    const phone = input.customerPhone.trim();
    const { data } = await admin
      .from('leads')
      .select('*')
      .eq('customer_phone', phone)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }

  if (input.customerEmail?.trim()) {
    const { data } = await admin
      .from('leads')
      .select('*')
      .ilike('customer_email', input.customerEmail.trim())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }

  return null;
}

async function saveMessage(leadId: string, input: NormalizedChannelLead) {
  if (!input.message) return;
  const admin = createSupabaseAdminClient();
  let conversationId: string | null = null;

  if (input.externalThreadId) {
    const { data } = await admin
      .from('lead_conversations')
      .select('id')
      .eq('provider', input.provider)
      .eq('external_thread_id', input.externalThreadId)
      .maybeSingle();
    conversationId = data?.id || null;
  }

  if (!conversationId) {
    const { data } = await admin
      .from('lead_conversations')
      .select('id')
      .eq('lead_id', leadId)
      .eq('provider', input.provider)
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    conversationId = data?.id || null;
  }

  const sentAt = input.message.sentAt || new Date().toISOString();
  if (!conversationId) {
    const { data, error } = await admin
      .from('lead_conversations')
      .insert({
        lead_id: leadId,
        connection_id: input.connectionId || null,
        provider: input.provider,
        external_thread_id: input.externalThreadId || null,
        external_contact_id: input.externalContactId || null,
        status: 'open',
        last_message_at: sentAt,
      })
      .select('id')
      .single();
    if (error) throw error;
    conversationId = data.id;
  } else {
    await admin
      .from('lead_conversations')
      .update({ last_message_at: sentAt, status: 'open' })
      .eq('id', conversationId);
  }

  const { error: messageError } = await admin.from('lead_messages').insert({
    conversation_id: conversationId,
    lead_id: leadId,
    connection_id: input.connectionId || null,
    provider: input.provider,
    external_message_id: input.message.externalMessageId || null,
    direction: 'inbound',
    message_type: input.message.type || 'text',
    body: input.message.body || null,
    metadata: input.message.metadata || {},
    sent_at: sentAt,
  });
  if (messageError && messageError.code !== '23505') throw messageError;

  await admin.from('activity_logs').insert({
    lead_id: leadId,
    activity_type: activityType(input.provider),
    title: `${input.sourceLabel || input.provider} message received`,
    notes: input.message.body || `Inbound ${input.message.type || 'message'} received.`,
    metadata: {
      provider: input.provider,
      external_message_id: input.message.externalMessageId || null,
      external_thread_id: input.externalThreadId || null,
    },
  });

  await admin
    .from('leads')
    .update({ last_contacted_at: sentAt, last_activity_type: activityType(input.provider) })
    .eq('id', leadId);
}

export async function ingestNormalizedLead(input: NormalizedChannelLead): Promise<IngestionResult> {
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();

  const { data: event, error: eventError } = await admin
    .from('inbound_channel_events')
    .insert({
      connection_id: input.connectionId || null,
      provider: input.provider,
      external_event_id: input.externalEventId,
      event_type: input.eventType || (input.message ? 'message' : 'lead'),
      status: 'received',
      payload: input.metadata || {},
      received_at: now,
    })
    .select('id')
    .single();

  if (eventError?.code === '23505') {
    const { data: existingEvent } = await admin
      .from('inbound_channel_events')
      .select('lead_id')
      .eq('provider', input.provider)
      .eq('external_event_id', input.externalEventId)
      .maybeSingle();
    let lead = null;
    if (existingEvent?.lead_id) {
      const { data } = await admin.from('leads').select('*').eq('id', existingEvent.lead_id).maybeSingle();
      lead = data || null;
    }
    return { duplicate: true, created: false, lead, routed: Boolean(lead?.assigned_to) };
  }
  if (eventError) throw eventError;

  try {
    let lead = await findExistingLead(input);
    let created = false;
    let routed = Boolean(lead?.assigned_to);

    if (!lead) {
      const externalId = input.externalLeadId || input.externalEventId;
      const fallbackPhone = input.customerPhone?.trim() || `${input.provider}:${input.externalContactId || externalId}`;
      const payload = {
        customer_name: input.customerName?.trim() || `${input.sourceLabel || input.provider} inquiry`,
        customer_phone: fallbackPhone,
        customer_email: input.customerEmail?.trim() || null,
        destination: input.destination?.trim() || 'Not specified',
        travel_dates: input.travelDates?.trim() || null,
        budget_range: input.budgetRange?.trim() || null,
        pax_adults: input.paxAdults ?? 2,
        pax_children: input.paxChildren ?? 0,
        pax_infants: input.paxInfants ?? 0,
        travel_type: input.travelType || 'custom',
        special_notes: input.notes?.trim() || null,
        source: input.sourceLabel || input.provider,
        source_channel: input.provider,
        source_connection_id: input.connectionId || null,
        source_campaign: input.campaign || null,
        source_ad: input.ad || null,
        source_form: input.form || null,
        source_metadata: input.metadata || {},
        external_id: externalId,
        stage: 'new',
        priority: input.priority || 'normal',
        assigned_to: null,
        assigned_at: null,
      };

      const { data: inserted, error: insertError } = await admin.from('leads').insert(payload).select('*').single();
      if (insertError) throw insertError;
      lead = inserted;
      created = true;

      const { data: duplicateOf, error: duplicateError } = await admin.rpc('mark_possible_duplicate', {
        p_lead_id: inserted.id,
      });
      if (duplicateError) console.warn('Omnichannel duplicate detection failed:', duplicateError.message);

      const { data: assignedTo, error: routeError } = await admin.rpc('route_lead_atomic', {
        p_lead_id: inserted.id,
        p_destination: payload.destination,
        p_excluded_agent: null,
        p_force: false,
      });
      if (routeError) console.warn('Omnichannel automatic routing failed:', routeError.message);
      routed = Boolean(assignedTo);

      const { data: refreshed } = await admin.from('leads').select('*').eq('id', inserted.id).single();
      lead = refreshed || inserted;

      await admin.from('activity_logs').insert({
        lead_id: inserted.id,
        activity_type: 'system',
        title: `Lead received from ${input.sourceLabel || input.provider}`,
        notes: input.campaign ? `Campaign: ${input.campaign}` : 'Created automatically from a connected channel.',
        metadata: {
          provider: input.provider,
          connection_id: input.connectionId || null,
          external_event_id: input.externalEventId,
          external_lead_id: input.externalLeadId || null,
          campaign: input.campaign || null,
          ad: input.ad || null,
          form: input.form || null,
          duplicate_of: duplicateOf || null,
        },
      });

      if (lead.assigned_to) {
        await admin.from('notifications').insert({
          user_id: lead.assigned_to,
          title: 'New lead assigned',
          message: `${lead.customer_name} came in from ${input.sourceLabel || input.provider}.`,
          type: 'lead_assigned',
          link: `/leads/${lead.id}/workspace`,
        });
      }
    }

    if (!lead) throw new Error('Lead could not be resolved after ingestion.');
    await saveMessage(lead.id, input);

    await admin
      .from('inbound_channel_events')
      .update({ status: 'processed', lead_id: lead.id, processed_at: new Date().toISOString() })
      .eq('id', event.id);

    if (input.connectionId) {
      await admin
        .from('integration_connections')
        .update({ last_event_at: new Date().toISOString(), last_sync_at: new Date().toISOString(), last_error: null })
        .eq('id', input.connectionId);
    }

    return { duplicate: false, created, lead, routed };
  } catch (error) {
    await admin
      .from('inbound_channel_events')
      .update({
        status: 'failed',
        processed_at: new Date().toISOString(),
        error: error instanceof Error ? error.message.slice(0, 1000) : 'Unknown ingestion error',
      })
      .eq('id', event.id);
    throw error;
  }
}
