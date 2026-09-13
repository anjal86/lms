-- 202609120030_conversation_operations_platform.sql
-- Production conversation operations layer: workspace isolation, persistent Contacts,
-- Respond.io-style conversation states/SLA, collaborators, events, assignment and
-- a small event-driven automation engine. Existing Travel lead/message behavior stays compatible.

begin;

-- ---------------------------------------------------------------------------
-- 1. Workspace-scope the omnichannel runtime.
-- ---------------------------------------------------------------------------

alter table public.integration_connections
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.inbound_channel_events
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.lead_conversations
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.lead_messages
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

update public.integration_connections c
set workspace_id = coalesce(
  (select p.workspace_id from public.profiles p where p.id = c.connected_by),
  '00000000-0000-0000-0000-000000000001'::uuid
)
where c.workspace_id is null;

update public.lead_conversations c
set workspace_id = coalesce(
  (select l.workspace_id from public.leads l where l.id = c.lead_id),
  (select ic.workspace_id from public.integration_connections ic where ic.id = c.connection_id),
  (select p.workspace_id from public.profiles p where p.id = c.assigned_to),
  '00000000-0000-0000-0000-000000000001'::uuid
)
where c.workspace_id is null;

update public.lead_messages m
set workspace_id = coalesce(
  (select c.workspace_id from public.lead_conversations c where c.id = m.conversation_id),
  (select l.workspace_id from public.leads l where l.id = m.lead_id),
  (select p.workspace_id from public.profiles p where p.id = m.created_by),
  '00000000-0000-0000-0000-000000000001'::uuid
)
where m.workspace_id is null;

update public.inbound_channel_events e
set workspace_id = coalesce(
  (select ic.workspace_id from public.integration_connections ic where ic.id = e.connection_id),
  (select l.workspace_id from public.leads l where l.id = e.lead_id),
  '00000000-0000-0000-0000-000000000001'::uuid
)
where e.workspace_id is null;

alter table public.integration_connections
  alter column workspace_id set default '00000000-0000-0000-0000-000000000001'::uuid,
  alter column workspace_id set not null;
alter table public.inbound_channel_events
  alter column workspace_id set default '00000000-0000-0000-0000-000000000001'::uuid,
  alter column workspace_id set not null;
alter table public.lead_conversations
  alter column workspace_id set default '00000000-0000-0000-0000-000000000001'::uuid,
  alter column workspace_id set not null;
alter table public.lead_messages
  alter column workspace_id set default '00000000-0000-0000-0000-000000000001'::uuid,
  alter column workspace_id set not null;

create index if not exists integration_connections_workspace_idx
  on public.integration_connections(workspace_id, provider, status);
create index if not exists inbound_channel_events_workspace_idx
  on public.inbound_channel_events(workspace_id, received_at desc);
create index if not exists lead_conversations_workspace_queue_idx
  on public.lead_conversations(workspace_id, status, assigned_to, last_message_at desc nulls last);
create index if not exists lead_messages_workspace_conversation_idx
  on public.lead_messages(workspace_id, conversation_id, sent_at desc);

create or replace function public.set_omnichannel_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  if new.workspace_id is not null then
    return new;
  end if;

  if tg_table_name = 'integration_connections' then
    select workspace_id into v_workspace_id from public.profiles where id = new.connected_by;
  elsif tg_table_name = 'lead_conversations' then
    if new.lead_id is not null then
      select workspace_id into v_workspace_id from public.leads where id = new.lead_id;
    end if;
    if v_workspace_id is null and new.connection_id is not null then
      select workspace_id into v_workspace_id from public.integration_connections where id = new.connection_id;
    end if;
    if v_workspace_id is null and new.assigned_to is not null then
      select workspace_id into v_workspace_id from public.profiles where id = new.assigned_to;
    end if;
  elsif tg_table_name = 'lead_messages' then
    if new.conversation_id is not null then
      select workspace_id into v_workspace_id from public.lead_conversations where id = new.conversation_id;
    end if;
    if v_workspace_id is null and new.lead_id is not null then
      select workspace_id into v_workspace_id from public.leads where id = new.lead_id;
    end if;
  elsif tg_table_name = 'inbound_channel_events' then
    if new.connection_id is not null then
      select workspace_id into v_workspace_id from public.integration_connections where id = new.connection_id;
    end if;
    if v_workspace_id is null and new.lead_id is not null then
      select workspace_id into v_workspace_id from public.leads where id = new.lead_id;
    end if;
  end if;

  new.workspace_id := coalesce(v_workspace_id, public.current_workspace_id(), '00000000-0000-0000-0000-000000000001'::uuid);
  return new;
