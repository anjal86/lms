-- 202609120025_workspace_runtime_integrity.sql
-- Runtime helpers for workspace-aware records while legacy travel flows remain compatible.

begin;

create or replace function public.sync_profile_workspace_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workspace_members(workspace_id,user_id,is_active)
  values (new.workspace_id,new.id,new.is_active)
  on conflict (workspace_id,user_id)
  do update set is_active = excluded.is_active;

  if tg_op = 'UPDATE' and old.workspace_id is distinct from new.workspace_id then
    update public.workspace_members
    set is_active = false
    where workspace_id = old.workspace_id and user_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_workspace_membership on public.profiles;
create trigger trg_profiles_workspace_membership
after insert or update of workspace_id,is_active on public.profiles
for each row execute function public.sync_profile_workspace_membership();

-- Lead codes now follow the active business instead of permanently saying TRV.
-- Existing lead codes are preserved; only new rows without a code use this rule.
create or replace function public.prepare_lead()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  frt_minutes integer;
  v_business_type text;
  v_prefix text;
begin
  if new.workspace_id is null then
    new.workspace_id := coalesce(public.current_workspace_id(), '00000000-0000-0000-0000-000000000001'::uuid);
  end if;

  if new.lead_code is null or btrim(new.lead_code) = '' then
    select business_type into v_business_type
    from public.workspaces
    where id = new.workspace_id;

    v_prefix := case coalesce(v_business_type,'generic')
      when 'travel' then 'TRV'
      when 'consultancy' then 'EDU'
      when 'health' then 'HLT'
      when 'agency' then 'AGY'
      else 'LEAD'
    end;

    new.lead_code := v_prefix || '-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.lead_code_seq')::text, 6, '0');
  end if;

  if new.assigned_to is not null then
    new.assigned_at := coalesce(new.assigned_at, now());
    if new.first_response_due_at is null then
      select coalesce((settings->>'frt_minutes')::integer,30)
      into frt_minutes from public.agency_settings where id='default';
      new.first_response_due_at := new.assigned_at + make_interval(mins => coalesce(frt_minutes,30));
    end if;
  end if;

  return new;
end;
$$;

commit;
