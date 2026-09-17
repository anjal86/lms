-- 202609150058_multi_company_workspace_membership.sql
-- Turn workspace membership into the tenant/role source of truth. profiles.workspace_id
-- remains only as the active-workspace compatibility pointer while the rest of the CRM
-- migrates away from the original single-workspace assumption.

begin;

-- ---------------------------------------------------------------------------
-- 1. A profile may exist before it owns or joins a workspace.
-- ---------------------------------------------------------------------------

alter table public.profiles
  alter column workspace_id drop not null,
  alter column workspace_id drop default;

alter table public.workspace_members
  add column if not exists role text,
  add column if not exists permissions jsonb not null default '{}'::jsonb,
  add column if not exists invited_by uuid references public.profiles(id) on delete set null,
  add column if not exists joined_at timestamptz;

update public.workspace_members wm
set role = case p.role
  when 'admin' then 'admin'
  when 'manager' then 'manager'
  else 'agent'
end,
joined_at = coalesce(wm.joined_at, wm.created_at)
from public.profiles p
where p.id = wm.user_id
  and wm.role is null;

alter table public.workspace_members
  alter column role set default 'agent',
  alter column role set not null,
  alter column joined_at set default now();

alter table public.workspace_members
  drop constraint if exists workspace_members_role_check;
alter table public.workspace_members
  add constraint workspace_members_role_check
  check (role in ('owner','admin','manager','agent'));

create index if not exists workspace_members_user_active_idx
  on public.workspace_members(user_id,is_active,workspace_id);
create index if not exists workspace_members_workspace_role_idx
  on public.workspace_members(workspace_id,role,is_active,user_id);

-- Every existing workspace gets exactly one owner. Prefer an existing admin, then
-- manager, then the earliest active member. Other memberships retain their roles.
with ranked as (
  select
    wm.workspace_id,
    wm.user_id,
    row_number() over (
      partition by wm.workspace_id
      order by
        case wm.role when 'admin' then 0 when 'manager' then 1 else 2 end,
        wm.created_at,
        wm.user_id
    ) as rn
  from public.workspace_members wm
  where wm.is_active = true
), chosen as (
  select r.workspace_id,r.user_id
  from ranked r
  where r.rn = 1
    and not exists (
      select 1 from public.workspace_members owner_member
      where owner_member.workspace_id = r.workspace_id
        and owner_member.role = 'owner'
        and owner_member.is_active = true
    )
)
update public.workspace_members wm
set role = 'owner'
from chosen c
where wm.workspace_id = c.workspace_id
  and wm.user_id = c.user_id;

-- ---------------------------------------------------------------------------
-- 2. Workspace permissions now understand Owner as the highest workspace role.
-- ---------------------------------------------------------------------------

alter table public.workspace_role_permissions
  drop constraint if exists workspace_role_permissions_role_check;
alter table public.workspace_role_permissions
  add constraint workspace_role_permissions_role_check
  check (role in ('owner','admin','manager','agent'));

insert into public.workspace_role_permissions(workspace_id,role,permissions)
select w.id,'owner','{"*":true}'::jsonb
from public.workspaces w
on conflict (workspace_id,role) do update
set permissions = excluded.permissions,
    updated_at = now();

-- ---------------------------------------------------------------------------
-- 3. Workspace invitations are independent from global user identity.
-- ---------------------------------------------------------------------------

create table if not exists public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role text not null default 'agent' check (role in ('admin','manager','agent')),
  invited_by uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists workspace_invitations_pending_email_uidx
  on public.workspace_invitations(workspace_id,lower(email))
  where status = 'pending';
create index if not exists workspace_invitations_email_status_idx
  on public.workspace_invitations(lower(email),status,expires_at);

alter table public.workspace_invitations enable row level security;

-- ---------------------------------------------------------------------------
-- 4. Active workspace + role helpers.
-- ---------------------------------------------------------------------------