end;
$$;

drop trigger if exists trg_integration_connections_workspace on public.integration_connections;
create trigger trg_integration_connections_workspace
before insert on public.integration_connections
for each row execute function public.set_omnichannel_workspace();

drop trigger if exists trg_lead_conversations_workspace on public.lead_conversations;
create trigger trg_lead_conversations_workspace
before insert on public.lead_conversations
for each row execute function public.set_omnichannel_workspace();

drop trigger if exists trg_lead_messages_workspace on public.lead_messages;
create trigger trg_lead_messages_workspace
before insert on public.lead_messages
for each row execute function public.set_omnichannel_workspace();

drop trigger if exists trg_inbound_channel_events_workspace on public.inbound_channel_events;
create trigger trg_inbound_channel_events_workspace
before insert on public.inbound_channel_events
for each row execute function public.set_omnichannel_workspace();

-- ---------------------------------------------------------------------------
-- 2. Persistent Contact identity, independent of conversations and opportunities.
-- ---------------------------------------------------------------------------

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  display_name text,
  primary_phone text,
  primary_email text,
  avatar_url text,
  lifecycle_key text not null default 'new',
  owner_id uuid references public.profiles(id) on delete set null,
  tags jsonb not null default '[]'::jsonb,
  custom_data jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contact_identities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  provider text not null default 'crm',
  identity_type text not null check (identity_type in ('phone','email','external')),
  identity_value text not null,
  identity_normalized text not null,
  is_primary boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(workspace_id, provider, identity_type, identity_normalized)
);

alter table public.lead_conversations
  add column if not exists contact_id uuid references public.contacts(id) on delete set null;

create index if not exists contacts_workspace_lifecycle_idx
  on public.contacts(workspace_id, lifecycle_key, updated_at desc);
create index if not exists contacts_workspace_owner_idx
  on public.contacts(workspace_id, owner_id, updated_at desc);
create index if not exists contacts_phone_idx on public.contacts(workspace_id, primary_phone);
create index if not exists contacts_email_idx on public.contacts(workspace_id, primary_email);
create index if not exists contact_identities_contact_idx on public.contact_identities(contact_id);
create index if not exists lead_conversations_contact_idx on public.lead_conversations(contact_id, last_message_at desc);

create or replace function public.normalize_contact_identity(p_value text, p_type text)
returns text
language sql
immutable
as $$
  select case
    when nullif(btrim(p_value), '') is null then null
    when p_type = 'phone' then regexp_replace(p_value, '[^0-9+]', '', 'g')
    when p_type = 'email' then lower(btrim(p_value))
    else lower(btrim(p_value))
  end;
$$;

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

  if not found then
    return null;
  end if;

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
        or (v_external is not null and ci.identity_type = 'external' and ci.provider = v_conversation.provider and ci.identity_normalized = v_external)
      )
    order by case ci.identity_type when 'phone' then 1 when 'email' then 2 else 3 end
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
    insert into public.contact_identities(workspace_id,contact_id,provider,identity_type,identity_value,identity_normalized,is_primary)
    values (v_conversation.workspace_id,v_contact_id,'crm','phone',v_conversation.customer_phone,v_phone,true)
    on conflict (workspace_id,provider,identity_type,identity_normalized) do nothing;
  end if;

  if v_email is not null then
    insert into public.contact_identities(workspace_id,contact_id,provider,identity_type,identity_value,identity_normalized,is_primary)
    values (v_conversation.workspace_id,v_contact_id,'crm','email',v_conversation.customer_email,v_email,true)
    on conflict (workspace_id,provider,identity_type,identity_normalized) do nothing;
  end if;

  if v_external is not null then
    insert into public.contact_identities(workspace_id,contact_id,provider,identity_type,identity_value,identity_normalized,is_primary)
    values (v_conversation.workspace_id,v_contact_id,v_conversation.provider,'external',v_conversation.external_contact_id,v_external,true)
    on conflict (workspace_id,provider,identity_type,identity_normalized) do nothing;
  end if;

  update public.lead_conversations
  set contact_id = v_contact_id
  where id = v_conversation.id and contact_id is distinct from v_contact_id;

  return v_contact_id;
