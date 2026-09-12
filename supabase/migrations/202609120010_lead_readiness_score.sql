-- Transparent, deterministic lead-readiness score. This is not an AI prediction.

alter table public.leads
  add column if not exists lead_score integer not null default 0,
  add column if not exists lead_temperature text not null default 'cold';

alter table public.leads
  drop constraint if exists leads_lead_score_check,
  add constraint leads_lead_score_check check (lead_score between 0 and 100),
  drop constraint if exists leads_lead_temperature_check,
  add constraint leads_lead_temperature_check check (lead_temperature in ('cold','warm','hot'));

create or replace function public.derive_lead_readiness()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  score integer := 20;
begin
  if new.stage = 'won' then
    score := 100;
  elsif new.stage in ('lost', 'junk') then
    score := 0;
  else
    if nullif(btrim(coalesce(new.customer_email, '')), '') is not null then score := score + 10; end if;
    if nullif(btrim(coalesce(new.travel_dates, '')), '') is not null then score := score + 15; end if;
    if nullif(btrim(coalesce(new.budget_range, '')), '') is not null then score := score + 15; end if;
    if nullif(btrim(coalesce(new.special_notes, '')), '') is not null then score := score + 5; end if;
    if coalesce(new.pax_adults, 0) + coalesce(new.pax_children, 0) + coalesce(new.pax_infants, 0) > 0 then score := score + 5; end if;

    score := score + case new.priority
      when 'urgent' then 15
      when 'high' then 10
      when 'normal' then 5
      else 0
    end;

    score := score + case new.stage
      when 'contacted' then 10
      when 'quote_sent' then 20
      when 'in_negotiation' then 30
      else 0
    end;

    if coalesce(new.is_first_response_breached, false) then score := score - 10; end if;
    score := greatest(0, least(100, score));
  end if;

  new.lead_score := score;
  new.lead_temperature := case
    when score >= 70 then 'hot'
    when score >= 45 then 'warm'
    else 'cold'
  end;
  return new;
end;
$$;

drop trigger if exists zzy_derive_lead_readiness on public.leads;
create trigger zzy_derive_lead_readiness
before insert or update of customer_email, travel_dates, budget_range, special_notes,
  pax_adults, pax_children, pax_infants, priority, stage, is_first_response_breached
on public.leads
for each row execute function public.derive_lead_readiness();

-- Backfill existing records through the same deterministic function.
update public.leads set priority = priority;

create index if not exists idx_leads_active_score
  on public.leads(lead_score desc, created_at desc)
  where stage in ('new','contacted','quote_sent','in_negotiation');

create or replace function public.search_crm(
  p_query text,
  p_limit integer default 12
)
returns table (
  kind text,
  id uuid,
  title text,
  subtitle text,
  meta jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  with params as (
    select lower(btrim(coalesce(p_query, ''))) as term,
           greatest(1, least(coalesce(p_limit, 12), 30)) as result_limit
  ),
  lead_matches as (
    select
      'lead'::text as kind,
      l.id,
      l.customer_name as title,
      concat_ws(' · ', l.lead_code, l.destination, l.customer_phone) as subtitle,
      jsonb_build_object(
        'lead_code', l.lead_code,
        'destination', l.destination,
        'stage', l.stage,
        'priority', l.priority,
        'lead_score', l.lead_score,
        'lead_temperature', l.lead_temperature,
        'possible_duplicate', l.duplicate_of is not null
      ) as meta,
      case
        when lower(l.lead_code) = params.term then 0
        when lower(l.customer_phone) = params.term then 1
        when lower(coalesce(l.customer_email, '')) = params.term then 2
        when lower(l.customer_name) = params.term then 3
        else 4
      end as rank
    from public.leads l
    cross join params
    where length(params.term) >= 2
      and (
        lower(l.lead_code) like '%' || params.term || '%'
        or lower(l.customer_name) like '%' || params.term || '%'
        or lower(l.destination) like '%' || params.term || '%'
        or lower(l.customer_phone) like '%' || params.term || '%'
        or lower(coalesce(l.customer_email, '')) like '%' || params.term || '%'
      )
    order by rank, l.lead_score desc, l.updated_at desc
    limit (select result_limit from params)
  ),
  profile_matches as (
    select
      'profile'::text as kind,
      p.id,
      p.full_name as title,
      concat_ws(' · ', p.email, p.role) as subtitle,
      jsonb_build_object(
        'role', p.role,
        'status', p.status,
        'destination_tags', p.destination_tags,
        'current_load', p.current_load,
        'max_capacity', p.max_capacity
      ) as meta,
      case
        when lower(p.email) = params.term then 0
        when lower(p.full_name) = params.term then 1
        else 2
      end as rank
    from public.profiles p
    cross join params
    where length(params.term) >= 2
      and p.is_active = true
      and (
        lower(p.full_name) like '%' || params.term || '%'
        or lower(p.email) like '%' || params.term || '%'
        or exists (
          select 1 from unnest(coalesce(p.destination_tags, '{}'::text[])) tag
          where lower(tag) like '%' || params.term || '%'
        )
      )
    order by rank, p.full_name
    limit least(6, (select result_limit from params))
  )
  select kind, id, title, subtitle, meta from lead_matches
  union all
  select kind, id, title, subtitle, meta from profile_matches;
$$;

comment on column public.leads.lead_score is
  'Deterministic readiness/engagement score derived from completeness, priority, stage, and SLA state; not an AI prediction.';
