-- 202609120048_inbox_collaboration_media.sql
-- Inbox collaboration notifications and private outbound conversation media.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'conversation-media',
  'conversation-media',
  false,
  15728640,
  array[
    'image/jpeg','image/png','image/webp','image/gif',
    'video/mp4','video/quicktime','audio/mpeg','audio/mp4','audio/ogg','audio/webm',
    'application/pdf','text/plain','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.notify_conversation_collaborator_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_name text;
  v_actor_name text;
begin
  if new.user_id is null or new.user_id = new.created_by then
    return new;
  end if;

  select customer_name
    into v_customer_name
  from public.lead_conversations
  where id = new.conversation_id
    and workspace_id = new.workspace_id;

  select coalesce(nullif(full_name, ''), email, 'A teammate')
    into v_actor_name
  from public.profiles
  where id = new.created_by;

  insert into public.notifications(user_id, title, message, type, link)
  values (
    new.user_id,
    'Added as conversation collaborator',
    coalesce(v_actor_name, 'A teammate') || ' added you to ' || coalesce(nullif(v_customer_name, ''), 'a customer') || '''s conversation.',
    'collaboration',
    '/inbox?conversationId=' || new.conversation_id::text
  );

  return new;
end;
$$;

revoke all on function public.notify_conversation_collaborator_added() from public;

drop trigger if exists trg_conversation_collaborator_notification on public.conversation_collaborators;
create trigger trg_conversation_collaborator_notification
after insert on public.conversation_collaborators
for each row execute function public.notify_conversation_collaborator_added();

commit;
