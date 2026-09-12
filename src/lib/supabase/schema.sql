-- ==============================================================================
-- Wanderlust Travel CRM — Production Supabase Schema & Security (RLS)
-- ==============================================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. ENUMS
-- ------------------------------------------------------------------------------
create type user_role as enum ('SUPER_ADMIN', 'ADMIN', 'TEAM_LEAD', 'AGENT');
create type user_status as enum ('ACTIVE', 'INACTIVE', 'ON_LEAVE');
create type lead_stage as enum ('NEW', 'CONTACTED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST');
create type lead_source as enum ('WEBSITE', 'META_ADS', 'GOOGLE_ADS', 'WHATSAPP', 'REFERRAL', 'WALK_IN', 'PHONE_CALL', 'OTHER');
create type priority_level as enum ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
create type trip_status as enum ('PLANNED', 'CONFIRMED', 'CANCELLED', 'IN_PROGRESS', 'COMPLETED');
create type activity_type as enum ('CALL', 'WHATSAPP', 'EMAIL', 'MEETING', 'NOTE', 'STATUS_CHANGE', 'PROPOSAL');
create type follow_up_status as enum ('PENDING', 'COMPLETED', 'CANCELLED', 'RESCHEDULED');

-- ------------------------------------------------------------------------------
-- 2. PROFILES (Extends Supabase auth.users)
-- ------------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text unique not null,
  full_name text not null,
  role user_role not null default 'AGENT',
  employee_code text unique,
  avatar_url text,
  phone text,
  daily_capacity integer not null default 15,
  status user_status not null default 'ACTIVE',
  team_id uuid,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ------------------------------------------------------------------------------
