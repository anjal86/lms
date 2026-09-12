-- Canonical production schema for Wanderlust Travel CRM.
-- This is the single source of truth used by local Docker and hosted Supabase.

create extension if not exists "pgcrypto";

create sequence if not exists public.lead_code_seq start 1;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  employee_code text unique,
  email text unique not null,
  full_name text not null,
  role text not null default 'agent' check (role in ('admin','manager','agent')),
  phone text,
  direct_extension text,
  avatar_url text,
  destination_tags text[] not null default '{}',
  max_capacity integer not null default 25 check (max_capacity between 1 and 500),
  current_load integer not null default 0 check (current_load >= 0),
  status text not null default 'available' check (status in ('available','in_call','on_break','offline')),
  is_active boolean not null default true,
  accepting_leads boolean not null default true,
  bio text,
  languages text[] not null default '{English}',
  office_location text,
  certifications text[] not null default '{}',
  user_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  lead_code text unique,
  customer_name text not null,
  customer_email text,
  customer_phone text not null,
  customer_city text,
  customer_country text,
  destination text not null,
  travel_dates text,
  duration_days integer not null default 5 check (duration_days > 0),
  pax_adults integer not null default 2 check (pax_adults >= 0),
  pax_children integer not null default 0 check (pax_children >= 0),
  pax_infants integer not null default 0 check (pax_infants >= 0),
  travel_type text not null default 'family',
  budget_range text,
  hotel_category text,
  flight_required boolean not null default true,
  visa_required boolean not null default false,
  special_notes text,
  source text not null default 'website',
  external_id text,
  stage text not null default 'new' check (stage in ('new','contacted','quote_sent','in_negotiation','won','lost','junk')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  assigned_to uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz,
  assigned_by uuid references public.profiles(id) on delete set null,
  first_response_due_at timestamptz,
  first_contacted_at timestamptz,
  first_response_time_seconds integer,
  is_first_response_breached boolean not null default false,
  next_follow_up_at timestamptz,
  last_contacted_at timestamptz,
  last_activity_type text,
  won_deal_value numeric(14,2),
  package_sale_price numeric(14,2),
  vendor_net_cost numeric(14,2),
  gross_profit numeric(14,2),
  profit_margin_pct numeric(7,2),
  agent_commission_earned numeric(14,2),
  commission_status text default 'accrued' check (commission_status in ('accrued','approved','paid')),
  lost_reason text,
  lost_notes text,
  closed_at timestamptz,
  trip_status text default 'planning' check (trip_status in ('planning','booked','pre_departure','on_trip','completed')),
  quotes jsonb not null default '[]'::jsonb,
  payment_milestones jsonb not null default '[]'::jsonb,
  payment_records jsonb not null default '[]'::jsonb,
  itinerary_days jsonb not null default '[]'::jsonb,
  passengers jsonb not null default '[]'::jsonb,
  documents jsonb not null default '[]'::jsonb,
  supplier_payables jsonb not null default '[]'::jsonb,
  checklist jsonb,
  post_trip_review jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, external_id)
);

