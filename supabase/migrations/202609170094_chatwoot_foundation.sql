-- Chatwoot becomes the source of truth for channel conversations/messages while
-- the CRM remains the source of truth for customers, leads and business workflow.
-- These tables keep the boundary explicit and make webhook ingestion durable.

begin;

create table if not exists public.chatwoot_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  chatwoot_account_id bigint not null,
  name text,
  status text not null default 'active' check (status in ('active','paused','disabled')),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id),
  unique (chatwoot_account_id)
);

create table if not exists public.chatwoot_inboxes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  chatwoot_account_link_id uuid not null references public.chatwoot_accounts(id) on delete cascade,
  integration_connection_id uuid references public.integration_connections(id) on delete set null,
  chatwoot_inbox_id bigint not null,
  name text,
  channel_type text,
  status text not null default 'active' check (status in ('active','paused','disabled')),
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chatwoot_account_link_id, chatwoot_inbox_id)
);

create index if not exists chatwoot_inboxes_workspace_idx
  on public.chatwoot_inboxes(workspace_id, status, chatwoot_inbox_id);

create index if not exists chatwoot_inboxes_connection_idx
  on public.chatwoot_inboxes(integration_connection_id)
  where integration_connection_id is not null;

create table if not exists public.chatwoot_conversation_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  chatwoot_account_link_id uuid not null references public.chatwoot_accounts(id) on delete cascade,
  lead_conversation_id uuid references public.lead_conversations(id) on delete set null,
  chatwoot_conversation_id bigint not null,
  chatwoot_inbox_id bigint,
  chatwoot_contact_id bigint,
  last_message_id bigint,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chatwoot_account_link_id, chatwoot_conversation_id)
);

create unique index if not exists chatwoot_conversation_links_crm_conversation_uidx
  on public.chatwoot_conversation_links(workspace_id, lead_conversation_id)
  where lead_conversation_id is not null;

create index if not exists chatwoot_conversation_links_contact_idx
  on public.chatwoot_conversation_links(workspace_id, chatwoot_contact_id)
  where chatwoot_contact_id is not null;

create table if not exists public.chatwoot_webhook_events (
  id uuid primary key default gen_random_uuid(),
  delivery_key text not null unique,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  chatwoot_account_link_id uuid not null references public.chatwoot_accounts(id) on delete cascade,
  chatwoot_account_id bigint not null,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','processing','processed','ignored','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists chatwoot_webhook_events_pending_idx
  on public.chatwoot_webhook_events(status, received_at)
  where status in ('pending','failed');

create index if not exists chatwoot_webhook_events_workspace_idx
  on public.chatwoot_webhook_events(workspace_id, received_at desc);

alter table public.chatwoot_accounts enable row level security;
alter table public.chatwoot_inboxes enable row level security;
alter table public.chatwoot_conversation_links enable row level security;
alter table public.chatwoot_webhook_events enable row level security;

drop policy if exists chatwoot_accounts_select on public.chatwoot_accounts;
create policy chatwoot_accounts_select on public.chatwoot_accounts
for select to authenticated
using (
  public.current_user_active()
  and workspace_id = public.current_workspace_id()
);

drop policy if exists chatwoot_inboxes_select on public.chatwoot_inboxes;
create policy chatwoot_inboxes_select on public.chatwoot_inboxes
for select to authenticated
using (
  public.current_user_active()
  and workspace_id = public.current_workspace_id()
);

drop policy if exists chatwoot_conversation_links_select on public.chatwoot_conversation_links;
create policy chatwoot_conversation_links_select on public.chatwoot_conversation_links
for select to authenticated
using (
  public.current_user_active()
  and workspace_id = public.current_workspace_id()
);

revoke all on table public.chatwoot_accounts from anon;
revoke all on table public.chatwoot_inboxes from anon;
revoke all on table public.chatwoot_conversation_links from anon;
revoke all on table public.chatwoot_webhook_events from anon, authenticated;

grant select on table public.chatwoot_accounts to authenticated;
grant select on table public.chatwoot_inboxes to authenticated;
grant select on table public.chatwoot_conversation_links to authenticated;

commit;
