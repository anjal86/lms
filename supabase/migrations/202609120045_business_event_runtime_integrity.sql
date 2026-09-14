-- 202609120045_business_event_runtime_integrity.sql
-- Make CRM business events executable, observable and recursion-safe.
-- Migration 044 introduced the dispatcher; this migration supplies explicit
-- entity references, opportunity events and a terminal processing state.

begin;

alter table public.business_events
  add column if not exists lead_id uuid references public.leads(id) on delete cascade,
  add column if not exists contact_id uuid references public.contacts(id) on delete set null,
  add column if not exists conversation_id uuid references public.lead_conversations(id) on delete cascade,
  add column if not exists status text not null default 'pending',
  add column if not exists attempts integer not null default 0,
  add column if not exists available_at timestamptz not null default now(),
  add column if not exists last_error text;

alter table public.business_events drop constraint if exists business_events_status_check;
alter table public.business_events add constraint business_events_status_check
  check (status in ('pending','processing','processed','failed'));
alter table public.business_events drop constraint if exists business_events_attempts_check;
alter table public.business_events add constraint business_events_attempts_check check (attempts >= 0);

create index if not exists business_events_runtime_idx
  on public.business_events(status, available_at, created_at);
create index if not exists business_events_lead_idx
  on public.business_events(workspace_id, lead_id, created_at desc)
  where lead_id is not null;

-- Recover entity references for events emitted before explicit reference columns existed.
update public.business_events be
set lead_id = l.id,
    contact_id = coalesce(be.contact_id, l.contact_id)
from public.leads l
where be.workspace_id = l.workspace_id
  and be.lead_id is null
  and l.id::text = be.payload->>'lead_id';

update public.business_events
set status = case when processed_at is null then 'pending' else 'processed' end
where status is distinct from case when processed_at is null then 'pending' else 'processed' end;

create or replace function public.emit_crm_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace uuid;
  v_type text;
  v_entity text;
  v_entity_id text;
  v_payload jsonb;
  v_lead_id uuid;
  v_contact_id uuid;
  v_conversation_id uuid;
  v_stage_type text;
  v_automation_generated boolean := false;
begin
  if tg_table_name = 'leads' then
    v_workspace := new.workspace_id;
    v_entity := 'opportunity';
    v_entity_id := new.id::text;
    v_lead_id := new.id;
    v_contact_id := new.contact_id;

    if tg_op = 'INSERT' then
      v_type := 'opportunity.created';
    elsif old.stage is distinct from new.stage or old.pipeline_stage_id is distinct from new.pipeline_stage_id then
      if new.pipeline_stage_id is not null then
        select ps.stage_type into v_stage_type from public.pipeline_stages ps where ps.id = new.pipeline_stage_id;
      end if;
      v_stage_type := coalesce(v_stage_type, case when new.stage = 'won' then 'won' when new.stage in ('lost','junk') then 'lost' else 'open' end);
      v_type := case v_stage_type when 'won' then 'opportunity.won' when 'lost' then 'opportunity.lost' else 'opportunity.stage_changed' end;
    elsif old.assigned_to is distinct from new.assigned_to then
      v_type := 'opportunity.assigned';
    elsif old.priority is distinct from new.priority
       or old.contact_id is distinct from new.contact_id
       or old.custom_data is distinct from new.custom_data
       or old.package_sale_price is distinct from new.package_sale_price
       or old.won_deal_value is distinct from new.won_deal_value then
      v_type := 'opportunity.updated';
    else
      return new;
    end if;

    v_payload := jsonb_build_object(
      'lead_id',new.id,
      'contact_id',new.contact_id,
      'stage',new.stage,
      'pipeline_stage_id',new.pipeline_stage_id,
      'assigned_to',new.assigned_to,
      'priority',new.priority
    );

  elsif tg_table_name = 'work_items' then
    v_workspace := new.workspace_id;
    v_entity := 'work_item';
    v_entity_id := new.id::text;
    v_lead_id := new.lead_id;
    v_contact_id := new.contact_id;
    v_conversation_id := new.conversation_id;
    v_automation_generated := new.source = 'automation';
    v_type := case when tg_op = 'INSERT' then 'work_item.created'
                   when old.status is distinct from new.status then 'work_item.' || new.status
                   else 'work_item.updated' end;
    v_payload := jsonb_build_object(
      'lead_id',new.lead_id,
      'contact_id',new.contact_id,
      'conversation_id',new.conversation_id,
      'owner_id',new.owner_id,
      'due_at',new.due_at,
      'type',new.type,
      'status',new.status,
      'automation_generated',v_automation_generated
    );

  elsif tg_table_name = 'lead_quotes' then
    select l.workspace_id,l.contact_id into v_workspace,v_contact_id from public.leads l where l.id = new.lead_id;
    v_entity := 'proposal';
    v_entity_id := new.lead_id::text || ':' || new.id;
    v_lead_id := new.lead_id;
    v_type := case when tg_op = 'INSERT' then 'proposal.created'
                   when old.status is distinct from new.status then 'proposal.' || new.status
                   else 'proposal.updated' end;
    v_payload := jsonb_build_object('lead_id',new.lead_id,'contact_id',v_contact_id,'quote_id',new.id,'status',new.status,'version',new.version);

  elsif tg_table_name = 'lead_documents' then
    select l.workspace_id,l.contact_id into v_workspace,v_contact_id from public.leads l where l.id = new.lead_id;
    v_entity := 'document';
    v_entity_id := new.lead_id::text || ':' || new.id;
    v_lead_id := new.lead_id;
    v_type := case when tg_op = 'INSERT' then 'document.created'
                   when old.lifecycle_status is distinct from new.lifecycle_status then 'document.' || new.lifecycle_status
                   else 'document.updated' end;
    v_payload := jsonb_build_object('lead_id',new.lead_id,'contact_id',v_contact_id,'document_id',new.id,'document_type',new.document_type,'status',new.lifecycle_status);

  elsif tg_table_name = 'post_sale_cases' then
    v_workspace := new.workspace_id;
    v_entity := 'case';
    v_entity_id := new.id::text;
    v_lead_id := new.lead_id;
    v_contact_id := new.contact_id;
    v_type := case when tg_op = 'INSERT' then 'case.created'
                   when old.status is distinct from new.status then 'case.' || new.status
                   else 'case.updated' end;
    v_payload := jsonb_build_object('lead_id',new.lead_id,'contact_id',new.contact_id,'case_type',new.case_type,'status',new.status,'owner_id',new.owner_id);
  else
    return new;
  end if;

  insert into public.business_events(
    workspace_id,event_type,entity_type,entity_id,actor_id,payload,
    lead_id,contact_id,conversation_id,status,available_at
  ) values (
    v_workspace,v_type,v_entity,v_entity_id,auth.uid(),coalesce(v_payload,'{}'::jsonb),
    v_lead_id,v_contact_id,v_conversation_id,'pending',now()
  );
  return new;
