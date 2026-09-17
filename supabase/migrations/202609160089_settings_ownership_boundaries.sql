-- Separate personal, workspace and installation-wide settings ownership.
-- Workspace roles never imply platform/system administration.

begin;

create table if not exists public.platform_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  note text
);

create index if not exists platform_admins_granted_at_idx
  on public.platform_admins(granted_at desc);

alter table public.platform_admins enable row level security;

-- Installation-wide privilege membership is intentionally invisible and
-- immutable to browser-authenticated users. Provisioning happens only through
-- trusted service-role tooling / deployment operations.
revoke all on public.platform_admins from public, anon, authenticated;
grant all on public.platform_admins to service_role;

create or replace function public.is_platform_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (
      select 1
      from public.platform_admins pa
      join public.profiles p on p.id = pa.user_id
      where pa.user_id = auth.uid()
        and p.is_active = true
    ),
    false
  );
$$;

revoke all on function public.is_platform_super_admin() from public, anon;
grant execute on function public.is_platform_super_admin() to authenticated, service_role;

-- Ensure personal preference keys have predictable defaults without moving
-- them into workspace-owned agency_settings. Existing user values win.
update public.profiles
set user_preferences = jsonb_build_object(
  'idle_auto_away_minutes', 15,
  'default_landing_page', '/leads',
  'kanban_density', 'expanded',
  'instant_whatsapp_direct', false,
  'default_country_code', '+1',
  'language', 'auto',
  'timezone', null,
  'date_format', null,
  'notification_sound_enabled', true,
  'notification_sound_preset', 'chime',
  'notification_volume', 75,
  'mute_sound_in_call', true,
  'browser_push_enabled', false,
  'toast_duration_seconds', 3
) || coalesce(user_preferences, '{}'::jsonb)
where not (
  coalesce(user_preferences, '{}'::jsonb) ? 'language'
  and coalesce(user_preferences, '{}'::jsonb) ? 'notification_sound_enabled'
);

commit;
