-- 202609120039_contact_opportunity_identity.sql
-- Link every opportunity to the persistent Contact layer. Contacts own customer identity;
-- lead customer_* columns remain synchronized compatibility snapshots for existing code.

begin;

alter table public.leads
  add column if not exists contact_id uuid references public.contacts(id) on delete set null;

create index if not exists leads_workspace_contact_idx
  on public.leads(workspace_id, contact_id, updated_at desc);

-- Prefer the contact already attached to a linked conversation.
update public.leads l
set contact_id = source.contact_id
from (
  select distinct on (c.lead_id) c.lead_id, c.contact_id
  from public.lead_conversations c
  where c.lead_id is not null and c.contact_id is not null
  order by c.lead_id, c.last_message_at desc nulls last, c.updated_at desc
) source
where l.id = source.lead_id
  and l.contact_id is null;

-- Create or match a Contact for every remaining opportunity.
do $$
declare
  v_lead public.leads%rowtype;
  v_contact_id uuid;
  v_phone text;
  v_email text;
begin
  for v_lead in
    select * from public.leads where contact_id is null order by created_at, id
  loop
    v_contact_id := null;
    v_phone := public.normalize_contact_identity(v_lead.customer_phone, 'phone');
    v_email := public.normalize_contact_identity(v_lead.customer_email, 'email');

    if v_phone is not null then
      select ci.contact_id into v_contact_id
      from public.contact_identities ci
      where ci.workspace_id = v_lead.workspace_id
        and ci.identity_type = 'phone'
        and ci.identity_normalized = v_phone
      order by case when ci.provider = 'crm' then 0 else 1 end, ci.created_at
      limit 1;
    end if;

    if v_contact_id is null and v_email is not null then
      select ci.contact_id into v_contact_id
      from public.contact_identities ci
      where ci.workspace_id = v_lead.workspace_id
        and ci.identity_type = 'email'
        and ci.identity_normalized = v_email
      order by case when ci.provider = 'crm' then 0 else 1 end, ci.created_at
      limit 1;
    end if;

    if v_contact_id is null then
      insert into public.contacts(
        workspace_id, display_name, primary_phone, primary_email, owner_id, last_seen_at
      ) values (
        v_lead.workspace_id,
        nullif(btrim(v_lead.customer_name), ''),
        nullif(btrim(v_lead.customer_phone), ''),
        nullif(lower(btrim(coalesce(v_lead.customer_email, ''))), ''),
        v_lead.assigned_to,
        coalesce(v_lead.last_contacted_at, v_lead.created_at)
      ) returning id into v_contact_id;
    end if;

    if v_phone is not null then
      insert into public.contact_identities(
        workspace_id, contact_id, provider, identity_type, identity_value, identity_normalized, is_primary
      ) values (
        v_lead.workspace_id, v_contact_id, 'crm', 'phone', v_lead.customer_phone, v_phone, true
      ) on conflict (workspace_id, provider, identity_type, identity_normalized) do nothing;
    end if;

    if v_email is not null then
      insert into public.contact_identities(
        workspace_id, contact_id, provider, identity_type, identity_value, identity_normalized, is_primary
      ) values (
        v_lead.workspace_id, v_contact_id, 'crm', 'email', v_lead.customer_email, v_email, true
      ) on conflict (workspace_id, provider, identity_type, identity_normalized) do nothing;
    end if;

    update public.leads set contact_id = v_contact_id where id = v_lead.id;
  end loop;
end
$$;

create or replace function public.derived_contact_lifecycle(p_contact_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1 from public.leads l where l.contact_id = p_contact_id and l.stage = 'won'
    ) then 'customer'
    when exists (
      select 1 from public.leads l
      where l.contact_id = p_contact_id and l.stage in ('new','contacted','quote_sent','in_negotiation')
    ) then 'opportunity'
    when exists (
      select 1 from public.leads l where l.contact_id = p_contact_id and l.stage in ('lost','junk')
    ) then 'lost'
    else null
  end;