create table if not exists public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  assigned_to uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  scheduled_at timestamptz not null,
  channel text not null default 'call' check (channel in ('call','whatsapp','email','meeting')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'pending' check (status in ('pending','completed','missed','cancelled')),
  notes text,
  completion_notes text,
  completed_at timestamptz,
  disposition text,
  is_escalated boolean not null default false,
  escalated_at timestamptz,
  retry_count integer not null default 0,
  rescheduled_from_id uuid references public.follow_ups(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  agent_id uuid references public.profiles(id) on delete set null,
  activity_type text not null check (activity_type in ('call','whatsapp','email','note','quote','payment','document','stage_change','reassignment','sla_alert','system')),
  title text not null,
  outcome text,
  notes text,
  call_duration_seconds integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'custom',
  message_body text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agency_settings (
  id text primary key default 'default',
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  type text not null check (type in ('lead_assigned','sla_breach','follow_up_due','reassignment','system')),
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.incentive_tiers (
  id text primary key,
  name text not null,
  min_sales numeric(14,2) not null default 0,
  max_sales numeric(14,2),
  commission_pct_profit numeric(7,2) not null default 0,
  milestone_bonus numeric(14,2) not null default 0,
  min_margin_threshold numeric(7,2) not null default 0,
  perk_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.webhook_events (
  idempotency_key text primary key,
  source text not null default 'webhook',
  created_at timestamptz not null default now()
);

create index if not exists idx_profiles_role_status on public.profiles(role,status,is_active);
create index if not exists idx_leads_stage on public.leads(stage);
create index if not exists idx_leads_assigned_to on public.leads(assigned_to);
create index if not exists idx_leads_next_follow_up on public.leads(next_follow_up_at);
create index if not exists idx_leads_destination on public.leads(destination);
create index if not exists idx_leads_created_at on public.leads(created_at desc);
create index if not exists idx_follow_ups_agent_status on public.follow_ups(assigned_to,status,scheduled_at);
create index if not exists idx_follow_ups_lead on public.follow_ups(lead_id);
create index if not exists idx_activity_logs_lead on public.activity_logs(lead_id,created_at desc);
create index if not exists idx_activity_logs_agent on public.activity_logs(agent_id,created_at desc);
create index if not exists idx_notifications_user on public.notifications(user_id,is_read,created_at desc);
create index if not exists idx_webhook_events_created_at on public.webhook_events(created_at);

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

revoke all on function public.current_user_role() from public;
grant execute on function public.current_user_role() to authenticated;

create or replace function public.is_management()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('admin','manager'), false);
$$;

revoke all on function public.is_management() from public;
grant execute on function public.is_management() to authenticated;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id,email,full_name,role)
  values (
    new.id,
    coalesce(new.email,''),
    coalesce(nullif(new.raw_user_meta_data->>'full_name',''), split_part(coalesce(new.email,'User'),'@',1)),
    'agent'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.prepare_lead()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  frt_minutes integer;
begin
  if new.lead_code is null or btrim(new.lead_code) = '' then
    new.lead_code := 'TRV-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.lead_code_seq')::text, 6, '0');
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

create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare actor_role text;
begin
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

create or replace function public.protect_lead_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare actor_role text;
begin
  if auth.role() = 'service_role' then return new; end if;
  actor_role := public.current_user_role();
  if actor_role = 'agent' then
    new.assigned_to := old.assigned_to;
    new.assigned_by := old.assigned_by;
    new.commission_status := old.commission_status;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles for each row execute function public.touch_updated_at();
drop trigger if exists trg_profiles_protect on public.profiles;
create trigger trg_profiles_protect before update on public.profiles for each row execute function public.protect_profile_privileged_fields();
drop trigger if exists trg_leads_prepare on public.leads;
create trigger trg_leads_prepare before insert on public.leads for each row execute function public.prepare_lead();
drop trigger if exists trg_leads_updated_at on public.leads;
create trigger trg_leads_updated_at before update on public.leads for each row execute function public.touch_updated_at();
drop trigger if exists trg_leads_protect on public.leads;
create trigger trg_leads_protect before update on public.leads for each row execute function public.protect_lead_privileged_fields();
drop trigger if exists trg_followups_updated_at on public.follow_ups;
create trigger trg_followups_updated_at before update on public.follow_ups for each row execute function public.touch_updated_at();
drop trigger if exists trg_templates_updated_at on public.whatsapp_templates;
create trigger trg_templates_updated_at before update on public.whatsapp_templates for each row execute function public.touch_updated_at();
drop trigger if exists trg_settings_updated_at on public.agency_settings;
create trigger trg_settings_updated_at before update on public.agency_settings for each row execute function public.touch_updated_at();
drop trigger if exists trg_incentives_updated_at on public.incentive_tiers;
create trigger trg_incentives_updated_at before update on public.incentive_tiers for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.leads enable row level security;
alter table public.follow_ups enable row level security;
alter table public.activity_logs enable row level security;
alter table public.whatsapp_templates enable row level security;
alter table public.agency_settings enable row level security;
alter table public.notifications enable row level security;
alter table public.incentive_tiers enable row level security;
alter table public.webhook_events enable row level security;

-- Profiles
create policy "profiles_select_authenticated" on public.profiles for select to authenticated using (true);
create policy "profiles_update_scoped" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_management())
  with check (id = auth.uid() or public.is_management());

-- Leads
create policy "leads_select_scoped" on public.leads for select to authenticated
  using (public.is_management() or assigned_to = auth.uid() or assigned_to is null);
create policy "leads_insert_scoped" on public.leads for insert to authenticated
  with check (public.is_management() or assigned_to = auth.uid() or assigned_to is null);
create policy "leads_update_scoped" on public.leads for update to authenticated
  using (public.is_management() or assigned_to = auth.uid())
  with check (public.is_management() or assigned_to = auth.uid());
create policy "leads_delete_management" on public.leads for delete to authenticated using (public.is_management());

