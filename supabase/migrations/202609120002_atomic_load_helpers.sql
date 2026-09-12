create or replace function public.increment_profile_load(profile_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
  set current_load = current_load + 1
  where id = profile_id;
$$;

create or replace function public.decrement_profile_load(profile_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
  set current_load = greatest(0, current_load - 1)
  where id = profile_id;
$$;

revoke all on function public.increment_profile_load(uuid) from public, authenticated;
revoke all on function public.decrement_profile_load(uuid) from public, authenticated;
grant execute on function public.increment_profile_load(uuid) to service_role;
grant execute on function public.decrement_profile_load(uuid) to service_role;
