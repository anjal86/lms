-- 202609150050_whatsapp_history_multi_account.sql
-- Make WhatsApp conversations connection-scoped, add per-staff visibility metadata,
-- persist history-sync progress, and retain WhatsApp LID -> phone mappings.

begin;

-- Make integration ownership explicit. Legacy connections are backfilled through
-- the profile that originally connected them; rows without an owner remain nullable
-- so this migration does not invalidate unrelated historical integrations.
alter table public.integration_connections
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade,
  add column if not exists visibility_scope text;

update public.integration_connections connection
set workspace_id = profile.workspace_id
from public.profiles profile
where connection.workspace_id is null
  and connection.connected_by = profile.id
  and profile.workspace_id is not null;

-- Existing integrations behaved as workspace/shared accounts. Preserve that
-- behavior for current rows, while new accounts default to personal ownership.
update public.integration_connections
set visibility_scope = 'workspace'
where visibility_scope is null;

alter table public.integration_connections
  alter column visibility_scope set default 'personal',
  alter column visibility_scope set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.integration_connections'::regclass
      and conname = 'integration_connections_visibility_scope_check'
  ) then
    alter table public.integration_connections
      add constraint integration_connections_visibility_scope_check
      check (visibility_scope in ('personal', 'workspace'));
  end if;
end
$$;

create index if not exists integration_connections_workspace_visibility_idx
  on public.integration_connections(workspace_id, provider, visibility_scope, connected_by, status);

-- Provider IDs are only unique inside a concrete provider connection. The previous
-- provider-wide indexes caused two staff WhatsApp accounts talking to the same JID
-- to collapse into one CRM thread.
drop index if exists public.idx_lead_messages_provider_ext_msg_full;
drop index if exists public.idx_lead_conversations_provider_thread_full;
drop index if exists public.lead_messages_provider_external_uidx;
drop index if exists public.lead_conversations_thread_uidx;

create unique index if not exists lead_messages_connection_external_uidx
  on public.lead_messages(provider, connection_id, external_message_id)
  where connection_id is not null and external_message_id is not null;

create unique index if not exists lead_messages_legacy_external_uidx
  on public.lead_messages(provider, external_message_id)
  where connection_id is null and external_message_id is not null;

create unique index if not exists lead_conversations_connection_thread_uidx
  on public.lead_conversations(provider, connection_id, external_thread_id)
  where connection_id is not null and external_thread_id is not null;

create unique index if not exists lead_conversations_legacy_thread_uidx
  on public.lead_conversations(provider, external_thread_id)
  where connection_id is null and external_thread_id is not null;

-- Track on-demand history requests separately from ordinary live webhook delivery.
create table if not exists public.whatsapp_history_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  conversation_id uuid references public.lead_conversations(id) on delete cascade,
  requested_by uuid references public.profiles(id) on delete set null,
  request_id text,
  status text not null default 'queued',
  requested_count integer not null default 50,
  messages_received integer not null default 0,
  sync_type text,
  progress integer,
  is_latest boolean,
  oldest_message_at timestamptz,
  newest_message_at timestamptz,
  error text,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint whatsapp_history_sync_jobs_status_check
    check (status in ('queued', 'requested', 'receiving', 'completed', 'partial', 'failed', 'timed_out')),
  constraint whatsapp_history_sync_jobs_requested_count_check
    check (requested_count between 1 and 100),
  constraint whatsapp_history_sync_jobs_progress_check
    check (progress is null or progress between 0 and 100)
);

create index if not exists whatsapp_history_sync_jobs_connection_idx
  on public.whatsapp_history_sync_jobs(connection_id, requested_at desc);
create index if not exists whatsapp_history_sync_jobs_conversation_idx
  on public.whatsapp_history_sync_jobs(conversation_id, requested_at desc)
  where conversation_id is not null;
create index if not exists whatsapp_history_sync_jobs_active_idx
  on public.whatsapp_history_sync_jobs(connection_id, status, requested_at desc)
  where status in ('queued', 'requested', 'receiving');

alter table public.whatsapp_history_sync_jobs enable row level security;

-- Service routes use the service-role client. Keep direct client access closed.
revoke all on table public.whatsapp_history_sync_jobs from anon, authenticated;
grant all on table public.whatsapp_history_sync_jobs to service_role;

