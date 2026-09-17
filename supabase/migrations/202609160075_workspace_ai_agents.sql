-- Workspace AI agents powered by Mistral.
-- Postgres is the source of truth for agent configuration, conversation state,
-- and durable work queueing. Historical message imports never enqueue AI work.

begin;

create table if not exists public.ai_agents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  provider text not null default 'mistral' check (provider in ('mistral')),
  model text not null default 'mistral-medium-latest',
  mistral_agent_id text,
  instructions text not null default '',
  tone text not null default 'professional and friendly',
  languages text[] not null default array['auto']::text[],
  mode text not null default 'assist' check (mode in ('off','assist','auto','auto_handoff')),
  is_active boolean not null default false,
  temperature numeric(3,2) not null default 0.30 check (temperature >= 0 and temperature <= 1.5),
  confidence_threshold numeric(4,3) not null default 0.650 check (confidence_threshold >= 0 and confidence_threshold <= 1),
  response_delay_min_seconds integer not null default 2 check (response_delay_min_seconds >= 0 and response_delay_min_seconds <= 120),
  response_delay_max_seconds integer not null default 8 check (response_delay_max_seconds >= 0 and response_delay_max_seconds <= 180),
  handoff_team_key text,
  handoff_keywords text[] not null default array['human','person','manager','complaint','refund']::text[],
  allow_when_human_assigned boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_agent_connections (
  agent_id uuid not null references public.ai_agents(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  primary key(agent_id, connection_id),
  unique(workspace_id, connection_id)
);

create table if not exists public.conversation_ai_states (
  conversation_id uuid primary key references public.lead_conversations(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id uuid references public.ai_agents(id) on delete set null,
  state text not null default 'active' check (state in ('active','paused','handed_off','failed','disabled')),
  draft_reply text,
  last_processed_message_id uuid references public.lead_messages(id) on delete set null,
  last_ai_message_id uuid references public.lead_messages(id) on delete set null,
  last_ai_at timestamptz,
  last_human_at timestamptz,
  handoff_reason text,
  handed_off_at timestamptz,
  handed_off_to uuid references public.profiles(id) on delete set null,
  failure_count integer not null default 0,
  last_error text,
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_agent_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id uuid not null references public.ai_agents(id) on delete cascade,
  conversation_id uuid not null references public.lead_conversations(id) on delete cascade,
  source_message_id uuid not null references public.lead_messages(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','processing','completed','failed')),
  attempt_count integer not null default 0,
  max_attempts integer not null default 4,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_message_id)
);

create index if not exists ai_agents_workspace_idx
  on public.ai_agents(workspace_id, is_active, mode, updated_at desc);
create index if not exists ai_agent_connections_connection_idx
  on public.ai_agent_connections(workspace_id, connection_id) where is_enabled = true;
create index if not exists conversation_ai_states_workspace_idx
  on public.conversation_ai_states(workspace_id, state, updated_at desc);
create index if not exists ai_agent_jobs_claim_idx
  on public.ai_agent_jobs(status, next_attempt_at, created_at)
  where status in ('queued','processing');
create index if not exists ai_agent_jobs_conversation_idx
  on public.ai_agent_jobs(conversation_id, created_at desc);

create or replace function public.validate_ai_agent_connection()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agent_workspace uuid;
  v_connection_workspace uuid;
begin
  select workspace_id into v_agent_workspace from public.ai_agents where id = new.agent_id;
  select workspace_id into v_connection_workspace from public.integration_connections where id = new.connection_id;
  if v_agent_workspace is null or v_connection_workspace is null
     or v_agent_workspace is distinct from new.workspace_id
     or v_connection_workspace is distinct from new.workspace_id then
    raise exception 'AI agent connection must stay inside one workspace' using errcode='23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_ai_agent_connection on public.ai_agent_connections;
create trigger trg_validate_ai_agent_connection
before insert or update on public.ai_agent_connections
for each row execute function public.validate_ai_agent_connection();

create or replace function public.queue_live_ai_agent_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_connection_id uuid;
  v_assigned_to uuid;
  v_agent public.ai_agents%rowtype;
  v_state text;
  v_historical boolean;
begin
  if new.conversation_id is null or new.direction <> 'inbound' then
    return new;
  end if;

  v_historical := (
    new.provider = 'whatsapp'
    and coalesce((new.metadata->>'synced_realtime')::boolean, true) = false
  ) or (
    new.provider in ('facebook', 'instagram')
    and (
      coalesce((new.metadata->>'history_backfill')::boolean, false)
      or coalesce((new.metadata->>'history_seed')::boolean, false)
    )
  );
  if v_historical then return new; end if;

  select c.workspace_id, c.connection_id, c.assigned_to
    into v_workspace_id, v_connection_id, v_assigned_to
  from public.lead_conversations c
  where c.id = new.conversation_id;

  if v_workspace_id is null or v_connection_id is null then return new; end if;

  select a.* into v_agent
  from public.ai_agent_connections ac
  join public.ai_agents a on a.id = ac.agent_id and a.workspace_id = ac.workspace_id
  where ac.workspace_id = v_workspace_id
    and ac.connection_id = v_connection_id
    and ac.is_enabled = true
    and a.is_active = true
    and a.mode <> 'off'
  limit 1;

  if v_agent.id is null then return new; end if;
  if v_assigned_to is not null and not v_agent.allow_when_human_assigned then return new; end if;

  select state into v_state
  from public.conversation_ai_states
  where conversation_id = new.conversation_id;
  if v_state in ('paused','handed_off','disabled') then return new; end if;

  insert into public.conversation_ai_states(
    conversation_id, workspace_id, agent_id, state, updated_at
  ) values (
    new.conversation_id, v_workspace_id, v_agent.id, 'active', now()
  )
  on conflict (conversation_id) do update
    set agent_id = excluded.agent_id,
        workspace_id = excluded.workspace_id,
        updated_at = now()
    where public.conversation_ai_states.state not in ('paused','handed_off','disabled');

  insert into public.ai_agent_jobs(
    workspace_id, agent_id, conversation_id, source_message_id
  ) values (
    v_workspace_id, v_agent.id, new.conversation_id, new.id
  ) on conflict (source_message_id) do nothing;

  return new;
end;
$$;

revoke all on function public.queue_live_ai_agent_message() from public, anon, authenticated;
grant execute on function public.queue_live_ai_agent_message() to service_role;

drop trigger if exists trg_queue_live_ai_agent_message on public.lead_messages;
create trigger trg_queue_live_ai_agent_message
after insert on public.lead_messages
for each row execute function public.queue_live_ai_agent_message();

create or replace function public.claim_ai_agent_job()
returns setof public.ai_agent_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Not authorized' using errcode='42501';
  end if;

  select j.id into v_id
  from public.ai_agent_jobs j
  where j.status = 'queued'
    and j.next_attempt_at <= now()
  order by j.created_at asc
  for update skip locked
  limit 1;

  if v_id is null then return; end if;

  update public.ai_agent_jobs
  set status = 'processing',
      locked_at = now(),
      updated_at = now()
  where id = v_id;

  return query select * from public.ai_agent_jobs where id = v_id;
end;
$$;

revoke all on function public.claim_ai_agent_job() from public, anon, authenticated;
grant execute on function public.claim_ai_agent_job() to service_role;

alter table public.ai_agents enable row level security;
alter table public.ai_agent_connections enable row level security;
alter table public.conversation_ai_states enable row level security;
alter table public.ai_agent_jobs enable row level security;

drop policy if exists ai_agents_select on public.ai_agents;
create policy ai_agents_select on public.ai_agents
for select to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists ai_agents_manage on public.ai_agents;
create policy ai_agents_manage on public.ai_agents
for all to authenticated
using (workspace_id = public.current_workspace_id() and public.is_management())
with check (workspace_id = public.current_workspace_id() and public.is_management());

drop policy if exists ai_agent_connections_select on public.ai_agent_connections;
create policy ai_agent_connections_select on public.ai_agent_connections
for select to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists ai_agent_connections_manage on public.ai_agent_connections;
create policy ai_agent_connections_manage on public.ai_agent_connections
for all to authenticated
using (workspace_id = public.current_workspace_id() and public.is_management())
with check (workspace_id = public.current_workspace_id() and public.is_management());

drop policy if exists conversation_ai_states_select on public.conversation_ai_states;
create policy conversation_ai_states_select on public.conversation_ai_states
for select to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists conversation_ai_states_update on public.conversation_ai_states;
create policy conversation_ai_states_update on public.conversation_ai_states
for update to authenticated
using (public.is_workspace_member(workspace_id))
with check (workspace_id = public.current_workspace_id());

-- Jobs are operational internals. Authenticated users never read or mutate them directly.
revoke all on public.ai_agent_jobs from anon, authenticated;
grant all on public.ai_agent_jobs to service_role;
grant select, insert, update, delete on public.ai_agents to authenticated, service_role;
grant select, insert, update, delete on public.ai_agent_connections to authenticated, service_role;
grant select, insert, update on public.conversation_ai_states to authenticated, service_role;

commit;
