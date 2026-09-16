-- Workspace-scoped conversation teams and team-aware assignment.
-- Converts the existing lead_conversations.team_key field into a real routing boundary.

begin;

create table if not exists public.conversation_teams (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  team_key text not null,
  name text not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, team_key)
);

create table if not exists public.conversation_team_members (
  team_id uuid not null references public.conversation_teams(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key(team_id, user_id)
);

create index if not exists conversation_teams_workspace_idx
  on public.conversation_teams(workspace_id, is_active, sort_order, name);
create index if not exists conversation_team_members_workspace_user_idx
  on public.conversation_team_members(workspace_id, user_id, is_active);

create or replace function public.validate_conversation_team_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_workspace uuid;
begin
  select workspace_id into v_team_workspace
  from public.conversation_teams
  where id = new.team_id;

  if v_team_workspace is null or v_team_workspace is distinct from new.workspace_id then
    raise exception 'Conversation team workspace mismatch' using errcode='23514';
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    join public.profiles p on p.id = wm.user_id
    where wm.workspace_id = new.workspace_id
      and wm.user_id = new.user_id
      and wm.role = 'agent'
      and wm.is_active = true
      and p.is_active = true
  ) then
    raise exception 'Conversation team member must be an active workspace agent' using errcode='23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_conversation_team_member on public.conversation_team_members;
create trigger trg_validate_conversation_team_member
before insert or update on public.conversation_team_members
for each row execute function public.validate_conversation_team_member();

alter table public.conversation_teams enable row level security;
alter table public.conversation_team_members enable row level security;

drop policy if exists conversation_teams_select on public.conversation_teams;
create policy conversation_teams_select on public.conversation_teams
for select to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists conversation_teams_manage on public.conversation_teams;
create policy conversation_teams_manage on public.conversation_teams
for all to authenticated
using (workspace_id = public.current_workspace_id() and public.is_management())
with check (workspace_id = public.current_workspace_id() and public.is_management());

drop policy if exists conversation_team_members_select on public.conversation_team_members;
create policy conversation_team_members_select on public.conversation_team_members
for select to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists conversation_team_members_manage on public.conversation_team_members;
create policy conversation_team_members_manage on public.conversation_team_members
for all to authenticated
using (workspace_id = public.current_workspace_id() and public.is_management())
with check (workspace_id = public.current_workspace_id() and public.is_management());

grant select, insert, update, delete on public.conversation_teams to authenticated, service_role;
grant select, insert, update, delete on public.conversation_team_members to authenticated, service_role;

