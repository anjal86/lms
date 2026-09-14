-- 202609120047_realtime_assignment_notifications.sql
-- Durable staff assignment notifications delivered through Supabase Realtime.

begin;

create or replace function public.notify_staff_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_recipient uuid;
  v_previous_recipient uuid;
  v_title text;
  v_message text;
  v_type text;
  v_link text;
  v_entity_id text := v_new->>'id';
  v_conversation_id text;
  v_lead_id text;
begin
  case tg_table_name
    when 'leads' then
      v_recipient := nullif(v_new->>'assigned_to', '')::uuid;
      v_previous_recipient := nullif(v_old->>'assigned_to', '')::uuid;
      v_title := 'New opportunity assigned';
      v_message := 'You were assigned ' || coalesce(nullif(v_new->>'customer_name', ''), 'a customer opportunity') || '.';
      v_type := 'lead_assigned';
      v_link := '/my-work/' || v_entity_id;

    when 'lead_conversations' then
      v_recipient := nullif(v_new->>'assigned_to', '')::uuid;
      v_previous_recipient := nullif(v_old->>'assigned_to', '')::uuid;
      v_title := 'Conversation assigned to you';
      v_message := 'You were assigned a conversation with ' || coalesce(nullif(v_new->>'customer_name', ''), 'a customer') || '.';
      v_type := 'reassignment';
      v_link := '/inbox?conversationId=' || v_entity_id;

    when 'work_items' then
      v_recipient := nullif(v_new->>'owner_id', '')::uuid;
      v_previous_recipient := nullif(v_old->>'owner_id', '')::uuid;
      v_title := 'New work assigned';
      v_message := coalesce(nullif(v_new->>'title', ''), 'A new action') || ' was assigned to you.';
      v_type := 'reassignment';
      v_conversation_id := nullif(v_new->>'conversation_id', '');
      v_lead_id := nullif(v_new->>'lead_id', '');
      v_link := case
        when v_conversation_id is not null then '/inbox?conversationId=' || v_conversation_id
        when v_lead_id is not null then '/my-work/' || v_lead_id
        else '/work'
      end;

    when 'post_sale_cases' then
      v_recipient := nullif(v_new->>'owner_id', '')::uuid;
      v_previous_recipient := nullif(v_old->>'owner_id', '')::uuid;
      v_title := 'Case assigned to you';
      v_message := coalesce(nullif(v_new->>'title', ''), 'A customer case') || ' was assigned to you.';
      v_type := 'reassignment';
      v_lead_id := nullif(v_new->>'lead_id', '');
      v_link := case when v_lead_id is not null then '/my-work/' || v_lead_id else '/work' end;

    else
      return new;
  end case;

  -- Notify only for a real assignment or reassignment. Unrelated updates and
  -- unassignments do not create noise.
  if v_recipient is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and v_recipient is not distinct from v_previous_recipient then
    return new;
  end if;

  insert into public.notifications(user_id, title, message, type, link)
  values (v_recipient, v_title, v_message, v_type, v_link);

  return new;
end;
$$;

revoke all on function public.notify_staff_assignment() from public;

-- Opportunity ownership.
drop trigger if exists trg_leads_assignment_notification on public.leads;
create trigger trg_leads_assignment_notification
after insert or update on public.leads
for each row execute function public.notify_staff_assignment();

-- Inbox conversation ownership.
drop trigger if exists trg_conversations_assignment_notification on public.lead_conversations;
create trigger trg_conversations_assignment_notification
after insert or update on public.lead_conversations
for each row execute function public.notify_staff_assignment();

-- Canonical due-work ownership. Follow-ups already synchronize into work_items,
-- so this avoids a second parallel notification path for follow-up assignment.
drop trigger if exists trg_work_items_assignment_notification on public.work_items;
create trigger trg_work_items_assignment_notification
after insert or update on public.work_items
for each row execute function public.notify_staff_assignment();

-- Post-sale/customer case ownership.
drop trigger if exists trg_post_sale_cases_assignment_notification on public.post_sale_cases;
create trigger trg_post_sale_cases_assignment_notification
after insert or update on public.post_sale_cases
for each row execute function public.notify_staff_assignment();

-- Existing client code already subscribes to notifications. Explicitly publish
-- the table so INSERT events can reach the assigned staff member immediately.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'notifications'
     ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$$;

commit;
