begin;

alter table public.leads
  add column if not exists source_channel text,
  add column if not exists source_connection_id uuid,
  add column if not exists source_campaign text,
  add column if not exists source_ad text,
  add column if not exists source_form text,
  add column if not exists source_metadata jsonb not null default '{}'::jsonb;

create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('meta','facebook','instagram','whatsapp','tiktok','email','website','api','google_business','messenger','telegram','other')),
  display_name text not null,
  external_account_id text,
  status text not null default 'disconnected' check (status in ('disconnected','pending','connected','needs_attention','paused')),
  capabilities jsonb not null default '[]'::jsonb,
  config jsonb not null default '{}'::jsonb,
  connected_by uuid references public.profiles(id) on delete set null,
  last_sync_at timestamptz,
  last_event_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists integration_connections_provider_idx on public.integration_connections(provider);
create unique index if not exists integration_connections_provider_external_uidx
  on public.integration_connections(provider, external_account_id)
  where external_account_id is not null;

create table if not exists public.integration_secrets (
  connection_id uuid primary key references public.integration_connections(id) on delete cascade,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  webhook_secret text,
  secret_payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.inbound_channel_events (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid references public.integration_connections(id) on delete set null,
  provider text not null,
  external_event_id text not null,
  event_type text not null default 'lead',
  status text not null default 'received' check (status in ('received','processed','ignored','failed')),
  lead_id uuid references public.leads(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique(provider, external_event_id)
);

create index if not exists inbound_channel_events_received_idx on public.inbound_channel_events(received_at desc);
create index if not exists inbound_channel_events_lead_idx on public.inbound_channel_events(lead_id, received_at desc);

create table if not exists public.lead_conversations (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  connection_id uuid references public.integration_connections(id) on delete set null,
  provider text not null,
  external_thread_id text,
  external_contact_id text,
  status text not null default 'open' check (status in ('open','closed','archived')),
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists lead_conversations_thread_uidx
  on public.lead_conversations(provider, external_thread_id)
  where external_thread_id is not null;
create index if not exists lead_conversations_lead_idx on public.lead_conversations(lead_id, last_message_at desc nulls last);

create table if not exists public.lead_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.lead_conversations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  connection_id uuid references public.integration_connections(id) on delete set null,
  provider text not null,
  external_message_id text,
  direction text not null check (direction in ('inbound','outbound','internal')),
  message_type text not null default 'text',
  body text,
  metadata jsonb not null default '{}'::jsonb,
  sent_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists lead_messages_provider_external_uidx
  on public.lead_messages(provider, external_message_id)
  where external_message_id is not null;
create index if not exists lead_messages_lead_idx on public.lead_messages(lead_id, sent_at desc);
create index if not exists lead_messages_conversation_idx on public.lead_messages(conversation_id, sent_at desc);

alter table public.leads
  drop constraint if exists leads_source_connection_id_fkey;
alter table public.leads
  add constraint leads_source_connection_id_fkey
  foreign key (source_connection_id) references public.integration_connections(id) on delete set null;

alter table public.integration_connections enable row level security;
alter table public.integration_secrets enable row level security;
alter table public.inbound_channel_events enable row level security;
alter table public.lead_conversations enable row level security;
alter table public.lead_messages enable row level security;

drop policy if exists integration_connections_read on public.integration_connections;
create policy integration_connections_read on public.integration_connections
  for select using (public.current_user_active());

drop policy if exists integration_connections_manage on public.integration_connections;
create policy integration_connections_manage on public.integration_connections
  for all using (public.current_user_active() and public.current_user_role() in ('admin','manager'))
  with check (public.current_user_active() and public.current_user_role() in ('admin','manager'));

-- No integration_secrets policies on purpose. Only service-role server code may read tokens.

drop policy if exists inbound_channel_events_read on public.inbound_channel_events;
create policy inbound_channel_events_read on public.inbound_channel_events
  for select using (public.current_user_active() and public.current_user_role() in ('admin','manager'));

drop policy if exists lead_conversations_read on public.lead_conversations;
create policy lead_conversations_read on public.lead_conversations
  for select using (public.current_user_active() and public.can_access_lead(lead_id));

drop policy if exists lead_conversations_write on public.lead_conversations;
create policy lead_conversations_write on public.lead_conversations
  for all using (public.current_user_active() and public.can_access_lead(lead_id))
  with check (public.current_user_active() and public.can_access_lead(lead_id));

drop policy if exists lead_messages_read on public.lead_messages;
create policy lead_messages_read on public.lead_messages
  for select using (public.current_user_active() and public.can_access_lead(lead_id));

drop policy if exists lead_messages_write on public.lead_messages;
create policy lead_messages_write on public.lead_messages
  for insert with check (public.current_user_active() and public.can_access_lead(lead_id));

grant select on public.integration_connections to authenticated;
grant select on public.inbound_channel_events to authenticated;
grant select, insert, update on public.lead_conversations to authenticated;
grant select, insert on public.lead_messages to authenticated;

create or replace function public.touch_omnichannel_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists integration_connections_touch on public.integration_connections;
create trigger integration_connections_touch before update on public.integration_connections
for each row execute function public.touch_omnichannel_updated_at();

drop trigger if exists lead_conversations_touch on public.lead_conversations;
create trigger lead_conversations_touch before update on public.lead_conversations
for each row execute function public.touch_omnichannel_updated_at();

commit;
