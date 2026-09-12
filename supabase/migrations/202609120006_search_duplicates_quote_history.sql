-- Production query performance, duplicate-lead detection, and immutable quote snapshots.

create extension if not exists pg_trgm;

alter table public.leads
  add column if not exists duplicate_of uuid references public.leads(id) on delete set null;

create index if not exists idx_leads_sla_pending
  on public.leads(first_response_due_at)
  where assigned_to is not null
    and first_contacted_at is null
    and is_first_response_breached = false
    and stage in ('new','contacted','quote_sent','in_negotiation');

create index if not exists idx_followups_pending_due
  on public.follow_ups(scheduled_at)
  where status = 'pending';

create index if not exists idx_leads_customer_email_lower
  on public.leads(lower(customer_email))
  where customer_email is not null and btrim(customer_email) <> '';

create index if not exists idx_leads_customer_phone_digits
  on public.leads((regexp_replace(customer_phone, '[^0-9]', '', 'g')));

create index if not exists idx_leads_customer_name_trgm
  on public.leads using gin (lower(customer_name) gin_trgm_ops);

create index if not exists idx_leads_destination_trgm
  on public.leads using gin (lower(destination) gin_trgm_ops);

create index if not exists idx_leads_lead_code_trgm
  on public.leads using gin (lower(lead_code) gin_trgm_ops);

create or replace function public.mark_possible_duplicate(p_lead_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_email text;
  target_phone text;
  target_created_at timestamptz;
  candidate_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Not authorized';
  end if;

  select nullif(lower(btrim(customer_email)), ''),
         regexp_replace(customer_phone, '[^0-9]', '', 'g'),
         created_at
  into target_email, target_phone, target_created_at
  from public.leads
  where id = p_lead_id;

  if not found then
    return null;
  end if;

  select l.id
  into candidate_id
  from public.leads l
  where l.id <> p_lead_id
    and l.created_at <= target_created_at
    and l.created_at >= target_created_at - interval '180 days'
    and (
      (target_email is not null and lower(btrim(l.customer_email)) = target_email)
      or
      (length(target_phone) >= 7 and regexp_replace(l.customer_phone, '[^0-9]', '', 'g') = target_phone)
    )
  order by
    case
      when target_email is not null
       and lower(btrim(l.customer_email)) = target_email
       and length(target_phone) >= 7
       and regexp_replace(l.customer_phone, '[^0-9]', '', 'g') = target_phone then 0
      else 1
    end,
    l.created_at desc
  limit 1;

  if candidate_id is not null then
    update public.leads
    set duplicate_of = candidate_id
    where id = p_lead_id;
  end if;

  return candidate_id;
end;
$$;

revoke all on function public.mark_possible_duplicate(uuid) from public;
revoke all on function public.mark_possible_duplicate(uuid) from anon;
revoke all on function public.mark_possible_duplicate(uuid) from authenticated;
grant execute on function public.mark_possible_duplicate(uuid) to service_role;

create table if not exists public.quote_versions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  quote jsonb not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (lead_id, version_number)
);

create index if not exists idx_quote_versions_lead
  on public.quote_versions(lead_id, version_number desc);

alter table public.quote_versions enable row level security;

create policy "quote_versions_select_scoped"
on public.quote_versions
for select
to authenticated
using (
  exists (
    select 1
    from public.leads l
    where l.id = quote_versions.lead_id
      and (public.is_management() or l.assigned_to = auth.uid() or l.assigned_to is null)
  )
);

create or replace function public.snapshot_latest_quote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_version integer;
begin
  if new.latest_quote is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.latest_quote is not distinct from old.latest_quote then
    return new;
  end if;

  select coalesce(max(version_number), 0) + 1
  into next_version
  from public.quote_versions
  where lead_id = new.id;

  insert into public.quote_versions(lead_id, version_number, quote, created_by)
  values (new.id, next_version, new.latest_quote, auth.uid());

  return new;
end;
$$;

drop trigger if exists zzz_snapshot_latest_quote on public.leads;
create trigger zzz_snapshot_latest_quote
after insert or update of latest_quote on public.leads
for each row execute function public.snapshot_latest_quote();

comment on column public.leads.duplicate_of is
  'Possible duplicate lead detected by normalized email/phone matching within the prior 180 days.';
comment on table public.quote_versions is
  'Append-only snapshots of latest_quote changes for historical quotation versioning.';
