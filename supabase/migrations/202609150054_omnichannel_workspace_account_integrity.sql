-- 202609150054_omnichannel_workspace_account_integrity.sql
-- Make omnichannel tenancy explicit: every provider account/event/external identity is
-- scoped to a workspace and, where relevant, a concrete integration connection.

begin;

-- ---------------------------------------------------------------------------
-- 1. Connection/account uniqueness belongs to a workspace, not the whole SaaS.
-- ---------------------------------------------------------------------------

drop index if exists public.integration_connections_provider_external_uidx;
create unique index if not exists integration_connections_workspace_provider_external_uidx
  on public.integration_connections(workspace_id, provider, external_account_id)
  where workspace_id is not null and external_account_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Inbound provider event idempotency is connection/workspace scoped.
-- ---------------------------------------------------------------------------

alter table public.inbound_channel_events
  drop constraint if exists inbound_channel_events_provider_external_event_id_key;

drop index if exists public.inbound_channel_events_provider_external_event_id_key;

create unique index if not exists inbound_channel_events_connection_event_uidx
  on public.inbound_channel_events(workspace_id, connection_id, external_event_id)
  where connection_id is not null;

create unique index if not exists inbound_channel_events_legacy_event_uidx
  on public.inbound_channel_events(workspace_id, provider, external_event_id)
  where connection_id is null;

-- ---------------------------------------------------------------------------
-- 3. Lead/provider IDs are only unique inside the source connection/workspace.
-- ---------------------------------------------------------------------------

drop index if exists public.idx_leads_source_channel_external_id;

create unique index if not exists leads_connection_external_uidx
  on public.leads(workspace_id, source_channel, source_connection_id, external_id)
  where source_connection_id is not null and source_channel is not null and external_id is not null;

create unique index if not exists leads_legacy_external_uidx
  on public.leads(workspace_id, source_channel, external_id)
  where source_connection_id is null and source_channel is not null and external_id is not null;

-- ---------------------------------------------------------------------------
-- 4. External channel identities are connection scoped. A Facebook PSID or
-- Instagram scoped user id is not a phone number and is not globally portable.
-- ---------------------------------------------------------------------------

alter table public.contact_identities
  add column if not exists connection_id uuid references public.integration_connections(id) on delete cascade;

alter table public.contact_identities
  drop constraint if exists contact_identities_workspace_id_provider_identity_type_identity_normalized_key;

drop index if exists public.contact_identities_workspace_id_provider_identity_type_identity_normalized_key;

-- Preserve the existing phone/email semantics while letting external IDs repeat
-- on different concrete provider accounts.
create unique index if not exists contact_identities_contact_value_uidx
  on public.contact_identities(workspace_id, provider, identity_type, identity_normalized)
  where identity_type in ('phone','email');

create unique index if not exists contact_identities_external_connection_uidx
  on public.contact_identities(workspace_id, provider, connection_id, identity_type, identity_normalized)
  where identity_type = 'external' and connection_id is not null;

create unique index if not exists contact_identities_external_legacy_uidx
  on public.contact_identities(workspace_id, provider, identity_type, identity_normalized)
  where identity_type = 'external' and connection_id is null;

create index if not exists contact_identities_connection_idx
  on public.contact_identities(connection_id, identity_normalized)
  where connection_id is not null;

-- Backfill a connection when an external identity currently maps unambiguously to
-- one conversation. Ambiguous legacy identities stay null and remain readable.
update public.contact_identities ci
set connection_id = source.connection_id
from (
  select
    c.workspace_id,
    c.provider,
    public.normalize_contact_identity(c.external_contact_id, 'external') as identity_normalized,
    min(c.connection_id) as connection_id,
    count(distinct c.connection_id) as connection_count
  from public.lead_conversations c
  where c.connection_id is not null
    and nullif(btrim(c.external_contact_id), '') is not null
  group by c.workspace_id, c.provider, public.normalize_contact_identity(c.external_contact_id, 'external')
) source
where ci.identity_type = 'external'
  and ci.connection_id is null
  and ci.workspace_id = source.workspace_id
  and ci.provider = source.provider
  and ci.identity_normalized = source.identity_normalized
  and source.connection_count = 1;

