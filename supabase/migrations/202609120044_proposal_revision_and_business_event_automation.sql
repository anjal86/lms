-- 202609120044_proposal_revision_and_business_event_automation.sql
-- Atomic proposal revisions and business-event dispatch through the existing
-- automation_workflows / automation_runs engine.

begin;

create or replace function public.create_proposal_revision(
  p_lead_id uuid,
  p_parent_revision_id text,
  p_id text,
  p_quote_number text,
  p_package_title text,
  p_total_selling_price numeric,
  p_total_supplier_cost numeric,
  p_terms text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent public.lead_quotes%rowtype;
  v_revision public.lead_quotes%rowtype;
  v_gross numeric;
  v_margin numeric;
begin
  if not exists (
    select 1 from public.leads l
    where l.id = p_lead_id
      and l.workspace_id = public.current_workspace_id()
      and public.can_manage_lead(l.id)
  ) then
    raise exception 'Opportunity access denied' using errcode = '42501';
  end if;

  select * into v_parent
  from public.lead_quotes q
  where q.lead_id = p_lead_id and q.id = p_parent_revision_id
  for update;
  if not found then raise exception 'Parent proposal revision not found' using errcode = 'P0002'; end if;
  if coalesce(v_parent.status,'draft') not in ('sent','viewed','rejected') then
    raise exception 'Only a sent, viewed, or rejected proposal can be revised' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.lead_quotes q
    where q.lead_id = p_lead_id and q.parent_revision_id = p_parent_revision_id
  ) then
    raise exception 'A revision already exists for this proposal' using errcode = '23505';
  end if;

  v_gross := case when p_total_selling_price is not null and p_total_supplier_cost is not null then p_total_selling_price - p_total_supplier_cost else null end;
  v_margin := case when coalesce(p_total_selling_price,0) <> 0 and v_gross is not null then (v_gross / p_total_selling_price) * 100 else null end;

  insert into public.lead_quotes(
    lead_id,id,quote_number,package_title,status,total_selling_price,total_supplier_cost,
    gross_profit,profit_margin_pct,version,parent_revision_id,terms,created_at,updated_at,payload
  ) values (
    p_lead_id,p_id,p_quote_number,p_package_title,'draft',p_total_selling_price,p_total_supplier_cost,
    v_gross,v_margin,coalesce(v_parent.version,1)+1,p_parent_revision_id,p_terms,now(),now(),
    coalesce(p_payload,'{}'::jsonb) || jsonb_build_object(
      'id',p_id,'status','draft','version',coalesce(v_parent.version,1)+1,
      'parent_revision_id',p_parent_revision_id,'gross_profit',v_gross,'profit_margin_pct',v_margin
    )
  ) returning * into v_revision;

  update public.lead_quotes
  set status = 'revised', updated_at = now(),
      payload = coalesce(payload,'{}'::jsonb) || jsonb_build_object('status','revised','revised_by',p_id)
  where lead_id = p_lead_id and id = p_parent_revision_id;

  return to_jsonb(v_revision);
end;
$$;

revoke all on function public.create_proposal_revision(uuid,text,text,text,text,numeric,numeric,text,jsonb) from public, anon;
grant execute on function public.create_proposal_revision(uuid,text,text,text,text,numeric,numeric,text,jsonb) to authenticated;

-- Extend the existing run ledger so business events use the same automation engine.
alter table public.automation_runs
  add column if not exists business_event_id uuid references public.business_events(id) on delete cascade;
alter table public.automation_runs alter column event_id drop not null;
alter table public.automation_runs alter column conversation_id drop not null;

create unique index if not exists automation_runs_business_event_unique_idx
  on public.automation_runs(workflow_id,business_event_id)
  where business_event_id is not null;

alter table public.automation_runs drop constraint if exists automation_runs_event_source_check;
alter table public.automation_runs add constraint automation_runs_event_source_check
  check (num_nonnulls(event_id,business_event_id) = 1);

