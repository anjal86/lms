-- 202609120031_automation_execution_integrity.sql
-- Allow event-triggered automation runs to execute operational helpers without a
-- human auth.uid(), while preserving the normal workspace/user access checks.

begin;

create or replace function public.automation_run_authorized(
  p_run_id uuid,
  p_conversation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_run_id is not null and exists (
    select 1
    from public.automation_runs ar
    join public.lead_conversations c
      on c.id = ar.conversation_id
     and c.workspace_id = ar.workspace_id
    where ar.id = p_run_id
      and ar.conversation_id = p_conversation_id
      and ar.status = 'running'
      and c.id = p_conversation_id
  );
$$;

revoke all on function public.automation_run_authorized(uuid,uuid) from public,anon,authenticated;

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
  v_is_automation boolean;
begin
  if p_state not in ('open','waiting','snoozed','closed') then
    raise exception 'Invalid conversation state' using errcode='22023';
  end if;

  v_is_automation := public.automation_run_authorized(p_automation_run_id,p_conversation_id);
  if not v_is_automation and not public.can_access_conversation(p_conversation_id) then
    raise exception 'Conversation access denied' using errcode='42501';
  end if;
  if p_automation_run_id is not null and not v_is_automation then
    raise exception 'Automation run is not authorized for this conversation' using errcode='42501';
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
      closed_by = case when p_state='closed' and not v_is_automation then auth.uid() else null end,
      updated_at = now()
  where id = p_conversation_id
  returning * into v_conversation;

  if not found then
    raise exception 'Conversation not found' using errcode='P0002';
  end if;

  v_payload := jsonb_build_object(
    'state',p_state,
    'snoozed_until',p_snoozed_until,
    'resolution_code',p_resolution_code,
    'next_action_at',p_next_action_at
  );
  if v_is_automation then
    v_payload := v_payload || jsonb_build_object('automation_source',p_automation_run_id);
  end if;
  perform public.log_conversation_event(
    p_conversation_id,
    'state_changed',
    case when v_is_automation then null else auth.uid() end,
    v_payload
  );

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
  v_is_automation boolean;
begin
  v_is_automation := public.automation_run_authorized(p_automation_run_id,p_conversation_id);
  if not v_is_automation and not public.can_access_conversation(p_conversation_id) then
    raise exception 'Conversation access denied' using errcode='42501';
  end if;
  if p_automation_run_id is not null and not v_is_automation then
    raise exception 'Automation run is not authorized for this conversation' using errcode='42501';
  end if;

  select * into v_conversation from public.lead_conversations where id=p_conversation_id for update;
  if not found then raise exception 'Conversation not found' using errcode='P0002'; end if;

  if p_assignee_id is not null then
    if not v_is_automation and not public.is_management() and p_assignee_id is distinct from auth.uid() then
      raise exception 'Agents may only claim conversations for themselves' using errcode='42501';
    end if;
    if not exists (
      select 1 from public.profiles p
      where p.id=p_assignee_id and p.workspace_id=v_conversation.workspace_id and p.is_active=true
    ) then
      raise exception 'Assignee is not an active workspace member' using errcode='22023';
    end if;
    v_assignee := p_assignee_id;
  elsif not v_is_automation and not public.is_management() then
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
  if v_is_automation then
    v_payload := v_payload || jsonb_build_object('automation_source',p_automation_run_id);
  end if;
  perform public.log_conversation_event(
    p_conversation_id,
    'assigned',
    case when v_is_automation then null else auth.uid() end,
    v_payload
  );
  return v_assignee;
end;
$$;

revoke all on function public.transition_conversation(uuid,text,timestamptz,text,text,timestamptz,uuid) from public,anon;
revoke all on function public.assign_conversation(uuid,uuid,text,uuid) from public,anon;
grant execute on function public.transition_conversation(uuid,text,timestamptz,text,text,timestamptz,uuid) to authenticated;
grant execute on function public.assign_conversation(uuid,uuid,text,uuid) to authenticated;

commit;
