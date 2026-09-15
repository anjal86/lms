-- 202609150053_whatsapp_single_owner_assignment.sql
-- Prevent WhatsApp history/backfill from behaving like live inbound traffic and
-- keep strategy-based automation assignment sticky once a conversation has an owner.

begin;

-- Historical WhatsApp rows are factual message history only. They must not reopen
-- conversations, reset SLA state, emit message_received/reply_sent events, or run
-- assignment automations. Keep last inbound/outbound timestamps accurate without
-- triggering live operational side effects.
create or replace function public.track_message_operations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_due timestamptz;
  v_whatsapp_historical boolean;
begin
  if new.conversation_id is null then return new; end if;

  v_whatsapp_historical := new.provider = 'whatsapp'
    and coalesce((new.metadata->>'synced_realtime')::boolean, true) = false;

  if v_whatsapp_historical then
    if new.direction = 'inbound' then
      update public.lead_conversations
      set last_inbound_at = greatest(
            coalesce(last_inbound_at,'-infinity'::timestamptz),
            coalesce(new.sent_at,now())
          )
      where id = new.conversation_id;
    elsif new.direction = 'outbound' then
      update public.lead_conversations
      set last_outbound_at = greatest(
            coalesce(last_outbound_at,'-infinity'::timestamptz),
            coalesce(new.sent_at,now())
          )
      where id = new.conversation_id;
    end if;
    return new;
  end if;

  select workspace_id into v_workspace_id
  from public.lead_conversations
  where id = new.conversation_id;

  if new.direction = 'inbound' then
    v_due := public.conversation_first_response_due(v_workspace_id, coalesce(new.sent_at,now()));
    update public.lead_conversations
    set last_inbound_at = greatest(coalesce(last_inbound_at,'-infinity'::timestamptz),coalesce(new.sent_at,now())),
        workflow_state = 'open',
        status = 'open',
        snoozed_until = null,
        closed_at = null,
        closed_by = null,
        first_response_due_at = case when first_responded_at is null then coalesce(first_response_due_at,v_due) else first_response_due_at end
    where id = new.conversation_id;
    perform public.log_conversation_event(
      new.conversation_id,
      'message_received',
      new.created_by,
      jsonb_build_object('message_id',new.id,'provider',new.provider)
    );
  elsif new.direction = 'outbound' then
    update public.lead_conversations
    set last_outbound_at = greatest(coalesce(last_outbound_at,'-infinity'::timestamptz),coalesce(new.sent_at,now())),
        first_responded_at = coalesce(first_responded_at,coalesce(new.sent_at,now())),
        workflow_state = case when workflow_state = 'closed' then 'open' else workflow_state end,
        status = 'open'
    where id = new.conversation_id;
    perform public.log_conversation_event(
      new.conversation_id,
      'reply_sent',
      new.created_by,
      jsonb_build_object('message_id',new.id,'provider',new.provider)
    );
  elsif new.direction = 'internal' then
    perform public.log_conversation_event(
      new.conversation_id,
      'note_added',
      new.created_by,
      jsonb_build_object('message_id',new.id)
    );
  end if;
  return new;
end;
$$;

-- Strategy-based automation routing is intended to claim unowned work. Once a
-- conversation has an owner, future inbound messages/history must not round-robin
-- it to somebody else. Explicit manual assignment and explicit automation user_id
-- assignment remain supported.
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

  -- Idempotent explicit assignment: do not create duplicate assignment events.
  if p_assignee_id is not null
     and v_conversation.assigned_to is not distinct from p_assignee_id then
    return v_conversation.assigned_to;
  end if;

  -- Automation strategy assignment is sticky. A workflow may explicitly provide
  -- user_id to intentionally reassign, but strategy-only routing cannot bounce an
  -- already-owned conversation between agents on every message event.
  if p_automation_run_id is not null
     and p_assignee_id is null
     and v_conversation.assigned_to is not null then
    return v_conversation.assigned_to;
  end if;

  if p_assignee_id is not null then
    if not public.is_management() and p_assignee_id is distinct from auth.uid() then
      raise exception 'Agents may only claim conversations for themselves' using errcode='42501';
    end if;
    if not exists (
      select 1 from public.profiles p
      where p.id=p_assignee_id
        and p.workspace_id=v_conversation.workspace_id
        and p.is_active=true
    ) then
      raise exception 'Assignee is not an active workspace member' using errcode='22023';
    end if;
    v_assignee := p_assignee_id;
  elsif not public.is_management() then
    v_assignee := auth.uid();
  else
    select coalesce(nullif(w.settings #>> '{conversation_routing,strategy}',''),p_strategy,'least_open'),
           coalesce((w.settings #>> '{conversation_routing,online_only}')::boolean,false)
      into v_strategy,v_online_only
    from public.workspaces w
    where w.id=v_conversation.workspace_id;

    v_strategy := coalesce(nullif(p_strategy,''),v_strategy,'least_open');

    select p.id into v_assignee
    from public.profiles p
    where p.workspace_id=v_conversation.workspace_id
      and p.is_active=true
      and p.role='agent'
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
    for update skip locked;
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
