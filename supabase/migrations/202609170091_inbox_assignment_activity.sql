-- Keep the Mine queue responsive to newly assigned work without changing the
-- ordering semantics of the other Inbox queues.

begin;

alter table public.lead_conversations
  add column if not exists inbox_activity_at timestamptz;

update public.lead_conversations
set inbox_activity_at = greatest(
  coalesce(last_message_at, '-infinity'::timestamptz),
  coalesce(updated_at, '-infinity'::timestamptz),
  coalesce(created_at, now())
)
where inbox_activity_at is null;

create or replace function public.maintain_conversation_inbox_activity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  if tg_op = 'INSERT' then
    new.inbox_activity_at := greatest(
      coalesce(new.inbox_activity_at, '-infinity'::timestamptz),
      coalesce(new.last_message_at, '-infinity'::timestamptz),
      coalesce(new.created_at, v_now)
    );
    return new;
  end if;

  if new.assigned_to is distinct from old.assigned_to and new.assigned_to is not null then
    new.inbox_activity_at := greatest(
      coalesce(new.inbox_activity_at, '-infinity'::timestamptz),
      v_now
    );
  end if;

  if new.last_message_at is distinct from old.last_message_at and new.last_message_at is not null then
    new.inbox_activity_at := greatest(
      coalesce(new.inbox_activity_at, '-infinity'::timestamptz),
      new.last_message_at
    );
  end if;

  if new.inbox_activity_at is null then
    new.inbox_activity_at := greatest(
      coalesce(new.last_message_at, '-infinity'::timestamptz),
      coalesce(new.created_at, v_now)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_maintain_conversation_inbox_activity on public.lead_conversations;
create trigger trg_maintain_conversation_inbox_activity
before insert or update of assigned_to, last_message_at on public.lead_conversations
for each row execute function public.maintain_conversation_inbox_activity();

create index if not exists lead_conversations_mine_activity_idx
  on public.lead_conversations(workspace_id, assigned_to, inbox_activity_at desc)
  where workflow_state <> 'closed';

commit;