create or replace function public.conversation_agent_in_team(
  p_workspace_id uuid,
  p_team_key text,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when nullif(btrim(p_team_key), '') is null then true
    else exists (
      select 1
      from public.conversation_teams t
      join public.conversation_team_members tm
        on tm.team_id = t.id
       and tm.workspace_id = t.workspace_id
      where t.workspace_id = p_workspace_id
        and t.team_key = p_team_key
        and t.is_active = true
        and tm.user_id = p_user_id
        and tm.is_active = true
    )
  end;
$$;

revoke all on function public.conversation_agent_in_team(uuid,text,uuid) from public, anon;
grant execute on function public.conversation_agent_in_team(uuid,text,uuid) to authenticated, service_role;

create or replace function public.assign_conversation_worker(
  p_conversation_id uuid,
  p_strategy text default null
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
begin
  select * into v_conversation
  from public.lead_conversations
  where id=p_conversation_id
  for update;
  if not found then return null; end if;

  select coalesce(nullif(p_strategy,''),nullif(w.settings #>> '{conversation_routing,strategy}',''),'workload_balanced'),
         coalesce((w.settings #>> '{conversation_routing,online_only}')::boolean,false)
    into v_strategy,v_online_only
  from public.workspaces w
  where w.id=v_conversation.workspace_id;

  select p.id into v_assignee
  from public.workspace_members wm
  join public.profiles p on p.id=wm.user_id
  where wm.workspace_id=v_conversation.workspace_id
    and wm.role='agent'
    and wm.is_active=true
    and p.is_active=true
    and coalesce(p.accepting_leads,true)=true
    and p.id is distinct from v_conversation.assigned_to
    and public.conversation_agent_in_team(v_conversation.workspace_id, v_conversation.team_key, p.id)
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
  for update of p skip locked;

  if v_assignee is null then return null; end if;

  update public.lead_conversations
  set assigned_to=v_assignee,updated_at=now()
  where id=p_conversation_id;

  update public.profiles set last_assigned_at=now() where id=v_assignee;

  perform public.log_conversation_event(
    p_conversation_id,
    'assigned',
    null,
    jsonb_build_object(
      'assigned_to',v_assignee,
      'previous_assignee',v_conversation.assigned_to,
      'strategy',v_strategy,
      'team_key',v_conversation.team_key,
      'worker_source','routing_worker'
    )
  );
  return v_assignee;
end;
$$;

revoke all on function public.assign_conversation_worker(uuid,text) from public,anon,authenticated;
grant execute on function public.assign_conversation_worker(uuid,text) to service_role;

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

  select * into v_conversation
  from public.lead_conversations
  where id=p_conversation_id
  for update;
  if not found then
    raise exception 'Conversation not found' using errcode='P0002';
  end if;

  if p_assignee_id is not null
     and v_conversation.assigned_to is not distinct from p_assignee_id then
    return v_conversation.assigned_to;
  end if;

  if p_automation_run_id is not null
     and v_conversation.provider = 'whatsapp'
     and v_conversation.assigned_to is not null then
    return v_conversation.assigned_to;
  end if;

  if p_automation_run_id is not null
     and p_assignee_id is null
     and v_conversation.assigned_to is not null then
    return v_conversation.assigned_to;
  end if;

  if not public.is_management()
     and p_automation_run_id is null
     and v_conversation.assigned_to is not null
     and v_conversation.assigned_to is distinct from auth.uid() then
    raise exception 'Conversation is already assigned to another agent' using errcode='42501';
  end if;

  if p_assignee_id is not null then
    if not public.is_management() and p_assignee_id is distinct from auth.uid() then
      raise exception 'Agents may only claim conversations for themselves' using errcode='42501';
    end if;
    if not exists (
      select 1
      from public.workspace_members wm
      join public.profiles p on p.id=wm.user_id
      where wm.workspace_id=v_conversation.workspace_id
        and wm.user_id=p_assignee_id
        and wm.is_active=true
        and p.is_active=true
    ) then
      raise exception 'Assignee is not an active workspace member' using errcode='22023';
    end if;
    if not public.conversation_agent_in_team(v_conversation.workspace_id, v_conversation.team_key, p_assignee_id) then
      raise exception 'Assignee is not a member of the conversation team' using errcode='22023';
    end if;
    v_assignee := p_assignee_id;
  elsif not public.is_management() then
    if not exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id=v_conversation.workspace_id
        and wm.user_id=auth.uid()
        and wm.is_active=true
    ) then
      raise exception 'Workspace membership is not active' using errcode='42501';
    end if;
    if not public.conversation_agent_in_team(v_conversation.workspace_id, v_conversation.team_key, auth.uid()) then
      raise exception 'You are not a member of the conversation team' using errcode='42501';
    end if;
    v_assignee := auth.uid();
  else
    select coalesce(nullif(w.settings #>> '{conversation_routing,strategy}',''),p_strategy,'workload_balanced'),
           coalesce((w.settings #>> '{conversation_routing,online_only}')::boolean,false)
      into v_strategy,v_online_only
    from public.workspaces w
    where w.id=v_conversation.workspace_id;

    v_strategy := coalesce(nullif(p_strategy,''),v_strategy,'workload_balanced');

    select p.id into v_assignee
    from public.workspace_members wm
    join public.profiles p on p.id=wm.user_id
    where wm.workspace_id=v_conversation.workspace_id
      and wm.role='agent'
      and wm.is_active=true
      and p.is_active=true
      and coalesce(p.accepting_leads,true)=true
      and public.conversation_agent_in_team(v_conversation.workspace_id, v_conversation.team_key, p.id)
      and (not v_online_only or p.status='available')
      and (
        select count(*)
        from public.lead_conversations c
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
    for update of p skip locked;
  end if;

  if v_assignee is null then return null; end if;

  update public.lead_conversations
  set assigned_to=v_assignee,
      updated_at=now()
  where id=p_conversation_id;

  update public.profiles
  set last_assigned_at=now()
  where id=v_assignee;

  v_payload := jsonb_build_object(
    'assigned_to',v_assignee,
    'previous_assignee',v_conversation.assigned_to,
    'strategy',coalesce(v_strategy,p_strategy,'manual'),
    'team_key',v_conversation.team_key
  );
  if p_automation_run_id is not null then
    v_payload := v_payload || jsonb_build_object('automation_source',p_automation_run_id);
  end if;
  perform public.log_conversation_event(p_conversation_id,'assigned',auth.uid(),v_payload);
  return v_assignee;
end;
$$;

revoke all on function public.assign_conversation(uuid,uuid,text,uuid) from public;
grant execute on function public.assign_conversation(uuid,uuid,text,uuid) to authenticated, service_role;

create or replace function public.set_conversation_team(
  p_conversation_id uuid,
  p_team_key text default null,
  p_route boolean default true,
  p_strategy text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation public.lead_conversations%rowtype;
  v_team_key text := nullif(btrim(p_team_key), '');
  v_assignee uuid;
begin
  if not public.can_access_conversation(p_conversation_id) or not public.is_management() then
    raise exception 'Manager access required' using errcode='42501';
  end if;

  select * into v_conversation
  from public.lead_conversations
  where id = p_conversation_id
  for update;
  if not found then
    raise exception 'Conversation not found' using errcode='P0002';
  end if;

  if v_team_key is not null and not exists (
    select 1 from public.conversation_teams t
    where t.workspace_id = v_conversation.workspace_id
      and t.team_key = v_team_key
      and t.is_active = true
  ) then
    raise exception 'Conversation team not found' using errcode='22023';
  end if;

  v_assignee := v_conversation.assigned_to;
  if v_assignee is not null
     and not public.conversation_agent_in_team(v_conversation.workspace_id, v_team_key, v_assignee) then
    v_assignee := null;
  end if;

  update public.lead_conversations
  set team_key = v_team_key,
      assigned_to = v_assignee,
      updated_at = now()
  where id = p_conversation_id;

  perform public.log_conversation_event(
    p_conversation_id,
    'team_changed',
    auth.uid(),
    jsonb_build_object('from', v_conversation.team_key, 'team_key', v_team_key)
  );

  if p_route and v_assignee is null and v_team_key is not null then
    v_assignee := public.assign_conversation(p_conversation_id, null, p_strategy, null);
  end if;

  return v_assignee;
end;
$$;

revoke all on function public.set_conversation_team(uuid,text,boolean,text) from public, anon;
grant execute on function public.set_conversation_team(uuid,text,boolean,text) to authenticated, service_role;

commit;
