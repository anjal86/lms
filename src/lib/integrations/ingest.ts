import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { extractPhoneNumbers } from './phone-extractor';

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
  customerCity?: string | null;
  customerCountry?: string | null;
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
    direction?: 'inbound' | 'outbound';
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
  lead: Record<string, any> | null;
  routed: boolean;
  eventStatus?: string;
};

type ClaimRow = {
  event_id: string;
  should_process: boolean;
  event_status: string;
  existing_lead_id: string | null;
};

type IngestionScope = {
  workspaceId: string;
  connectionId: string;
  provider: string;
};

function firstRpcRow<T>(data: T | T[] | null): T | null {
  if (!data) return null;
  return Array.isArray(data) ? (data[0] || null) : data;
}

function serializableInput(input: NormalizedChannelLead) {
  return JSON.parse(JSON.stringify(input)) as Record<string, unknown>;
}

function supportsOutboundReply(provider: string) {
  return provider === 'facebook' || provider === 'instagram' || provider === 'whatsapp';
}

async function resolveIngestionScope(input: NormalizedChannelLead): Promise<IngestionScope> {
  const connectionId = input.connectionId?.trim();
  if (!connectionId) {
    throw new Error(`A concrete ${input.provider} connection is required for omnichannel ingestion.`);
  }

  const admin = createSupabaseAdminClient();
  const { data: connection, error } = await admin
    .from('integration_connections')
    .select('id,workspace_id,provider,status')
    .eq('id', connectionId)
    .maybeSingle();

  if (error || !connection) {
    throw new Error('The integration connection could not be resolved.');
  }
  if (!connection.workspace_id) {
    throw new Error('The integration connection is not attached to a workspace.');
  }
  if (connection.provider !== input.provider) {
    throw new Error(`Integration provider mismatch: expected ${connection.provider}, received ${input.provider}.`);
  }
  if (!['connected', 'pending', 'needs_attention'].includes(connection.status)) {
    throw new Error(`The ${input.provider} connection is not active.`);
  }

  return {
    workspaceId: connection.workspace_id,
    connectionId: connection.id,
    provider: connection.provider,
  };
}

async function loadLead(id: string | null | undefined, workspaceId: string) {
  if (!id) return null;
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from('leads')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', id)
    .maybeSingle();
  return data || null;
}