create or replace function public.current_workspace_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.workspace_id
      from public.profiles p
      join public.workspace_members wm
        on wm.workspace_id = p.workspace_id
       and wm.user_id = p.id
       and wm.is_active = true
      where p.id = auth.uid()
        and p.is_active = true
      limit 1
    ),
    (
      select wm.workspace_id
      from public.workspace_members wm
      join public.profiles p on p.id = wm.user_id
      where wm.user_id = auth.uid()
        and wm.is_active = true
        and p.is_active = true
      order by
        case wm.role when 'owner' then 0 when 'admin' then 1 when 'manager' then 2 else 3 end,
        wm.created_at,
        wm.workspace_id
      limit 1
    )
  );
$$;

create or replace function public.current_workspace_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select wm.role
  from public.workspace_members wm
  where wm.user_id = auth.uid()
    and wm.workspace_id = public.current_workspace_id()
    and wm.is_active = true
  limit 1;
$$;

-- Keep legacy role checks working while membership role becomes canonical.
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case public.current_workspace_role()
    when 'owner' then 'admin'
    when 'admin' then 'admin'
    when 'manager' then 'manager'
    when 'agent' then 'agent'
    else null
  end;
$$;

create or replace function public.is_management()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_workspace_role() in ('owner','admin','manager'), false);
$$;

create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    join public.profiles p on p.id = wm.user_id
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.is_active = true
      and p.is_active = true
  );
$$;