-- 3. LEADS (Core Pipeline Entity)
-- ------------------------------------------------------------------------------
create table if not exists public.leads (
  id uuid default uuid_generate_v4() primary key,
  lead_code text unique not null,
  customer_name text not null,
  customer_email text,
  customer_phone text not null,
  city text,
  destination text not null,
  start_date date,
  end_date date,
  duration_days integer,
  adults_count integer default 2 not null,
  children_count integer default 0 not null,
  hotel_category text default '4_STAR',
  budget_currency text default 'USD' not null,
  budget_amount numeric(12, 2) default 0 not null,
  stage lead_stage not null default 'NEW',
  source lead_source not null default 'WEBSITE',
  priority priority_level not null default 'MEDIUM',
  trip_status trip_status not null default 'PLANNED',
  assigned_agent_id uuid references public.profiles(id) on delete set null,
  assigned_at timestamp with time zone,
  score integer default 50,
  tags text[] default '{}',
  notes text,
  lost_reason text,
  lost_competitor text,
  won_revenue numeric(12, 2),
  custom_fields jsonb default '{}'::jsonb,
  last_contacted_at timestamp with time zone,
  next_follow_up_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ------------------------------------------------------------------------------
-- 4. FOLLOW-UPS (SLA & Agent Task Agenda)
-- ------------------------------------------------------------------------------
create table if not exists public.follow_ups (
  id uuid default uuid_generate_v4() primary key,
  lead_id uuid references public.leads(id) on delete cascade not null,
  agent_id uuid references public.profiles(id) on delete cascade not null,
  due_date timestamp with time zone not null,
  title text not null,
  notes text,
  priority priority_level default 'MEDIUM' not null,
  status follow_up_status default 'PENDING' not null,
  completed_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ------------------------------------------------------------------------------
-- 5. ACTIVITIES (Audit Log & Engagement History)
-- ------------------------------------------------------------------------------
create table if not exists public.activities (
  id uuid default uuid_generate_v4() primary key,
  lead_id uuid references public.leads(id) on delete cascade not null,
  agent_id uuid references public.profiles(id) on delete set null,
  type activity_type not null,
  title text not null,
  description text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ------------------------------------------------------------------------------
-- 6. TEMPLATES (Quick WhatsApp / Email Response Templates)
-- ------------------------------------------------------------------------------
create table if not exists public.templates (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  category text not null default 'GENERAL',
  channel text not null default 'WHATSAPP', -- WHATSAPP, EMAIL, SMS
  content text not null,
  variables text[] default '{}',
  is_global boolean default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ------------------------------------------------------------------------------
-- 7. CRM SETTINGS (Company, Round Robin & SLA Configuration)
-- ------------------------------------------------------------------------------
create table if not exists public.crm_settings (
  id text primary key default 'default',
  company_name text not null default 'Wanderlust Travels',
  sla_response_time_minutes integer not null default 30,
  auto_assign_enabled boolean not null default true,
  round_robin_strategy text not null default 'CAPACITY_BASED',
  working_hours jsonb default '{"start": "09:00", "end": "18:00", "timezone": "Asia/Kolkata"}'::jsonb,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ------------------------------------------------------------------------------
-- 8. INDEXES FOR PERFORMANCE
-- ------------------------------------------------------------------------------
create index if exists idx_leads_stage on public.leads(stage);
create index if exists idx_leads_assigned_agent on public.leads(assigned_agent_id);
create index if exists idx_leads_created_at on public.leads(created_at desc);
create index if exists idx_leads_destination on public.leads(destination);
create index if exists idx_follow_ups_due_date on public.follow_ups(due_date);
create index if exists idx_follow_ups_agent on public.follow_ups(agent_id, status);
create index if exists idx_activities_lead_id on public.activities(lead_id, created_at desc);

-- ------------------------------------------------------------------------------
-- 9. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.leads enable row level security;
alter table public.follow_ups enable row level security;
alter table public.activities enable row level security;
alter table public.templates enable row level security;
alter table public.crm_settings enable row level security;

-- Profiles: Authenticated users can view team profiles; users can edit own profile; Admin can edit any
create policy "Authenticated users can view profiles"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

-- Leads: Admins/Team Leads can view all; Agents can view assigned or unassigned
create policy "Staff can view relevant leads"
  on public.leads for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and (
        profiles.role in ('SUPER_ADMIN', 'ADMIN', 'TEAM_LEAD')
        or leads.assigned_agent_id = auth.uid()
        or leads.assigned_agent_id is null
      )
    )
  );

create policy "Staff can update relevant leads"
  on public.leads for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and (
        profiles.role in ('SUPER_ADMIN', 'ADMIN', 'TEAM_LEAD')
        or leads.assigned_agent_id = auth.uid()
      )
    )
  );

create policy "Staff can insert leads"
  on public.leads for insert
  to authenticated
  with check (true);

-- Activities: All authenticated staff can create & read activity log
create policy "Staff can read activities"
  on public.activities for select
  to authenticated
  using (true);

create policy "Staff can insert activities"
  on public.activities for insert
  to authenticated
  with check (true);

-- Follow-ups: Agents see their own follow-ups; Managers see all
create policy "Staff can manage follow ups"
  on public.follow_ups for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and (
        profiles.role in ('SUPER_ADMIN', 'ADMIN', 'TEAM_LEAD')
        or follow_ups.agent_id = auth.uid()
      )
    )
  );

-- Templates: Global read, author or manager edit
create policy "Staff can read templates"
  on public.templates for select
  to authenticated
  using (true);

create policy "Managers and authors can manage templates"
  on public.templates for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and (
        profiles.role in ('SUPER_ADMIN', 'ADMIN')
        or templates.created_by = auth.uid()
      )
    )
  );

-- Settings: Everyone reads, only Admins edit
create policy "Staff can read settings"
  on public.crm_settings for select
  to authenticated
  using (true);

create policy "Admins can update settings"
  on public.crm_settings for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role in ('SUPER_ADMIN', 'ADMIN')
    )
  );

-- ------------------------------------------------------------------------------
-- 10. TRIGGER FUNCTIONS FOR UPDATED_AT
-- ------------------------------------------------------------------------------
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

create trigger trigger_profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

create trigger trigger_leads_updated_at
  before update on public.leads
  for each row execute function public.handle_updated_at();

create trigger trigger_follow_ups_updated_at
  before update on public.follow_ups
  for each row execute function public.handle_updated_at();
