-- Keep Chatwoot authoritative for full message bodies while preserving CRM-side
-- idempotency for operator sends. This table stores only request/result identity.

begin;

create table if not exists public.chatwoot_outbound_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references public.lead_conversations(id) on delete cascade,
  client_request_id text not null,
  request_hash text not null,
  direction text not null check (direction in ('outbound','internal')),
  status text not null default 'processing' check (status in ('processing','sent','failed')),
  attempts integer not null default 1 check (attempts > 0),
  chatwoot_message_id bigint,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, conversation_id, client_request_id)
);

create index if not exists chatwoot_outbound_requests_conversation_idx
  on public.chatwoot_outbound_requests(workspace_id, conversation_id, created_at desc);

alter table public.chatwoot_outbound_requests enable row level security;
revoke all on table public.chatwoot_outbound_requests from public, anon, authenticated;

create or replace function public.claim_chatwoot_outbound_request(
  p_workspace_id uuid,
  p_conversation_id uuid,
  p_client_request_id text,
  p_request_hash text,
  p_direction text
)
returns table(
  request_id uuid,
  should_process boolean,
  request_status text,
  existing_message_id bigint,
  existing_sent_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.chatwoot_outbound_requests%rowtype;
begin
  if nullif(btrim(p_client_request_id), '') is null
     or nullif(btrim(p_request_hash), '') is null
     or p_direction not in ('outbound','internal') then
    raise exception 'Invalid Chatwoot outbound claim' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.lead_conversations c
    where c.id = p_conversation_id and c.workspace_id = p_workspace_id
  ) then
    raise exception 'Conversation/workspace mismatch' using errcode = '42501';
  end if;

  select * into v_request
  from public.chatwoot_outbound_requests
  where workspace_id = p_workspace_id
    and conversation_id = p_conversation_id
    and client_request_id = p_client_request_id
  for update;

  if found then
    if v_request.request_hash is distinct from p_request_hash
       or v_request.direction is distinct from p_direction then
      raise exception 'Idempotency key was already used for a different Chatwoot message' using errcode = '22023';
    end if;

    if v_request.status = 'sent' then
      return query select v_request.id, false, v_request.status, v_request.chatwoot_message_id, v_request.sent_at;
      return;
    end if;

    if v_request.status = 'processing'
       and v_request.updated_at > now() - interval '2 minutes' then
      return query select v_request.id, false, v_request.status, v_request.chatwoot_message_id, v_request.sent_at;
      return;
    end if;

    update public.chatwoot_outbound_requests
    set status = 'processing',
        attempts = attempts + 1,
        last_error = null,
        updated_at = now()
    where id = v_request.id
    returning * into v_request;

    return query select v_request.id, true, v_request.status, v_request.chatwoot_message_id, v_request.sent_at;
    return;
  end if;

  insert into public.chatwoot_outbound_requests(
    workspace_id, conversation_id, client_request_id, request_hash, direction,
    status, attempts, created_at, updated_at
  ) values (
    p_workspace_id, p_conversation_id, p_client_request_id, p_request_hash, p_direction,
    'processing', 1, now(), now()
  ) returning * into v_request;

  return query select v_request.id, true, v_request.status, null::bigint, null::timestamptz;
end;
$$;

revoke all on function public.claim_chatwoot_outbound_request(uuid,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.claim_chatwoot_outbound_request(uuid,uuid,text,text,text) to service_role;

commit;
