-- 202609120033_inbox_operational_views.sql
-- Keeps a cheap, queryable "needs reply" signal in sync with message direction so
-- the unified Inbox can expose a reliable Respond.io-style unreplied view.

begin;

alter table public.lead_conversations
  add column if not exists needs_reply boolean not null default false;

update public.lead_conversations
set needs_reply = last_inbound_at is not null
  and (last_outbound_at is null or last_inbound_at > last_outbound_at);

create index if not exists lead_conversations_workspace_needs_reply_idx
  on public.lead_conversations(workspace_id, needs_reply, workflow_state, last_message_at desc nulls last);

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
        needs_reply = true,
        first_response_due_at = case when first_responded_at is null then coalesce(first_response_due_at,v_due) else first_response_due_at end
    where id = new.conversation_id;
    perform public.log_conversation_event(new.conversation_id,'message_received',new.created_by,jsonb_build_object('message_id',new.id,'provider',new.provider));
  elsif new.direction = 'outbound' then
    update public.lead_conversations
    set last_outbound_at = greatest(coalesce(last_outbound_at,'-infinity'::timestamptz),coalesce(new.sent_at,now())),
        first_responded_at = coalesce(first_responded_at,coalesce(new.sent_at,now())),
        workflow_state = case when workflow_state = 'closed' then 'open' else workflow_state end,
        status = 'open',
        needs_reply = false
    where id = new.conversation_id;
    perform public.log_conversation_event(new.conversation_id,'reply_sent',new.created_by,jsonb_build_object('message_id',new.id,'provider',new.provider));
  elsif new.direction = 'internal' then
    perform public.log_conversation_event(new.conversation_id,'note_added',new.created_by,jsonb_build_object('message_id',new.id));
  end if;
  return new;
end;
$$;

-- Closed work should never remain in an unreplied queue. Reopening leaves the signal
-- alone; a later inbound/outbound message remains the source of truth.
create or replace function public.clear_needs_reply_when_closed()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.workflow_state = 'closed' then
    new.needs_reply := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clear_needs_reply_when_closed on public.lead_conversations;
create trigger trg_clear_needs_reply_when_closed
before insert or update of workflow_state on public.lead_conversations
for each row execute function public.clear_needs_reply_when_closed();

commit;
