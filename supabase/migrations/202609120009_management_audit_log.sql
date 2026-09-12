-- Append-only audit trail for privileged CRM state changes.

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role text,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_events_created_at
  on public.audit_events(created_at desc);
create index if not exists idx_audit_events_entity
  on public.audit_events(entity_type, entity_id, created_at desc);
create index if not exists idx_audit_events_actor
  on public.audit_events(actor_id, created_at desc);

alter table public.audit_events enable row level security;

create policy "audit_events_management_select"
on public.audit_events
for select
to authenticated
using (public.is_management());

create or replace function public.audit_actor_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.role() = 'service_role' then 'service_role'
    else coalesce(public.current_user_role(), 'unknown')
  end;
$$;

create or replace function public.audit_lead_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if row(
    old.stage,
    old.assigned_to,
    old.package_sale_price,
    old.vendor_net_cost,
    old.commission_status,
    old.trip_status,
    old.duplicate_of
  ) is distinct from row(
    new.stage,
    new.assigned_to,
    new.package_sale_price,
    new.vendor_net_cost,
    new.commission_status,
    new.trip_status,
    new.duplicate_of
  ) then
    insert into public.audit_events(actor_id, actor_role, entity_type, entity_id, action, changes)
    values (
      auth.uid(),
      public.audit_actor_role(),
      'lead',
      new.id::text,
      'update',
      jsonb_build_object(
        'lead_code', new.lead_code,
        'stage', jsonb_build_object('from', old.stage, 'to', new.stage),
        'assigned_to', jsonb_build_object('from', old.assigned_to, 'to', new.assigned_to),
        'package_sale_price', jsonb_build_object('from', old.package_sale_price, 'to', new.package_sale_price),
        'vendor_net_cost', jsonb_build_object('from', old.vendor_net_cost, 'to', new.vendor_net_cost),
        'commission_status', jsonb_build_object('from', old.commission_status, 'to', new.commission_status),
        'trip_status', jsonb_build_object('from', old.trip_status, 'to', new.trip_status),
        'duplicate_of', jsonb_build_object('from', old.duplicate_of, 'to', new.duplicate_of)
      )
    );
  end if;
  return new;
end;
$$;

create or replace function public.audit_profile_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if row(old.role, old.is_active, old.accepting_leads, old.max_capacity, old.status)
     is distinct from
     row(new.role, new.is_active, new.accepting_leads, new.max_capacity, new.status) then
    insert into public.audit_events(actor_id, actor_role, entity_type, entity_id, action, changes)
    values (
      auth.uid(),
      public.audit_actor_role(),
      'profile',
      new.id::text,
      'update',
      jsonb_build_object(
        'email', new.email,
        'role', jsonb_build_object('from', old.role, 'to', new.role),
        'is_active', jsonb_build_object('from', old.is_active, 'to', new.is_active),
        'accepting_leads', jsonb_build_object('from', old.accepting_leads, 'to', new.accepting_leads),
        'max_capacity', jsonb_build_object('from', old.max_capacity, 'to', new.max_capacity),
        'status', jsonb_build_object('from', old.status, 'to', new.status)
      )
    );
  end if;
  return new;
end;
$$;

create or replace function public.audit_settings_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.settings is distinct from new.settings then
    insert into public.audit_events(actor_id, actor_role, entity_type, entity_id, action, changes)
    values (
      auth.uid(),
      public.audit_actor_role(),
      'agency_settings',
      new.id,
      'update',
      jsonb_build_object('from', old.settings, 'to', new.settings)
    );
  end if;
  return new;
end;
$$;

create or replace function public.audit_incentive_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$;
-- Placeholder replaced below to keep migration compatible with all supported PostgreSQL trigger operations.
$$;

drop function if exists public.audit_incentive_change();
create function public.audit_incentive_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_id text;
  payload jsonb;
begin
  row_id := coalesce(new.id, old.id);
  payload := case tg_op
    when 'INSERT' then jsonb_build_object('to', to_jsonb(new))
    when 'DELETE' then jsonb_build_object('from', to_jsonb(old))
    else jsonb_build_object('from', to_jsonb(old), 'to', to_jsonb(new))
  end;

  insert into public.audit_events(actor_id, actor_role, entity_type, entity_id, action, changes)
  values (auth.uid(), public.audit_actor_role(), 'incentive_tier', row_id, lower(tg_op), payload);

  return coalesce(new, old);
end;
$$;

create or replace function public.prevent_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Audit events are append-only';
end;
$$;

drop trigger if exists zzz_audit_lead_change on public.leads;
create trigger zzz_audit_lead_change
after update on public.leads
for each row execute function public.audit_lead_change();

drop trigger if exists zzz_audit_profile_change on public.profiles;
create trigger zzz_audit_profile_change
after update on public.profiles
for each row execute function public.audit_profile_change();

drop trigger if exists zzz_audit_settings_change on public.agency_settings;
create trigger zzz_audit_settings_change
after update on public.agency_settings
for each row execute function public.audit_settings_change();

drop trigger if exists zzz_audit_incentives on public.incentive_tiers;
create trigger zzz_audit_incentives
after insert or update or delete on public.incentive_tiers
for each row execute function public.audit_incentive_change();

drop trigger if exists zzz_prevent_audit_update on public.audit_events;
create trigger zzz_prevent_audit_update
before update or delete on public.audit_events
for each row execute function public.prevent_audit_mutation();

revoke all on function public.audit_actor_role() from public;
revoke all on function public.audit_lead_change() from public;
revoke all on function public.audit_profile_change() from public;
revoke all on function public.audit_settings_change() from public;
revoke all on function public.audit_incentive_change() from public;
revoke all on function public.prevent_audit_mutation() from public;
