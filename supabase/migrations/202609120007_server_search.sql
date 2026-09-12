-- RLS-aware global CRM search used by the command palette.

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
    order by rank, l.updated_at desc
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

revoke all on function public.search_crm(text,integer) from public;
revoke all on function public.search_crm(text,integer) from anon;
grant execute on function public.search_crm(text,integer) to authenticated;
