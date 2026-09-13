-- 202609120024_dynamic_business_platform.sql
-- Introduce a configurable business layer without breaking the existing Travel CRM.
-- Travel remains the default template; future industries are configuration, not forks.

begin;

create table if not exists public.business_templates (
  key text primary key,
  name text not null,
  business_type text not null,
  description text,
  terminology jsonb not null default '{}'::jsonb,
  modules jsonb not null default '{}'::jsonb,
  fields jsonb not null default '[]'::jsonb,
  pipeline jsonb not null default '{}'::jsonb,
  is_system boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  business_type text not null default 'generic',
  template_key text references public.business_templates(key) on delete set null,
  timezone text not null default 'Asia/Kathmandu',
  currency text not null default 'NPR',
  locale text not null default 'en-NP',
  terminology jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.field_definitions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_type text not null default 'lead' check (entity_type in ('lead','contact','conversation','deal')),
  field_key text not null,
  label text not null,
  field_type text not null check (field_type in (
    'text','textarea','number','currency','date','datetime','boolean','single_select',
    'multi_select','phone','email','url','country','city','user','relation','file',
    'address','percentage','rating'
  )),
  section_key text not null default 'details',
  description text,
  options jsonb not null default '[]'::jsonb,
  validation jsonb not null default '{}'::jsonb,
  default_value jsonb,
  is_required boolean not null default false,
  is_searchable boolean not null default false,
  is_filterable boolean not null default false,
  is_system boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, entity_type, field_key)
);

create table if not exists public.pipelines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_type text not null default 'lead' check (entity_type in ('lead','deal')),
  pipeline_key text not null,
  name text not null,
  description text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, entity_type, pipeline_key)
);

create table if not exists public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  stage_key text not null,
  name text not null,
  stage_type text not null default 'open' check (stage_type in ('open','won','lost')),
  probability integer not null default 0 check (probability between 0 and 100),
  sort_order integer not null default 100,
  color_token text not null default 'zinc',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pipeline_id, stage_key)
);

create table if not exists public.workspace_modules (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  module_key text not null,
  is_enabled boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  sort_order integer not null default 100,
  primary key (workspace_id, module_key)
);