end;
$$;

revoke all on function public.emit_crm_event() from public,anon,authenticated;

drop trigger if exists trg_lead_business_event on public.leads;
create trigger trg_lead_business_event
after insert or update of stage,pipeline_stage_id,assigned_to,priority,contact_id,custom_data,package_sale_price,won_deal_value
on public.leads
for each row execute function public.emit_crm_event();

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
  v_owner uuid;
  v_state text;
  v_minutes integer;
  v_tag text;
  v_tags jsonb;
  v_source_id text;
  v_failed boolean := false;
  v_last_error text;
begin
  -- Work Items created by an automation still produce an audit event, but they must not
  -- recursively fire the same CRM automation graph.
  if coalesce((new.payload->>'automation_generated')::boolean,false) then
    update public.business_events
    set status='processed', processed_at=coalesce(processed_at,now()), attempts=attempts+1, last_error=null
    where id=new.id;
    return new;
  end if;

  update public.business_events
  set status='processing', attempts=attempts+1, last_error=null
  where id=new.id;

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
    v_run_id := null;
    v_matches := true;
    if v_workflow.conditions ? 'entity_type' and v_workflow.conditions->>'entity_type' <> new.entity_type then v_matches := false; end if;
    if v_workflow.conditions ? 'has_lead' and (v_workflow.conditions->>'has_lead')::boolean <> (new.lead_id is not null) then v_matches := false; end if;
    if v_workflow.conditions ? 'provider' and coalesce(v_conversation.provider,'') <> v_workflow.conditions->>'provider' then v_matches := false; end if;
    if v_workflow.conditions ? 'priority' and coalesce(v_conversation.priority,v_lead.priority,'') <> v_workflow.conditions->>'priority' then v_matches := false; end if;
    if v_workflow.conditions ? 'workflow_state' and coalesce(v_conversation.workflow_state,'') <> v_workflow.conditions->>'workflow_state' then v_matches := false; end if;
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
            where id=new.conversation_id and workspace_id=new.workspace_id
              and priority is distinct from v_action->>'value';
          elsif new.lead_id is not null then
            update public.leads set priority=v_action->>'value',updated_at=now()
            where id=new.lead_id and workspace_id=new.workspace_id
              and priority is distinct from v_action->>'value';
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
          elsif new.lead_id is not null then
            if v_assignee is null then
              raise exception 'Opportunity assignment automation requires a user_id' using errcode='22023';
            end if;
            if not exists (
              select 1 from public.profiles p
              where p.id=v_assignee and p.workspace_id=new.workspace_id and p.is_active=true
            ) then
              raise exception 'Automation assignee is not an active workspace member' using errcode='22023';
            end if;
            update public.leads
            set assigned_to=v_assignee,assigned_at=now(),updated_at=now()
            where id=new.lead_id and workspace_id=new.workspace_id
              and assigned_to is distinct from v_assignee;
          end if;

        elsif v_action_type='set_lifecycle' and v_contact.id is not null and nullif(btrim(v_action->>'value'),'') is not null then
          update public.contacts
          set lifecycle_key=left(btrim(v_action->>'value'),80),updated_at=now()
          where id=v_contact.id and workspace_id=new.workspace_id
            and lifecycle_key is distinct from left(btrim(v_action->>'value'),80);

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
            v_owner := coalesce(v_lead.assigned_to,v_contact.owner_id);
            if v_owner is not null and not exists (
              select 1 from public.profiles p where p.id=v_owner and p.workspace_id=new.workspace_id and p.is_active=true
            ) then
              v_owner := null;
            end if;
            v_source_id := 'workflow:' || v_workflow.id::text || ':entity:' || coalesce(new.lead_id::text,new.contact_id::text,new.entity_id);
            insert into public.work_items(
              workspace_id,contact_id,lead_id,owner_id,type,title,due_at,priority,status,source,source_id,metadata
            ) values (
              new.workspace_id,coalesce(new.contact_id,v_lead.contact_id),new.lead_id,v_owner,
              'custom',coalesce(nullif(v_action->>'title',''),'Automation follow-up'),now()+make_interval(mins=>v_minutes),
              'normal','open','automation',v_source_id,jsonb_build_object('business_event_id',new.id,'workflow_id',v_workflow.id)
            )
            on conflict (workspace_id,source,source_id) where source_id is not null
            do update set
              contact_id=excluded.contact_id,
              lead_id=excluded.lead_id,
              owner_id=excluded.owner_id,
              title=excluded.title,
              due_at=excluded.due_at,
              status='open',
              completed_at=null,
              metadata=excluded.metadata,
              updated_at=now();
          end if;
        end if;
      end loop;

      update public.automation_runs
      set status='succeeded',completed_at=now(),result='{"executed":true}'::jsonb,error=null
      where id=v_run_id;
    exception when others then
      v_failed := true;
      v_last_error := sqlerrm;
      update public.automation_runs set status='failed',completed_at=now(),error=sqlerrm where id=v_run_id;
    end;
  end loop;

  update public.business_events
  set status=case when v_failed then 'failed' else 'processed' end,
      processed_at=now(),
      last_error=case when v_failed then v_last_error else null end
  where id=new.id;
  return new;