create or replace function public.run_business_event_automations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workflow public.automation_workflows%rowtype;
  v_run_id uuid;
  v_action jsonb;
  v_action_type text;
  v_matches boolean;
  v_conversation public.lead_conversations%rowtype;
  v_lead public.leads%rowtype;
  v_contact public.contacts%rowtype;
  v_assignee uuid;
  v_state text;
  v_minutes integer;
  v_tag text;
  v_tags jsonb;
begin
  if new.conversation_id is not null then
    select * into v_conversation from public.lead_conversations
    where id = new.conversation_id and workspace_id = new.workspace_id;
  end if;
  if new.lead_id is not null then
    select * into v_lead from public.leads
    where id = new.lead_id and workspace_id = new.workspace_id;
  end if;
  if new.contact_id is not null then
    select * into v_contact from public.contacts
    where id = new.contact_id and workspace_id = new.workspace_id;
  elsif v_lead.contact_id is not null then
    select * into v_contact from public.contacts
    where id = v_lead.contact_id and workspace_id = new.workspace_id;
  end if;

  for v_workflow in
    select * from public.automation_workflows
    where workspace_id = new.workspace_id
      and is_enabled = true
      and trigger_key in (new.event_type,'*')
    order by sort_order,id
  loop
    v_matches := true;
    if v_workflow.conditions ? 'entity_type' and v_workflow.conditions->>'entity_type' <> new.entity_type then v_matches := false; end if;
    if v_workflow.conditions ? 'has_lead' and (v_workflow.conditions->>'has_lead')::boolean <> (new.lead_id is not null) then v_matches := false; end if;
    if v_workflow.conditions ? 'provider' and coalesce(v_conversation.provider,'') <> v_workflow.conditions->>'provider' then v_matches := false; end if;
    if v_workflow.conditions ? 'priority' and coalesce(v_conversation.priority,v_lead.priority,'') <> v_workflow.conditions->>'priority' then v_matches := false; end if;
    if v_workflow.conditions ? 'lifecycle_key' and coalesce(v_contact.lifecycle_key,'new') <> v_workflow.conditions->>'lifecycle_key' then v_matches := false; end if;

    insert into public.automation_runs(
      workspace_id,workflow_id,event_id,business_event_id,conversation_id,status,idempotency_key,started_at
    ) values (
      new.workspace_id,v_workflow.id,null,new.id,new.conversation_id,
      case when v_matches then 'running' else 'skipped' end,
      v_workflow.id::text || ':business:' || new.id::text,now()
    )
    on conflict do nothing
    returning id into v_run_id;

    if v_run_id is null then continue; end if;
    if not v_matches then
      update public.automation_runs
      set completed_at=now(),result='{"reason":"conditions_not_met"}'::jsonb
      where id=v_run_id;
      continue;
    end if;

    begin
      for v_action in select value from jsonb_array_elements(coalesce(v_workflow.actions,'[]'::jsonb))
      loop
        v_action_type := v_action->>'type';

        if v_action_type='set_priority' and v_action->>'value' in ('low','normal','high','urgent') then
          if new.conversation_id is not null then
            update public.lead_conversations set priority=v_action->>'value',updated_at=now()
            where id=new.conversation_id and workspace_id=new.workspace_id;
          elsif new.lead_id is not null then
            update public.leads set priority=v_action->>'value',updated_at=now()
            where id=new.lead_id and workspace_id=new.workspace_id;
          end if;

        elsif v_action_type='set_state' and new.conversation_id is not null then
          v_state := v_action->>'value';
          if v_state in ('open','waiting','closed') then
            perform public.transition_conversation(new.conversation_id,v_state,null,v_action->>'resolution_code',v_action->>'note',null,v_run_id);
          elsif v_state='snoozed' then
            v_minutes := greatest(1,least(10080,coalesce((v_action->>'minutes')::integer,60)));
            perform public.transition_conversation(new.conversation_id,'snoozed',now()+make_interval(mins=>v_minutes),null,null,null,v_run_id);
          end if;

        elsif v_action_type='assign' then
          v_assignee := nullif(v_action->>'user_id','')::uuid;
          if new.conversation_id is not null then
            perform public.assign_conversation(new.conversation_id,v_assignee,v_action->>'strategy',v_run_id);
          elsif new.lead_id is not null and v_assignee is not null and exists (
            select 1 from public.profiles p where p.id=v_assignee and p.workspace_id=new.workspace_id and p.is_active=true
          ) then
            update public.leads set assigned_to=v_assignee,assigned_at=now(),updated_at=now()
            where id=new.lead_id and workspace_id=new.workspace_id;
          end if;

        elsif v_action_type='set_lifecycle' and v_contact.id is not null and nullif(btrim(v_action->>'value'),'') is not null then
          update public.contacts
          set lifecycle_key=left(btrim(v_action->>'value'),80),updated_at=now()
          where id=v_contact.id and workspace_id=new.workspace_id;

        elsif v_action_type in ('add_tag','remove_tag') and v_contact.id is not null then
          v_tag := nullif(left(btrim(v_action->>'value'),80),'');
          if v_tag is not null then
            select coalesce(tags,'[]'::jsonb) into v_tags from public.contacts where id=v_contact.id for update;
            if v_action_type='add_tag' then
              select coalesce(jsonb_agg(value order by value),'[]'::jsonb) into v_tags
              from (select distinct value from (
                select value from jsonb_array_elements_text(coalesce(v_tags,'[]'::jsonb))
                union all select v_tag
              ) all_tags) distinct_tags;
            else
              select coalesce(jsonb_agg(value order by value),'[]'::jsonb) into v_tags
              from jsonb_array_elements_text(coalesce(v_tags,'[]'::jsonb)) value
              where value <> v_tag;
            end if;
            update public.contacts set tags=v_tags,updated_at=now() where id=v_contact.id;
          end if;

        elsif v_action_type='set_next_action' then
          v_minutes := greatest(1,least(43200,coalesce((v_action->>'minutes')::integer,60)));
          if new.conversation_id is not null then
            update public.lead_conversations
            set next_action_at=now()+make_interval(mins=>v_minutes),next_action_notified_at=null,updated_at=now()
            where id=new.conversation_id and workspace_id=new.workspace_id;
          elsif new.lead_id is not null or v_contact.id is not null then
            insert into public.work_items(
              workspace_id,contact_id,lead_id,owner_id,type,title,due_at,priority,status,source,source_id,metadata
            ) values (
              new.workspace_id,coalesce(new.contact_id,v_lead.contact_id),new.lead_id,coalesce(v_lead.assigned_to,v_contact.owner_id),
              'custom',coalesce(nullif(v_action->>'title',''),'Automation follow-up'),now()+make_interval(mins=>v_minutes),
              'normal','open','automation',v_run_id::text,jsonb_build_object('business_event_id',new.id,'workflow_id',v_workflow.id)
            ) on conflict (workspace_id,source,source_id) where source_id is not null do nothing;
          end if;
        end if;
      end loop;

      update public.automation_runs set status='succeeded',completed_at=now(),result='{"executed":true}'::jsonb where id=v_run_id;
    exception when others then
      update public.automation_runs set status='failed',completed_at=now(),error=sqlerrm where id=v_run_id;
    end;
  end loop;

  update public.business_events set processed_at=coalesce(processed_at,now()) where id=new.id;
  return new;
end;
$$;

revoke all on function public.run_business_event_automations() from public, anon, authenticated;

drop trigger if exists trg_business_event_automations on public.business_events;
create trigger trg_business_event_automations
after insert on public.business_events
for each row execute function public.run_business_event_automations();

commit;
