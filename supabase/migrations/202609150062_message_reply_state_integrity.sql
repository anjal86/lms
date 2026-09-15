-- Keep Inbox reply state correct for live delivery and historical imports.

begin;

create or replace function public.track_message_operations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_due timestamptz;
  v_sent_at timestamptz := coalesce(new.sent_at, now());
  v_historical boolean;
begin
  if new.conversation_id is null then return new; end if;

  v_historical := (
    new.provider = 'whatsapp'
    and coalesce((new.metadata->>'synced_realtime')::boolean, true) = false
  ) or (
    new.provider in ('facebook', 'instagram')
    and (
      coalesce((new.metadata->>'history_backfill')::boolean, false)
      or coalesce((new.metadata->>'history_seed')::boolean, false)
    )
  );

  if v_historical then
    if new.direction = 'inbound' then
      update public.lead_conversations
      set last_inbound_at = greatest(coalesce(last_inbound_at, '-infinity'::timestamptz), v_sent_at),
          needs_reply = workflow_state <> 'closed'
            and greatest(coalesce(last_inbound_at, '-infinity'::timestamptz), v_sent_at)
              > coalesce(last_outbound_at, '-infinity'::timestamptz)
      where id = new.conversation_id;
    elsif new.direction = 'outbound' then
      update public.lead_conversations
      set last_outbound_at = greatest(coalesce(last_outbound_at, '-infinity'::timestamptz), v_sent_at),
          needs_reply = workflow_state <> 'closed'
            and coalesce(last_inbound_at, '-infinity'::timestamptz)
              > greatest(coalesce(last_outbound_at, '-infinity'::timestamptz), v_sent_at)
      where id = new.conversation_id;
    end if;
    return new;
  end if;

  select workspace_id into v_workspace_id
  from public.lead_conversations
  where id = new.conversation_id;

  if new.direction = 'inbound' then
    v_due := public.conversation_first_response_due(v_workspace_id, v_sent_at);
    update public.lead_conversations
    set last_inbound_at = greatest(coalesce(last_inbound_at, '-infinity'::timestamptz), v_sent_at),
        workflow_state = 'open',
        status = 'open',
        snoozed_until = null,
        closed_at = null,
        closed_by = null,
        needs_reply = true,
        first_response_due_at = case
          when first_responded_at is null then coalesce(first_response_due_at, v_due)
          else first_response_due_at
        end
    where id = new.conversation_id;
    if tg_op = 'INSERT' then
      perform public.log_conversation_event(
        new.conversation_id,
        'message_received',
        new.created_by,
        jsonb_build_object('message_id', new.id, 'provider', new.provider)
      );
    end if;
  elsif new.direction = 'outbound' then
    update public.lead_conversations
    set last_outbound_at = greatest(coalesce(last_outbound_at, '-infinity'::timestamptz), v_sent_at),
        first_responded_at = coalesce(first_responded_at, v_sent_at),
        workflow_state = case when workflow_state = 'closed' then 'open' else workflow_state end,
        status = 'open',
        needs_reply = false
    where id = new.conversation_id;
    if tg_op = 'INSERT' then
      perform public.log_conversation_event(
        new.conversation_id,
        'reply_sent',
        new.created_by,
        jsonb_build_object('message_id', new.id, 'provider', new.provider)
      );
    end if;
  elsif new.direction = 'internal' and tg_op = 'INSERT' then
    perform public.log_conversation_event(
      new.conversation_id,
      'note_added',
      new.created_by,
      jsonb_build_object('message_id', new.id)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_track_message_operations on public.lead_messages;
create trigger trg_track_message_operations
after insert or update of conversation_id, direction, sent_at on public.lead_messages
for each row execute function public.track_message_operations();

-- Repair timestamps after messages were moved between workspace-scoped threads.
update public.lead_conversations c
set last_inbound_at = history.last_inbound_at,
    last_outbound_at = history.last_outbound_at
from (
  select conversation_id,
    max(sent_at) filter (where direction = 'inbound') as last_inbound_at,
    max(sent_at) filter (where direction = 'outbound') as last_outbound_at
  from public.lead_messages
  where conversation_id is not null
  group by conversation_id
) history
where c.id = history.conversation_id;

update public.lead_conversations
set needs_reply = workflow_state <> 'closed'
  and last_inbound_at is not null
  and (last_outbound_at is null or last_inbound_at > last_outbound_at);

commit;
