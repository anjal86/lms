-- Meta can deliver a paid-ad referral/postback before it delivers the actual
-- customer message. Buffer that referral briefly so the next inbound message
-- from the same concrete account/contact inherits the correct attribution.

begin;

create table if not exists public.pending_ad_referrals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  provider text not null,
  account_id text not null,
  external_contact_id text not null,
  attribution jsonb not null,
  captured_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(attribution) = 'object'),
  check (expires_at > captured_at)
);

create index if not exists pending_ad_referrals_lookup_idx
  on public.pending_ad_referrals(
    workspace_id,
    connection_id,
    provider,
    external_contact_id,
    captured_at desc
  )
  where consumed_at is null;

alter table public.pending_ad_referrals enable row level security;

-- This table is webhook/runtime infrastructure. Browser clients should never
-- enumerate raw referral payloads directly; conversation attribution has its
-- own access-controlled read model.
revoke all on public.pending_ad_referrals from public, anon, authenticated;
grant all on public.pending_ad_referrals to service_role;

commit;