create or replace function public.has_workspace_permission(p_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_member_permissions jsonb;
  v_role_permissions jsonb;
begin
  if auth.uid() is null or nullif(btrim(p_key),'') is null then return false; end if;

  select wm.role, wm.permissions
  into v_role, v_member_permissions
  from public.workspace_members wm
  join public.profiles p on p.id = wm.user_id
  where wm.user_id = auth.uid()
    and wm.workspace_id = public.current_workspace_id()
    and wm.is_active = true
    and p.is_active = true
  limit 1;

  if v_role is null then return false; end if;
  if v_role in ('owner','admin') then return true; end if;

  if v_member_permissions ? '*' then
    return coalesce((v_member_permissions->>'*')::boolean,false);
  end if;
  if v_member_permissions ? p_key then
    return coalesce((v_member_permissions->>p_key)::boolean,false);
  end if;

  select permissions into v_role_permissions
  from public.workspace_role_permissions
  where workspace_id = public.current_workspace_id()
    and role = v_role;

  if v_role_permissions ? '*' and coalesce((v_role_permissions->>'*')::boolean,false) then return true; end if;
  if v_role_permissions ? p_key then return coalesce((v_role_permissions->>p_key)::boolean,false); end if;

  if v_role = 'manager' then
    return p_key in (
      'inbox.view','inbox.assign','inbox.resolve','inbox.saved_views.manage',
      'contacts.view','contacts.edit','contacts.merge',
      'automations.view','automations.edit','automations.publish','reports.view','permissions.view'
    );
  end if;
  if v_role = 'agent' then
    return p_key in ('inbox.view','inbox.resolve','inbox.saved_views.manage','contacts.view','contacts.edit');
  end if;
  return false;
end;
$$;

revoke all on function public.current_workspace_role() from public;
revoke all on function public.is_workspace_member(uuid) from public;
grant execute on function public.current_workspace_role() to authenticated;
grant execute on function public.is_workspace_member(uuid) to authenticated;

-- Switching profiles.workspace_id no longer removes a previous membership. The column
-- is an active-workspace pointer only.
create or replace function public.sync_profile_workspace_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.workspace_id is not null then
    insert into public.workspace_members(workspace_id,user_id,role,is_active,joined_at)
    values (
      new.workspace_id,
      new.id,
      case new.role when 'admin' then 'admin' when 'manager' then 'manager' else 'agent' end,
      new.is_active,
      now()
    )
    on conflict (workspace_id,user_id)
    do update set is_active = excluded.is_active;
  end if;

  return new;
end;
$$;

-- New accounts are not silently attached to the legacy/default business. They either
-- create a workspace or receive membership through an invitation.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id,email,full_name,role,workspace_id)
  values (
    new.id,
    coalesce(new.email,''),
    coalesce(nullif(new.raw_user_meta_data->>'full_name',''), split_part(coalesce(new.email,'User'),'@',1)),
    'agent',
    null
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Claim pending email invitations as soon as a profile is provisioned.
create or replace function public.claim_workspace_invitations_for_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite record;
  v_first_workspace uuid;
  v_first_role text;
begin
  if nullif(lower(btrim(new.email)),'') is null then return new; end if;

  for v_invite in
    select wi.id,wi.workspace_id,wi.role,wi.invited_by
    from public.workspace_invitations wi
    where lower(wi.email) = lower(btrim(new.email))
      and wi.status = 'pending'
      and wi.expires_at > now()
    order by wi.created_at
  loop
    insert into public.workspace_members(workspace_id,user_id,role,is_active,invited_by,joined_at)
    values (v_invite.workspace_id,new.id,v_invite.role,true,v_invite.invited_by,now())
    on conflict (workspace_id,user_id)
    do update set is_active = true;

    update public.workspace_invitations
    set status='accepted',accepted_by=new.id,accepted_at=now(),updated_at=now()
    where id=v_invite.id;

    if v_first_workspace is null then
      v_first_workspace := v_invite.workspace_id;
      v_first_role := v_invite.role;
    end if;
  end loop;

  if new.workspace_id is null and v_first_workspace is not null then
    update public.profiles
    set workspace_id = v_first_workspace,
        role = case v_first_role when 'admin' then 'admin' when 'manager' then 'manager' else 'agent' end
    where id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_claim_workspace_invitations on public.profiles;
create trigger trg_claim_workspace_invitations
after insert or update of email on public.profiles
for each row execute function public.claim_workspace_invitations_for_profile();

create or replace function public.claim_my_workspace_invitations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_invite record;
  v_count integer := 0;
begin
  select * into v_profile from public.profiles where id=auth.uid() and is_active=true;
  if not found then return 0; end if;

  for v_invite in
    select wi.id,wi.workspace_id,wi.role,wi.invited_by
    from public.workspace_invitations wi
    where lower(wi.email)=lower(btrim(v_profile.email))
      and wi.status='pending'
      and wi.expires_at > now()
    order by wi.created_at
  loop
    insert into public.workspace_members(workspace_id,user_id,role,is_active,invited_by,joined_at)
    values (v_invite.workspace_id,v_profile.id,v_invite.role,true,v_invite.invited_by,now())
    on conflict (workspace_id,user_id)
    do update set is_active=true;

    update public.workspace_invitations
    set status='accepted',accepted_by=v_profile.id,accepted_at=now(),updated_at=now()
    where id=v_invite.id;
    v_count := v_count + 1;

    if v_profile.workspace_id is null then
      update public.profiles
      set workspace_id=v_invite.workspace_id,
          role=case v_invite.role when 'admin' then 'admin' when 'manager' then 'manager' else 'agent' end
      where id=v_profile.id;
      v_profile.workspace_id := v_invite.workspace_id;
    end if;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.claim_my_workspace_invitations() from public,anon;
grant execute on function public.claim_my_workspace_invitations() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Workspace creation and switching.
-- ---------------------------------------------------------------------------

create or replace function public.create_workspace_for_current_user(
  p_name text,
  p_template_key text default 'generic'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid := gen_random_uuid();
  v_slug text;
  v_base_slug text;
  v_template_key text := coalesce(nullif(btrim(p_template_key),''),'generic');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(btrim(p_name),'') is null then raise exception 'Workspace name is required'; end if;
  if not exists (select 1 from public.profiles where id=auth.uid() and is_active=true) then
    raise exception 'Active profile required';
  end if;
  if not exists (select 1 from public.business_templates where key=v_template_key and is_active=true) then
    raise exception 'Unknown business template: %', v_template_key;
  end if;

  v_base_slug := regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '-', 'g');
  v_base_slug := regexp_replace(v_base_slug, '(^-+|-+$)', '', 'g');
  if v_base_slug = '' then v_base_slug := 'workspace'; end if;
  v_slug := v_base_slug;
  while exists (select 1 from public.workspaces where slug=v_slug) loop
    v_slug := v_base_slug || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,6);
  end loop;

  insert into public.workspaces(id,name,slug,business_type,template_key)
  select v_workspace_id,btrim(p_name),v_slug,bt.business_type,bt.key
  from public.business_templates bt
  where bt.key=v_template_key;

  insert into public.workspace_members(workspace_id,user_id,role,is_active,joined_at)
  values (v_workspace_id,auth.uid(),'owner',true,now());

  insert into public.workspace_role_permissions(workspace_id,role,permissions)
  values
    (v_workspace_id,'owner','{"*":true}'::jsonb),
    (v_workspace_id,'admin','{"*":true}'::jsonb),
    (v_workspace_id,'manager',jsonb_build_object(
      'inbox.view',true,'inbox.assign',true,'inbox.resolve',true,'inbox.saved_views.manage',true,
      'contacts.view',true,'contacts.edit',true,'contacts.merge',true,
      'automations.view',true,'automations.edit',true,'automations.publish',true,
      'reports.view',true,'permissions.view',true,'permissions.manage',false
    )),
    (v_workspace_id,'agent',jsonb_build_object(
      'inbox.view',true,'inbox.assign',false,'inbox.resolve',true,'inbox.saved_views.manage',true,
      'contacts.view',true,'contacts.edit',true,'contacts.merge',false,
      'automations.view',false,'automations.edit',false,'automations.publish',false,
      'reports.view',false,'permissions.view',false,'permissions.manage',false
    ))
  on conflict (workspace_id,role) do nothing;

  update public.profiles
  set workspace_id=v_workspace_id,role='admin'
  where id=auth.uid();

  perform public.apply_business_template(v_workspace_id,v_template_key);
  return v_workspace_id;
