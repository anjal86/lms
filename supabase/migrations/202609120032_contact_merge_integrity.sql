-- 202609120032_contact_merge_integrity.sql
-- Atomic duplicate-contact merge for the persistent identity layer.

begin;

create or replace function public.merge_contacts(
  p_primary_contact_id uuid,
  p_duplicate_contact_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_primary public.contacts%rowtype;
  v_duplicate public.contacts%rowtype;
  v_tags jsonb;
  v_result public.contacts%rowtype;
begin
  if p_primary_contact_id is null or p_duplicate_contact_id is null or p_primary_contact_id = p_duplicate_contact_id then
    raise exception 'Two different contacts are required' using errcode='22023';
  end if;
  if not public.current_user_active() or not public.is_management() then
    raise exception 'Manager access required' using errcode='42501';
  end if;

  v_workspace_id := public.current_workspace_id();

  -- Deterministic lock order prevents two opposite merge requests from deadlocking.
  perform 1
  from public.contacts
  where id in (p_primary_contact_id,p_duplicate_contact_id)
    and workspace_id=v_workspace_id
  order by id
  for update;

  select * into v_primary
  from public.contacts
  where id=p_primary_contact_id and workspace_id=v_workspace_id;
  select * into v_duplicate
  from public.contacts
  where id=p_duplicate_contact_id and workspace_id=v_workspace_id;

  if v_primary.id is null or v_duplicate.id is null then
    raise exception 'Contact not found in current workspace' using errcode='P0002';
  end if;

  select coalesce(jsonb_agg(value order by value),'[]'::jsonb)
  into v_tags
  from (
    select distinct value
    from (
      select value from jsonb_array_elements_text(coalesce(v_primary.tags,'[]'::jsonb))
      union all
      select value from jsonb_array_elements_text(coalesce(v_duplicate.tags,'[]'::jsonb))
    ) combined
  ) unique_tags;

  update public.contacts
  set display_name = coalesce(nullif(btrim(v_primary.display_name),''),nullif(btrim(v_duplicate.display_name),'')),
      primary_phone = coalesce(nullif(btrim(v_primary.primary_phone),''),nullif(btrim(v_duplicate.primary_phone),'')),
      primary_email = coalesce(nullif(btrim(v_primary.primary_email),''),nullif(btrim(v_duplicate.primary_email),'')),
      avatar_url = coalesce(nullif(btrim(v_primary.avatar_url),''),nullif(btrim(v_duplicate.avatar_url),'')),
      lifecycle_key = case when v_primary.lifecycle_key='new' and v_duplicate.lifecycle_key <> 'new' then v_duplicate.lifecycle_key else v_primary.lifecycle_key end,
      owner_id = coalesce(v_primary.owner_id,v_duplicate.owner_id),
      tags = v_tags,
      custom_data = coalesce(v_duplicate.custom_data,'{}'::jsonb) || coalesce(v_primary.custom_data,'{}'::jsonb),
      last_seen_at = greatest(coalesce(v_primary.last_seen_at,'-infinity'::timestamptz),coalesce(v_duplicate.last_seen_at,'-infinity'::timestamptz)),
      updated_at = now()
  where id=v_primary.id
  returning * into v_result;

  -- Remove duplicate identities that already exist on the primary, then re-parent the rest.
  delete from public.contact_identities duplicate_identity
  where duplicate_identity.contact_id=v_duplicate.id
    and exists (
      select 1 from public.contact_identities primary_identity
      where primary_identity.contact_id=v_primary.id
        and primary_identity.workspace_id=duplicate_identity.workspace_id
        and primary_identity.provider=duplicate_identity.provider
        and primary_identity.identity_type=duplicate_identity.identity_type
        and primary_identity.identity_normalized=duplicate_identity.identity_normalized
    );

  update public.contact_identities
  set contact_id=v_primary.id
  where contact_id=v_duplicate.id;

  update public.lead_conversations
  set contact_id=v_primary.id,updated_at=now()
  where workspace_id=v_workspace_id and contact_id=v_duplicate.id;

  update public.conversation_events
  set contact_id=v_primary.id
  where workspace_id=v_workspace_id and contact_id=v_duplicate.id;

  delete from public.contacts where id=v_duplicate.id;

  insert into public.conversation_events(workspace_id,conversation_id,contact_id,event_type,actor_id,payload)
  select v_workspace_id,c.id,v_primary.id,'contact_merged',auth.uid(),jsonb_build_object(
    'primary_contact_id',v_primary.id,
    'merged_contact_id',v_duplicate.id
  )
  from public.lead_conversations c
  where c.workspace_id=v_workspace_id and c.contact_id=v_primary.id;

  return to_jsonb(v_result);
end;
$$;

revoke all on function public.merge_contacts(uuid,uuid) from public,anon;
grant execute on function public.merge_contacts(uuid,uuid) to authenticated;

commit;
