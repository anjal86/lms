-- 202609150060_routable_account_release_integrity.sql
-- Keep disconnected integration rows as historical source-account tombstones while
-- allowing the same externally routed account to be explicitly connected elsewhere.
-- Only non-disconnected rows may own the live provider routing identity.

begin;

drop index if exists public.integration_connections_routable_external_uidx;

create unique index integration_connections_routable_external_uidx
  on public.integration_connections(provider, external_account_id)
  where external_account_id is not null
    and provider in ('facebook','instagram','whatsapp','tiktok')
    and status <> 'disconnected';

comment on index public.integration_connections_routable_external_uidx is
  'Guarantees one live CRM owner for a routable provider account while preserving disconnected historical connection rows.';

commit;