end;
$$;

create or replace function public.switch_workspace(p_workspace_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select wm.role into v_role
  from public.workspace_members wm
  join public.profiles p on p.id=wm.user_id
  where wm.workspace_id=p_workspace_id
    and wm.user_id=auth.uid()
    and wm.is_active=true
    and p.is_active=true
  limit 1;

  if v_role is null then raise exception 'Workspace membership not found'; end if;

  update public.profiles
  set workspace_id=p_workspace_id,
      role=case v_role when 'owner' then 'admin' when 'admin' then 'admin' when 'manager' then 'manager' else 'agent' end
  where id=auth.uid();

  return v_role;
end;
$$;

revoke all on function public.create_workspace_for_current_user(text,text) from public,anon;
revoke all on function public.switch_workspace(uuid) from public,anon;
grant execute on function public.create_workspace_for_current_user(text,text) to authenticated;
grant execute on function public.switch_workspace(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Tenant-safe RLS for workspaces, members, invitations, and profiles.
-- ---------------------------------------------------------------------------

drop policy if exists workspaces_read_current on public.workspaces;
create policy workspaces_read_memberships on public.workspaces
for select to authenticated
using (public.current_user_active() and public.is_workspace_member(id));

drop policy if exists workspace_members_read_current on public.workspace_members;
create policy workspace_members_read_memberships on public.workspace_members
for select to authenticated
using (
  public.current_user_active()
  and (
    user_id = auth.uid()
    or workspace_id = public.current_workspace_id()
  )
);

drop policy if exists workspace_invitations_read on public.workspace_invitations;
create policy workspace_invitations_read on public.workspace_invitations
for select to authenticated
using (
  public.current_user_active()
  and (
    lower(email) = lower((select p.email from public.profiles p where p.id=auth.uid()))
    or (
      workspace_id = public.current_workspace_id()
      and public.current_workspace_role() in ('owner','admin','manager')
    )
  )
);

drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated on public.profiles
for select to authenticated
using (
  public.current_user_active()
  and (
    id = auth.uid()
    or exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = public.current_workspace_id()
        and wm.user_id = profiles.id
        and wm.is_active = true
    )
  )
);

drop policy if exists profiles_update_scoped on public.profiles;
create policy profiles_update_scoped on public.profiles
for update to authenticated
using (
  public.current_user_active()
  and (
    id = auth.uid()
    or (
      public.is_management()
      and exists (
        select 1 from public.workspace_members wm
        where wm.workspace_id = public.current_workspace_id()
          and wm.user_id = profiles.id
          and wm.is_active = true
      )
    )
  )
)
with check (
  public.current_user_active()
  and (
    id = auth.uid()
    or (
      public.is_management()
      and exists (
        select 1 from public.workspace_members wm
        where wm.workspace_id = public.current_workspace_id()
          and wm.user_id = profiles.id
          and wm.is_active = true
      )
    )
  )
);

grant select on public.workspace_invitations to authenticated;

grant select on public.workspace_members to authenticated;

commit;