async function findExistingLead(input: NormalizedChannelLead, scope: IngestionScope) {
  const admin = createSupabaseAdminClient();

  if (input.externalLeadId) {
    const { data } = await admin
      .from('leads')
      .select('*')
      .eq('workspace_id', scope.workspaceId)
      .eq('source_channel', input.provider)
      .eq('source_connection_id', scope.connectionId)
      .eq('external_id', input.externalLeadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }

  if (input.customerPhone?.trim()) {
    const { data } = await admin
      .from('leads')
      .select('*')
      .eq('workspace_id', scope.workspaceId)
      .eq('customer_phone', input.customerPhone.trim())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }

  if (input.customerEmail?.trim()) {
    const { data } = await admin
      .from('leads')
      .select('*')
      .eq('workspace_id', scope.workspaceId)
      .ilike('customer_email', input.customerEmail.trim())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }

  return null;
}

async function createLeadFromChannel(input: NormalizedChannelLead, scope: IngestionScope) {
  const admin = createSupabaseAdminClient();
  const externalId = input.externalLeadId || input.externalEventId;
  const payload = {
    workspace_id: scope.workspaceId,
    customer_name: input.customerName?.trim() || `${input.sourceLabel || input.provider} inquiry`,
    customer_phone: input.customerPhone?.trim() || null,
    customer_email: input.customerEmail?.trim() || null,
    customer_city: input.customerCity?.trim() || null,
    customer_country: input.customerCountry?.trim() || null,
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
    source_connection_id: scope.connectionId,
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

  const { data: inserted, error: insertError } = await admin
    .from('leads')
    .insert(payload)
    .select('*')
    .single();

  if (insertError?.code === '23505') {
    const existing = await findExistingLead(input, scope);
    if (existing) return { lead: existing, created: false, routed: Boolean(existing.assigned_to) };
  }
  if (insertError || !inserted) throw insertError || new Error('Lead insert returned no record.');

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

  const { data: refreshed } = await admin
    .from('leads')
    .select('*')
    .eq('workspace_id', scope.workspaceId)
    .eq('id', inserted.id)
    .single();
  const lead = refreshed || inserted;

  await admin.from('activity_logs').insert({
    lead_id: inserted.id,
    activity_type: 'system',
    title: `Lead received from ${input.sourceLabel || input.provider}`,
    notes: input.campaign ? `Campaign: ${input.campaign}` : 'Created automatically from a connected channel.',
    metadata: {
      workspace_id: scope.workspaceId,
      provider: input.provider,
      connection_id: scope.connectionId,
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

  return { lead, created: true, routed: Boolean(assignedTo || lead.assigned_to) };
}

async function saveMessageAtomically(leadId: string | null, input: NormalizedChannelLead, scope: IngestionScope) {
  if (!input.message) return { leadId, conversationId: null, inserted: false };
  const admin = createSupabaseAdminClient();
  const sentAt = input.message.sentAt || new Date().toISOString();
  const avatarUrl = typeof input.metadata?.customer_avatar_url === 'string'
    ? input.metadata.customer_avatar_url
    : null;

  const { data, error } = await admin.rpc('ingest_channel_message', {
    p_lead_id: leadId,
    p_connection_id: scope.connectionId,
    p_provider: input.provider,
    p_external_thread_id: input.externalThreadId || null,
    p_external_contact_id: input.externalContactId || null,
    p_customer_name: input.customerName?.trim() || `${input.sourceLabel || input.provider} User`,
    p_customer_phone: input.customerPhone?.trim() || null,
    p_customer_email: input.customerEmail?.trim() || null,
    p_customer_avatar_url: avatarUrl,
    p_external_message_id: input.message.externalMessageId || null,
    p_direction: input.message.direction || 'inbound',
    p_message_type: input.message.type || 'text',
    p_body: input.message.body || null,
    p_sent_at: sentAt,
    p_message_metadata: input.message.metadata || {},
    p_conversation_metadata: {
      ...(input.metadata || {}),
      workspace_id: scope.workspaceId,
      connection_id: scope.connectionId,
      can_reply: supportsOutboundReply(input.provider),
    },
    p_source_label: input.sourceLabel || input.provider,
  });
  if (error) throw error;

  const result = (data || {}) as Record<string, unknown>;
  return {
    leadId: typeof result.lead_id === 'string' ? result.lead_id : leadId,
    conversationId: typeof result.conversation_id === 'string' ? result.conversation_id : null,
    inserted: result.message_inserted === true,
  };
}

async function markEventFailed(eventId: string, error: unknown, scope: IngestionScope) {
  const admin = createSupabaseAdminClient();
  const message = error instanceof Error ? error.message.slice(0, 1000) : 'Unknown ingestion error';
  const { data: event } = await admin
    .from('inbound_channel_events')
    .select('attempt_count')
    .eq('workspace_id', scope.workspaceId)
    .eq('id', eventId)
    .maybeSingle();
  const attempts = Math.max(1, Number(event?.attempt_count) || 1);
  const retrySeconds = Math.min(3600, 30 * (2 ** Math.min(attempts - 1, 7)));

  await admin
    .from('inbound_channel_events')
    .update({
      status: 'failed',
      error: message,
      last_error: message,
      processing_started_at: null,
      processed_at: null,
      next_retry_at: new Date(Date.now() + retrySeconds * 1000).toISOString(),
    })
    .eq('workspace_id', scope.workspaceId)
    .eq('id', eventId);

  await admin
    .from('integration_connections')
    .update({
      last_error: message,
      last_health_check_at: new Date().toISOString(),
    })
    .eq('workspace_id', scope.workspaceId)
    .eq('id', scope.connectionId);
}

export async function ingestNormalizedLead(input: NormalizedChannelLead): Promise<IngestionResult> {
  const admin = createSupabaseAdminClient();
  const scope = await resolveIngestionScope(input);
  const isPureMessage = Boolean(input.message) && (input.eventType === 'message' || !input.externalLeadId);

  const { data: claimData, error: claimError } = await admin.rpc('claim_inbound_channel_event', {
    p_connection_id: scope.connectionId,
    p_provider: input.provider,
    p_external_event_id: input.externalEventId,
    p_event_type: input.eventType || (isPureMessage ? 'message' : 'lead'),
    p_payload: serializableInput(input),
  });
  if (claimError) throw claimError;

  const claim = firstRpcRow(claimData as ClaimRow | ClaimRow[] | null);
  if (!claim) throw new Error('Inbound event claim returned no row.');

  if (!claim.should_process) {
    const lead = await loadLead(claim.existing_lead_id, scope.workspaceId);
    return {
      duplicate: true,
      created: false,
      lead,
      routed: Boolean(lead?.assigned_to),
      eventStatus: claim.event_status,
    };
  }

  try {
    let lead = await findExistingLead(input, scope);
    let created = false;
    let routed = Boolean(lead?.assigned_to);

    if (!lead && !isPureMessage) {
      const createdResult = await createLeadFromChannel(input, scope);
      lead = createdResult.lead;
      created = createdResult.created;
      routed = createdResult.routed;
    }

    if (input.message) {
      const messageResult = await saveMessageAtomically(lead?.id || null, input, scope);
      if (!lead && messageResult.leadId) {
        lead = await loadLead(messageResult.leadId, scope.workspaceId);
        routed = Boolean(lead?.assigned_to);
      }

      if (messageResult.conversationId && input.message.body && input.message.direction !== 'outbound') {
        const detected = extractPhoneNumbers(input.message.body);
        if (detected.length > 0) {
          const { data: conv } = await admin
            .from('lead_conversations')
            .select('id,metadata,customer_phone,provider')
            .eq('workspace_id', scope.workspaceId)
            .eq('id', messageResult.conversationId)
            .maybeSingle();
          if (conv) {
            const existingMetadata = (conv.metadata || {}) as Record<string, unknown>;
            const existingPhones = Array.isArray(existingMetadata.detected_phones) ? existingMetadata.detected_phones as string[] : [];
            const merged = Array.from(new Set([...detected, ...existingPhones]));
            const patch: Record<string, unknown> = {
              metadata: {
                ...existingMetadata,
                detected_phone: detected[0],
                detected_phones: merged,
                detected_phone_at: input.message.sentAt || new Date().toISOString(),
                detected_phone_snippet: input.message.body.slice(0, 160),
              },
            };
            if (!conv.customer_phone || conv.customer_phone.startsWith(`${conv.provider}:`)) {
              patch.customer_phone = detected[0];
            }
            await admin
              .from('lead_conversations')
              .update(patch)
              .eq('workspace_id', scope.workspaceId)
              .eq('id', conv.id);
          }
        }
      }
    }

    await admin
      .from('inbound_channel_events')
      .update({
        status: 'processed',
        lead_id: lead?.id || null,
        processed_at: new Date().toISOString(),
        processing_started_at: null,
        next_retry_at: null,
        error: null,
        last_error: null,
      })
      .eq('workspace_id', scope.workspaceId)
      .eq('id', claim.event_id);

    await admin
      .from('integration_connections')
      .update({
        last_event_at: new Date().toISOString(),
        last_error: null,
        last_health_check_at: new Date().toISOString(),
      })
      .eq('workspace_id', scope.workspaceId)
      .eq('id', scope.connectionId);

    return { duplicate: false, created, lead, routed, eventStatus: 'processed' };
  } catch (error) {
    await markEventFailed(claim.event_id, error, scope);
    throw error;
  }
}