-- Seed reusable industry packs. They are intentionally data-only: switching packs
-- never requires a code fork.
insert into public.business_templates(key,name,business_type,description,terminology,modules,fields,pipeline)
values
(
  'travel', 'Travel & Tours', 'travel',
  'Travel inquiry, booking and trip operations.',
  '{"lead":"Inquiry","lead_plural":"Inquiries","contact":"Traveler","contact_plural":"Travelers","deal":"Booking","deal_plural":"Bookings","convert":"Convert to Inquiry","workspace_label":"Travel Workspace"}'::jsonb,
  '{"inbox":true,"leads":true,"tasks":true,"documents":true,"quotes":true,"payments":true,"itinerary":true,"passengers":true,"suppliers":true,"appointments":false,"applications":false}'::jsonb,
  '[
    {"key":"destination","label":"Destination","type":"text","section":"trip","required":true,"searchable":true,"filterable":true,"order":10,"system":true},
    {"key":"travel_dates","label":"Travel Dates","type":"text","section":"trip","order":20,"system":true},
    {"key":"duration_days","label":"Duration (days)","type":"number","section":"trip","order":30,"system":true},
    {"key":"pax_adults","label":"Adults","type":"number","section":"travelers","order":40,"system":true},
    {"key":"pax_children","label":"Children","type":"number","section":"travelers","order":50,"system":true},
    {"key":"travel_type","label":"Travel Type","type":"single_select","section":"trip","options":["family","couple","solo","group","business"],"order":60,"system":true},
    {"key":"budget_range","label":"Budget","type":"text","section":"commercial","filterable":true,"order":70,"system":true},
    {"key":"hotel_category","label":"Hotel Category","type":"text","section":"trip","order":80,"system":true}
  ]'::jsonb,
  '{"key":"travel_sales","name":"Travel Sales","stages":[
    {"key":"new","name":"New Inquiry","type":"open","probability":5,"order":10},
    {"key":"contacted","name":"Contacted","type":"open","probability":15,"order":20},
    {"key":"quote_sent","name":"Quotation","type":"open","probability":35,"order":30},
    {"key":"in_negotiation","name":"Negotiation","type":"open","probability":60,"order":40},
    {"key":"won","name":"Booked","type":"won","probability":100,"order":50},
    {"key":"lost","name":"Lost","type":"lost","probability":0,"order":60}
  ]}'::jsonb
),
(
  'consultancy', 'Education Consultancy', 'consultancy',
  'Student counseling, application and visa workflow.',
  '{"lead":"Student Inquiry","lead_plural":"Student Inquiries","contact":"Student","contact_plural":"Students","deal":"Application","deal_plural":"Applications","convert":"Convert to Student Inquiry","workspace_label":"Consultancy Workspace"}'::jsonb,
  '{"inbox":true,"leads":true,"tasks":true,"documents":true,"applications":true,"appointments":true,"quotes":false,"itinerary":false,"passengers":false,"suppliers":false}'::jsonb,
  '[
    {"key":"study_destination","label":"Study Destination","type":"country","section":"study","searchable":true,"filterable":true,"order":10},
    {"key":"intake","label":"Intake","type":"text","section":"study","filterable":true,"order":20},
    {"key":"institution","label":"Institution","type":"text","section":"study","searchable":true,"order":30},
    {"key":"course","label":"Course","type":"text","section":"study","searchable":true,"order":40},
    {"key":"qualification","label":"Academic Qualification","type":"text","section":"qualification","order":50},
    {"key":"gpa","label":"GPA / Percentage","type":"text","section":"qualification","order":60},
    {"key":"language_test","label":"Language Test","type":"single_select","section":"qualification","options":["IELTS","PTE","JLPT","NAT","JFT","TOEFL","None"],"filterable":true,"order":70},
    {"key":"language_score","label":"Language Score / Level","type":"text","section":"qualification","order":80}
  ]'::jsonb,
  '{"key":"student_application","name":"Student Application","stages":[
    {"key":"inquiry","name":"Inquiry","type":"open","probability":5,"order":10},
    {"key":"counseling","name":"Counseling","type":"open","probability":15,"order":20},
    {"key":"documentation","name":"Documentation","type":"open","probability":30,"order":30},
    {"key":"application","name":"Application","type":"open","probability":50,"order":40},
    {"key":"offer","name":"Offer / Acceptance","type":"open","probability":65,"order":50},
    {"key":"coe","name":"COE / Admission","type":"open","probability":80,"order":60},
    {"key":"visa","name":"Visa Processing","type":"open","probability":90,"order":70},
    {"key":"enrolled","name":"Enrolled","type":"won","probability":100,"order":80},
    {"key":"lost","name":"Closed / Lost","type":"lost","probability":0,"order":90}
  ]}'::jsonb
),
(
  'health', 'Health & Wellness', 'health',
  'Inquiry, consultation, enrollment and follow-up workflow.',
  '{"lead":"Client Inquiry","lead_plural":"Client Inquiries","contact":"Client","contact_plural":"Clients","deal":"Program","deal_plural":"Programs","convert":"Convert to Client","workspace_label":"Health Workspace"}'::jsonb,
  '{"inbox":true,"leads":true,"tasks":true,"documents":true,"appointments":true,"payments":true,"applications":false,"itinerary":false,"passengers":false,"suppliers":false}'::jsonb,
  '[
    {"key":"service_interest","label":"Service / Program","type":"text","section":"care","searchable":true,"filterable":true,"order":10},
    {"key":"consultation_date","label":"Consultation Date","type":"datetime","section":"care","order":20},
    {"key":"client_goal","label":"Client Goal","type":"textarea","section":"care","order":30},
    {"key":"consultation_status","label":"Consultation Status","type":"single_select","section":"care","options":["Not Scheduled","Scheduled","Completed","No Show"],"filterable":true,"order":40},
    {"key":"program_status","label":"Program Status","type":"single_select","section":"care","options":["Considering","Enrolled","Active","Paused","Completed"],"filterable":true,"order":50},
    {"key":"follow_up_date","label":"Follow-up Date","type":"date","section":"care","order":60}
  ]'::jsonb,
  '{"key":"client_journey","name":"Client Journey","stages":[
    {"key":"inquiry","name":"New Inquiry","type":"open","probability":5,"order":10},
    {"key":"consultation","name":"Consultation","type":"open","probability":25,"order":20},
    {"key":"assessment","name":"Assessment","type":"open","probability":40,"order":30},
    {"key":"recommended","name":"Plan Recommended","type":"open","probability":65,"order":40},
    {"key":"enrolled","name":"Enrolled","type":"won","probability":100,"order":50},
    {"key":"lost","name":"Not Proceeding","type":"lost","probability":0,"order":60}
  ]}'::jsonb
),
(
  'agency', 'Service Agency', 'agency',
  'Prospect, proposal and project conversion workflow.',
  '{"lead":"Prospect","lead_plural":"Prospects","contact":"Client","contact_plural":"Clients","deal":"Project","deal_plural":"Projects","convert":"Convert to Prospect","workspace_label":"Agency Workspace"}'::jsonb,
  '{"inbox":true,"leads":true,"tasks":true,"documents":true,"quotes":true,"payments":true,"appointments":true,"applications":false,"itinerary":false,"passengers":false,"suppliers":false}'::jsonb,
  '[
    {"key":"service_interest","label":"Service","type":"text","section":"opportunity","searchable":true,"filterable":true,"order":10},
    {"key":"project_budget","label":"Budget","type":"currency","section":"opportunity","order":20},
    {"key":"project_deadline","label":"Target Deadline","type":"date","section":"opportunity","order":30},
    {"key":"company_name","label":"Company","type":"text","section":"client","searchable":true,"order":40},
    {"key":"brief","label":"Requirements / Brief","type":"textarea","section":"opportunity","order":50}
  ]'::jsonb,
  '{"key":"sales","name":"Sales Pipeline","stages":[
    {"key":"new","name":"New Prospect","type":"open","probability":5,"order":10},
    {"key":"qualified","name":"Qualified","type":"open","probability":25,"order":20},
    {"key":"proposal","name":"Proposal","type":"open","probability":50,"order":30},
    {"key":"negotiation","name":"Negotiation","type":"open","probability":70,"order":40},
    {"key":"won","name":"Won","type":"won","probability":100,"order":50},
    {"key":"lost","name":"Lost","type":"lost","probability":0,"order":60}
  ]}'::jsonb
),
(
  'generic', 'General CRM', 'generic',
  'Neutral CRM configuration for any business.',
  '{"lead":"Lead","lead_plural":"Leads","contact":"Contact","contact_plural":"Contacts","deal":"Opportunity","deal_plural":"Opportunities","convert":"Convert to Lead","workspace_label":"Business Workspace"}'::jsonb,
  '{"inbox":true,"leads":true,"tasks":true,"documents":true,"appointments":true,"quotes":false,"payments":false,"applications":false,"itinerary":false,"passengers":false,"suppliers":false}'::jsonb,
  '[
    {"key":"interest","label":"Interest / Requirement","type":"text","section":"details","searchable":true,"filterable":true,"order":10},
    {"key":"budget","label":"Budget","type":"currency","section":"details","order":20},
    {"key":"target_date","label":"Target Date","type":"date","section":"details","order":30},
    {"key":"notes","label":"Requirements","type":"textarea","section":"details","order":40}
  ]'::jsonb,
  '{"key":"default","name":"Sales Pipeline","stages":[
    {"key":"new","name":"New","type":"open","probability":5,"order":10},
    {"key":"contacted","name":"Contacted","type":"open","probability":20,"order":20},
    {"key":"qualified","name":"Qualified","type":"open","probability":40,"order":30},
    {"key":"proposal","name":"Proposal","type":"open","probability":65,"order":40},
    {"key":"won","name":"Won","type":"won","probability":100,"order":50},
    {"key":"lost","name":"Lost","type":"lost","probability":0,"order":60}
  ]}'::jsonb
)
on conflict (key) do update set
  name = excluded.name,
  business_type = excluded.business_type,
  description = excluded.description,
  terminology = excluded.terminology,
  modules = excluded.modules,
  fields = excluded.fields,
  pipeline = excluded.pipeline,
  updated_at = now();

