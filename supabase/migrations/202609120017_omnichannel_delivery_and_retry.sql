-- Complete omnichannel durability, delivery state, provider health, and incremental sync metadata.
begin;

alter table public.inbound_channel_events
  add column if not exists last_error text;

alter table public.inbound_channel_events
  drop constraint if exists inbound_channel_events_status_check;
alter table public.inbound_channel_events
  add constraint inbound_channel_events_status_check
  check (status in ('received','processing','processed','ignored','failed'));

alter table public.lead_messages
  add column if not exists provider_message_id text,
  add column if not exists failure_code text,
  add column if not exists failure_message text,
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz;

alter table public.lead_messages
  drop constraint if exists lead_messages_delivery_status_check;
alter table public.lead_messages
  add constraint lead_messages_delivery_status_check
  check (delivery_status in ('queued','pending','sending','sent','delivered','read','failed'));

create index if not exists idx_lead_messages_delivery_status
  on public.lead_messages(delivery_status, sent_at desc);
create index if not exists idx_lead_messages_provider_message_id
  on public.lead_messages(provider, provider_message_id)
  where provider_message_id is not null;

alter table public.integration_connections
  add column if not exists provider_cursor text,
  add column if not exists last_external_timestamp timestamptz,
  add column if not exists last_health_check_at timestamptz;

alter table public.integration_connections
  drop constraint if exists integration_connections_status_check;
alter table public.integration_connections
  add constraint integration_connections_status_check
  check (status in (
    'disconnected','pending','connected','needs_attention','paused',
    'reconnect_required','token_expiring','permission_revoked','webhook_error','disabled'
  ));

alter table public.integration_secrets
  add column if not exists key_version integer not null default 2,
  add column if not exists encrypted_at timestamptz not null default now();

-- Claim or reclaim an inbound event. Only processed/ignored events are terminal.
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

  perform pg_advisory_xact_lock(hashtextextended(p_provider || ':' || p_external_event_id, 0));

  select * into v_event
  from public.inbound_channel_events
  where provider = p_provider and external_event_id = p_external_event_id
  for update;

  if found then
    if v_event.status in ('processed', 'ignored') then
      return query select v_event.id, false, v_event.status, v_event.lead_id;
      return;
    end if;

    if v_event.status = 'processing'
       and v_event.processing_started_at is not null
       and v_event.processing_started_at > now() - interval '5 minutes' then
      return query select v_event.id, false, v_event.status, v_event.lead_id;
      return;
    end if;

    if v_event.next_retry_at is not null and v_event.next_retry_at > now() then
      return query select v_event.id, false, v_event.status, v_event.lead_id;
      return;
    end if;

    update public.inbound_channel_events
    set connection_id = coalesce(p_connection_id, connection_id),
        event_type = coalesce(nullif(p_event_type, ''), event_type),
        status = 'processing',
        payload = coalesce(p_payload, payload, '{}'::jsonb),
        error = null,
        last_error = null,
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
    coalesce(nullif(p_event_type, ''), 'lead'), 'processing', coalesce(p_payload, '{}'::jsonb),
    now(), 1, now(), now()
  )
  returning * into v_event;

  return query select v_event.id, true, v_event.status, v_event.lead_id;
end;
$$;

revoke all on function public.claim_inbound_channel_event(uuid,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.claim_inbound_channel_event(uuid,text,text,text,jsonb) to service_role;

-- Provider delivery receipts update the canonical outbound message idempotently.
create or replace function public.update_message_delivery(
  p_provider text,
  p_external_message_id text,
  p_status text,
  p_event_at timestamptz,
  p_failure_code text default null,
  p_failure_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_status text;
begin
  if p_status not in ('sent','delivered','read','failed') then
    raise exception 'Invalid delivery status' using errcode = '22023';
  end if;

  select id into v_id
  from public.lead_messages
  where provider = p_provider
    and (external_message_id = p_external_message_id or provider_message_id = p_external_message_id)
  order by sent_at desc
  limit 1
  for update;

  if not found then return null; end if;

  select delivery_status into v_status from public.lead_messages where id = v_id;
  if v_status = 'read' and p_status in ('sent','delivered') then return v_id; end if;
  if v_status = 'delivered' and p_status = 'sent' then return v_id; end if;

  update public.lead_messages
  set provider_message_id = coalesce(provider_message_id, p_external_message_id),
      delivery_status = p_status,
      delivered_at = case when p_status in ('delivered','read') then coalesce(delivered_at, p_event_at, now()) else delivered_at end,
      read_at = case when p_status = 'read' then coalesce(read_at, p_event_at, now()) else read_at end,
      failure_code = case when p_status = 'failed' then p_failure_code else null end,
      failure_message = case when p_status = 'failed' then p_failure_message else null end
  where id = v_id;

  return v_id;
end;
$$;

revoke all on function public.update_message_delivery(text,text,text,timestamptz,text,text) from public, anon, authenticated;
grant execute on function public.update_message_delivery(text,text,text,timestamptz,text,text) to service_role;

commit;
