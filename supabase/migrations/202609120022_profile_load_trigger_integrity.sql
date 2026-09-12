-- Let the authoritative lead-load trigger maintain profiles.current_load without
-- allowing authenticated users to edit that privileged field directly.
begin;

create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text;
begin
  -- recompute_profile_load() is invoked by zzz_sync_profile_load on a lead write and is
  -- not executable by authenticated users. Its nested profile UPDATE changes only
  -- current_load, so permit that narrow system-maintained mutation before consulting
  -- request claims. Direct profile edits run at trigger depth 1 and cannot use this path.
  if pg_trigger_depth() > 1
     and new.role is not distinct from old.role
     and new.employee_code is not distinct from old.employee_code
     and new.is_active is not distinct from old.is_active
     and new.max_capacity is not distinct from old.max_capacity
     and new.accepting_leads is not distinct from old.accepting_leads
     and new.email is not distinct from old.email
     and new.full_name is not distinct from old.full_name
     and new.avatar_url is not distinct from old.avatar_url then
    return new;
  end if;

  if auth.role() = 'service_role' then return new; end if;
  actor_role := public.current_user_role();
  if actor_role = 'admin' then return new; end if;

  if actor_role = 'manager' then
    if old.role <> 'agent' and old.id <> auth.uid() then
      raise exception 'Managers may only manage agent profiles';
    end if;
    new.role := old.role;
    new.employee_code := old.employee_code;
    if old.id = auth.uid() then
      new.is_active := old.is_active;
      new.max_capacity := old.max_capacity;
      new.current_load := old.current_load;
    end if;
    return new;
  end if;

  if old.id <> auth.uid() then raise exception 'Not authorized'; end if;
  new.role := old.role;
  new.employee_code := old.employee_code;
  new.is_active := old.is_active;
  new.max_capacity := old.max_capacity;
  new.current_load := old.current_load;
  new.accepting_leads := old.accepting_leads;
  return new;
end;
$$;

commit;
