-- Harden omnichannel ingestion, conversion, outbound delivery, and query performance.
begin;

create extension if not exists pg_trgm;

alter table public.inbound_channel_events
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists processing_started_at timestamptz,
  add column if not exists next_retry_at timestamptz;

alter table public.lead_conversations
  add column if not exists converted_at timestamptz,
  add column if not exists converted_by uuid references public.profiles(id) on delete set null;

alter table public.lead_messages
  add column if not exists delivery_status text not null default 'sent',
  add column if not exists client_request_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.lead_messages'::regclass
      and conname = 'lead_messages_delivery_status_check'
  ) then
    alter table public.lead_messages
      add constraint lead_messages_delivery_status_check
      check (delivery_status in ('pending','sent','failed'));
  end if;
end
$$;

-- The full unique indexes from migration 015 are the canonical conflict targets.
-- Remove redundant partial indexes to reduce write amplification.
drop index if exists public.lead_conversations_thread_uidx;
drop index if exists public.idx_lead_conversations_provider_thread;
drop index if exists public.lead_messages_provider_external_uidx;
drop index if exists public.idx_lead_messages_provider_msg;

create unique index if not exists idx_lead_messages_conversation_client_request
  on public.lead_messages(conversation_id, client_request_id)
  where client_request_id is not null;

create index if not exists idx_lead_conversations_provider_last_message
  on public.lead_conversations(provider, last_message_at desc nulls last);
create index if not exists idx_inbound_channel_events_retry
  on public.inbound_channel_events(status, next_retry_at, received_at)
  where status in ('received','failed');
create index if not exists idx_lead_conversations_customer_name_trgm
  on public.lead_conversations using gin (customer_name gin_trgm_ops);
create index if not exists idx_lead_conversations_customer_phone_trgm
  on public.lead_conversations using gin (customer_phone gin_trgm_ops);
create index if not exists idx_lead_conversations_customer_email_trgm
  on public.lead_conversations using gin (customer_email gin_trgm_ops);
create index if not exists idx_lead_conversations_preview_trgm
  on public.lead_conversations using gin (last_message_preview gin_trgm_ops);
create unique index if not exists idx_leads_source_channel_external_id
  on public.leads(source_channel, external_id)
  where source_channel is not null and external_id is not null;