-- Follow-ups
create policy "followups_select_scoped" on public.follow_ups for select to authenticated
  using (public.is_management() or assigned_to = auth.uid());
create policy "followups_insert_scoped" on public.follow_ups for insert to authenticated
  with check (public.is_management() or assigned_to = auth.uid());
create policy "followups_update_scoped" on public.follow_ups for update to authenticated
  using (public.is_management() or assigned_to = auth.uid())
  with check (public.is_management() or assigned_to = auth.uid());
create policy "followups_delete_scoped" on public.follow_ups for delete to authenticated
  using (public.is_management() or assigned_to = auth.uid());

-- Append-only activity log. Agents cannot forge another user's identity.
create policy "activity_select_scoped" on public.activity_logs for select to authenticated
  using (
    public.is_management()
    or exists (
      select 1 from public.leads l
      where l.id = activity_logs.lead_id
        and (l.assigned_to = auth.uid() or l.assigned_to is null)
    )
  );
create policy "activity_insert_scoped" on public.activity_logs for insert to authenticated
  with check (
    agent_id = auth.uid()
    and (
      public.is_management()
      or exists (
        select 1 from public.leads l
        where l.id = activity_logs.lead_id
          and (l.assigned_to = auth.uid() or l.assigned_to is null)
      )
    )
  );

-- Shared read-only operational configuration; writes go through authorized server routes.
create policy "templates_select_authenticated" on public.whatsapp_templates for select to authenticated using (true);
create policy "templates_write_management" on public.whatsapp_templates for all to authenticated
  using (public.is_management()) with check (public.is_management());
create policy "settings_select_authenticated" on public.agency_settings for select to authenticated using (true);
create policy "notifications_select_own" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "notifications_update_own" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "incentives_select_authenticated" on public.incentive_tiers for select to authenticated using (true);

insert into public.agency_settings(id,settings)
values ('default', jsonb_build_object(
  'frt_minutes',30,
  'overdue_grace_minutes',60,
  'escalate_to_manager',true,
  'auto_reassign_breached_leads',false,
  'auto_reassign_hours',4,
  'business_hours_start','09:00',
  'business_hours_end','18:00',
  'freeze_sla_weekends',true,
  'timezone','Asia/Kathmandu',
  'pre_breach_warning_minutes',10,
  'routing_strategy','workload_balanced',
  'routing_overflow_policy','unassigned_pool',
  'vip_high_budget_threshold',8000,
  'vip_route_seniors_only',true,
  'lead_cooldown_minutes',3,
  'currency','USD',
  'currency_symbol','$',
  'date_format','DD/MM/YYYY',
  'commission_tds_pct',10,
  'min_gross_margin_threshold',12,
  'payout_frequency','monthly',
  'notification_sound_enabled',true,
  'notification_sound_preset','chime',
  'notification_volume',75,
  'mute_sound_in_call',true,
  'browser_push_enabled',false,
  'toast_duration_seconds',3,
  'custom_lost_reasons',jsonb_build_array('budget_too_high','competitor','dates_changed','no_response','other'),
  'custom_lead_sources',jsonb_build_array('website','meta_ads','google_ads','whatsapp','referral','walk_in','phone_call','other'),
  'auto_archive_days',30
)) on conflict (id) do nothing;

insert into public.incentive_tiers(id,name,min_sales,max_sales,commission_pct_profit,milestone_bonus,min_margin_threshold,perk_description)
values
  ('bronze','Bronze',0,10000,6,0,10,'Entry tier'),
  ('silver','Silver',10000,25000,9,150,12,'Consistent performer'),
  ('gold','Gold',25000,50000,13,350,14,'High performer'),
  ('platinum','Platinum',50000,null,18,750,16,'Top performer')
on conflict (id) do nothing;

insert into public.whatsapp_templates(name,category,message_body,is_active)
select * from (values
  ('Initial Welcome & Trip Inquiry','welcome','Hi {{customer_name}}, thank you for reaching out. This is {{agent_name}}, your travel planner for {{destination}}. Could you confirm whether your dates are flexible?',true),
  ('Custom Itinerary & Quote Sent','quote_followup','Hello {{customer_name}}, I have prepared your customized {{destination}} itinerary and quote. Please let me know what you would like adjusted.',true),
  ('Follow-up Reminder','reminder','Hi {{customer_name}}, checking in regarding your {{destination}} trip. Let me know a convenient time for a quick call.',true)
) as seed(name,category,message_body,is_active)
where not exists (select 1 from public.whatsapp_templates);