$$;

create or replace function public.refresh_contact_lifecycle(p_contact_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lifecycle text;
begin
  if p_contact_id is null then return; end if;
  v_lifecycle := public.derived_contact_lifecycle(p_contact_id);
  if v_lifecycle is not null then
    update public.contacts
    set lifecycle_key = v_lifecycle,
        updated_at = now()
    where id = p_contact_id and lifecycle_key is distinct from v_lifecycle;
  end if;
end;
$$;

create or replace function public.sync_contact_identity_snapshots()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.leads
  set customer_name = coalesce(nullif(btrim(new.display_name), ''), customer_name),
      customer_phone = coalesce(nullif(btrim(new.primary_phone), ''), customer_phone),
      customer_email = nullif(lower(btrim(coalesce(new.primary_email, ''))), ''),
      updated_at = now()
  where contact_id = new.id
    and workspace_id = new.workspace_id
    and (
      customer_name is distinct from coalesce(nullif(btrim(new.display_name), ''), customer_name)
      or customer_phone is distinct from coalesce(nullif(btrim(new.primary_phone), ''), customer_phone)
      or customer_email is distinct from nullif(lower(btrim(coalesce(new.primary_email, ''))), '')
    );

  update public.lead_conversations
  set customer_name = coalesce(nullif(btrim(new.display_name), ''), customer_name),
      customer_phone = coalesce(nullif(btrim(new.primary_phone), ''), customer_phone),
      customer_email = nullif(lower(btrim(coalesce(new.primary_email, ''))), ''),
      updated_at = now()
  where contact_id = new.id
    and workspace_id = new.workspace_id
    and (
      customer_name is distinct from coalesce(nullif(btrim(new.display_name), ''), customer_name)
      or customer_phone is distinct from coalesce(nullif(btrim(new.primary_phone), ''), customer_phone)
      or customer_email is distinct from nullif(lower(btrim(coalesce(new.primary_email, ''))), '')
    );

  return new;
end;
$$;

drop trigger if exists trg_contacts_sync_identity_snapshots on public.contacts;
create trigger trg_contacts_sync_identity_snapshots
after update of display_name, primary_phone, primary_email on public.contacts
for each row execute function public.sync_contact_identity_snapshots();

create or replace function public.link_lead_contact_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact public.contacts%rowtype;
  v_contact_id uuid;
  v_workspace_id uuid;
  v_phone text;
  v_email text;
begin
  -- Contact-driven snapshot propagation updates leads recursively; do not write back.
  if pg_trigger_depth() > 1 then return new; end if;

  v_workspace_id := coalesce(new.workspace_id, public.current_workspace_id(), '00000000-0000-0000-0000-000000000001'::uuid);
  new.workspace_id := v_workspace_id;
  v_phone := public.normalize_contact_identity(new.customer_phone, 'phone');
  v_email := public.normalize_contact_identity(new.customer_email, 'email');
  v_contact_id := new.contact_id;

  if v_contact_id is null and v_phone is not null then
    select ci.contact_id into v_contact_id
    from public.contact_identities ci
    where ci.workspace_id = v_workspace_id
      and ci.identity_type = 'phone'
      and ci.identity_normalized = v_phone
    order by case when ci.provider = 'crm' then 0 else 1 end, ci.created_at
    limit 1;
  end if;

  if v_contact_id is null and v_email is not null then
    select ci.contact_id into v_contact_id
    from public.contact_identities ci
    where ci.workspace_id = v_workspace_id
      and ci.identity_type = 'email'
      and ci.identity_normalized = v_email
    order by case when ci.provider = 'crm' then 0 else 1 end, ci.created_at
    limit 1;
  end if;

  if v_contact_id is null then
    insert into public.contacts(
      workspace_id, display_name, primary_phone, primary_email, owner_id, last_seen_at
    ) values (
      v_workspace_id,
      nullif(btrim(new.customer_name), ''),
      nullif(btrim(new.customer_phone), ''),
      nullif(lower(btrim(coalesce(new.customer_email, ''))), ''),
      new.assigned_to,
      coalesce(new.last_contacted_at, now())
    ) returning * into v_contact;
    v_contact_id := v_contact.id;
  else
    select * into v_contact
    from public.contacts
    where id = v_contact_id and workspace_id = v_workspace_id
    for update;
    if not found then
      raise exception 'Linked contact is outside this workspace' using errcode = '23503';
    end if;
  end if;

  -- Lead identity edits write through to the canonical Contact. Empty values do not
  -- erase an existing canonical name/phone, while email may intentionally be cleared.
  update public.contacts
  set display_name = coalesce(nullif(btrim(new.customer_name), ''), display_name),
      primary_phone = coalesce(nullif(btrim(new.customer_phone), ''), primary_phone),
      primary_email = nullif(lower(btrim(coalesce(new.customer_email, ''))), ''),
      owner_id = coalesce(owner_id, new.assigned_to),
      updated_at = now()
  where id = v_contact_id
  returning * into v_contact;

  v_phone := public.normalize_contact_identity(v_contact.primary_phone, 'phone');
  v_email := public.normalize_contact_identity(v_contact.primary_email, 'email');

  if v_phone is not null and exists (
    select 1 from public.contact_identities i
    where i.workspace_id = v_workspace_id
      and i.contact_id <> v_contact_id
      and i.identity_type = 'phone'
      and i.identity_normalized = v_phone
  ) then
    raise exception 'Phone number belongs to another contact' using errcode = '23505';
  end if;

  if v_email is not null and exists (
    select 1 from public.contact_identities i
    where i.workspace_id = v_workspace_id
      and i.contact_id <> v_contact_id
      and i.identity_type = 'email'
      and i.identity_normalized = v_email
  ) then
    raise exception 'Email address belongs to another contact' using errcode = '23505';
  end if;

  delete from public.contact_identities
  where contact_id = v_contact_id and provider = 'crm' and identity_type in ('phone','email');

  if v_phone is not null then
    insert into public.contact_identities(workspace_id,contact_id,provider,identity_type,identity_value,identity_normalized,is_primary)
    values (v_workspace_id,v_contact_id,'crm','phone',v_contact.primary_phone,v_phone,true);
  end if;
  if v_email is not null then
    insert into public.contact_identities(workspace_id,contact_id,provider,identity_type,identity_value,identity_normalized,is_primary)
    values (v_workspace_id,v_contact_id,'crm','email',v_contact.primary_email,v_email,true);
  end if;

  new.contact_id := v_contact_id;
  new.customer_name := coalesce(nullif(btrim(v_contact.display_name), ''), new.customer_name);
  new.customer_phone := coalesce(nullif(btrim(v_contact.primary_phone), ''), new.customer_phone);
  new.customer_email := nullif(lower(btrim(coalesce(v_contact.primary_email, ''))), '');
  return new;
end;
$$;

drop trigger if exists trg_leads_link_contact_identity on public.leads;
create trigger trg_leads_link_contact_identity
before insert or update of customer_name, customer_phone, customer_email, contact_id
on public.leads
for each row execute function public.link_lead_contact_identity();

create or replace function public.sync_contact_lifecycle_from_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_contact_lifecycle(old.contact_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.contact_id is distinct from new.contact_id then
    perform public.refresh_contact_lifecycle(old.contact_id);
  end if;
  perform public.refresh_contact_lifecycle(new.contact_id);
  return new;
end;
$$;

drop trigger if exists trg_leads_sync_contact_lifecycle on public.leads;
create trigger trg_leads_sync_contact_lifecycle
after insert or update of stage, contact_id or delete on public.leads
for each row execute function public.sync_contact_lifecycle_from_lead();

create or replace function public.enforce_derived_contact_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_derived text;
begin
  v_derived := public.derived_contact_lifecycle(new.id);
  if v_derived is not null then new.lifecycle_key := v_derived; end if;
  return new;
end;
$$;

drop trigger if exists trg_contacts_derived_lifecycle on public.contacts;
create trigger trg_contacts_derived_lifecycle
before update of lifecycle_key on public.contacts
for each row execute function public.enforce_derived_contact_lifecycle();

-- Make contact merge re-parent opportunities as well as conversations/events.
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
  perform 1 from public.contacts
  where id in (p_primary_contact_id,p_duplicate_contact_id) and workspace_id=v_workspace_id
  order by id for update;

  select * into v_primary from public.contacts where id=p_primary_contact_id and workspace_id=v_workspace_id;
  select * into v_duplicate from public.contacts where id=p_duplicate_contact_id and workspace_id=v_workspace_id;
  if v_primary.id is null or v_duplicate.id is null then
    raise exception 'Contact not found in current workspace' using errcode='P0002';
  end if;

  select coalesce(jsonb_agg(value order by value),'[]'::jsonb) into v_tags
  from (
    select distinct value from (
      select value from jsonb_array_elements_text(coalesce(v_primary.tags,'[]'::jsonb))
      union all
      select value from jsonb_array_elements_text(coalesce(v_duplicate.tags,'[]'::jsonb))
    ) combined
  ) unique_tags;

  update public.contacts
  set display_name=coalesce(nullif(btrim(v_primary.display_name),''),nullif(btrim(v_duplicate.display_name),'')),
      primary_phone=coalesce(nullif(btrim(v_primary.primary_phone),''),nullif(btrim(v_duplicate.primary_phone),'')),
      primary_email=coalesce(nullif(btrim(v_primary.primary_email),''),nullif(btrim(v_duplicate.primary_email),'')),
      avatar_url=coalesce(nullif(btrim(v_primary.avatar_url),''),nullif(btrim(v_duplicate.avatar_url),'')),
      owner_id=coalesce(v_primary.owner_id,v_duplicate.owner_id),
      tags=v_tags,
      custom_data=coalesce(v_duplicate.custom_data,'{}'::jsonb) || coalesce(v_primary.custom_data,'{}'::jsonb),
      last_seen_at=greatest(coalesce(v_primary.last_seen_at,'-infinity'::timestamptz),coalesce(v_duplicate.last_seen_at,'-infinity'::timestamptz)),
      updated_at=now()
  where id=v_primary.id
  returning * into v_result;

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

  update public.contact_identities set contact_id=v_primary.id where contact_id=v_duplicate.id;
  update public.leads set contact_id=v_primary.id where workspace_id=v_workspace_id and contact_id=v_duplicate.id;
  update public.lead_conversations set contact_id=v_primary.id,updated_at=now() where workspace_id=v_workspace_id and contact_id=v_duplicate.id;
  update public.conversation_events set contact_id=v_primary.id where workspace_id=v_workspace_id and contact_id=v_duplicate.id;

  perform public.refresh_contact_lifecycle(v_primary.id);
  delete from public.contacts where id=v_duplicate.id;

  insert into public.conversation_events(workspace_id,conversation_id,contact_id,event_type,actor_id,payload)
  select v_workspace_id,c.id,v_primary.id,'contact_merged',auth.uid(),jsonb_build_object(
    'primary_contact_id',v_primary.id,'merged_contact_id',v_duplicate.id
  )
  from public.lead_conversations c
  where c.workspace_id=v_workspace_id and c.contact_id=v_primary.id;

  select * into v_result from public.contacts where id=v_primary.id;
  return to_jsonb(v_result);
end;
$$;

revoke all on function public.merge_contacts(uuid,uuid) from public,anon;
grant execute on function public.merge_contacts(uuid,uuid) to authenticated;

-- Recompute lifecycle for the backfilled opportunity links.
do $$
declare
  v_contact_id uuid;
begin
  for v_contact_id in select distinct contact_id from public.leads where contact_id is not null loop
    perform public.refresh_contact_lifecycle(v_contact_id);
  end loop;
end
$$;

commit;
