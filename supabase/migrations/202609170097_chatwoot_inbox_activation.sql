-- A discovered Chatwoot inbox can be mapped to an existing CRM connection while
-- the legacy provider adapter remains live. Only traffic_mode='active' is allowed
-- to take over reads/sends in later adapter work.

begin;

alter table public.chatwoot_inboxes
  add column if not exists traffic_mode text not null default 'shadow'
    check (traffic_mode in ('shadow','active'));

-- One CRM channel connection must have exactly one Chatwoot inbox owner.
drop index if exists public.chatwoot_inboxes_connection_idx;
create unique index if not exists chatwoot_inboxes_connection_uidx
  on public.chatwoot_inboxes(integration_connection_id)
  where integration_connection_id is not null;

commit;
