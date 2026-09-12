-- 202609120014_inbox_and_lead_conversion.sql
-- Omnichannel Inbox support: Make lead_id nullable so incoming messages start a conversation without creating a lead.
-- Allows manual or automated conversion of conversations to leads.

begin;

-- 1. Make lead_id nullable in conversations and messages
alter table public.lead_conversations alter column lead_id drop not null;
alter table public.lead_messages alter column lead_id drop not null;

-- 2. Add contact details, unread count, and assignment to lead_conversations
alter table public.lead_conversations
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists customer_email text,
  add column if not exists customer_avatar_url text,
  add column if not exists last_message_preview text,
  add column if not exists unread_count integer not null default 0,
  add column if not exists assigned_to uuid references public.profiles(id) on delete set null,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- 3. Helpful indices for high performance conversation listing
create unique index if not exists idx_lead_conversations_provider_thread
  on public.lead_conversations(provider, external_thread_id)
  where external_thread_id is not null;

create unique index if not exists idx_lead_messages_provider_msg
  on public.lead_messages(provider, external_message_id)
  where external_message_id is not null;

create index if not exists lead_conversations_unconverted_idx
  on public.lead_conversations(last_message_at desc)
  where lead_id is null;

create index if not exists lead_conversations_assigned_idx
  on public.lead_conversations(assigned_to, last_message_at desc);

create index if not exists lead_conversations_status_idx
  on public.lead_conversations(status, last_message_at desc);

create index if not exists lead_messages_conversation_idx
  on public.lead_messages(conversation_id, sent_at asc);

-- 4. Access helper for conversations (supports both lead-linked and unconverted conversations)
create or replace function public.can_access_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_active() and exists (
    select 1
    from public.lead_conversations c
    where c.id = p_conversation_id
      and (
        (c.lead_id is not null and public.can_access_lead(c.lead_id))
        or (c.lead_id is null and (public.is_management() or c.assigned_to = auth.uid() or c.assigned_to is null))
      )
  );
$$;

-- 5. Updated RLS policies for lead_conversations
drop policy if exists lead_conversations_read on public.lead_conversations;
create policy lead_conversations_read on public.lead_conversations
  for select using (
    public.current_user_active() and (
      (lead_id is not null and public.can_access_lead(lead_id))
      or (lead_id is null and (public.is_management() or assigned_to = auth.uid() or assigned_to is null))
    )
  );

drop policy if exists lead_conversations_write on public.lead_conversations;
create policy lead_conversations_write on public.lead_conversations
  for all using (
    public.current_user_active() and (
      (lead_id is not null and public.can_access_lead(lead_id))
      or (lead_id is null and (public.is_management() or assigned_to = auth.uid() or assigned_to is null))
    )
  )
  with check (
    public.current_user_active() and (
      (lead_id is not null and public.can_access_lead(lead_id))
      or (lead_id is null and (public.is_management() or assigned_to = auth.uid() or assigned_to is null))
    )
  );

-- 6. Updated RLS policies for lead_messages
drop policy if exists lead_messages_read on public.lead_messages;
create policy lead_messages_read on public.lead_messages
  for select using (
    public.current_user_active() and (
      (lead_id is not null and public.can_access_lead(lead_id))
      or (conversation_id is not null and public.can_access_conversation(conversation_id))
    )
  );

drop policy if exists lead_messages_write on public.lead_messages;
create policy lead_messages_write on public.lead_messages
  for insert with check (
    public.current_user_active() and (
      (lead_id is not null and public.can_access_lead(lead_id))
      or (conversation_id is not null and public.can_access_conversation(conversation_id))
    )
  );

grant select, insert, update on public.lead_conversations to authenticated;
grant select, insert on public.lead_messages to authenticated;

commit;
