-- 202609120043_crm_core_integrity_hardening.sql
-- Harden CRM core workspace references, legacy compatibility sync, stage gates,
-- proposal revisions and document lifecycle invariants.

begin;

create or replace function public.validate_work_item_workspace_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_workspace uuid;
  v_conversation_lead uuid;
  v_conversation_contact uuid;
begin
  if new.lead_id is not null and not exists (
    select 1 from public.leads l where l.id = new.lead_id and l.workspace_id = new.workspace_id
  ) then
    raise exception 'Work item opportunity must belong to the same workspace' using errcode = '23514';
  end if;

  if new.contact_id is not null and not exists (
    select 1 from public.contacts c where c.id = new.contact_id and c.workspace_id = new.workspace_id
  ) then
    raise exception 'Work item contact must belong to the same workspace' using errcode = '23514';
  end if;

  if new.conversation_id is not null then
    select c.workspace_id, c.lead_id, c.contact_id
      into v_conversation_workspace, v_conversation_lead, v_conversation_contact
    from public.lead_conversations c
    where c.id = new.conversation_id;

    if v_conversation_workspace is null or v_conversation_workspace is distinct from new.workspace_id then
      raise exception 'Work item conversation must belong to the same workspace' using errcode = '23514';
    end if;

    if new.lead_id is null then
      new.lead_id := v_conversation_lead;
    elsif v_conversation_lead is not null and new.lead_id is distinct from v_conversation_lead then
      raise exception 'Work item opportunity does not match the conversation' using errcode = '23514';
    end if;

    if new.contact_id is null then
      new.contact_id := v_conversation_contact;
    elsif v_conversation_contact is not null and new.contact_id is distinct from v_conversation_contact then
      raise exception 'Work item contact does not match the conversation' using errcode = '23514';
    end if;
  end if;

  if new.lead_id is not null and new.contact_id is not null and exists (
    select 1 from public.leads l
    where l.id = new.lead_id
      and l.contact_id is not null
      and l.contact_id is distinct from new.contact_id
  ) then
    raise exception 'Work item contact does not match the opportunity contact' using errcode = '23514';
  end if;

  if new.owner_id is not null and not exists (
    select 1 from public.profiles p
    where p.id = new.owner_id and p.workspace_id = new.workspace_id and p.is_active = true
  ) then
    raise exception 'Work item owner must be an active member of the workspace' using errcode = '23514';
  end if;

  if new.created_by is not null and not exists (
    select 1 from public.profiles p
    where p.id = new.created_by and p.workspace_id = new.workspace_id
  ) then
    raise exception 'Work item creator must belong to the workspace' using errcode = '23514';
  end if;

  if new.lead_id is null and new.contact_id is null and new.conversation_id is null then
    raise exception 'Work item must belong to an opportunity, contact, or conversation' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_work_item_workspace_refs() from public, anon, authenticated;

drop trigger if exists trg_work_items_validate_workspace_refs on public.work_items;
create trigger trg_work_items_validate_workspace_refs
before insert or update of workspace_id, lead_id, contact_id, conversation_id, owner_id, created_by
on public.work_items
for each row execute function public.validate_work_item_workspace_refs();

