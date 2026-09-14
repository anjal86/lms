-- 202609120037_contact_profile_edit_integrity.sql
-- Keeps editable Contact fields and canonical CRM identities synchronized atomically.

begin;

create or replace function public.update_contact_profile(
  p_contact_id uuid,
  p_display_name text,
  p_primary_phone text,
  p_primary_email text,
  p_lifecycle_key text,
  p_owner_id uuid,
  p_tags jsonb,
  p_custom_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact public.contacts%rowtype;
  v_phone text;
  v_email text;
  v_phone_normalized text;
  v_email_normalized text;
  v_tags jsonb;
  v_result public.contacts%rowtype;
begin
  if not public.current_user_active() or not public.has_workspace_permission('contacts.edit') then
    raise exception 'Contact edit permission required' using errcode='42501';
  end if;

  select * into v_contact
  from public.contacts
  where id=p_contact_id and workspace_id=public.current_workspace_id()
  for update;
  if not found then raise exception 'Contact not found' using errcode='P0002'; end if;

  if p_owner_id is not null and not exists (
    select 1 from public.profiles p
    where p.id=p_owner_id and p.workspace_id=v_contact.workspace_id and p.is_active=true
  ) then
    raise exception 'Contact owner must be an active workspace member' using errcode='22023';
  end if;

  v_phone := nullif(btrim(coalesce(p_primary_phone,'')),'');
  v_email := nullif(lower(btrim(coalesce(p_primary_email,''))),'');
  v_phone_normalized := case when v_phone is null then null else public.normalize_contact_identity(v_phone,'phone') end;
  v_email_normalized := case when v_email is null then null else public.normalize_contact_identity(v_email,'email') end;

  if v_phone_normalized is not null and exists (
    select 1 from public.contact_identities i
    where i.workspace_id=v_contact.workspace_id
      and i.contact_id <> v_contact.id
      and i.identity_type='phone'
      and i.identity_normalized=v_phone_normalized
  ) then
    raise exception 'Phone number belongs to another contact' using errcode='23505';
  end if;

  if v_email_normalized is not null and exists (
    select 1 from public.contact_identities i
    where i.workspace_id=v_contact.workspace_id
      and i.contact_id <> v_contact.id
      and i.identity_type='email'
      and i.identity_normalized=v_email_normalized
  ) then
    raise exception 'Email address belongs to another contact' using errcode='23505';
  end if;

  select coalesce(jsonb_agg(value order by value),'[]'::jsonb)
  into v_tags
  from (
    select distinct left(btrim(value),80) as value
    from jsonb_array_elements_text(case when jsonb_typeof(coalesce(p_tags,'[]'::jsonb))='array' then coalesce(p_tags,'[]'::jsonb) else '[]'::jsonb end)
    where nullif(btrim(value),'') is not null
    limit 100
  ) clean_tags;

  update public.contacts
  set display_name=nullif(left(btrim(coalesce(p_display_name,'')),160),''),
      primary_phone=v_phone,
      primary_email=v_email,
      lifecycle_key=left(coalesce(nullif(btrim(p_lifecycle_key),''),'new'),80),
      owner_id=p_owner_id,
      tags=v_tags,
      custom_data=case when jsonb_typeof(coalesce(p_custom_data,'{}'::jsonb))='object' then coalesce(p_custom_data,'{}'::jsonb) else '{}'::jsonb end,
      updated_at=now()
  where id=v_contact.id
  returning * into v_result;

  delete from public.contact_identities
  where contact_id=v_contact.id and provider='crm' and identity_type in ('phone','email');

  if v_phone_normalized is not null then
    insert into public.contact_identities(workspace_id,contact_id,provider,identity_type,identity_value,identity_normalized,is_primary)
    values (v_contact.workspace_id,v_contact.id,'crm','phone',v_phone,v_phone_normalized,true);
  end if;
  if v_email_normalized is not null then
    insert into public.contact_identities(workspace_id,contact_id,provider,identity_type,identity_value,identity_normalized,is_primary)
    values (v_contact.workspace_id,v_contact.id,'crm','email',v_email,v_email_normalized,true);
  end if;

  return to_jsonb(v_result);
end;
$$;

revoke all on function public.update_contact_profile(uuid,text,text,text,text,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.update_contact_profile(uuid,text,text,text,text,uuid,jsonb,jsonb) to authenticated;

commit;
