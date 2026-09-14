-- 202609120034_profile_assignment_metrics.sql
-- Adds last_assigned_at and conversion_rate columns to public.profiles
-- required by assign_conversation() for round-robin, conversion-weighted, and capacity routing.

begin;

alter table public.profiles
  add column if not exists last_assigned_at timestamptz,
  add column if not exists conversion_rate numeric(5,2) not null default 0;

commit;
