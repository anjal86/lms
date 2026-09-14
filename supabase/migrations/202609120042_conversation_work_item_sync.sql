-- Keep Inbox next actions synchronized with canonical Work Items regardless of
-- whether the change came from UI, transition RPC, automation, or integration.

begin;

create or replace function public.sync_conversation_next_action_to_work_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_work_item_id uuid;
  v_priority text;
  v_title text;
begin
  select id into v_work_item_id
  from public.work_items
  where workspace_id = new.workspace_id
    and source = 'conversation_next_action'
    and source_id = new.id::text
  limit 1;

  v_priority := case new.priority
    when 'urgent' then 'urgent'
    when 'high' then 'high'
    when 'low' then 'low'
    else 'normal'
  end;
  v_title := 'Conversation follow-up · ' || coalesce(nullif(new.customer_name,''), 'Customer');

  if new.next_action_at is null or new.workflow_state = 'closed' then
    if v_work_item_id is not null then
      update public.work_items
      set status = 'cancelled', due_at = null, updated_at = now()
      where id = v_work_item_id;
    end if;
    return new;
  end if;

  if v_work_item_id is null then
    insert into public.work_items(
      workspace_id, contact_id, lead_id, conversation_id, owner_id,
      type, title, due_at, priority, status, source, source_id, metadata
    ) values (
      new.workspace_id, new.contact_id, new.lead_id, new.id, new.assigned_to,
      'message', v_title, new.next_action_at, v_priority, 'open',
      'conversation_next_action', new.id::text,
      jsonb_build_object('provider',new.provider,'workflow_state',new.workflow_state)
    );
  else
    update public.work_items
    set contact_id = new.contact_id,
        lead_id = new.lead_id,
        conversation_id = new.id,
        owner_id = new.assigned_to,
        type = 'message',
        title = v_title,
        due_at = new.next_action_at,
        priority = v_priority,
        status = 'open',
        completed_at = null,
        metadata = jsonb_build_object('provider',new.provider,'workflow_state',new.workflow_state),
        updated_at = now()
    where id = v_work_item_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_conversation_next_action_work_item on public.lead_conversations;
create trigger trg_conversation_next_action_work_item
after insert or update of next_action_at, workflow_state, assigned_to, lead_id, contact_id, priority, customer_name
on public.lead_conversations
for each row execute function public.sync_conversation_next_action_to_work_item();

-- Backfill current Inbox next actions by touching the relevant rows.
update public.lead_conversations
set updated_at = updated_at
where next_action_at is not null and workflow_state <> 'closed';

-- Completing/cancelling an Inbox-backed work item clears the source next action.
create or replace function public.sync_conversation_work_item_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1
     or new.source <> 'conversation_next_action'
     or new.source_id is null
     or new.status = old.status then
    return new;
  end if;

  if new.status in ('completed','cancelled') then
    update public.lead_conversations
    set next_action_at = null,
        updated_at = now()
    where id::text = new.source_id
      and workspace_id = new.workspace_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_work_item_conversation_completion on public.work_items;
create trigger trg_work_item_conversation_completion
after update of status on public.work_items
for each row execute function public.sync_conversation_work_item_completion();

commit;
