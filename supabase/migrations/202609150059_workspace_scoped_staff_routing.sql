-- 202609150059_workspace_scoped_staff_routing.sql
-- Routing and conversation ownership must use the member's role in the work's
-- workspace, not the compatibility role/current workspace stored on profiles.

begin;

create or replace function public.route_lead_atomic(
  p_lead_id uuid,
  p_destination text,
  p_excluded_agent uuid default null,
  p_force boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate_id uuid;
  v_workspace_id uuid;
  frt_minutes integer := 30;
  auto_assign boolean := true;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Not authorized';
  end if;

  select workspace_id into v_workspace_id
  from public.leads
  where id = p_lead_id
  for update;

  if v_workspace_id is null then return null; end if;

  select
    coalesce((settings->>'frt_minutes')::integer, 30),
    coalesce((settings->>'auto_assign_enabled')::boolean, true)
  into frt_minutes, auto_assign
  from public.agency_settings
  where id = 'default';

  if not p_force and not coalesce(auto_assign, true) then
    return null;
  end if;

  select p.id
  into candidate_id
  from public.workspace_members wm
  join public.profiles p on p.id = wm.user_id
  where wm.workspace_id = v_workspace_id
    and wm.role = 'agent'
    and wm.is_active = true
    and p.is_active = true
    and p.accepting_leads = true
    and p.status = 'available'
    and (p_excluded_agent is null or p.id <> p_excluded_agent)
    and (
      select count(*)
      from public.leads l
      where l.workspace_id = v_workspace_id
        and l.assigned_to = p.id
        and l.stage not in ('won','lost','junk')
    ) < greatest(coalesce(p.max_capacity,25),1)
  order by
    case when exists (
      select 1
      from unnest(coalesce(p.destination_tags, '{}'::text[])) as tag
      where lower(tag) = 'global'
         or lower(coalesce(p_destination, '')) like '%' || lower(tag) || '%'
         or lower(tag) like '%' || lower(coalesce(p_destination, '')) || '%'
    ) then 0 else 1 end,
    (
      select count(*)::numeric / greatest(coalesce(p.max_capacity,25),1)
      from public.leads l
      where l.workspace_id = v_workspace_id
        and l.assigned_to = p.id
        and l.stage not in ('won','lost','junk')
    ) asc,
    p.updated_at asc,
    p.id asc
  for update of p skip locked
  limit 1;

  if candidate_id is null then return null; end if;

  update public.leads
  set assigned_to = candidate_id,
      assigned_at = now(),
      first_response_due_at = now() + make_interval(mins => greatest(coalesce(frt_minutes, 30), 1)),
      is_first_response_breached = false
  where id = p_lead_id
    and workspace_id = v_workspace_id
    and first_contacted_at is null
    and (assigned_to is null or assigned_to = p_excluded_agent);

  if not found then return null; end if;
  return candidate_id;
end;
$$;

revoke all on function public.route_lead_atomic(uuid,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.route_lead_atomic(uuid,text,uuid,boolean) to service_role;

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

  select coalesce(nullif(p_strategy,''),nullif(w.settings #>> '{conversation_routing,strategy}',''),'least_open'),
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
      'worker_source','sla_recovery'
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
    v_assignee := auth.uid();
  else
    select coalesce(nullif(w.settings #>> '{conversation_routing,strategy}',''),p_strategy,'least_open'),
           coalesce((w.settings #>> '{conversation_routing,online_only}')::boolean,false)
      into v_strategy,v_online_only
    from public.workspaces w
    where w.id=v_conversation.workspace_id;

    v_strategy := coalesce(nullif(p_strategy,''),v_strategy,'least_open');

    select p.id into v_assignee
    from public.workspace_members wm
    join public.profiles p on p.id=wm.user_id
    where wm.workspace_id=v_conversation.workspace_id
      and wm.role='agent'
      and wm.is_active=true
      and p.is_active=true
      and coalesce(p.accepting_leads,true)=true
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
    'strategy',coalesce(v_strategy,p_strategy,'manual')
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

commit;
