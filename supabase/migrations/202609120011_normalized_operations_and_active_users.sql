-- Normalize operational lead data while preserving backward compatibility with the
-- existing JSONB columns. Existing UI writes continue to work because a trigger
-- mirrors those arrays into typed child tables.

create or replace function public.current_user_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active = true
  );
$$;

revoke all on function public.current_user_active() from public;
grant execute on function public.current_user_active() to authenticated;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid() and is_active = true;
$$;

revoke all on function public.current_user_role() from public;
grant execute on function public.current_user_role() to authenticated;

create or replace function public.can_access_lead(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_active() and exists (
    select 1
    from public.leads l
    where l.id = p_lead_id
      and (public.is_management() or l.assigned_to = auth.uid() or l.assigned_to is null)
  );
$$;

create or replace function public.can_manage_lead(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_active() and exists (
    select 1
    from public.leads l
    where l.id = p_lead_id
      and (public.is_management() or l.assigned_to = auth.uid())
  );
$$;

revoke all on function public.can_access_lead(uuid) from public;
revoke all on function public.can_manage_lead(uuid) from public;
grant execute on function public.can_access_lead(uuid) to authenticated;
grant execute on function public.can_manage_lead(uuid) to authenticated;

-- Harden the original policies so a disabled user cannot keep using an old session.
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated" on public.profiles
  for select to authenticated using (public.current_user_active());

drop policy if exists "profiles_update_scoped" on public.profiles;
create policy "profiles_update_scoped" on public.profiles
  for update to authenticated
  using (public.current_user_active() and (id = auth.uid() or public.is_management()))
  with check (public.current_user_active() and (id = auth.uid() or public.is_management()));

drop policy if exists "leads_select_scoped" on public.leads;
create policy "leads_select_scoped" on public.leads
  for select to authenticated
  using (public.current_user_active() and (public.is_management() or assigned_to = auth.uid() or assigned_to is null));

drop policy if exists "leads_insert_scoped" on public.leads;
create policy "leads_insert_scoped" on public.leads
  for insert to authenticated
  with check (public.current_user_active() and (public.is_management() or assigned_to = auth.uid() or assigned_to is null));

drop policy if exists "leads_update_scoped" on public.leads;
create policy "leads_update_scoped" on public.leads
  for update to authenticated
  using (public.current_user_active() and (public.is_management() or assigned_to = auth.uid()))
  with check (public.current_user_active() and (public.is_management() or assigned_to = auth.uid()));

drop policy if exists "leads_delete_management" on public.leads;
create policy "leads_delete_management" on public.leads
  for delete to authenticated using (public.current_user_active() and public.is_management());

drop policy if exists "followups_select_scoped" on public.follow_ups;
create policy "followups_select_scoped" on public.follow_ups
  for select to authenticated using (public.current_user_active() and (public.is_management() or assigned_to = auth.uid()));

drop policy if exists "followups_insert_scoped" on public.follow_ups;
create policy "followups_insert_scoped" on public.follow_ups
  for insert to authenticated with check (public.current_user_active() and (public.is_management() or assigned_to = auth.uid()));

drop policy if exists "followups_update_scoped" on public.follow_ups;
create policy "followups_update_scoped" on public.follow_ups
  for update to authenticated
  using (public.current_user_active() and (public.is_management() or assigned_to = auth.uid()))
  with check (public.current_user_active() and (public.is_management() or assigned_to = auth.uid()));

drop policy if exists "followups_delete_scoped" on public.follow_ups;
create policy "followups_delete_scoped" on public.follow_ups
  for delete to authenticated using (public.current_user_active() and (public.is_management() or assigned_to = auth.uid()));

drop policy if exists "activity_select_scoped" on public.activity_logs;
create policy "activity_select_scoped" on public.activity_logs
  for select to authenticated
  using (
    public.current_user_active()
    and (
      public.is_management()
      or exists (
        select 1 from public.leads l
        where l.id = activity_logs.lead_id
          and (l.assigned_to = auth.uid() or l.assigned_to is null)
      )
    )
  );

drop policy if exists "activity_insert_scoped" on public.activity_logs;
create policy "activity_insert_scoped" on public.activity_logs
  for insert to authenticated
  with check (
    public.current_user_active()
    and agent_id = auth.uid()
    and (
      public.is_management()
      or exists (
        select 1 from public.leads l
        where l.id = activity_logs.lead_id
          and (l.assigned_to = auth.uid() or l.assigned_to is null)
      )
    )
  );

drop policy if exists "templates_select_authenticated" on public.whatsapp_templates;
create policy "templates_select_authenticated" on public.whatsapp_templates
  for select to authenticated using (public.current_user_active());

drop policy if exists "templates_write_management" on public.whatsapp_templates;
create policy "templates_write_management" on public.whatsapp_templates
  for all to authenticated
  using (public.current_user_active() and public.is_management())
  with check (public.current_user_active() and public.is_management());

drop policy if exists "settings_select_authenticated" on public.agency_settings;
create policy "settings_select_authenticated" on public.agency_settings
  for select to authenticated using (public.current_user_active());

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select to authenticated using (public.current_user_active() and user_id = auth.uid());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update to authenticated
  using (public.current_user_active() and user_id = auth.uid())
  with check (public.current_user_active() and user_id = auth.uid());

drop policy if exists "incentives_select_authenticated" on public.incentive_tiers;
create policy "incentives_select_authenticated" on public.incentive_tiers
  for select to authenticated using (public.current_user_active());

drop policy if exists "quote_versions_select_scoped" on public.quote_versions;
create policy "quote_versions_select_scoped" on public.quote_versions
  for select to authenticated using (public.can_access_lead(lead_id));

create or replace function public.try_numeric(p_value text)
returns numeric
language plpgsql
immutable
as $$
begin
  if p_value is null or btrim(p_value) = '' then return null; end if;
  return p_value::numeric;
exception when others then
  return null;
end;
$$;

create or replace function public.try_integer(p_value text)
returns integer
language plpgsql
immutable
as $$
begin
  if p_value is null or btrim(p_value) = '' then return null; end if;
  return p_value::integer;
exception when others then
  return null;
end;
$$;

create or replace function public.try_date(p_value text)
returns date
language plpgsql
immutable
as $$
begin
  if p_value is null or btrim(p_value) = '' then return null; end if;
  return p_value::date;
exception when others then
  return null;
end;
$$;

create or replace function public.try_timestamptz(p_value text)
returns timestamptz
language plpgsql
stable
as $$
begin
  if p_value is null or btrim(p_value) = '' then return null; end if;
  return p_value::timestamptz;
exception when others then
  return null;
end;
$$;

create table if not exists public.lead_quotes (
  lead_id uuid not null references public.leads(id) on delete cascade,
  id text not null,
  quote_number text,
  package_title text,
  status text,
  total_selling_price numeric(14,2),
  total_supplier_cost numeric(14,2),
  gross_profit numeric(14,2),
  profit_margin_pct numeric(7,2),
  commission_earned numeric(14,2),
  created_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  primary key (lead_id, id)
);

create table if not exists public.lead_payment_milestones (
  lead_id uuid not null references public.leads(id) on delete cascade,
  id text not null,
  title text,
  percentage numeric(7,2),
  amount numeric(14,2),
  due_date date,
  status text,
  paid_amount numeric(14,2),
  paid_at timestamptz,
  notes text,
  payload jsonb not null default '{}'::jsonb,
  primary key (lead_id, id)
);

create table if not exists public.lead_payment_records (
  lead_id uuid not null references public.leads(id) on delete cascade,
  id text not null,
  receipt_number text,
  amount numeric(14,2),
  method text,
  reference_no text,
  notes text,
  received_at timestamptz,
  created_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  primary key (lead_id, id)
);

create table if not exists public.lead_itinerary_days (
  lead_id uuid not null references public.leads(id) on delete cascade,
  id text not null,
  day_number integer,
  title text,
  description text,
  hotel_name text,
  meal_plan text,
  payload jsonb not null default '{}'::jsonb,
  primary key (lead_id, id)
);

create table if not exists public.lead_passengers (
  lead_id uuid not null references public.leads(id) on delete cascade,
  id text not null,
  full_name text,
  passenger_type text,
  passport_number text,
  passport_country text,
  passport_expiry_date date,
  visa_status text,
  date_of_birth date,
  dietary_preference text,
  special_notes text,
  payload jsonb not null default '{}'::jsonb,
  primary key (lead_id, id)
);

create table if not exists public.lead_documents (
  lead_id uuid not null references public.leads(id) on delete cascade,
  id text not null,
  passenger_id text,
  title text,
  category text,
  file_name text,
  file_size text,
  storage_path text,
  uploaded_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  primary key (lead_id, id)
);

create table if not exists public.lead_supplier_payables (
  lead_id uuid not null references public.leads(id) on delete cascade,
  id text not null,
  supplier_name text,
  service_description text,
  amount_payable numeric(14,2),
  amount_paid numeric(14,2),
  status text,
  confirmation_voucher_no text,
  due_date date,
  payload jsonb not null default '{}'::jsonb,
  primary key (lead_id, id)
);

create index if not exists idx_lead_quotes_status on public.lead_quotes(lead_id, status);
create index if not exists idx_lead_payment_milestones_due on public.lead_payment_milestones(due_date, status);
create index if not exists idx_lead_payment_records_received on public.lead_payment_records(lead_id, received_at desc);
create index if not exists idx_lead_itinerary_days_order on public.lead_itinerary_days(lead_id, day_number);
create index if not exists idx_lead_passengers_passport_expiry on public.lead_passengers(passport_expiry_date);
create index if not exists idx_lead_documents_passenger on public.lead_documents(lead_id, passenger_id);
create index if not exists idx_lead_supplier_payables_due on public.lead_supplier_payables(due_date, status);

alter table public.lead_quotes enable row level security;
alter table public.lead_payment_milestones enable row level security;
alter table public.lead_payment_records enable row level security;
alter table public.lead_itinerary_days enable row level security;
alter table public.lead_passengers enable row level security;
alter table public.lead_documents enable row level security;
alter table public.lead_supplier_payables enable row level security;

-- Child-table policies intentionally share the same lead-level access rules.
do $$
declare
  t text;
begin
  foreach t in array array[
    'lead_quotes','lead_payment_milestones','lead_payment_records','lead_itinerary_days',
    'lead_passengers','lead_documents','lead_supplier_payables'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_select_scoped', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.can_access_lead(lead_id))', t || '_select_scoped', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_scoped', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_manage_lead(lead_id))', t || '_insert_scoped', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_scoped', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.can_manage_lead(lead_id)) with check (public.can_manage_lead(lead_id))', t || '_update_scoped', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_scoped', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.can_manage_lead(lead_id))', t || '_delete_scoped', t);
  end loop;
end $$;

grant select, insert, update, delete on public.lead_quotes to authenticated;
grant select, insert, update, delete on public.lead_payment_milestones to authenticated;
grant select, insert, update, delete on public.lead_payment_records to authenticated;
grant select, insert, update, delete on public.lead_itinerary_days to authenticated;
grant select, insert, update, delete on public.lead_passengers to authenticated;
grant select, insert, update, delete on public.lead_documents to authenticated;
grant select, insert, update, delete on public.lead_supplier_payables to authenticated;

create or replace function public.sync_lead_operational_tables()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  item_id text;
begin
  delete from public.lead_quotes where lead_id = new.id;
  for item in select value from jsonb_array_elements(coalesce(new.quotes, '[]'::jsonb)) loop
    item_id := coalesce(nullif(item->>'id',''), gen_random_uuid()::text);
    insert into public.lead_quotes(
      lead_id,id,quote_number,package_title,status,total_selling_price,total_supplier_cost,
      gross_profit,profit_margin_pct,commission_earned,created_at,payload
    ) values (
      new.id,item_id,item->>'quote_number',item->>'package_title',item->>'status',
      public.try_numeric(item->>'total_selling_price'),public.try_numeric(item->>'total_supplier_cost'),
      public.try_numeric(item->>'gross_profit'),public.try_numeric(item->>'profit_margin_pct'),
      public.try_numeric(item->>'commission_earned'),public.try_timestamptz(item->>'created_at'),item
    );
  end loop;

  delete from public.lead_payment_milestones where lead_id = new.id;
  for item in select value from jsonb_array_elements(coalesce(new.payment_milestones, '[]'::jsonb)) loop
    item_id := coalesce(nullif(item->>'id',''), gen_random_uuid()::text);
    insert into public.lead_payment_milestones(
      lead_id,id,title,percentage,amount,due_date,status,paid_amount,paid_at,notes,payload
    ) values (
      new.id,item_id,item->>'title',public.try_numeric(item->>'percentage'),public.try_numeric(item->>'amount'),
      public.try_date(item->>'due_date'),item->>'status',public.try_numeric(item->>'paid_amount'),
      public.try_timestamptz(item->>'paid_at'),item->>'notes',item
    );
  end loop;

  delete from public.lead_payment_records where lead_id = new.id;
  for item in select value from jsonb_array_elements(coalesce(new.payment_records, '[]'::jsonb)) loop
    item_id := coalesce(nullif(item->>'id',''), gen_random_uuid()::text);
    insert into public.lead_payment_records(
      lead_id,id,receipt_number,amount,method,reference_no,notes,received_at,created_at,payload
    ) values (
      new.id,item_id,item->>'receipt_number',public.try_numeric(item->>'amount'),item->>'method',
      item->>'reference_no',item->>'notes',public.try_timestamptz(item->>'received_at'),
      public.try_timestamptz(item->>'created_at'),item
    );
  end loop;

  delete from public.lead_itinerary_days where lead_id = new.id;
  for item in select value from jsonb_array_elements(coalesce(new.itinerary_days, '[]'::jsonb)) loop
    item_id := coalesce(nullif(item->>'id',''), gen_random_uuid()::text);
    insert into public.lead_itinerary_days(
      lead_id,id,day_number,title,description,hotel_name,meal_plan,payload
    ) values (
      new.id,item_id,public.try_integer(item->>'day_number'),item->>'title',item->>'description',
      item->>'hotel_name',item->>'meal_plan',item
    );
  end loop;

  delete from public.lead_passengers where lead_id = new.id;
  for item in select value from jsonb_array_elements(coalesce(new.passengers, '[]'::jsonb)) loop
    item_id := coalesce(nullif(item->>'id',''), gen_random_uuid()::text);
    insert into public.lead_passengers(
      lead_id,id,full_name,passenger_type,passport_number,passport_country,passport_expiry_date,
      visa_status,date_of_birth,dietary_preference,special_notes,payload
    ) values (
      new.id,item_id,item->>'full_name',item->>'type',item->>'passport_number',item->>'passport_country',
      public.try_date(item->>'passport_expiry_date'),item->>'visa_status',public.try_date(item->>'date_of_birth'),
      item->>'dietary_preference',item->>'special_notes',item
    );
  end loop;

  delete from public.lead_documents where lead_id = new.id;
  for item in select value from jsonb_array_elements(coalesce(new.documents, '[]'::jsonb)) loop
    item_id := coalesce(nullif(item->>'id',''), gen_random_uuid()::text);
    insert into public.lead_documents(
      lead_id,id,passenger_id,title,category,file_name,file_size,storage_path,uploaded_at,payload
    ) values (
      new.id,item_id,item->>'passenger_id',item->>'title',item->>'category',item->>'file_name',
      item->>'file_size',item->>'storage_path',public.try_timestamptz(item->>'uploaded_at'),item
    );
  end loop;

  delete from public.lead_supplier_payables where lead_id = new.id;
  for item in select value from jsonb_array_elements(coalesce(new.supplier_payables, '[]'::jsonb)) loop
    item_id := coalesce(nullif(item->>'id',''), gen_random_uuid()::text);
    insert into public.lead_supplier_payables(
      lead_id,id,supplier_name,service_description,amount_payable,amount_paid,status,
      confirmation_voucher_no,due_date,payload
    ) values (
      new.id,item_id,item->>'supplier_name',item->>'service_description',
      public.try_numeric(item->>'amount_payable'),public.try_numeric(item->>'amount_paid'),item->>'status',
      item->>'confirmation_voucher_no',public.try_date(item->>'due_date'),item
    );
  end loop;

  return new;
end;
$$;

revoke all on function public.sync_lead_operational_tables() from public;

drop trigger if exists zzz_sync_lead_operational_tables on public.leads;
create trigger zzz_sync_lead_operational_tables
after insert or update of quotes,payment_milestones,payment_records,itinerary_days,passengers,documents,supplier_payables
on public.leads
for each row execute function public.sync_lead_operational_tables();

-- Backfill existing rows. Mentioning a mirrored column in the UPDATE causes the
-- trigger to run even when its value is unchanged.
update public.leads set payment_records = payment_records;

comment on table public.lead_passengers is 'Normalized passenger rows mirrored from leads.passengers during the transition away from JSONB.';
comment on table public.lead_payment_records is 'Normalized payment receipts mirrored from leads.payment_records during the transition away from JSONB.';
comment on table public.lead_documents is 'Normalized document metadata mirrored from leads.documents; file bytes remain in private object storage.';
