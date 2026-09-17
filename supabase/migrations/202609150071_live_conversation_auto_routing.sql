-- Route new live inbound conversations when the workspace explicitly enables it.
-- Historical WhatsApp/Meta backfills must never claim live agent capacity.

begin;

create or replace function public.route_live_inbound_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_assigned_to uuid;
  v_settings jsonb;
  v_historical boolean;
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

  if v_historical then
    return new;
  end if;

  select c.workspace_id, c.assigned_to
  into v_workspace_id, v_assigned_to
  from public.lead_conversations c
  where c.id = new.conversation_id;

  if v_workspace_id is null or v_assigned_to is not null then
    return new;
  end if;

  select w.settings
  into v_settings
  from public.workspaces w
  where w.id = v_workspace_id;

  if coalesce((v_settings #>> '{conversation_routing,auto_assign_new}')::boolean, false) then
    perform public.assign_conversation_worker(new.conversation_id, null);
  end if;

  return new;
end;
$$;

revoke all on function public.route_live_inbound_conversation() from public, anon, authenticated;
grant execute on function public.route_live_inbound_conversation() to service_role;

drop trigger if exists trg_route_live_inbound_conversation on public.lead_messages;
create trigger trg_route_live_inbound_conversation
after insert on public.lead_messages
for each row execute function public.route_live_inbound_conversation();

commit;
