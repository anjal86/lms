-- Durable Chatwoot webhook processing with atomic claiming, stale-lock recovery and retry timing.

begin;

alter table public.chatwoot_webhook_events
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists locked_at timestamptz;

drop index if exists public.chatwoot_webhook_events_pending_idx;
create index if not exists chatwoot_webhook_events_pending_idx
  on public.chatwoot_webhook_events(status, next_attempt_at, received_at)
  where status in ('pending','failed','processing');

create or replace function public.claim_chatwoot_webhook_event()
returns table (
  id uuid,
  delivery_key text,
  workspace_id uuid,
  chatwoot_account_link_id uuid,
  chatwoot_account_id bigint,
  event_type text,
  payload jsonb,
  attempts integer,
  received_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidate as (
    select e.id
    from public.chatwoot_webhook_events e
    where (
      (e.status in ('pending','failed') and e.next_attempt_at <= now())
      or (e.status = 'processing' and e.locked_at < now() - interval '5 minutes')
    )
    order by e.received_at asc
    for update skip locked
    limit 1
  )
  update public.chatwoot_webhook_events e
  set
    status = 'processing',
    attempts = e.attempts + 1,
    locked_at = now(),
    updated_at = now(),
    error = case
      when e.status = 'processing' then 'Recovered after an interrupted Chatwoot worker cycle.'
      else null
    end
  from candidate
  where e.id = candidate.id
  returning
    e.id,
    e.delivery_key,
    e.workspace_id,
    e.chatwoot_account_link_id,
    e.chatwoot_account_id,
    e.event_type,
    e.payload,
    e.attempts,
    e.received_at;
end;
$$;

revoke all on function public.claim_chatwoot_webhook_event() from public, anon, authenticated;
grant execute on function public.claim_chatwoot_webhook_event() to service_role;

commit;
