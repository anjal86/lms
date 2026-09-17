-- Track authoritative per-conversation Meta history completion.

begin;

-- Old provider-global indexes can survive partially applied local migration sets
-- and block reconnect repairs even though connection-scoped indexes are present.
drop index if exists public.idx_lead_messages_provider_ext_msg_full;
drop index if exists public.idx_lead_conversations_provider_thread_full;

alter table public.lead_conversations
  add column if not exists meta_history_complete boolean not null default false,
  add column if not exists meta_history_synced_at timestamptz,
  add column if not exists meta_history_error text;

drop index if exists public.lead_conversations_meta_history_pending_idx;
create index lead_conversations_meta_history_pending_idx
  on public.lead_conversations(workspace_id, connection_id, meta_history_synced_at asc nulls first, last_message_at desc nulls last)
  where provider in ('facebook', 'instagram')
    and connection_id is not null
    and meta_history_complete = false;

commit;