-- Claim an inbound provider event exactly once. Failed or abandoned claims can be retried,
-- while processed events are immutable idempotency records.
create or replace function public.claim_inbound_channel_event(
  p_connection_id uuid,
  p_provider text,
  p_external_event_id text,
  p_event_type text,
  p_payload jsonb
)
returns table(event_id uuid, should_process boolean, event_status text, existing_lead_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.inbound_channel_events%rowtype;
begin
  if nullif(btrim(p_provider), '') is null or nullif(btrim(p_external_event_id), '') is null then
    raise exception 'provider and external_event_id are required' using errcode = '22023';
  end if;

  select * into v_event
  from public.inbound_channel_events
  where provider = p_provider and external_event_id = p_external_event_id
  for update;

  if found then
    if v_event.status in ('processed', 'ignored') then
      return query select v_event.id, false, v_event.status, v_event.lead_id;
      return;
    end if;

    if v_event.status = 'received'
       and v_event.processing_started_at is not null
       and v_event.processing_started_at > now() - interval '5 minutes' then
      return query select v_event.id, false, v_event.status, v_event.lead_id;
      return;
    end if;

    update public.inbound_channel_events
    set connection_id = coalesce(p_connection_id, connection_id),
        event_type = coalesce(nullif(p_event_type, ''), event_type),
        status = 'received',
        payload = coalesce(p_payload, '{}'::jsonb),
        error = null,
        attempt_count = attempt_count + 1,
        last_attempt_at = now(),
        processing_started_at = now(),
        next_retry_at = null,
        processed_at = null
    where id = v_event.id
    returning * into v_event;

    return query select v_event.id, true, v_event.status, v_event.lead_id;
    return;
  end if;

  insert into public.inbound_channel_events(
    connection_id, provider, external_event_id, event_type, status, payload,
    received_at, attempt_count, last_attempt_at, processing_started_at
  ) values (
    p_connection_id, p_provider, p_external_event_id,
    coalesce(nullif(p_event_type, ''), 'lead'), 'received', coalesce(p_payload, '{}'::jsonb),
    now(), 1, now(), now()
  )
  returning * into v_event;

  return query select v_event.id, true, v_event.status, v_event.lead_id;
end;
$$;

revoke all on function public.claim_inbound_channel_event(uuid,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.claim_inbound_channel_event(uuid,text,text,text,jsonb) to service_role;

-- Atomically find/create a conversation, deduplicate the provider message, inherit any
-- converted lead_id, and increment unread_count only when a new inbound message is inserted.
create or replace function public.ingest_channel_message(
  p_lead_id uuid,
  p_connection_id uuid,
  p_provider text,
  p_external_thread_id text,
  p_external_contact_id text,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_customer_avatar_url text,
  p_external_message_id text,
  p_direction text,
  p_message_type text,
  p_body text,
  p_sent_at timestamptz,
  p_message_metadata jsonb,
  p_conversation_metadata jsonb,
  p_source_label text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation public.lead_conversations%rowtype;
  v_message_id uuid;
  v_effective_lead_id uuid;
  v_preview text;
  v_lock_key text;
begin
  if p_direction not in ('inbound','outbound','internal') then
    raise exception 'Invalid message direction' using errcode = '22023';
  end if;

  v_lock_key := coalesce(nullif(p_external_thread_id, ''), coalesce(p_lead_id::text, p_external_contact_id, gen_random_uuid()::text));
  perform pg_advisory_xact_lock(hashtextextended(coalesce(p_provider, '') || ':' || v_lock_key, 0));

  if nullif(p_external_thread_id, '') is not null then
    select * into v_conversation
    from public.lead_conversations
    where provider = p_provider and external_thread_id = p_external_thread_id
    limit 1
    for update;
  elsif p_lead_id is not null then
    select * into v_conversation
    from public.lead_conversations
    where lead_id = p_lead_id and provider = p_provider
    order by last_message_at desc nulls last
    limit 1
    for update;
  end if;

  if not found then
    insert into public.lead_conversations(
      lead_id, connection_id, provider, external_thread_id, external_contact_id,
      customer_name, customer_phone, customer_email, customer_avatar_url,
      last_message_preview, status, unread_count, last_message_at, metadata
    ) values (
      p_lead_id, p_connection_id, p_provider, nullif(p_external_thread_id, ''), nullif(p_external_contact_id, ''),
      nullif(p_customer_name, ''), nullif(p_customer_phone, ''), nullif(p_customer_email, ''), nullif(p_customer_avatar_url, ''),
      null, 'open', 0, p_sent_at, coalesce(p_conversation_metadata, '{}'::jsonb)
    )
    returning * into v_conversation;
  end if;

  v_effective_lead_id := coalesce(v_conversation.lead_id, p_lead_id);
  v_preview := coalesce(nullif(left(coalesce(p_body, ''), 180), ''), '[' || coalesce(nullif(p_message_type, ''), 'message') || ']');

  insert into public.lead_messages(
    conversation_id, lead_id, connection_id, provider, external_message_id,
    direction, message_type, body, metadata, sent_at, delivery_status
  ) values (
    v_conversation.id, v_effective_lead_id, coalesce(p_connection_id, v_conversation.connection_id), p_provider,
    nullif(p_external_message_id, ''), p_direction, coalesce(nullif(p_message_type, ''), 'text'), p_body,
    coalesce(p_message_metadata, '{}'::jsonb), p_sent_at, 'sent'
  )
  on conflict (provider, external_message_id) do nothing
  returning id into v_message_id;

  if v_message_id is null then
    if v_effective_lead_id is not null and nullif(p_external_message_id, '') is not null then
      update public.lead_messages
      set lead_id = coalesce(lead_id, v_effective_lead_id),
          conversation_id = coalesce(conversation_id, v_conversation.id)
      where provider = p_provider and external_message_id = p_external_message_id;
    end if;

    return jsonb_build_object(
      'conversation_id', v_conversation.id,
      'lead_id', v_effective_lead_id,
      'message_inserted', false
    );
  end if;

  update public.lead_conversations
  set lead_id = coalesce(lead_id, v_effective_lead_id),
      connection_id = coalesce(connection_id, p_connection_id),
      external_contact_id = coalesce(nullif(p_external_contact_id, ''), external_contact_id),
      customer_name = coalesce(nullif(p_customer_name, ''), customer_name),
      customer_phone = coalesce(nullif(p_customer_phone, ''), customer_phone),
      customer_email = coalesce(nullif(p_customer_email, ''), customer_email),
      customer_avatar_url = coalesce(nullif(p_customer_avatar_url, ''), customer_avatar_url),
      metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_conversation_metadata, '{}'::jsonb),
      last_message_at = case when last_message_at is null or p_sent_at >= last_message_at then p_sent_at else last_message_at end,
      last_message_preview = case when last_message_at is null or p_sent_at >= last_message_at then v_preview else last_message_preview end,
      unread_count = unread_count + case when p_direction = 'inbound' then 1 else 0 end,
      status = 'open'
  where id = v_conversation.id
  returning lead_id into v_effective_lead_id;

  if v_effective_lead_id is not null then
    insert into public.activity_logs(lead_id, activity_type, title, notes, metadata)
    values (
      v_effective_lead_id,
      case when p_provider = 'whatsapp' then 'whatsapp' when p_provider = 'email' then 'email' else 'system' end,
      case when p_direction = 'outbound'
        then coalesce(nullif(p_source_label, ''), p_provider) || ' reply sent (Meta Business Suite)'
        else coalesce(nullif(p_source_label, ''), p_provider) || ' message received'
      end,
      coalesce(p_body, case when p_direction = 'outbound' then 'Outbound message.' else 'Inbound message.' end),
      jsonb_build_object(
        'provider', p_provider,
        'direction', p_direction,
        'external_message_id', p_external_message_id,
        'external_thread_id', p_external_thread_id
      )
    );

    update public.leads
    set last_contacted_at = case
          when last_contacted_at is null or p_sent_at >= last_contacted_at then p_sent_at
          else last_contacted_at
        end,
        last_activity_type = case when p_provider = 'whatsapp' then 'whatsapp' when p_provider = 'email' then 'email' else 'system' end
    where id = v_effective_lead_id;
  end if;

  return jsonb_build_object(
    'conversation_id', v_conversation.id,
    'lead_id', v_effective_lead_id,
    'message_id', v_message_id,
    'message_inserted', true
  );
end;
$$;

revoke all on function public.ingest_channel_message(uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,timestamptz,jsonb,jsonb,text) from public, anon, authenticated;
grant execute on function public.ingest_channel_message(uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,timestamptz,jsonb,jsonb,text) to service_role;

-- Merge an outbound provider echo with the locally claimed pending message when necessary.
create or replace function public.finalize_outbound_message(
  p_message_id uuid,
  p_external_message_id text,
  p_sent_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pending public.lead_messages%rowtype;
  v_existing public.lead_messages%rowtype;
  v_result uuid;
begin
  select * into v_pending
  from public.lead_messages
  where id = p_message_id
  for update;

  if not found then
    raise exception 'Pending outbound message not found' using errcode = 'P0002';
  end if;

  if nullif(p_external_message_id, '') is null then
    raise exception 'external_message_id is required' using errcode = '22023';
  end if;

  select * into v_existing
  from public.lead_messages
  where provider = v_pending.provider
    and external_message_id = p_external_message_id
    and id <> p_message_id
  for update;

  if found then
    update public.lead_messages
    set client_request_id = null
    where id = p_message_id;

    update public.lead_messages
    set conversation_id = coalesce(conversation_id, v_pending.conversation_id),
        lead_id = coalesce(lead_id, v_pending.lead_id),
        connection_id = coalesce(connection_id, v_pending.connection_id),
        direction = 'outbound',
        message_type = coalesce(nullif(v_pending.message_type, ''), message_type),
        body = coalesce(v_pending.body, body),
        metadata = coalesce(metadata, '{}'::jsonb) || coalesce(v_pending.metadata, '{}'::jsonb),
        created_by = coalesce(v_pending.created_by, created_by),
        client_request_id = v_pending.client_request_id,
        delivery_status = 'sent',
        sent_at = coalesce(p_sent_at, v_pending.sent_at, sent_at)
    where id = v_existing.id
    returning id into v_result;

    delete from public.lead_messages where id = p_message_id;
    return v_result;
  end if;

  update public.lead_messages
  set external_message_id = p_external_message_id,
      delivery_status = 'sent',
      sent_at = coalesce(p_sent_at, sent_at)
  where id = p_message_id
  returning id into v_result;

  return v_result;
end;
$$;

revoke all on function public.finalize_outbound_message(uuid,text,timestamptz) from public, anon, authenticated;
grant execute on function public.finalize_outbound_message(uuid,text,timestamptz) to service_role;

-- Convert an Inbox conversation and its full message history in one database transaction.
create or replace function public.convert_conversation_to_lead(
  p_conversation_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_destination text,
  p_travel_dates text,
  p_budget_range text,
  p_pax_adults integer,
  p_pax_children integer,
  p_priority text,
  p_assigned_to uuid,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation public.lead_conversations%rowtype;
  v_lead public.leads%rowtype;
  v_assigned_to uuid;
  v_role text;
  v_now timestamptz := now();
begin
  if not public.current_user_active() then
    raise exception 'Account is not active' using errcode = '42501';
  end if;

  if not public.can_access_conversation(p_conversation_id) then
    raise exception 'Conversation access denied' using errcode = '42501';
  end if;

  select * into v_conversation
  from public.lead_conversations
  where id = p_conversation_id
  for update;

  if not found then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;

  if v_conversation.lead_id is not null then
    select * into v_lead from public.leads where id = v_conversation.lead_id;
    return jsonb_build_object(
      'lead', to_jsonb(v_lead),
      'conversation_id', v_conversation.id,
      'already_converted', true
    );
  end if;

  v_role := public.current_user_role();
  v_assigned_to := coalesce(p_assigned_to, case when v_role = 'agent' then auth.uid() else null end);

  if v_role = 'agent' and v_assigned_to is distinct from auth.uid() then
    raise exception 'Agents may only assign converted leads to themselves' using errcode = '42501';
  end if;

  if v_assigned_to is not null and not exists (
    select 1 from public.profiles where id = v_assigned_to and is_active = true
  ) then
    raise exception 'Assigned user is not active' using errcode = '22023';
  end if;

  insert into public.leads(
    customer_name, customer_phone, customer_email, destination, travel_dates, budget_range,
    pax_adults, pax_children, pax_infants, travel_type, special_notes, source,
    source_channel, source_connection_id, stage, priority, assigned_to, assigned_at, assigned_by,
    last_contacted_at, last_activity_type
  ) values (
    coalesce(nullif(btrim(p_customer_name), ''), nullif(btrim(v_conversation.customer_name), ''), 'Traveler'),
    coalesce(nullif(btrim(p_customer_phone), ''), nullif(btrim(v_conversation.customer_phone), ''), v_conversation.provider || ':' || left(v_conversation.id::text, 8)),
    coalesce(nullif(btrim(p_customer_email), ''), nullif(btrim(v_conversation.customer_email), '')),
    coalesce(nullif(btrim(p_destination), ''), 'Not specified'),
    nullif(btrim(p_travel_dates), ''),
    nullif(btrim(p_budget_range), ''),
    greatest(coalesce(p_pax_adults, 2), 1),
    greatest(coalesce(p_pax_children, 0), 0),
    0,
    'custom',
    coalesce(nullif(btrim(p_notes), ''), 'Converted from omnichannel chat conversation.'),
    v_conversation.provider || ' chat',
    v_conversation.provider,
    v_conversation.connection_id,
    'new',
    case when p_priority in ('low','normal','high','urgent') then p_priority else 'normal' end,
    v_assigned_to,
    case when v_assigned_to is not null then v_now else null end,
    auth.uid(),
    coalesce(v_conversation.last_message_at, v_now),
    case when v_conversation.provider = 'whatsapp' then 'whatsapp' else 'system' end
  )
  returning * into v_lead;

  update public.lead_conversations
  set lead_id = v_lead.id,
      customer_name = v_lead.customer_name,
      customer_phone = v_lead.customer_phone,
      customer_email = v_lead.customer_email,
      assigned_to = v_assigned_to,
      converted_at = v_now,
      converted_by = auth.uid(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('converted_at', v_now, 'converted_by', auth.uid())
  where id = v_conversation.id;

  update public.lead_messages
  set lead_id = v_lead.id
  where conversation_id = v_conversation.id;

  insert into public.activity_logs(lead_id, agent_id, activity_type, title, notes, metadata)
  values (
    v_lead.id,
    auth.uid(),
    'system',
    'Converted from ' || v_conversation.provider || ' chat',
    'Conversation history attached during lead conversion.',
    jsonb_build_object(
      'conversation_id', v_conversation.id,
      'provider', v_conversation.provider,
      'external_contact_id', v_conversation.external_contact_id
    )
  );

  if v_assigned_to is not null and v_assigned_to <> auth.uid() then
    insert into public.notifications(user_id, title, message, type, link)
    values (
      v_assigned_to,
      'New lead assigned from chat',
      v_lead.customer_name || ' (' || v_lead.destination || ') was converted from ' || v_conversation.provider || ' and assigned to you.',
      'lead_assigned',
      '/leads/' || v_lead.id || '/workspace'
    );
  end if;

  return jsonb_build_object(
    'lead', to_jsonb(v_lead),
    'conversation_id', v_conversation.id,
    'already_converted', false
  );
end;
$$;

revoke all on function public.convert_conversation_to_lead(uuid,text,text,text,text,text,text,integer,integer,text,uuid,text) from public, anon;
grant execute on function public.convert_conversation_to_lead(uuid,text,text,text,text,text,text,integer,integer,text,uuid,text) to authenticated;

revoke all on function public.can_access_conversation(uuid) from public, anon;
grant execute on function public.can_access_conversation(uuid) to authenticated;

commit;