end;
$$;

revoke all on function public.run_business_event_automations() from public,anon,authenticated;

-- Rebind all CRM event triggers to the updated emitter/dispatcher.
drop trigger if exists trg_business_event_automations on public.business_events;
create trigger trg_business_event_automations
after insert on public.business_events
for each row execute function public.run_business_event_automations();

-- Reviewable suggestions may be approved/rejected by any user who can access the
-- linked opportunity. Insertion remains restricted to management or the requester.
drop policy if exists ai_suggestions_write_scoped on public.ai_suggestions;
drop policy if exists ai_suggestions_insert_scoped on public.ai_suggestions;
drop policy if exists ai_suggestions_update_scoped on public.ai_suggestions;
drop policy if exists ai_suggestions_delete_scoped on public.ai_suggestions;

create policy ai_suggestions_insert_scoped on public.ai_suggestions
  for insert to authenticated
  with check (
    public.current_user_active()
    and workspace_id=public.current_workspace_id()
    and (public.is_management() or requested_by=auth.uid())
  );

create policy ai_suggestions_update_scoped on public.ai_suggestions
  for update to authenticated
  using (
    public.current_user_active()
    and workspace_id=public.current_workspace_id()
    and (
      public.is_management()
      or requested_by=auth.uid()
      or (lead_id is not null and public.can_access_lead(lead_id))
    )
  )
  with check (
    public.current_user_active()
    and workspace_id=public.current_workspace_id()
    and (
      public.is_management()
      or requested_by=auth.uid()
      or (lead_id is not null and public.can_access_lead(lead_id))
    )
  );

create policy ai_suggestions_delete_scoped on public.ai_suggestions
  for delete to authenticated
  using (
    public.current_user_active()
    and workspace_id=public.current_workspace_id()
    and (public.is_management() or requested_by=auth.uid())
  );

commit;
