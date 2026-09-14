-- 202609120038_service_level_permissions.sql
-- Extends granular workspace permissions for conversation service-level configuration.

begin;

update public.workspace_role_permissions
set permissions = permissions || '{"service_levels.view":true,"service_levels.edit":true}'::jsonb,
    updated_at = now()
where role='manager';

update public.workspace_role_permissions
set permissions = permissions || '{"service_levels.view":false,"service_levels.edit":false}'::jsonb,
    updated_at = now()
where role='agent';

create or replace function public.has_workspace_permission(p_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_permissions jsonb;
begin
  if auth.uid() is null or nullif(btrim(p_key),'') is null then return false; end if;

  select * into v_profile
  from public.profiles
  where id=auth.uid() and is_active=true;
  if not found or v_profile.workspace_id is null then return false; end if;
  if v_profile.role='admin' then return true; end if;

  select permissions into v_permissions
  from public.workspace_role_permissions
  where workspace_id=v_profile.workspace_id and role=v_profile.role;

  if v_permissions ? '*' and coalesce((v_permissions->>'*')::boolean,false) then return true; end if;
  if v_permissions ? p_key then return coalesce((v_permissions->>p_key)::boolean,false); end if;

  if v_profile.role='manager' then
    return p_key in (
      'inbox.view','inbox.assign','inbox.resolve','inbox.saved_views.manage',
      'contacts.view','contacts.edit','contacts.merge',
      'automations.view','automations.edit','automations.publish',
      'reports.view','permissions.view',
      'service_levels.view','service_levels.edit'
    );
  end if;
  if v_profile.role='agent' then
    return p_key in ('inbox.view','inbox.resolve','inbox.saved_views.manage','contacts.view','contacts.edit');
  end if;
  return false;
end;
$$;

commit;