-- Fixed default workspace keeps every existing row compatible while the product is
-- migrated from single-business assumptions to workspace-aware writes.
insert into public.workspaces(
  id, name, slug, business_type, template_key, timezone, currency, locale, terminology, settings
)
values (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Wanderlust',
  'wanderlust',
  'travel',
  'travel',
  'Asia/Kathmandu',
  'NPR',
  'en-NP',
  (select terminology from public.business_templates where key = 'travel'),
  '{"platform_version":1}'::jsonb
)
on conflict (id) do nothing;

alter table public.profiles
  add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict;

update public.profiles
set workspace_id = '00000000-0000-0000-0000-000000000001'::uuid
where workspace_id is null;

alter table public.profiles
  alter column workspace_id set default '00000000-0000-0000-0000-000000000001'::uuid,
  alter column workspace_id set not null;

insert into public.workspace_members(workspace_id,user_id)
select workspace_id,id from public.profiles
on conflict (workspace_id,user_id) do nothing;

alter table public.leads
  add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict,
  add column if not exists custom_data jsonb not null default '{}'::jsonb,
  add column if not exists pipeline_id uuid references public.pipelines(id) on delete set null,
  add column if not exists pipeline_stage_id uuid references public.pipeline_stages(id) on delete set null;

update public.leads
set workspace_id = '00000000-0000-0000-0000-000000000001'::uuid
where workspace_id is null;