-- Modern WhatsApp can surface @lid identities in history. Persist mappings as they
-- arrive so older messages can be resolved later instead of being discarded.
create table if not exists public.whatsapp_identity_mappings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  lid_jid text not null,
  pn_jid text,
  phone_number text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(connection_id, lid_jid)
);

create index if not exists whatsapp_identity_mappings_phone_idx
  on public.whatsapp_identity_mappings(connection_id, phone_number)
  where phone_number is not null;

alter table public.whatsapp_identity_mappings enable row level security;
revoke all on table public.whatsapp_identity_mappings from anon, authenticated;
grant all on table public.whatsapp_identity_mappings to service_role;

-- Rebuild ingestion so both conversation lookup and message idempotency are scoped
-- to the concrete integration connection. This preserves legacy rows where the
-- connection is null while allowing the same WhatsApp customer/message IDs on
-- multiple staff accounts.
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
  v_effective_connection_id uuid;
begin
  if p_direction not in ('inbound','outbound','internal') then
    raise exception 'Invalid message direction' using errcode = '22023';
  end if;

  v_lock_key := coalesce(
    nullif(p_external_thread_id, ''),
    coalesce(p_lead_id::text, p_external_contact_id, gen_random_uuid()::text)
  );
  perform pg_advisory_xact_lock(
    hashtextextended(
      coalesce(p_provider, '') || ':' || coalesce(p_connection_id::text, 'legacy') || ':' || v_lock_key,
      0
    )
  );

  if nullif(p_external_thread_id, '') is not null then
    select * into v_conversation
    from public.lead_conversations
    where provider = p_provider
      and external_thread_id = p_external_thread_id
      and connection_id is not distinct from p_connection_id
    limit 1
    for update;
  elsif p_lead_id is not null then
    select * into v_conversation
    from public.lead_conversations
    where lead_id = p_lead_id
      and provider = p_provider
      and (p_connection_id is null or connection_id is not distinct from p_connection_id)
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

  v_effective_connection_id := coalesce(p_connection_id, v_conversation.connection_id);
  v_effective_lead_id := coalesce(v_conversation.lead_id, p_lead_id);
  v_preview := coalesce(
    nullif(left(coalesce(p_body, ''), 180), ''),
    '[' || coalesce(nullif(p_message_type, ''), 'message') || ']'
  );

  insert into public.lead_messages(
    conversation_id, lead_id, connection_id, provider, external_message_id,
    direction, message_type, body, metadata, sent_at, delivery_status
  ) values (
    v_conversation.id, v_effective_lead_id, v_effective_connection_id, p_provider,
    nullif(p_external_message_id, ''), p_direction, coalesce(nullif(p_message_type, ''), 'text'), p_body,
    coalesce(p_message_metadata, '{}'::jsonb), p_sent_at, 'sent'
  )
  on conflict do nothing
  returning id into v_message_id;

  if v_message_id is null then
    if v_effective_lead_id is not null and nullif(p_external_message_id, '') is not null then
      update public.lead_messages
      set lead_id = coalesce(lead_id, v_effective_lead_id),
          conversation_id = coalesce(conversation_id, v_conversation.id)
      where provider = p_provider
        and external_message_id = p_external_message_id
        and connection_id is not distinct from v_effective_connection_id;
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
        then coalesce(nullif(p_source_label, ''), p_provider) || ' reply sent'
        else coalesce(nullif(p_source_label, ''), p_provider) || ' message received'
      end,
      coalesce(p_body, case when p_direction = 'outbound' then 'Outbound message.' else 'Inbound message.' end),
      jsonb_build_object(
        'provider', p_provider,
        'direction', p_direction,
        'connection_id', v_effective_connection_id,
        'external_message_id', p_external_message_id,
        'external_thread_id', p_external_thread_id
      )
    );

    update public.leads
    set last_contacted_at = case
          when last_contacted_at is null or p_sent_at >= last_contacted_at then p_sent_at
          else last_contacted_at
        end,
        last_activity_type = case
          when p_provider = 'whatsapp' then 'whatsapp'
          when p_provider = 'email' then 'email'
          else 'system'
        end
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

revoke all on function public.ingest_channel_message(uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,timestamptz,jsonb,jsonb,text)
  from public, anon, authenticated;
grant execute on function public.ingest_channel_message(uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,timestamptz,jsonb,jsonb,text)
  to service_role;

commit;
