-- Coordinate existing human auto-routing with workspace AI agents.
-- Auto/auto_handoff AI owns first response until explicit handoff.
-- Assist mode keeps normal human routing and can still prepare drafts for owned chats.

begin;

create or replace function public.route_live_inbound_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_connection_id uuid;
  v_assigned_to uuid;
  v_settings jsonb;
  v_historical boolean;
  v_ai_auto boolean := false;
begin
  if new.conversation_id is null or new.direction <> 'inbound' then
    return new;
  end if;

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
  if v_historical then return new; end if;

  select c.workspace_id, c.connection_id, c.assigned_to
    into v_workspace_id, v_connection_id, v_assigned_to
  from public.lead_conversations c
  where c.id = new.conversation_id;

  if v_workspace_id is null or v_assigned_to is not null then return new; end if;

  select exists (
    select 1
    from public.ai_agent_connections ac
    join public.ai_agents a on a.id = ac.agent_id and a.workspace_id = ac.workspace_id
    where ac.workspace_id = v_workspace_id
      and ac.connection_id = v_connection_id
      and ac.is_enabled = true
      and a.is_active = true
      and a.mode in ('auto','auto_handoff')
  ) into v_ai_auto;

  -- An autonomous AI agent owns the first-response window. Human routing happens
  -- later only when the agent hands off or a manager explicitly takes over.
  if v_ai_auto then return new; end if;

  select w.settings into v_settings
  from public.workspaces w
  where w.id = v_workspace_id;

  if coalesce((v_settings #>> '{conversation_routing,auto_assign_new}')::boolean, false) then
    perform public.assign_conversation_worker(new.conversation_id, null);
  end if;

  return new;
end;
$$;

create or replace function public.queue_live_ai_agent_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_connection_id uuid;
  v_assigned_to uuid;
  v_agent public.ai_agents%rowtype;
  v_state text;
  v_historical boolean;
begin
  if new.conversation_id is null or new.direction <> 'inbound' then return new; end if;

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
  if v_historical then return new; end if;

  select c.workspace_id, c.connection_id, c.assigned_to
    into v_workspace_id, v_connection_id, v_assigned_to
  from public.lead_conversations c
  where c.id = new.conversation_id;

  if v_workspace_id is null or v_connection_id is null then return new; end if;

  select a.* into v_agent
  from public.ai_agent_connections ac
  join public.ai_agents a on a.id = ac.agent_id and a.workspace_id = ac.workspace_id
  where ac.workspace_id = v_workspace_id
    and ac.connection_id = v_connection_id
    and ac.is_enabled = true
    and a.is_active = true
    and a.mode <> 'off'
  limit 1;

  if v_agent.id is null then return new; end if;
  if v_assigned_to is not null
     and v_agent.mode <> 'assist'
     and not v_agent.allow_when_human_assigned then
    return new;
  end if;

  select state into v_state
  from public.conversation_ai_states
  where conversation_id = new.conversation_id;
  if v_state in ('paused','handed_off','disabled') then return new; end if;

  insert into public.conversation_ai_states(
    conversation_id, workspace_id, agent_id, state, updated_at
  ) values (
    new.conversation_id, v_workspace_id, v_agent.id, 'active', now()
  )
  on conflict (conversation_id) do update
    set agent_id = excluded.agent_id,
        workspace_id = excluded.workspace_id,
        updated_at = now()
    where public.conversation_ai_states.state not in ('paused','handed_off','disabled');

  insert into public.ai_agent_jobs(
    workspace_id, agent_id, conversation_id, source_message_id
  ) values (
    v_workspace_id, v_agent.id, new.conversation_id, new.id
  ) on conflict (source_message_id) do nothing;

  return new;
end;
$$;

commit;
