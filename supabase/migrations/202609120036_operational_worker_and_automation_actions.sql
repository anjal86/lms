-- 202609120036_operational_worker_and_automation_actions.sql
-- Adds service-worker-safe conversation routing and richer deterministic automation actions.

begin;

-- A narrow service-role helper for SLA recovery. Human and workflow assignment continue
-- to use assign_conversation(); this helper exists only for the authenticated cron worker.
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
  from public.profiles p
  where p.workspace_id=v_conversation.workspace_id
    and p.is_active=true
    and p.role='agent'
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
  for update skip locked;

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

-- Deterministic local actions are executed transactionally. Network/delayed actions are
-- intentionally left out of PostgreSQL so the database never performs external I/O.
create or replace function public.run_conversation_automations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workflow public.automation_workflows%rowtype;
  v_conversation public.lead_conversations%rowtype;
  v_contact public.contacts%rowtype;
  v_action jsonb;
  v_run_id uuid;
  v_matches boolean;
  v_action_type text;
  v_state text;
  v_minutes integer;
  v_assignee uuid;
  v_tag text;
  v_tags jsonb;
  v_next_action_minutes integer;
begin
  if new.payload ? 'automation_source' then return new; end if;
  select * into v_conversation from public.lead_conversations where id=new.conversation_id;
  if not found then return new; end if;
  if v_conversation.contact_id is not null then
    select * into v_contact from public.contacts where id=v_conversation.contact_id;
  end if;

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
    if v_workflow.conditions ? 'lifecycle_key' and coalesce(v_contact.lifecycle_key,'new') <> v_workflow.conditions->>'lifecycle_key' then v_matches := false; end if;

    insert into public.automation_runs(workspace_id,workflow_id,event_id,conversation_id,status,idempotency_key,started_at)
    values (
      new.workspace_id,v_workflow.id,new.id,new.conversation_id,
      case when v_matches then 'running' else 'skipped' end,
      v_workflow.id::text || ':' || new.id::text,now()
    )
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

        elsif v_action_type='set_lifecycle' and v_conversation.contact_id is not null and nullif(btrim(v_action->>'value'),'') is not null then
          update public.contacts
          set lifecycle_key=left(btrim(v_action->>'value'),80),updated_at=now()
          where id=v_conversation.contact_id and workspace_id=new.workspace_id;
          perform public.log_conversation_event(new.conversation_id,'lifecycle_changed',null,jsonb_build_object('lifecycle_key',left(btrim(v_action->>'value'),80),'automation_source',v_run_id));

        elsif v_action_type in ('add_tag','remove_tag') and v_conversation.contact_id is not null then
          v_tag := nullif(left(btrim(v_action->>'value'),80),'');
          if v_tag is not null then
            select coalesce(tags,'[]'::jsonb) into v_tags from public.contacts where id=v_conversation.contact_id for update;
            if v_action_type='add_tag' then
              select coalesce(jsonb_agg(value order by value),'[]'::jsonb) into v_tags
              from (
                select distinct value from (
                  select value from jsonb_array_elements_text(coalesce(v_tags,'[]'::jsonb))
                  union all select v_tag
                ) all_tags
              ) distinct_tags;
            else
              select coalesce(jsonb_agg(value order by value),'[]'::jsonb) into v_tags
              from jsonb_array_elements_text(coalesce(v_tags,'[]'::jsonb)) value
              where value <> v_tag;
            end if;
            update public.contacts set tags=v_tags,updated_at=now() where id=v_conversation.contact_id;
            perform public.log_conversation_event(new.conversation_id,'contact_tag_changed',null,jsonb_build_object('action',v_action_type,'tag',v_tag,'automation_source',v_run_id));
          end if;

        elsif v_action_type='set_next_action' then
          v_next_action_minutes := greatest(1,least(43200,coalesce((v_action->>'minutes')::integer,60)));
          update public.lead_conversations
          set next_action_at=now()+make_interval(mins=>v_next_action_minutes),next_action_notified_at=null,updated_at=now()
          where id=new.conversation_id;
          perform public.log_conversation_event(new.conversation_id,'next_action_changed',null,jsonb_build_object('minutes',v_next_action_minutes,'automation_source',v_run_id));
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

commit;
