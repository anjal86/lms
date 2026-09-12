-- Route a lead and reserve an agent inside one database transaction.
-- This prevents concurrent webhook requests from choosing the same stale workload snapshot.

create or replace function public.route_lead_atomic(
  p_lead_id uuid,
  p_destination text,
  p_excluded_agent uuid default null,
  p_force boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate_id uuid;
  frt_minutes integer := 30;
  auto_assign boolean := true;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Not authorized';
  end if;

  select
    coalesce((settings->>'frt_minutes')::integer, 30),
    coalesce((settings->>'auto_assign_enabled')::boolean, true)
  into frt_minutes, auto_assign
  from public.agency_settings
  where id = 'default';

  if not p_force and not coalesce(auto_assign, true) then
    return null;
  end if;

  select p.id
  into candidate_id
  from public.profiles p
  where p.role = 'agent'
    and p.is_active = true
    and p.accepting_leads = true
    and p.status = 'available'
    and p.current_load < p.max_capacity
    and (p_excluded_agent is null or p.id <> p_excluded_agent)
  order by
    case when exists (
      select 1
      from unnest(coalesce(p.destination_tags, '{}'::text[])) as tag
      where lower(tag) = 'global'
         or lower(coalesce(p_destination, '')) like '%' || lower(tag) || '%'
         or lower(tag) like '%' || lower(coalesce(p_destination, '')) || '%'
    ) then 0 else 1 end,
    (p.current_load::numeric / greatest(p.max_capacity, 1)) asc,
    p.updated_at asc,
    p.id asc
  for update skip locked
  limit 1;

  if candidate_id is null then
    return null;
  end if;

  update public.leads
  set assigned_to = candidate_id,
      assigned_at = now(),
      first_response_due_at = now() + make_interval(mins => greatest(coalesce(frt_minutes, 30), 1)),
      is_first_response_breached = false
  where id = p_lead_id
    and first_contacted_at is null
    and (assigned_to is null or assigned_to = p_excluded_agent);

  if not found then
    return null;
  end if;

  return candidate_id;
end;
$$;

revoke all on function public.route_lead_atomic(uuid,text,uuid,boolean) from public;
revoke all on function public.route_lead_atomic(uuid,text,uuid,boolean) from anon;
revoke all on function public.route_lead_atomic(uuid,text,uuid,boolean) from authenticated;
grant execute on function public.route_lead_atomic(uuid,text,uuid,boolean) to service_role;
