-- 202609150061_channel_history_workspace_integrity.sql
-- Keep channel conversations/messages bound to the workspace that owns their concrete
-- integration connection. This removes any dependency on default/current-workspace
-- fallbacks for service-role history imports and reconnect/backfill jobs.

begin;

-- Repair conversation rows that already carry a concrete connection but have a stale
-- workspace assignment.
update public.lead_conversations c
set workspace_id = ic.workspace_id,
    updated_at = now()
from public.integration_connections ic
where c.connection_id = ic.id
  and ic.workspace_id is not null
  and c.workspace_id is distinct from ic.workspace_id;

-- Messages always belong to the same tenant as their parent conversation. This repairs
-- rows previously inserted by service/background paths under the default workspace.
update public.lead_messages m
set workspace_id = c.workspace_id
from public.lead_conversations c
where m.conversation_id = c.id
  and m.workspace_id is distinct from c.workspace_id;

-- Fill a missing message connection from its parent conversation where possible. Do not
-- rewrite a non-null historical connection: old disconnected connections intentionally
-- remain as immutable source/audit identities after an account is moved to a workspace.
update public.lead_messages m
set connection_id = c.connection_id
from public.lead_conversations c
where m.conversation_id = c.id
  and m.connection_id is null
  and c.connection_id is not null
  and not exists (
    select 1
    from public.lead_messages duplicate_message
    where duplicate_message.id <> m.id
      and duplicate_message.connection_id = c.connection_id
      and duplicate_message.provider = m.provider
      and duplicate_message.external_message_id = m.external_message_id
      and m.external_message_id is not null
  );

create or replace function public.enforce_conversation_connection_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  if new.connection_id is null then
    return new;
  end if;

  select ic.workspace_id
  into v_workspace_id
  from public.integration_connections ic
  where ic.id = new.connection_id;

  if not found or v_workspace_id is null then
    raise exception 'Conversation connection % does not have a workspace', new.connection_id
      using errcode = '23503';
  end if;

  new.workspace_id := v_workspace_id;
  return new;
end;
$$;

create or replace function public.enforce_message_conversation_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_connection_id uuid;
  v_connection_workspace_id uuid;
begin
  if new.conversation_id is not null then
    select c.workspace_id, c.connection_id
    into v_workspace_id, v_connection_id
    from public.lead_conversations c
    where c.id = new.conversation_id;

    if not found then
      raise exception 'Message conversation % does not exist', new.conversation_id
        using errcode = '23503';
    end if;

    new.workspace_id := v_workspace_id;

    if v_connection_id is not null then
      if new.connection_id is null then
        new.connection_id := v_connection_id;
      elsif new.connection_id is distinct from v_connection_id then
        raise exception 'Message connection % does not match conversation connection %', new.connection_id, v_connection_id
          using errcode = '23514';
      end if;
    end if;
  end if;

  if new.connection_id is not null then
    select ic.workspace_id
    into v_connection_workspace_id
    from public.integration_connections ic
    where ic.id = new.connection_id;

    if not found or v_connection_workspace_id is null then
      raise exception 'Message connection % does not have a workspace', new.connection_id
        using errcode = '23503';
    end if;

    if new.workspace_id is null then
      new.workspace_id := v_connection_workspace_id;
    elsif new.workspace_id is distinct from v_connection_workspace_id then
      raise exception 'Message workspace % does not match connection workspace %', new.workspace_id, v_connection_workspace_id
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_conversation_connection_workspace on public.lead_conversations;
create trigger trg_conversation_connection_workspace
before insert or update of connection_id, workspace_id
on public.lead_conversations
for each row execute function public.enforce_conversation_connection_workspace();

drop trigger if exists trg_message_conversation_workspace on public.lead_messages;
create trigger trg_message_conversation_workspace
before insert or update of conversation_id, connection_id, workspace_id
on public.lead_messages
for each row execute function public.enforce_message_conversation_workspace();

commit;
