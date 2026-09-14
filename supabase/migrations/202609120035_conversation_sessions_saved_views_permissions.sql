-- 202609120035_conversation_sessions_saved_views_permissions.sql
-- Adds durable conversation sessions, reusable Inbox views, operational deadline markers,
-- and a granular workspace permission foundation without breaking legacy role checks.

begin;

-- ---------------------------------------------------------------------------
-- 1. Conversation sessions: one persistent Contact/thread can have many resolved work sessions.
-- ---------------------------------------------------------------------------

create table if not exists public.conversation_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references public.lead_conversations(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null,
  opened_at timestamptz not null default now(),
  first_inbound_at timestamptz,
  first_outbound_at timestamptz,
  last_message_at timestamptz,
  first_response_seconds integer,
  closed_at timestamptz,
  closed_by uuid references public.profiles(id) on delete set null,
  resolution_code text,
  closing_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lead_conversations
  add column if not exists current_session_id uuid references public.conversation_sessions(id) on delete set null,
  add column if not exists sla_breached_at timestamptz,
  add column if not exists sla_warning_sent_at timestamptz,
  add column if not exists next_action_notified_at timestamptz,
  add column if not exists auto_closed_at timestamptz;

alter table public.lead_messages
  add column if not exists session_id uuid references public.conversation_sessions(id) on delete set null;

create index if not exists conversation_sessions_workspace_opened_idx
  on public.conversation_sessions(workspace_id, opened_at desc);
create index if not exists conversation_sessions_conversation_idx
  on public.conversation_sessions(conversation_id, opened_at desc);
create index if not exists conversation_sessions_owner_idx
  on public.conversation_sessions(workspace_id, owner_id, opened_at desc);
create index if not exists conversation_sessions_closed_idx
  on public.conversation_sessions(workspace_id, closed_at, opened_at desc);
create index if not exists lead_messages_session_idx
  on public.lead_messages(session_id, sent_at asc);
create index if not exists lead_conversations_deadline_worker_idx
  on public.lead_conversations(workspace_id, workflow_state, first_response_due_at, snoozed_until, next_action_at);

-- Backfill a single historical/current session for every existing transport conversation.
insert into public.conversation_sessions(
  workspace_id, conversation_id, owner_id, opened_at,
  first_inbound_at, first_outbound_at, last_message_at, first_response_seconds,
  closed_at, closed_by, resolution_code, closing_note
)
select
  c.workspace_id,
  c.id,
  c.assigned_to,
  coalesce(
    (select min(m.sent_at) from public.lead_messages m where m.conversation_id=c.id),
    c.created_at,
    now()
  ),
  (select min(m.sent_at) from public.lead_messages m where m.conversation_id=c.id and m.direction='inbound'),
  (select min(m.sent_at) from public.lead_messages m where m.conversation_id=c.id and m.direction='outbound'),
  coalesce(c.last_message_at, c.updated_at, c.created_at),
  case
    when (select min(m.sent_at) from public.lead_messages m where m.conversation_id=c.id and m.direction='inbound') is not null
     and (select min(m.sent_at) from public.lead_messages m where m.conversation_id=c.id and m.direction='outbound') is not null
    then greatest(0, extract(epoch from (
      (select min(m.sent_at) from public.lead_messages m where m.conversation_id=c.id and m.direction='outbound') -
      (select min(m.sent_at) from public.lead_messages m where m.conversation_id=c.id and m.direction='inbound')
    ))::integer)
    else null
  end,
  case when c.workflow_state='closed' then coalesce(c.closed_at,c.updated_at) else null end,
  case when c.workflow_state='closed' then c.closed_by else null end,
  c.resolution_code,
  c.closing_note
from public.lead_conversations c
where not exists (
  select 1 from public.conversation_sessions s where s.conversation_id=c.id
);

update public.lead_conversations c
set current_session_id = s.id
from lateral (
  select cs.id
  from public.conversation_sessions cs
  where cs.conversation_id=c.id
  order by cs.opened_at desc, cs.id desc
  limit 1
) s
where c.current_session_id is null;

update public.lead_messages m
set session_id = c.current_session_id
from public.lead_conversations c
where m.conversation_id=c.id and m.session_id is null and c.current_session_id is not null;

create or replace function public.ensure_conversation_session(p_conversation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation public.lead_conversations%rowtype;
  v_session public.conversation_sessions%rowtype;
begin
  select * into v_conversation
  from public.lead_conversations
  where id=p_conversation_id
  for update;

  if not found then return null; end if;

  if v_conversation.current_session_id is not null then
    select * into v_session
    from public.conversation_sessions
    where id=v_conversation.current_session_id;
    if found and v_session.closed_at is null then
      return v_session.id;
    end if;
  end if;

  insert into public.conversation_sessions(workspace_id,conversation_id,owner_id,opened_at)
  values (v_conversation.workspace_id,v_conversation.id,v_conversation.assigned_to,now())
  returning * into v_session;

  update public.lead_conversations
  set current_session_id=v_session.id, updated_at=now()
  where id=v_conversation.id;

  return v_session.id;
end;
$$;

create or replace function public.attach_message_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.conversation_id is not null and new.session_id is null then
    new.session_id := public.ensure_conversation_session(new.conversation_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lead_messages_session on public.lead_messages;
create trigger trg_lead_messages_session
before insert on public.lead_messages
for each row execute function public.attach_message_session();

create or replace function public.track_conversation_session_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.session_id is null then return new; end if;

  update public.conversation_sessions
  set first_inbound_at = case when new.direction='inbound' then least(coalesce(first_inbound_at,new.sent_at),new.sent_at) else first_inbound_at end,
      first_outbound_at = case when new.direction='outbound' then least(coalesce(first_outbound_at,new.sent_at),new.sent_at) else first_outbound_at end,
      last_message_at = greatest(coalesce(last_message_at,new.sent_at),new.sent_at),
      updated_at = now()
  where id=new.session_id;

  if new.direction='outbound' then
    update public.conversation_sessions
    set first_response_seconds = case
      when first_inbound_at is not null and first_outbound_at is not null
      then greatest(0,extract(epoch from (first_outbound_at-first_inbound_at))::integer)
      else first_response_seconds
    end,
    updated_at=now()
    where id=new.session_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_track_conversation_session_message on public.lead_messages;
create trigger trg_track_conversation_session_message
after insert on public.lead_messages
for each row execute function public.track_conversation_session_message();

create or replace function public.sync_conversation_session_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
begin
  if new.workflow_state = old.workflow_state then return new; end if;

  if new.workflow_state='closed' and new.current_session_id is not null then
    update public.conversation_sessions
    set closed_at=coalesce(closed_at,coalesce(new.closed_at,now())),
        closed_by=coalesce(new.closed_by,closed_by),
        resolution_code=coalesce(new.resolution_code,resolution_code),
        closing_note=coalesce(new.closing_note,closing_note),
        first_response_seconds=case
          when first_inbound_at is not null and first_outbound_at is not null
          then greatest(0,extract(epoch from (first_outbound_at-first_inbound_at))::integer)
          else first_response_seconds
        end,
        updated_at=now()
    where id=new.current_session_id;
  elsif old.workflow_state='closed' and new.workflow_state <> 'closed' then
    v_session_id := public.ensure_conversation_session(new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_conversation_session_state on public.lead_conversations;
create trigger trg_sync_conversation_session_state
after update of workflow_state on public.lead_conversations
for each row execute function public.sync_conversation_session_state();

create or replace function public.sync_conversation_session_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.current_session_id is not null and new.assigned_to is distinct from old.assigned_to then
    update public.conversation_sessions
    set owner_id=new.assigned_to,updated_at=now()
    where id=new.current_session_id and closed_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_conversation_session_owner on public.lead_conversations;
create trigger trg_sync_conversation_session_owner
after update of assigned_to on public.lead_conversations
for each row execute function public.sync_conversation_session_owner();

-- ---------------------------------------------------------------------------
-- 2. Saved Inbox views.
-- ---------------------------------------------------------------------------

create table if not exists public.conversation_saved_views (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete cascade,
  name text not null,
  filters jsonb not null default '{}'::jsonb,
  is_shared boolean not null default false,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(btrim(name)) between 1 and 80)
);

create unique index if not exists conversation_saved_views_owner_name_uq
  on public.conversation_saved_views(workspace_id,coalesce(owner_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(name));
create index if not exists conversation_saved_views_workspace_idx
  on public.conversation_saved_views(workspace_id,is_shared,sort_order,name);

-- ---------------------------------------------------------------------------
-- 3. Granular permissions with role defaults. Existing role checks stay valid.
-- ---------------------------------------------------------------------------

create table if not exists public.workspace_role_permissions (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  role text not null check (role in ('admin','manager','agent')),
  permissions jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key(workspace_id,role)
);

insert into public.workspace_role_permissions(workspace_id,role,permissions)
select w.id,'admin','{"*":true}'::jsonb from public.workspaces w
on conflict (workspace_id,role) do nothing;
insert into public.workspace_role_permissions(workspace_id,role,permissions)
select w.id,'manager',jsonb_build_object(
  'inbox.view',true,'inbox.assign',true,'inbox.resolve',true,'inbox.saved_views.manage',true,
  'contacts.view',true,'contacts.edit',true,'contacts.merge',true,
  'automations.view',true,'automations.edit',true,'automations.publish',true,
  'reports.view',true,'permissions.view',true,'permissions.manage',false
) from public.workspaces w
on conflict (workspace_id,role) do nothing;
insert into public.workspace_role_permissions(workspace_id,role,permissions)
select w.id,'agent',jsonb_build_object(
  'inbox.view',true,'inbox.assign',false,'inbox.resolve',true,'inbox.saved_views.manage',true,
  'contacts.view',true,'contacts.edit',true,'contacts.merge',false,
  'automations.view',false,'automations.edit',false,'automations.publish',false,
  'reports.view',false,'permissions.view',false,'permissions.manage',false
) from public.workspaces w
on conflict (workspace_id,role) do nothing;

create or replace function public.has_workspace_permission(p_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_permissions jsonb;
begin
  if auth.uid() is null or nullif(btrim(p_key),'') is null then return false; end if;

  select * into v_profile
  from public.profiles
  where id=auth.uid() and is_active=true;
  if not found or v_profile.workspace_id is null then return false; end if;
  if v_profile.role='admin' then return true; end if;

  select permissions into v_permissions
  from public.workspace_role_permissions
  where workspace_id=v_profile.workspace_id and role=v_profile.role;

  if v_permissions ? '*' and coalesce((v_permissions->>'*')::boolean,false) then return true; end if;
  if v_permissions ? p_key then return coalesce((v_permissions->>p_key)::boolean,false); end if;

  -- Safe fallbacks preserve existing behavior when a workspace has not customized permissions yet.
  if v_profile.role='manager' then
    return p_key in (
      'inbox.view','inbox.assign','inbox.resolve','inbox.saved_views.manage',
      'contacts.view','contacts.edit','contacts.merge',
      'automations.view','automations.edit','automations.publish','reports.view','permissions.view'
    );
  end if;
  if v_profile.role='agent' then
    return p_key in ('inbox.view','inbox.resolve','inbox.saved_views.manage','contacts.view','contacts.edit');
  end if;
  return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. RLS.
-- ---------------------------------------------------------------------------

alter table public.conversation_sessions enable row level security;
alter table public.conversation_saved_views enable row level security;
alter table public.workspace_role_permissions enable row level security;

drop policy if exists conversation_sessions_read on public.conversation_sessions;
create policy conversation_sessions_read on public.conversation_sessions
for select to authenticated
using (
  public.current_user_active()
  and workspace_id=public.current_workspace_id()
  and public.can_access_conversation(conversation_id)
);

drop policy if exists conversation_saved_views_read on public.conversation_saved_views;
create policy conversation_saved_views_read on public.conversation_saved_views
for select to authenticated
using (
  public.current_user_active()
  and workspace_id=public.current_workspace_id()
  and (is_shared=true or owner_id=auth.uid() or public.is_management())
);

drop policy if exists conversation_saved_views_write on public.conversation_saved_views;
create policy conversation_saved_views_write on public.conversation_saved_views
for all to authenticated
using (
  public.current_user_active()
  and workspace_id=public.current_workspace_id()
  and (owner_id=auth.uid() or public.is_management())
)
with check (
  public.current_user_active()
  and workspace_id=public.current_workspace_id()
  and (owner_id=auth.uid() or public.is_management())
  and public.has_workspace_permission('inbox.saved_views.manage')
);

drop policy if exists workspace_role_permissions_read on public.workspace_role_permissions;
create policy workspace_role_permissions_read on public.workspace_role_permissions
for select to authenticated
using (
  public.current_user_active()
  and workspace_id=public.current_workspace_id()
  and public.has_workspace_permission('permissions.view')
);

drop policy if exists workspace_role_permissions_write on public.workspace_role_permissions;
create policy workspace_role_permissions_write on public.workspace_role_permissions
for all to authenticated
using (
  public.current_user_active()
  and workspace_id=public.current_workspace_id()
  and public.has_workspace_permission('permissions.manage')
)
with check (
  public.current_user_active()
  and workspace_id=public.current_workspace_id()
  and public.has_workspace_permission('permissions.manage')
);

revoke all on function public.ensure_conversation_session(uuid) from public,anon;
revoke all on function public.has_workspace_permission(text) from public,anon;
grant execute on function public.has_workspace_permission(text) to authenticated;

grant select on public.conversation_sessions to authenticated;
grant select,insert,update,delete on public.conversation_saved_views to authenticated;
grant select,insert,update,delete on public.workspace_role_permissions to authenticated;

commit;