-- Contact matching now prefers exact connection-scoped external identity. Phone and
-- email remain workspace-level matching keys.
create or replace function public.ensure_contact_for_conversation(p_conversation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation public.lead_conversations%rowtype;
  v_contact_id uuid;
  v_phone text;
  v_email text;
  v_external text;
begin
  select * into v_conversation
  from public.lead_conversations
  where id = p_conversation_id
  for update;

  if not found then return null; end if;

  v_phone := public.normalize_contact_identity(v_conversation.customer_phone, 'phone');
  v_email := public.normalize_contact_identity(v_conversation.customer_email, 'email');
  v_external := public.normalize_contact_identity(v_conversation.external_contact_id, 'external');

  if v_conversation.contact_id is not null then
    v_contact_id := v_conversation.contact_id;
  else
    select ci.contact_id into v_contact_id
    from public.contact_identities ci
    where ci.workspace_id = v_conversation.workspace_id
      and (
        (v_phone is not null and ci.identity_type = 'phone' and ci.identity_normalized = v_phone)
        or (v_email is not null and ci.identity_type = 'email' and ci.identity_normalized = v_email)
        or (
          v_external is not null
          and ci.identity_type = 'external'
          and ci.provider = v_conversation.provider
          and ci.identity_normalized = v_external
          and (
            ci.connection_id is not distinct from v_conversation.connection_id
            or ci.connection_id is null
          )
        )
      )
    order by
      case ci.identity_type when 'phone' then 1 when 'email' then 2 else 3 end,
      case when ci.connection_id is not distinct from v_conversation.connection_id then 0 else 1 end,
      ci.created_at
    limit 1;
  end if;

  if v_contact_id is null then
    insert into public.contacts(
      workspace_id, display_name, primary_phone, primary_email, avatar_url,
      owner_id, last_seen_at
    ) values (
      v_conversation.workspace_id,
      nullif(btrim(v_conversation.customer_name), ''),
      nullif(btrim(v_conversation.customer_phone), ''),
      nullif(btrim(v_conversation.customer_email), ''),
      nullif(btrim(v_conversation.customer_avatar_url), ''),
      v_conversation.assigned_to,
      coalesce(v_conversation.last_message_at, now())
    ) returning id into v_contact_id;
  else
    update public.contacts
    set display_name = coalesce(nullif(btrim(v_conversation.customer_name), ''), display_name),
        primary_phone = coalesce(primary_phone, nullif(btrim(v_conversation.customer_phone), '')),
        primary_email = coalesce(primary_email, nullif(btrim(v_conversation.customer_email), '')),
        avatar_url = coalesce(nullif(btrim(v_conversation.customer_avatar_url), ''), avatar_url),
        owner_id = coalesce(owner_id, v_conversation.assigned_to),
        last_seen_at = greatest(coalesce(last_seen_at, '-infinity'::timestamptz), coalesce(v_conversation.last_message_at, now())),
        updated_at = now()
    where id = v_contact_id and workspace_id = v_conversation.workspace_id;
  end if;

  if v_phone is not null then
    insert into public.contact_identities(
      workspace_id, contact_id, connection_id, provider, identity_type, identity_value, identity_normalized, is_primary
    ) values (
      v_conversation.workspace_id, v_contact_id, null, 'crm', 'phone', v_conversation.customer_phone, v_phone, true
    ) on conflict do nothing;
  end if;

  if v_email is not null then
    insert into public.contact_identities(
      workspace_id, contact_id, connection_id, provider, identity_type, identity_value, identity_normalized, is_primary
    ) values (
      v_conversation.workspace_id, v_contact_id, null, 'crm', 'email', v_conversation.customer_email, v_email, true
    ) on conflict do nothing;
  end if;

  if v_external is not null then
    insert into public.contact_identities(
      workspace_id, contact_id, connection_id, provider, identity_type, identity_value, identity_normalized, is_primary
    ) values (
      v_conversation.workspace_id, v_contact_id, v_conversation.connection_id, v_conversation.provider,
      'external', v_conversation.external_contact_id, v_external, true
    ) on conflict do nothing;
  end if;

  update public.lead_conversations
  set contact_id = v_contact_id
  where id = v_conversation.id and contact_id is distinct from v_contact_id;

  return v_contact_id;
end;
$$;

-- Refresh contact identity when a conversation is attached to a different concrete
-- account as well as when its customer identity fields change.
drop trigger if exists trg_sync_conversation_contact on public.lead_conversations;
create trigger trg_sync_conversation_contact
after insert or update of customer_name, customer_phone, customer_email, customer_avatar_url, external_contact_id, connection_id
on public.lead_conversations
for each row execute function public.sync_conversation_contact();

-- ---------------------------------------------------------------------------
-- 5. Claim provider events inside the resolved connection/workspace. Service-role
-- webhook execution must never infer a tenant from a logged-in browser session.
-- ---------------------------------------------------------------------------

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
  v_workspace_id uuid;
begin
  if nullif(btrim(p_provider), '') is null or nullif(btrim(p_external_event_id), '') is null then
    raise exception 'provider and external_event_id are required' using errcode = '22023';
  end if;

  if p_connection_id is not null then
    select workspace_id into v_workspace_id
    from public.integration_connections
    where id = p_connection_id;

    if v_workspace_id is null then
      raise exception 'Integration connection has no workspace' using errcode = '23503';
    end if;
  else
    v_workspace_id := public.current_workspace_id();
    if v_workspace_id is null then
      raise exception 'A workspace-scoped integration connection is required' using errcode = '22023';
    end if;
  end if;

  select * into v_event
  from public.inbound_channel_events
  where workspace_id = v_workspace_id
    and provider = p_provider
    and connection_id is not distinct from p_connection_id
    and external_event_id = p_external_event_id
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
    set event_type = coalesce(nullif(p_event_type, ''), event_type),
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
    workspace_id, connection_id, provider, external_event_id, event_type, status, payload,
    received_at, attempt_count, last_attempt_at, processing_started_at
  ) values (
    v_workspace_id, p_connection_id, p_provider, p_external_event_id,
    coalesce(nullif(p_event_type, ''), 'lead'), 'received', coalesce(p_payload, '{}'::jsonb),
    now(), 1, now(), now()
  )
  returning * into v_event;

  return query select v_event.id, true, v_event.status, v_event.lead_id;
end;
$$;

revoke all on function public.claim_inbound_channel_event(uuid,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.claim_inbound_channel_event(uuid,text,text,text,jsonb) to service_role;

commit;