alter table public.leads
  alter column workspace_id set default '00000000-0000-0000-0000-000000000001'::uuid,
  alter column workspace_id set not null;

create index if not exists profiles_workspace_idx on public.profiles(workspace_id,is_active);
create index if not exists leads_workspace_stage_idx on public.leads(workspace_id,stage,created_at desc);
create index if not exists field_definitions_workspace_idx on public.field_definitions(workspace_id,entity_type,is_active,sort_order);
create index if not exists pipelines_workspace_idx on public.pipelines(workspace_id,entity_type,is_active);
create index if not exists pipeline_stages_pipeline_idx on public.pipeline_stages(pipeline_id,sort_order);

create or replace function public.current_workspace_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select workspace_id
  from public.profiles
  where id = auth.uid() and is_active = true;
$$;

revoke all on function public.current_workspace_id() from public;
grant execute on function public.current_workspace_id() to authenticated;

create or replace function public.apply_business_template(
  p_workspace_id uuid,
  p_template_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template public.business_templates%rowtype;
  v_field jsonb;
  v_stage jsonb;
  v_pipeline_id uuid;
  v_module record;
begin
  if auth.uid() is not null then
    if not public.current_user_active()
       or not public.is_management()
       or public.current_workspace_id() is distinct from p_workspace_id then
      raise exception 'Not authorized to configure this workspace';
    end if;
  end if;

  select * into v_template
  from public.business_templates
  where key = p_template_key and is_active = true;

  if not found then
    raise exception 'Unknown business template: %', p_template_key;
  end if;

  update public.workspaces
  set
    business_type = v_template.business_type,
    template_key = v_template.key,
    terminology = v_template.terminology,
    updated_at = now()
  where id = p_workspace_id;

  delete from public.field_definitions
  where workspace_id = p_workspace_id and entity_type = 'lead' and is_system = false;

  -- Template-managed fields are replaced as a unit. Existing physical travel fields
  -- remain untouched for backward compatibility and are flagged as system mappings.
  delete from public.field_definitions
  where workspace_id = p_workspace_id and entity_type = 'lead' and is_system = true;

  for v_field in select value from jsonb_array_elements(v_template.fields)
  loop
    insert into public.field_definitions(
      workspace_id, entity_type, field_key, label, field_type, section_key,
      options, is_required, is_searchable, is_filterable, is_system, sort_order
    ) values (
      p_workspace_id,
      'lead',
      v_field->>'key',
      v_field->>'label',
      v_field->>'type',
      coalesce(v_field->>'section','details'),
      coalesce(v_field->'options','[]'::jsonb),
      coalesce((v_field->>'required')::boolean,false),
      coalesce((v_field->>'searchable')::boolean,false),
      coalesce((v_field->>'filterable')::boolean,false),
      coalesce((v_field->>'system')::boolean,false),
      coalesce((v_field->>'order')::integer,100)
    );
  end loop;

  delete from public.pipelines
  where workspace_id = p_workspace_id and entity_type = 'lead';

  insert into public.pipelines(workspace_id,entity_type,pipeline_key,name,is_default)
  values (
    p_workspace_id,
    'lead',
    coalesce(v_template.pipeline->>'key','default'),
    coalesce(v_template.pipeline->>'name','Sales Pipeline'),
    true
  )
  returning id into v_pipeline_id;

  for v_stage in select value from jsonb_array_elements(coalesce(v_template.pipeline->'stages','[]'::jsonb))
  loop
    insert into public.pipeline_stages(
      pipeline_id,stage_key,name,stage_type,probability,sort_order,color_token
    ) values (
      v_pipeline_id,
      v_stage->>'key',
      v_stage->>'name',
      coalesce(v_stage->>'type','open'),
      coalesce((v_stage->>'probability')::integer,0),
      coalesce((v_stage->>'order')::integer,100),
      coalesce(v_stage->>'color','zinc')
    );
  end loop;

  delete from public.workspace_modules where workspace_id = p_workspace_id;
  for v_module in select key, value from jsonb_each(v_template.modules)
  loop
    insert into public.workspace_modules(workspace_id,module_key,is_enabled)
    values (p_workspace_id,v_module.key,coalesce((v_module.value #>> '{}')::boolean,false));
  end loop;

  update public.leads
  set pipeline_id = v_pipeline_id,
      pipeline_stage_id = (
        select ps.id
        from public.pipeline_stages ps
        where ps.pipeline_id = v_pipeline_id
          and ps.stage_key = leads.stage
        limit 1
      )
  where workspace_id = p_workspace_id;
end;
$$;

revoke all on function public.apply_business_template(uuid,text) from public;
grant execute on function public.apply_business_template(uuid,text) to authenticated;

-- Initialize the existing installation with Travel configuration.
select public.apply_business_template('00000000-0000-0000-0000-000000000001'::uuid,'travel');

-- Workspace-aware lead access. This closes the future cross-workspace hole while
-- preserving all current assignment behavior in the default workspace.
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
      and l.workspace_id = public.current_workspace_id()
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
      and l.workspace_id = public.current_workspace_id()
      and (public.is_management() or l.assigned_to = auth.uid())
  );
$$;

-- RLS for the configuration layer.
alter table public.business_templates enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.field_definitions enable row level security;
alter table public.pipelines enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.workspace_modules enable row level security;

create policy business_templates_read on public.business_templates
  for select to authenticated
  using (public.current_user_active() and is_active = true);

create policy workspaces_read_current on public.workspaces
  for select to authenticated
  using (public.current_user_active() and id = public.current_workspace_id());

create policy workspaces_update_management on public.workspaces
  for update to authenticated
  using (public.current_user_active() and public.is_management() and id = public.current_workspace_id())
  with check (public.current_user_active() and public.is_management() and id = public.current_workspace_id());

create policy workspace_members_read_current on public.workspace_members
  for select to authenticated
  using (public.current_user_active() and workspace_id = public.current_workspace_id());

create policy field_definitions_read_current on public.field_definitions
  for select to authenticated
  using (public.current_user_active() and workspace_id = public.current_workspace_id());
create policy field_definitions_write_management on public.field_definitions
  for all to authenticated
  using (public.current_user_active() and public.is_management() and workspace_id = public.current_workspace_id())
  with check (public.current_user_active() and public.is_management() and workspace_id = public.current_workspace_id());

create policy pipelines_read_current on public.pipelines
  for select to authenticated
  using (public.current_user_active() and workspace_id = public.current_workspace_id());
create policy pipelines_write_management on public.pipelines
  for all to authenticated
  using (public.current_user_active() and public.is_management() and workspace_id = public.current_workspace_id())
  with check (public.current_user_active() and public.is_management() and workspace_id = public.current_workspace_id());

create policy pipeline_stages_read_current on public.pipeline_stages
  for select to authenticated
  using (
    public.current_user_active()
    and exists (
      select 1 from public.pipelines p
      where p.id = pipeline_stages.pipeline_id
        and p.workspace_id = public.current_workspace_id()
    )
  );
create policy pipeline_stages_write_management on public.pipeline_stages
  for all to authenticated
  using (
    public.current_user_active() and public.is_management()
    and exists (
      select 1 from public.pipelines p
      where p.id = pipeline_stages.pipeline_id
        and p.workspace_id = public.current_workspace_id()
    )
  )
  with check (
    public.current_user_active() and public.is_management()
    and exists (
      select 1 from public.pipelines p
      where p.id = pipeline_stages.pipeline_id
        and p.workspace_id = public.current_workspace_id()
    )
  );

create policy workspace_modules_read_current on public.workspace_modules
  for select to authenticated
  using (public.current_user_active() and workspace_id = public.current_workspace_id());
create policy workspace_modules_write_management on public.workspace_modules
  for all to authenticated
  using (public.current_user_active() and public.is_management() and workspace_id = public.current_workspace_id())
  with check (public.current_user_active() and public.is_management() and workspace_id = public.current_workspace_id());

-- Tighten lead policies with workspace scope.
drop policy if exists "leads_select_scoped" on public.leads;
create policy "leads_select_scoped" on public.leads
  for select to authenticated
  using (
    public.current_user_active()
    and workspace_id = public.current_workspace_id()
    and (public.is_management() or assigned_to = auth.uid() or assigned_to is null)
  );

drop policy if exists "leads_insert_scoped" on public.leads;
create policy "leads_insert_scoped" on public.leads
  for insert to authenticated
  with check (
    public.current_user_active()
    and workspace_id = public.current_workspace_id()
    and (public.is_management() or assigned_to = auth.uid() or assigned_to is null)
  );

drop policy if exists "leads_update_scoped" on public.leads;
create policy "leads_update_scoped" on public.leads
  for update to authenticated
  using (
    public.current_user_active()
    and workspace_id = public.current_workspace_id()
    and (public.is_management() or assigned_to = auth.uid())
  )
  with check (
    public.current_user_active()
    and workspace_id = public.current_workspace_id()
    and (public.is_management() or assigned_to = auth.uid())
  );

drop policy if exists "leads_delete_management" on public.leads;
create policy "leads_delete_management" on public.leads
  for delete to authenticated
  using (
    public.current_user_active()
    and public.is_management()
    and workspace_id = public.current_workspace_id()
  );

grant select on public.business_templates to authenticated;
grant select, update on public.workspaces to authenticated;
grant select on public.workspace_members to authenticated;
grant select, insert, update, delete on public.field_definitions to authenticated;
grant select, insert, update, delete on public.pipelines to authenticated;
grant select, insert, update, delete on public.pipeline_stages to authenticated;
grant select, insert, update, delete on public.workspace_modules to authenticated;

commit;