create or replace function public.refresh_lead_next_work_item(p_lead_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.leads l
  set next_follow_up_at = (
    select min(wi.due_at)
    from public.work_items wi
    where wi.lead_id = l.id
      and wi.workspace_id = l.workspace_id
      and wi.status = 'open'
      and wi.due_at is not null
  )
  where l.id = p_lead_id;
$$;

revoke all on function public.refresh_lead_next_work_item(uuid) from public, anon, authenticated;

-- Preserve rich quote/document lifecycle fields when old JSON-based screens write leads.
create or replace function public.sync_lead_operational_tables()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  item_id text;
  v_uploaded_at timestamptz;
begin
  if pg_trigger_depth() > 1 then return new; end if;

  for item in select value from jsonb_array_elements(coalesce(new.quotes, '[]'::jsonb)) loop
    item_id := coalesce(nullif(item->>'id',''), gen_random_uuid()::text);
    insert into public.lead_quotes(
      lead_id,id,quote_number,package_title,status,total_selling_price,total_supplier_cost,
      gross_profit,profit_margin_pct,commission_earned,created_at,payload
    ) values (
      new.id,item_id,item->>'quote_number',item->>'package_title',coalesce(nullif(item->>'status',''),'draft'),
      public.try_numeric(item->>'total_selling_price'),public.try_numeric(item->>'total_supplier_cost'),
      public.try_numeric(item->>'gross_profit'),public.try_numeric(item->>'profit_margin_pct'),
      public.try_numeric(item->>'commission_earned'),public.try_timestamptz(item->>'created_at'),item
    )
    on conflict (lead_id,id) do update set
      quote_number = case when public.lead_quotes.status = 'draft' then excluded.quote_number else public.lead_quotes.quote_number end,
      package_title = case when public.lead_quotes.status = 'draft' then excluded.package_title else public.lead_quotes.package_title end,
      status = case when public.lead_quotes.status in ('sent','viewed','accepted','rejected','revised') then public.lead_quotes.status else coalesce(excluded.status, public.lead_quotes.status) end,
      total_selling_price = case when public.lead_quotes.status = 'draft' then excluded.total_selling_price else public.lead_quotes.total_selling_price end,
      total_supplier_cost = case when public.lead_quotes.status = 'draft' then excluded.total_supplier_cost else public.lead_quotes.total_supplier_cost end,
      gross_profit = case when public.lead_quotes.status = 'draft' then excluded.gross_profit else public.lead_quotes.gross_profit end,
      profit_margin_pct = case when public.lead_quotes.status = 'draft' then excluded.profit_margin_pct else public.lead_quotes.profit_margin_pct end,
      commission_earned = case when public.lead_quotes.status = 'draft' then excluded.commission_earned else public.lead_quotes.commission_earned end,
      payload = case when public.lead_quotes.status = 'draft' then excluded.payload else public.lead_quotes.payload end,
      updated_at = now();
  end loop;

  delete from public.lead_payment_milestones where lead_id = new.id;
  for item in select value from jsonb_array_elements(coalesce(new.payment_milestones, '[]'::jsonb)) loop
    item_id := coalesce(nullif(item->>'id',''), gen_random_uuid()::text);
    insert into public.lead_payment_milestones(lead_id,id,title,percentage,amount,due_date,status,paid_amount,paid_at,notes,payload)
    values (new.id,item_id,item->>'title',public.try_numeric(item->>'percentage'),public.try_numeric(item->>'amount'),public.try_date(item->>'due_date'),item->>'status',public.try_numeric(item->>'paid_amount'),public.try_timestamptz(item->>'paid_at'),item->>'notes',item);
  end loop;

  delete from public.lead_payment_records where lead_id = new.id;
  for item in select value from jsonb_array_elements(coalesce(new.payment_records, '[]'::jsonb)) loop
    item_id := coalesce(nullif(item->>'id',''), gen_random_uuid()::text);
    insert into public.lead_payment_records(lead_id,id,receipt_number,amount,method,reference_no,notes,received_at,created_at,payload)
    values (new.id,item_id,item->>'receipt_number',public.try_numeric(item->>'amount'),item->>'method',item->>'reference_no',item->>'notes',public.try_timestamptz(item->>'received_at'),public.try_timestamptz(item->>'created_at'),item);
  end loop;

  delete from public.lead_itinerary_days where lead_id = new.id;
  for item in select value from jsonb_array_elements(coalesce(new.itinerary_days, '[]'::jsonb)) loop
    item_id := coalesce(nullif(item->>'id',''), gen_random_uuid()::text);
    insert into public.lead_itinerary_days(lead_id,id,day_number,title,description,hotel_name,meal_plan,payload)
    values (new.id,item_id,public.try_integer(item->>'day_number'),item->>'title',item->>'description',item->>'hotel_name',item->>'meal_plan',item);
  end loop;

  delete from public.lead_passengers where lead_id = new.id;
  for item in select value from jsonb_array_elements(coalesce(new.passengers, '[]'::jsonb)) loop
    item_id := coalesce(nullif(item->>'id',''), gen_random_uuid()::text);
    insert into public.lead_passengers(lead_id,id,full_name,passenger_type,passport_number,passport_country,passport_expiry_date,visa_status,date_of_birth,dietary_preference,special_notes,payload)
    values (new.id,item_id,item->>'full_name',item->>'type',item->>'passport_number',item->>'passport_country',public.try_date(item->>'passport_expiry_date'),item->>'visa_status',public.try_date(item->>'date_of_birth'),item->>'dietary_preference',item->>'special_notes',item);
  end loop;

  for item in select value from jsonb_array_elements(coalesce(new.documents, '[]'::jsonb)) loop
    item_id := coalesce(nullif(item->>'id',''), gen_random_uuid()::text);
    v_uploaded_at := public.try_timestamptz(item->>'uploaded_at');
    insert into public.lead_documents(
      lead_id,id,passenger_id,title,category,document_type,file_name,file_size,storage_path,
      uploaded_at,lifecycle_status,requested_at,received_at,payload
    ) values (
      new.id,item_id,item->>'passenger_id',item->>'title',item->>'category',coalesce(item->>'document_type',item->>'category'),
      item->>'file_name',item->>'file_size',item->>'storage_path',v_uploaded_at,
      case when v_uploaded_at is null and nullif(item->>'storage_path','') is null then 'requested' else 'received' end,
      case when v_uploaded_at is null and nullif(item->>'storage_path','') is null then now() else null end,
      case when v_uploaded_at is not null or nullif(item->>'storage_path','') is not null then coalesce(v_uploaded_at,now()) else null end,
      item
    )
    on conflict (lead_id,id) do update set
      passenger_id = excluded.passenger_id,
      title = coalesce(excluded.title, public.lead_documents.title),
      category = coalesce(excluded.category, public.lead_documents.category),
      document_type = coalesce(excluded.document_type, public.lead_documents.document_type),
      file_name = coalesce(excluded.file_name, public.lead_documents.file_name),
      file_size = coalesce(excluded.file_size, public.lead_documents.file_size),
      storage_path = coalesce(excluded.storage_path, public.lead_documents.storage_path),
      uploaded_at = coalesce(excluded.uploaded_at, public.lead_documents.uploaded_at),
      lifecycle_status = case when public.lead_documents.lifecycle_status = 'requested' and (excluded.uploaded_at is not null or nullif(excluded.storage_path,'') is not null) then 'received' else public.lead_documents.lifecycle_status end,
      payload = public.lead_documents.payload || excluded.payload;
  end loop;

  delete from public.lead_supplier_payables where lead_id = new.id;
  for item in select value from jsonb_array_elements(coalesce(new.supplier_payables, '[]'::jsonb)) loop
    item_id := coalesce(nullif(item->>'id',''), gen_random_uuid()::text);
    insert into public.lead_supplier_payables(lead_id,id,supplier_name,service_description,amount_payable,amount_paid,status,confirmation_voucher_no,due_date,payload)
    values (new.id,item_id,item->>'supplier_name',item->>'service_description',public.try_numeric(item->>'amount_payable'),public.try_numeric(item->>'amount_paid'),item->>'status',item->>'confirmation_voucher_no',public.try_date(item->>'due_date'),item);
  end loop;

  return new;
end;
$$;

revoke all on function public.sync_lead_operational_tables() from public, anon, authenticated;

create or replace function public.lead_stage_missing_requirements(p_lead_id uuid, p_pipeline_stage_id uuid)
returns table(requirement_type text, requirement_key text, label text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lead public.leads%rowtype;
  v_target record;
  r record;
  v_value jsonb;
begin
  select * into v_lead from public.leads where id = p_lead_id and workspace_id = public.current_workspace_id();
  if not found then return; end if;

  select ps.id, ps.pipeline_id, ps.sort_order, ps.stage_type into v_target
  from public.pipeline_stages ps
  join public.pipelines p on p.id = ps.pipeline_id
  where ps.id = p_pipeline_stage_id and p.workspace_id = v_lead.workspace_id;
  if not found then return; end if;

  for r in
    select distinct on (req.requirement_type, req.requirement_key)
      req.requirement_type, req.requirement_key, req.label, req.sort_order
    from public.pipeline_stage_requirements req
    join public.pipeline_stages ps on ps.id = req.pipeline_stage_id
    where req.workspace_id = v_lead.workspace_id
      and req.is_required = true
      and ((v_target.stage_type = 'lost' and req.pipeline_stage_id = v_target.id)
        or (v_target.stage_type <> 'lost' and ps.pipeline_id = v_target.pipeline_id and ps.stage_type <> 'lost' and ps.sort_order <= v_target.sort_order))
    order by req.requirement_type, req.requirement_key, req.sort_order
  loop
    if r.requirement_type = 'field' then
      v_value := coalesce(to_jsonb(v_lead)->r.requirement_key, v_lead.custom_data->r.requirement_key);
      if v_value is null or v_value = 'null'::jsonb or v_value = '""'::jsonb or v_value = '[]'::jsonb or v_value = '{}'::jsonb then
        requirement_type := r.requirement_type;
        requirement_key := r.requirement_key;
        label := r.label;
        return next;
      end if;
    elsif r.requirement_type = 'document' and not exists (
      select 1 from public.lead_documents d
      where d.lead_id = p_lead_id and coalesce(d.document_type,d.category,'') = r.requirement_key and d.lifecycle_status = 'verified'
    ) then
      requirement_type := r.requirement_type;
      requirement_key := r.requirement_key;
      label := r.label;
      return next;
    end if;
  end loop;
end;
$$;

revoke all on function public.lead_stage_missing_requirements(uuid,uuid) from public, anon;
grant execute on function public.lead_stage_missing_requirements(uuid,uuid) to authenticated;

create unique index if not exists lead_quotes_one_child_revision_idx
  on public.lead_quotes(lead_id, parent_revision_id)
  where parent_revision_id is not null;

create or replace function public.validate_quote_lifecycle_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_parent_version integer;
  v_parent_status text;
  v_old_status text;
  v_new_status text;
begin
  new.status := coalesce(nullif(new.status,''), 'draft');
  v_new_status := new.status;

  if new.parent_revision_id is not null then
    if new.parent_revision_id = new.id then raise exception 'Proposal cannot revise itself' using errcode = '23514'; end if;
    select q.version, q.status into v_parent_version, v_parent_status
    from public.lead_quotes q where q.lead_id = new.lead_id and q.id = new.parent_revision_id;
    if not found then raise exception 'Parent proposal revision not found' using errcode = '23503'; end if;
    if tg_op = 'INSERT' and coalesce(v_parent_status,'draft') not in ('sent','viewed','rejected') then
      raise exception 'Only a sent, viewed, or rejected proposal can be revised' using errcode = '23514';
    end if;
    new.version := coalesce(v_parent_version,1) + 1;
  elsif new.version is null or new.version < 1 then
    new.version := 1;
  end if;

  if tg_op = 'UPDATE' then
    v_old_status := coalesce(nullif(old.status,''), 'draft');
    if v_old_status <> v_new_status and v_old_status in ('draft','sent','viewed','accepted','rejected','revised') and not (
      (v_old_status = 'draft' and v_new_status = 'sent')
      or (v_old_status = 'sent' and v_new_status in ('viewed','accepted','rejected','revised'))
      or (v_old_status = 'viewed' and v_new_status in ('accepted','rejected','revised'))
      or (v_old_status = 'rejected' and v_new_status = 'revised')
    ) then
      raise exception 'Invalid proposal lifecycle transition: % -> %', v_old_status, v_new_status using errcode = '23514';
    end if;
    if v_old_status <> 'draft' and (
      old.quote_number is distinct from new.quote_number
      or old.package_title is distinct from new.package_title
      or old.total_selling_price is distinct from new.total_selling_price
      or old.total_supplier_cost is distinct from new.total_supplier_cost
      or old.terms is distinct from new.terms
    ) then
      raise exception 'Sent proposals are immutable; create a revision instead' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_quote_lifecycle_integrity on public.lead_quotes;
create trigger trg_quote_lifecycle_integrity
before insert or update on public.lead_quotes
for each row execute function public.validate_quote_lifecycle_integrity();

create or replace function public.validate_document_lifecycle_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_old_status text;
  v_new_status text;
begin
  select l.workspace_id into v_workspace_id from public.leads l where l.id = new.lead_id;
  if v_workspace_id is null then raise exception 'Document opportunity not found' using errcode = '23503'; end if;
  if new.owner_id is not null and not exists (
    select 1 from public.profiles p where p.id = new.owner_id and p.workspace_id = v_workspace_id and p.is_active = true
  ) then
    raise exception 'Document owner must be an active workspace member' using errcode = '23514';
  end if;

  v_new_status := coalesce(nullif(new.lifecycle_status,''), case when new.uploaded_at is null and nullif(new.storage_path,'') is null then 'requested' else 'received' end);
  new.lifecycle_status := v_new_status;
  if v_new_status = 'verified' and new.uploaded_at is null and nullif(new.storage_path,'') is null then
    raise exception 'A document must be uploaded before it can be verified' using errcode = '23514';
  end if;
  if v_new_status = 'rejected' and nullif(btrim(coalesce(new.rejection_reason,'')),'') is null then
    raise exception 'Rejected documents require a rejection reason' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    v_old_status := coalesce(nullif(old.lifecycle_status,''), 'received');
    if v_old_status <> v_new_status and not (
      (v_old_status = 'requested' and v_new_status = 'received')
      or (v_old_status = 'received' and v_new_status in ('verified','rejected'))
      or (v_old_status = 'rejected' and v_new_status = 'received')
    ) then
      raise exception 'Invalid document lifecycle transition: % -> %', v_old_status, v_new_status using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_document_lifecycle_integrity on public.lead_documents;
create trigger trg_document_lifecycle_integrity
before insert or update on public.lead_documents
for each row execute function public.validate_document_lifecycle_integrity();

commit;