end;
$$;

create or replace function public.sync_conversation_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  perform public.ensure_contact_for_conversation(new.id);
  return new;
end;
$$;

drop trigger if exists trg_sync_conversation_contact on public.lead_conversations;
create trigger trg_sync_conversation_contact
after insert or update of customer_name, customer_phone, customer_email, customer_avatar_url, external_contact_id
on public.lead_conversations
for each row execute function public.sync_conversation_contact();

-- Backfill Contacts for all existing conversations.
do $$
declare
  v_id uuid;
begin
  for v_id in select id from public.lead_conversations where contact_id is null loop
    perform public.ensure_contact_for_conversation(v_id);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Operational conversation state, SLA and timeline.
-- ---------------------------------------------------------------------------

alter table public.lead_conversations
  add column if not exists workflow_state text not null default 'open',
  add column if not exists priority text not null default 'normal',
  add column if not exists snoozed_until timestamptz,
  add column if not exists first_response_due_at timestamptz,
  add column if not exists next_action_at timestamptz,
  add column if not exists first_responded_at timestamptz,
  add column if not exists last_inbound_at timestamptz,
  add column if not exists last_outbound_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by uuid references public.profiles(id) on delete set null,
  add column if not exists resolution_code text,
  add column if not exists closing_note text,
  add column if not exists team_key text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.lead_conversations'::regclass
      and conname = 'lead_conversations_workflow_state_check'
  ) then
    alter table public.lead_conversations
      add constraint lead_conversations_workflow_state_check
      check (workflow_state in ('open','waiting','snoozed','closed'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.lead_conversations'::regclass
      and conname = 'lead_conversations_priority_check'
  ) then
    alter table public.lead_conversations
      add constraint lead_conversations_priority_check
      check (priority in ('low','normal','high','urgent'));
  end if;
end
$$;

update public.lead_conversations
set workflow_state = case status when 'closed' then 'closed' when 'archived' then 'closed' else 'open' end,
    closed_at = case when status in ('closed','archived') then coalesce(closed_at, updated_at) else closed_at end
where workflow_state is distinct from case status when 'closed' then 'closed' when 'archived' then 'closed' else 'open' end;

create index if not exists lead_conversations_ops_queue_idx
  on public.lead_conversations(workspace_id, workflow_state, priority, assigned_to, last_message_at desc nulls last);
create index if not exists lead_conversations_snooze_idx
  on public.lead_conversations(workspace_id, snoozed_until)
  where workflow_state = 'snoozed';
create index if not exists lead_conversations_sla_idx
  on public.lead_conversations(workspace_id, first_response_due_at)
  where first_responded_at is null and workflow_state <> 'closed';

create table if not exists public.conversation_collaborators (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references public.lead_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(conversation_id,user_id)
);

create table if not exists public.conversation_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references public.lead_conversations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  event_type text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists conversation_events_conversation_idx
  on public.conversation_events(conversation_id, created_at desc);
create index if not exists conversation_events_workspace_type_idx
  on public.conversation_events(workspace_id,event_type,created_at desc);
create index if not exists conversation_collaborators_user_idx
  on public.conversation_collaborators(workspace_id,user_id,created_at desc);

create or replace function public.conversation_first_response_due(p_workspace_id uuid, p_from timestamptz)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select p_from + make_interval(mins => greatest(1, least(1440, coalesce(
    nullif(w.settings #>> '{conversation_sla,first_response_minutes}', '')::integer,
    30
  ))))
  from public.workspaces w
  where w.id = p_workspace_id;
$$;

create or replace function public.log_conversation_event(
  p_conversation_id uuid,
  p_event_type text,
  p_actor_id uuid default auth.uid(),
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_conversation public.lead_conversations%rowtype;
begin
  select * into v_conversation from public.lead_conversations where id = p_conversation_id;
  if not found then return null; end if;

  insert into public.conversation_events(workspace_id,conversation_id,contact_id,event_type,actor_id,payload)
  values (v_conversation.workspace_id,v_conversation.id,v_conversation.contact_id,p_event_type,p_actor_id,coalesce(p_payload,'{}'::jsonb))
  returning id into v_event_id;
  return v_event_id;
end;
$$;

create or replace function public.track_message_operations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_due timestamptz;
begin
  if new.conversation_id is null then return new; end if;
  select workspace_id into v_workspace_id from public.lead_conversations where id = new.conversation_id;

  if new.direction = 'inbound' then
    v_due := public.conversation_first_response_due(v_workspace_id, coalesce(new.sent_at,now()));
    update public.lead_conversations
    set last_inbound_at = greatest(coalesce(last_inbound_at,'-infinity'::timestamptz),coalesce(new.sent_at,now())),
        workflow_state = 'open',
        status = 'open',
        snoozed_until = null,
        closed_at = null,
        closed_by = null,
        first_response_due_at = case when first_responded_at is null then coalesce(first_response_due_at,v_due) else first_response_due_at end
    where id = new.conversation_id;
    perform public.log_conversation_event(new.conversation_id,'message_received',new.created_by,jsonb_build_object('message_id',new.id,'provider',new.provider));
  elsif new.direction = 'outbound' then
    update public.lead_conversations
    set last_outbound_at = greatest(coalesce(last_outbound_at,'-infinity'::timestamptz),coalesce(new.sent_at,now())),
        first_responded_at = coalesce(first_responded_at,coalesce(new.sent_at,now())),
        workflow_state = case when workflow_state = 'closed' then 'open' else workflow_state end,
        status = 'open'
    where id = new.conversation_id;
    perform public.log_conversation_event(new.conversation_id,'reply_sent',new.created_by,jsonb_build_object('message_id',new.id,'provider',new.provider));
  elsif new.direction = 'internal' then
    perform public.log_conversation_event(new.conversation_id,'note_added',new.created_by,jsonb_build_object('message_id',new.id));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_track_message_operations on public.lead_messages;
create trigger trg_track_message_operations
after insert on public.lead_messages
for each row execute function public.track_message_operations();

-- Backfill last inbound/outbound and first-response SLA from existing history.
update public.lead_conversations c
set last_inbound_at = x.last_inbound_at,
    last_outbound_at = x.last_outbound_at,
    first_responded_at = x.first_responded_at,
    first_response_due_at = case
      when x.first_responded_at is null and x.first_inbound_at is not null
        then public.conversation_first_response_due(c.workspace_id,x.first_inbound_at)
      else c.first_response_due_at
    end
from (
  select conversation_id,
    min(sent_at) filter (where direction='inbound') as first_inbound_at,
    max(sent_at) filter (where direction='inbound') as last_inbound_at,
    min(sent_at) filter (where direction='outbound') as first_responded_at,
    max(sent_at) filter (where direction='outbound') as last_outbound_at
  from public.lead_messages
  where conversation_id is not null
  group by conversation_id
) x
where c.id = x.conversation_id;

-- ---------------------------------------------------------------------------
-- 4. Atomic state transitions and assignment engine.
-- ---------------------------------------------------------------------------

create or replace function public.can_access_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_active() and exists (
    select 1 from public.lead_conversations c
    where c.id = p_conversation_id
      and c.workspace_id = public.current_workspace_id()
      and (
        public.is_management()
        or c.assigned_to = auth.uid()
        or c.assigned_to is null
        or exists (
          select 1 from public.conversation_collaborators cc
          where cc.conversation_id = c.id and cc.user_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.transition_conversation(
  p_conversation_id uuid,
  p_state text,
  p_snoozed_until timestamptz default null,
  p_resolution_code text default null,
  p_closing_note text default null,
  p_next_action_at timestamptz default null,
  p_automation_run_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation public.lead_conversations%rowtype;
  v_payload jsonb;
begin
  if p_state not in ('open','waiting','snoozed','closed') then
    raise exception 'Invalid conversation state' using errcode='22023';
  end if;
  if not public.can_access_conversation(p_conversation_id) then
    raise exception 'Conversation access denied' using errcode='42501';
  end if;
  if p_state = 'snoozed' and (p_snoozed_until is null or p_snoozed_until <= now()) then
    raise exception 'Snooze time must be in the future' using errcode='22023';
  end if;

  update public.lead_conversations
  set workflow_state = p_state,
      status = case when p_state='closed' then 'closed' else 'open' end,
      snoozed_until = case when p_state='snoozed' then p_snoozed_until else null end,
      resolution_code = case when p_state='closed' then nullif(btrim(p_resolution_code),'') else resolution_code end,
      closing_note = case when p_state='closed' then nullif(btrim(p_closing_note),'') else closing_note end,
      next_action_at = p_next_action_at,
      closed_at = case when p_state='closed' then now() else null end,
      closed_by = case when p_state='closed' then auth.uid() else null end,
      updated_at = now()
  where id = p_conversation_id
  returning * into v_conversation;

  v_payload := jsonb_build_object(
    'state',p_state,
    'snoozed_until',p_snoozed_until,
    'resolution_code',p_resolution_code,
    'next_action_at',p_next_action_at
  );
  if p_automation_run_id is not null then
    v_payload := v_payload || jsonb_build_object('automation_source',p_automation_run_id);
  end if;
  perform public.log_conversation_event(p_conversation_id,'state_changed',auth.uid(),v_payload);

  return to_jsonb(v_conversation);
end;
$$;

create or replace function public.assign_conversation(
  p_conversation_id uuid,
  p_assignee_id uuid default null,
  p_strategy text default null,
  p_automation_run_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation public.lead_conversations%rowtype;
  v_assignee uuid;
  v_strategy text;
  v_online_only boolean;
  v_payload jsonb;
begin
  if not public.can_access_conversation(p_conversation_id) then
    raise exception 'Conversation access denied' using errcode='42501';
  end if;

  select * into v_conversation from public.lead_conversations where id=p_conversation_id for update;
  if not found then raise exception 'Conversation not found' using errcode='P0002'; end if;

  if p_assignee_id is not null then
    if not public.is_management() and p_assignee_id is distinct from auth.uid() then
      raise exception 'Agents may only claim conversations for themselves' using errcode='42501';
    end if;
    if not exists (
      select 1 from public.profiles p
      where p.id=p_assignee_id and p.workspace_id=v_conversation.workspace_id and p.is_active=true
    ) then
      raise exception 'Assignee is not an active workspace member' using errcode='22023';
    end if;
    v_assignee := p_assignee_id;
  elsif not public.is_management() then
    v_assignee := auth.uid();
  else
    select coalesce(nullif(w.settings #>> '{conversation_routing,strategy}',''),p_strategy,'least_open'),
           coalesce((w.settings #>> '{conversation_routing,online_only}')::boolean,false)
      into v_strategy,v_online_only
    from public.workspaces w where w.id=v_conversation.workspace_id;
    v_strategy := coalesce(nullif(p_strategy,''),v_strategy,'least_open');

    select p.id into v_assignee
    from public.profiles p
    where p.workspace_id=v_conversation.workspace_id
      and p.is_active=true
      and p.role='agent'
      and coalesce(p.accepting_leads,true)=true
      and (not v_online_only or p.status='available')
      and (
        select count(*) from public.lead_conversations c
        where c.workspace_id=v_conversation.workspace_id
          and c.assigned_to=p.id
          and c.workflow_state <> 'closed'
      ) < greatest(coalesce(p.max_capacity,25),1)
    order by
      case when v_strategy='round_robin' then extract(epoch from coalesce(p.last_assigned_at,'1970-01-01'::timestamptz)) end asc nulls last,
      case when v_strategy='conversion_weighted' then coalesce(p.conversion_rate,0) end desc nulls last,
      case when v_strategy not in ('round_robin','conversion_weighted') then
        (select count(*)::numeric / greatest(coalesce(p.max_capacity,25),1)
         from public.lead_conversations c
         where c.workspace_id=v_conversation.workspace_id
           and c.assigned_to=p.id
           and c.workflow_state <> 'closed')
      end asc nulls last,
      p.last_assigned_at asc nulls first,
      p.id
    limit 1
    for update skip locked;
  end if;

  if v_assignee is null then return null; end if;

  update public.lead_conversations
  set assigned_to=v_assignee, updated_at=now()
  where id=p_conversation_id;

  update public.profiles
  set last_assigned_at=now()
  where id=v_assignee;

  v_payload := jsonb_build_object('assigned_to',v_assignee,'strategy',coalesce(p_strategy,'manual'));
  if p_automation_run_id is not null then
    v_payload := v_payload || jsonb_build_object('automation_source',p_automation_run_id);
  end if;
  perform public.log_conversation_event(p_conversation_id,'assigned',auth.uid(),v_payload);
  return v_assignee;
end;
$$;

-- Wake snoozed work automatically when its due time is crossed by a read/query worker.
create or replace function public.wake_due_conversations(p_workspace_id uuid default public.current_workspace_id())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_workspace_id is distinct from public.current_workspace_id() and auth.uid() is not null then
    raise exception 'Workspace access denied' using errcode='42501';
  end if;
  update public.lead_conversations
  set workflow_state='open',status='open',snoozed_until=null,updated_at=now()
  where workspace_id=p_workspace_id and workflow_state='snoozed' and snoozed_until <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Small event-driven workflow engine. Safe local actions execute immediately.
-- ---------------------------------------------------------------------------

create table if not exists public.automation_workflows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  trigger_key text not null,
  conditions jsonb not null default '{}'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  is_enabled boolean not null default true,
  sort_order integer not null default 100,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  workflow_id uuid not null references public.automation_workflows(id) on delete cascade,
  event_id uuid not null references public.conversation_events(id) on delete cascade,
  conversation_id uuid not null references public.lead_conversations(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','running','succeeded','failed','skipped')),
  idempotency_key text not null,
  result jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(workflow_id,event_id),
  unique(idempotency_key)
);

create index if not exists automation_workflows_trigger_idx
  on public.automation_workflows(workspace_id,trigger_key,is_enabled,sort_order);
create index if not exists automation_runs_workspace_status_idx
  on public.automation_runs(workspace_id,status,created_at desc);

create or replace function public.run_conversation_automations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workflow public.automation_workflows%rowtype;
  v_conversation public.lead_conversations%rowtype;
  v_action jsonb;
  v_run_id uuid;
  v_matches boolean;
  v_action_type text;
  v_state text;
  v_minutes integer;
  v_assignee uuid;
begin
  -- Automation-authored events do not recursively trigger more workflows.
  if new.payload ? 'automation_source' then return new; end if;
  select * into v_conversation from public.lead_conversations where id=new.conversation_id;
  if not found then return new; end if;

  for v_workflow in
    select * from public.automation_workflows
    where workspace_id=new.workspace_id and is_enabled=true
      and trigger_key in (new.event_type,'*')
    order by sort_order,id
  loop
    v_matches := true;
    if v_workflow.conditions ? 'provider' and v_workflow.conditions->>'provider' <> v_conversation.provider then v_matches := false; end if;
    if v_workflow.conditions ? 'priority' and v_workflow.conditions->>'priority' <> v_conversation.priority then v_matches := false; end if;
    if v_workflow.conditions ? 'workflow_state' and v_workflow.conditions->>'workflow_state' <> v_conversation.workflow_state then v_matches := false; end if;
    if v_workflow.conditions ? 'has_lead' and (v_workflow.conditions->>'has_lead')::boolean <> (v_conversation.lead_id is not null) then v_matches := false; end if;

    insert into public.automation_runs(workspace_id,workflow_id,event_id,conversation_id,status,idempotency_key,started_at)
    values (new.workspace_id,v_workflow.id,new.id,new.conversation_id,case when v_matches then 'running' else 'skipped' end,
      v_workflow.id::text || ':' || new.id::text,now())
    on conflict (workflow_id,event_id) do nothing
    returning id into v_run_id;

    if v_run_id is null then continue; end if;
    if not v_matches then
      update public.automation_runs set completed_at=now(),result='{"reason":"conditions_not_met"}'::jsonb where id=v_run_id;
      continue;
    end if;

    begin
      for v_action in select value from jsonb_array_elements(coalesce(v_workflow.actions,'[]'::jsonb))
      loop
        v_action_type := v_action->>'type';
        if v_action_type='set_priority' and v_action->>'value' in ('low','normal','high','urgent') then
          update public.lead_conversations set priority=v_action->>'value',updated_at=now() where id=new.conversation_id;
          perform public.log_conversation_event(new.conversation_id,'priority_changed',null,jsonb_build_object('priority',v_action->>'value','automation_source',v_run_id));
        elsif v_action_type='set_state' then
          v_state := v_action->>'value';
          if v_state in ('open','waiting','closed') then
            perform public.transition_conversation(new.conversation_id,v_state,null,v_action->>'resolution_code',v_action->>'note',null,v_run_id);
          elsif v_state='snoozed' then
            v_minutes := greatest(1,least(10080,coalesce((v_action->>'minutes')::integer,60)));
            perform public.transition_conversation(new.conversation_id,'snoozed',now()+make_interval(mins=>v_minutes),null,null,null,v_run_id);
          end if;
        elsif v_action_type='assign' then
          v_assignee := nullif(v_action->>'user_id','')::uuid;
          perform public.assign_conversation(new.conversation_id,v_assignee,v_action->>'strategy',v_run_id);
        end if;
      end loop;
      update public.automation_runs set status='succeeded',completed_at=now(),result='{"executed":true}'::jsonb where id=v_run_id;
    exception when others then
      update public.automation_runs set status='failed',completed_at=now(),error=sqlerrm where id=v_run_id;
    end;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_run_conversation_automations on public.conversation_events;
create trigger trg_run_conversation_automations
after insert on public.conversation_events
for each row execute function public.run_conversation_automations();

-- ---------------------------------------------------------------------------
-- 6. Workspace-safe RLS for all conversation operations data.
-- ---------------------------------------------------------------------------

alter table public.contacts enable row level security;
alter table public.contact_identities enable row level security;
alter table public.conversation_collaborators enable row level security;
alter table public.conversation_events enable row level security;
alter table public.automation_workflows enable row level security;
alter table public.automation_runs enable row level security;

-- Replace legacy omnichannel policies that predate workspace isolation.
drop policy if exists integration_connections_read on public.integration_connections;
create policy integration_connections_read on public.integration_connections
  for select to authenticated
  using (public.current_user_active() and workspace_id=public.current_workspace_id());

drop policy if exists integration_connections_manage on public.integration_connections;
create policy integration_connections_manage on public.integration_connections
  for all to authenticated
  using (public.current_user_active() and public.is_management() and workspace_id=public.current_workspace_id())
  with check (public.current_user_active() and public.is_management() and workspace_id=public.current_workspace_id());

drop policy if exists inbound_channel_events_read on public.inbound_channel_events;
create policy inbound_channel_events_read on public.inbound_channel_events
  for select to authenticated
  using (public.current_user_active() and public.is_management() and workspace_id=public.current_workspace_id());

drop policy if exists lead_conversations_read on public.lead_conversations;
create policy lead_conversations_read on public.lead_conversations
  for select to authenticated
  using (
    public.current_user_active() and workspace_id=public.current_workspace_id()
    and (public.is_management() or assigned_to=auth.uid() or assigned_to is null
      or exists (select 1 from public.conversation_collaborators cc where cc.conversation_id=lead_conversations.id and cc.user_id=auth.uid()))
  );

drop policy if exists lead_conversations_write on public.lead_conversations;
create policy lead_conversations_write on public.lead_conversations
  for all to authenticated
  using (
    public.current_user_active() and workspace_id=public.current_workspace_id()
    and (public.is_management() or assigned_to=auth.uid() or assigned_to is null)
  )
  with check (
    public.current_user_active() and workspace_id=public.current_workspace_id()
    and (public.is_management() or assigned_to=auth.uid() or assigned_to is null)
  );

drop policy if exists lead_messages_read on public.lead_messages;
create policy lead_messages_read on public.lead_messages
  for select to authenticated
  using (public.current_user_active() and workspace_id=public.current_workspace_id() and public.can_access_conversation(conversation_id));

drop policy if exists lead_messages_write on public.lead_messages;
create policy lead_messages_write on public.lead_messages
  for insert to authenticated
  with check (public.current_user_active() and workspace_id=public.current_workspace_id() and public.can_access_conversation(conversation_id));

create policy contacts_read_current on public.contacts
  for select to authenticated
  using (public.current_user_active() and workspace_id=public.current_workspace_id());
create policy contacts_write_current on public.contacts
  for all to authenticated
  using (public.current_user_active() and workspace_id=public.current_workspace_id() and (public.is_management() or owner_id=auth.uid() or owner_id is null))
  with check (public.current_user_active() and workspace_id=public.current_workspace_id() and (public.is_management() or owner_id=auth.uid() or owner_id is null));

create policy contact_identities_read_current on public.contact_identities
  for select to authenticated
  using (public.current_user_active() and workspace_id=public.current_workspace_id());
create policy contact_identities_write_current on public.contact_identities
  for all to authenticated
  using (public.current_user_active() and workspace_id=public.current_workspace_id())
  with check (public.current_user_active() and workspace_id=public.current_workspace_id());

create policy conversation_collaborators_read on public.conversation_collaborators
  for select to authenticated
  using (public.current_user_active() and workspace_id=public.current_workspace_id());
create policy conversation_collaborators_manage on public.conversation_collaborators
  for all to authenticated
  using (public.current_user_active() and workspace_id=public.current_workspace_id() and (public.is_management() or user_id=auth.uid()))
  with check (public.current_user_active() and workspace_id=public.current_workspace_id() and (public.is_management() or user_id=auth.uid()));

create policy conversation_events_read on public.conversation_events
  for select to authenticated
  using (public.current_user_active() and workspace_id=public.current_workspace_id() and public.can_access_conversation(conversation_id));

create policy automation_workflows_read on public.automation_workflows
  for select to authenticated
  using (public.current_user_active() and workspace_id=public.current_workspace_id());
create policy automation_workflows_manage on public.automation_workflows
  for all to authenticated
  using (public.current_user_active() and public.is_management() and workspace_id=public.current_workspace_id())
  with check (public.current_user_active() and public.is_management() and workspace_id=public.current_workspace_id());
create policy automation_runs_read on public.automation_runs
  for select to authenticated
  using (public.current_user_active() and workspace_id=public.current_workspace_id() and public.is_management());

-- Users only execute public operational helpers through the scoped functions.
revoke all on function public.ensure_contact_for_conversation(uuid) from public,anon;
revoke all on function public.log_conversation_event(uuid,text,uuid,jsonb) from public,anon;
revoke all on function public.transition_conversation(uuid,text,timestamptz,text,text,timestamptz,uuid) from public,anon;
revoke all on function public.assign_conversation(uuid,uuid,text,uuid) from public,anon;
revoke all on function public.wake_due_conversations(uuid) from public,anon;
grant execute on function public.transition_conversation(uuid,text,timestamptz,text,text,timestamptz,uuid) to authenticated;
grant execute on function public.assign_conversation(uuid,uuid,text,uuid) to authenticated;
grant execute on function public.wake_due_conversations(uuid) to authenticated;

grant select,insert,update on public.contacts to authenticated;
grant select,insert,update,delete on public.contact_identities to authenticated;
grant select,insert,delete on public.conversation_collaborators to authenticated;
grant select on public.conversation_events to authenticated;
grant select,insert,update,delete on public.automation_workflows to authenticated;
grant select on public.automation_runs to authenticated;

commit;
