-- Production AI runtime hardening: non-blocking reply scheduling, provider health,
-- and durable per-run telemetry. Postgres remains the source of truth.

begin;

alter table public.ai_provider_configs
  add column if not exists health_status text not null default 'unknown'
    check (health_status in ('unknown','healthy','degraded','unhealthy')),
  add column if not exists last_health_check_at timestamptz,
  add column if not exists last_health_latency_ms integer,
  add column if not exists last_health_error text,
  add column if not exists consecutive_failures integer not null default 0
    check (consecutive_failures >= 0);

create table if not exists public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id uuid references public.ai_agents(id) on delete set null,
  conversation_id uuid references public.lead_conversations(id) on delete cascade,
  source_message_id uuid references public.lead_messages(id) on delete set null,
  job_id uuid references public.ai_agent_jobs(id) on delete set null,
  provider_config_id uuid references public.ai_provider_configs(id) on delete set null,
  provider text,
  model text,
  status text not null default 'running'
    check (status in ('running','scheduled','succeeded','failed','handoff','noop','draft','cancelled')),
  action text check (action is null or action in ('reply','handoff','noop','draft')),
  confidence numeric(5,4),
  intent text,
  handoff_reason text,
  latency_ms integer,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  estimated_cost_usd numeric(14,6),
  knowledge_chunk_ids uuid[] not null default '{}'::uuid[],
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_runs_workspace_created_idx
  on public.ai_runs(workspace_id, created_at desc);
create index if not exists ai_runs_conversation_idx
  on public.ai_runs(workspace_id, conversation_id, created_at desc);
create index if not exists ai_runs_agent_idx
  on public.ai_runs(workspace_id, agent_id, created_at desc);
create index if not exists ai_runs_failures_idx
  on public.ai_runs(workspace_id, status, created_at desc)
  where status = 'failed';

alter table public.ai_agent_jobs
  add column if not exists phase text not null default 'decide'
    check (phase in ('decide','send')),
  add column if not exists scheduled_decision jsonb,
  add column if not exists send_due_at timestamptz,
  add column if not exists run_id uuid references public.ai_runs(id) on delete set null;

create index if not exists ai_agent_jobs_send_due_idx
  on public.ai_agent_jobs(status, phase, next_attempt_at, created_at)
  where status = 'queued';

-- Re-declare the claim function after the job shape changes. next_attempt_at is
-- the single scheduling primitive for retries and delayed AI sends.
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
  order by j.next_attempt_at asc, j.created_at asc
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

alter table public.ai_runs enable row level security;

drop policy if exists ai_runs_select on public.ai_runs;
create policy ai_runs_select on public.ai_runs
for select to authenticated
using (workspace_id = public.current_workspace_id() and public.is_management());

-- Runs are operational evidence. Browser clients may inspect but never mutate.
revoke all on public.ai_runs from public, anon;
revoke insert, update, delete on public.ai_runs from authenticated;
grant select on public.ai_runs to authenticated;
grant all on public.ai_runs to service_role;

commit;
