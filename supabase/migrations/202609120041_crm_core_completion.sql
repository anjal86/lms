-- 202609120041_crm_core_completion.sql
-- Complete the CRM core without creating parallel product systems.
-- Existing follow-ups, quote JSON and document JSON remain compatible while
-- Work Items, stage gates, proposal/document lifecycles and post-sale cases
-- become the canonical operational primitives.

begin;

-- ---------------------------------------------------------------------------
-- 1. Canonical Work Items
-- ---------------------------------------------------------------------------

create table if not exists public.work_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  lead_id uuid references public.leads(id) on delete cascade,
  conversation_id uuid references public.lead_conversations(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null,
  type text not null default 'custom' check (type in (
    'call','message','email','meeting','document','review','payment','proposal','custom'
  )),
  title text not null,
  description text,
  due_at timestamptz,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'open' check (status in ('open','completed','cancelled')),
  source text not null default 'manual',
  source_id text,
  completed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (lead_id is not null or contact_id is not null or conversation_id is not null)
);

create unique index if not exists work_items_source_unique_idx
  on public.work_items(workspace_id, source, source_id)
  where source_id is not null;
create index if not exists work_items_due_idx
  on public.work_items(workspace_id, status, due_at, owner_id);
create index if not exists work_items_lead_idx
  on public.work_items(lead_id, status, due_at);
create index if not exists work_items_contact_idx
  on public.work_items(contact_id, status, due_at);
create index if not exists work_items_conversation_idx
  on public.work_items(conversation_id, status, due_at);

create or replace function public.touch_work_item()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if new.status = 'completed' and new.completed_at is null then
    new.completed_at := now();
  elsif new.status <> 'completed' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_work_items_touch on public.work_items;
create trigger trg_work_items_touch
before update on public.work_items
for each row execute function public.touch_work_item();

create or replace function public.sync_follow_up_to_work_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_contact_id uuid;
  v_type text;
  v_status text;
begin
  if pg_trigger_depth() > 1 then return new; end if;

  select workspace_id, contact_id
  into v_workspace_id, v_contact_id
  from public.leads where id = new.lead_id;

  v_type := case new.channel
    when 'call' then 'call'
    when 'whatsapp' then 'message'
    when 'email' then 'email'
    when 'meeting' then 'meeting'
    else 'custom'
  end;
  v_status := case new.status
    when 'completed' then 'completed'
    when 'cancelled' then 'cancelled'
    else 'open'
  end;

  insert into public.work_items(
    workspace_id, contact_id, lead_id, owner_id, type, title, description,
    due_at, priority, status, source, source_id, completed_at, metadata,
    created_at, updated_at
  ) values (
    v_workspace_id, v_contact_id, new.lead_id, new.assigned_to, v_type, new.title,
    new.notes, new.scheduled_at, new.priority, v_status, 'follow_up', new.id::text,
    new.completed_at,
    jsonb_build_object(
      'channel', new.channel,
      'disposition', new.disposition,
      'completion_notes', new.completion_notes,
      'is_escalated', new.is_escalated
    ),
    new.created_at, new.updated_at
  )
  on conflict (workspace_id, source, source_id) where source_id is not null
  do update set
    contact_id = excluded.contact_id,
    lead_id = excluded.lead_id,
    owner_id = excluded.owner_id,
    type = excluded.type,
    title = excluded.title,
    description = excluded.description,
    due_at = excluded.due_at,
    priority = excluded.priority,
    status = excluded.status,
    completed_at = excluded.completed_at,
    metadata = excluded.metadata,
    updated_at = excluded.updated_at;

  return new;
end;
$$;

drop trigger if exists trg_follow_up_work_item_sync on public.follow_ups;
create trigger trg_follow_up_work_item_sync
after insert or update on public.follow_ups
for each row execute function public.sync_follow_up_to_work_item();

create or replace function public.sync_work_item_to_follow_up()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 or new.source <> 'follow_up' or new.source_id is null then
    return new;
  end if;

  update public.follow_ups
  set status = case new.status when 'completed' then 'completed' when 'cancelled' then 'cancelled' else 'pending' end,
      completed_at = case when new.status = 'completed' then coalesce(new.completed_at, now()) else null end,
      title = new.title,
      scheduled_at = coalesce(new.due_at, scheduled_at),
      priority = new.priority,
      assigned_to = coalesce(new.owner_id, assigned_to),
      notes = coalesce(new.description, notes),
      updated_at = now()
  where id::text = new.source_id;

  return new;
end;
$$;

drop trigger if exists trg_work_item_follow_up_sync on public.work_items;
create trigger trg_work_item_follow_up_sync
after update on public.work_items
for each row execute function public.sync_work_item_to_follow_up();

-- Backfill historical follow-ups. The trigger handles future writes.
insert into public.work_items(
  workspace_id, contact_id, lead_id, owner_id, type, title, description, due_at,
  priority, status, source, source_id, completed_at, metadata, created_at, updated_at
)
select
  l.workspace_id,
  l.contact_id,
  f.lead_id,
  f.assigned_to,
  case f.channel when 'call' then 'call' when 'whatsapp' then 'message' when 'email' then 'email' when 'meeting' then 'meeting' else 'custom' end,
  f.title,
  f.notes,
  f.scheduled_at,
  f.priority,
  case f.status when 'completed' then 'completed' when 'cancelled' then 'cancelled' else 'open' end,
  'follow_up',
  f.id::text,
  f.completed_at,
  jsonb_build_object('channel',f.channel,'disposition',f.disposition,'completion_notes',f.completion_notes,'is_escalated',f.is_escalated),
  f.created_at,
  f.updated_at
from public.follow_ups f
join public.leads l on l.id = f.lead_id
on conflict (workspace_id, source, source_id) where source_id is not null do nothing;

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
    where wi.lead_id = p_lead_id
      and wi.status = 'open'
      and wi.due_at is not null
  )
  where l.id = p_lead_id;
$$;

create or replace function public.after_work_item_refresh_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.lead_id is not null then perform public.refresh_lead_next_work_item(old.lead_id); end if;
    return old;
  end if;
  if new.lead_id is not null then perform public.refresh_lead_next_work_item(new.lead_id); end if;
  if tg_op = 'UPDATE' and old.lead_id is distinct from new.lead_id and old.lead_id is not null then
    perform public.refresh_lead_next_work_item(old.lead_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_work_items_refresh_lead on public.work_items;
create trigger trg_work_items_refresh_lead
after insert or update or delete on public.work_items
for each row execute function public.after_work_item_refresh_lead();

-- Initialize the compatibility cache once.
do $$
declare r record;
begin
  for r in select distinct lead_id from public.work_items where lead_id is not null loop
    perform public.refresh_lead_next_work_item(r.lead_id);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Stage-aware qualification requirements
-- ---------------------------------------------------------------------------

create table if not exists public.pipeline_stage_requirements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  pipeline_stage_id uuid not null references public.pipeline_stages(id) on delete cascade,
  requirement_type text not null check (requirement_type in ('field','document')),
  requirement_key text not null,
  label text not null,
  is_required boolean not null default true,
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pipeline_stage_id, requirement_type, requirement_key)
);

create index if not exists pipeline_stage_requirements_stage_idx
  on public.pipeline_stage_requirements(workspace_id, pipeline_stage_id, is_required, sort_order);

-- Seed an initial gate from the qualification schema at the first meaningful
-- qualification/proposal stage. Managers can edit/remove these rows later.
insert into public.pipeline_stage_requirements(
  workspace_id, pipeline_stage_id, requirement_type, requirement_key, label, sort_order
)
select
  p.workspace_id,
  ps.id,
  'field',
  fd.field_key,
  fd.label,
  fd.sort_order
from public.pipelines p
join public.pipeline_stages ps on ps.pipeline_id = p.id
join public.workspaces w on w.id = p.workspace_id
join public.field_definitions fd
  on fd.workspace_id = p.workspace_id
 and fd.entity_type = 'lead'
 and fd.is_active = true
 and coalesce((fd.validation->>'qualification')::boolean, false) = true
where p.entity_type = 'lead'
  and p.is_default = true
  and ps.stage_key = case
    when w.business_type = 'travel' then 'quote_sent'
    when w.business_type in ('consultancy','education') then 'documentation'
    when w.business_type in ('agency','services') then 'qualified'
    when w.business_type = 'health' then 'assessment'
    else 'qualified'
  end
on conflict (pipeline_stage_id, requirement_type, requirement_key) do nothing;

create or replace function public.lead_stage_missing_requirements(
  p_lead_id uuid,
  p_pipeline_stage_id uuid
)
returns table(requirement_type text, requirement_key text, label text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lead public.leads%rowtype;
  r record;
  v_value jsonb;
begin
  select * into v_lead from public.leads where id = p_lead_id;
  if not found then return; end if;

  for r in
    select * from public.pipeline_stage_requirements
    where pipeline_stage_id = p_pipeline_stage_id
      and workspace_id = v_lead.workspace_id
      and is_required = true
    order by sort_order, label
  loop
    if r.requirement_type = 'field' then
      v_value := coalesce(to_jsonb(v_lead)->r.requirement_key, v_lead.custom_data->r.requirement_key);
      if v_value is null
         or v_value = 'null'::jsonb
         or v_value = '""'::jsonb
         or v_value = '[]'::jsonb
         or v_value = '{}'::jsonb then
        requirement_type := r.requirement_type;
        requirement_key := r.requirement_key;
        label := r.label;
        return next;
      end if;
    elsif r.requirement_type = 'document' then
      if not exists (
        select 1 from public.lead_documents d
        where d.lead_id = p_lead_id
          and coalesce(d.document_type, d.category, '') = r.requirement_key
          and coalesce(d.lifecycle_status, case when d.uploaded_at is not null then 'received' else 'requested' end) = 'verified'
      ) then
        requirement_type := r.requirement_type;
        requirement_key := r.requirement_key;
        label := r.label;
        return next;
      end if;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Document lifecycle on the existing normalized document table
-- ---------------------------------------------------------------------------

alter table public.lead_documents
  add column if not exists document_type text,
  add column if not exists lifecycle_status text not null default 'received',
  add column if not exists requested_at timestamptz,
  add column if not exists received_at timestamptz,
  add column if not exists verified_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists owner_id uuid references public.profiles(id) on delete set null,
  add column if not exists notes text,
  add column if not exists rejection_reason text;

update public.lead_documents
set document_type = coalesce(document_type, category),
    lifecycle_status = case when uploaded_at is not null then 'received' else 'requested' end,
    received_at = coalesce(received_at, uploaded_at)
where document_type is null or received_at is null;

create index if not exists lead_documents_lifecycle_idx
  on public.lead_documents(lead_id, lifecycle_status, document_type);
create index if not exists lead_documents_expiry_idx
  on public.lead_documents(expires_at) where expires_at is not null;

create or replace function public.normalize_document_lifecycle()
returns trigger
language plpgsql
as $$
begin
  new.document_type := coalesce(nullif(new.document_type,''), new.category);
  if new.lifecycle_status = 'requested' then
    new.requested_at := coalesce(new.requested_at, now());
  elsif new.lifecycle_status = 'received' then
    new.received_at := coalesce(new.received_at, new.uploaded_at, now());
  elsif new.lifecycle_status = 'verified' then
    new.received_at := coalesce(new.received_at, new.uploaded_at, now());
    new.verified_at := coalesce(new.verified_at, now());
    new.rejected_at := null;
    new.rejection_reason := null;
  elsif new.lifecycle_status = 'rejected' then
    new.rejected_at := coalesce(new.rejected_at, now());
    new.verified_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lead_documents_lifecycle on public.lead_documents;
create trigger trg_lead_documents_lifecycle
before insert or update on public.lead_documents
for each row execute function public.normalize_document_lifecycle();

-- ---------------------------------------------------------------------------
-- 4. Proposal lifecycle on existing lead_quotes
-- ---------------------------------------------------------------------------

alter table public.lead_quotes
  add column if not exists version integer not null default 1,
  add column if not exists parent_revision_id text,
  add column if not exists sent_at timestamptz,
  add column if not exists viewed_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists terms text,
  add column if not exists updated_at timestamptz not null default now();

update public.lead_quotes
set status = coalesce(nullif(status,''), 'draft'),
    created_at = coalesce(created_at, now()),
    updated_at = coalesce(updated_at, created_at, now());

create index if not exists lead_quotes_lifecycle_idx
  on public.lead_quotes(lead_id, status, created_at desc);

create or replace function public.normalize_quote_lifecycle()
returns trigger
language plpgsql
as $$
begin
  new.status := coalesce(nullif(new.status,''), 'draft');
  new.updated_at := now();
  if new.status = 'sent' then new.sent_at := coalesce(new.sent_at, now()); end if;
  if new.status = 'viewed' then
    new.sent_at := coalesce(new.sent_at, now());
    new.viewed_at := coalesce(new.viewed_at, now());
  end if;
  if new.status = 'accepted' then new.accepted_at := coalesce(new.accepted_at, now()); end if;
  if new.status = 'rejected' then new.rejected_at := coalesce(new.rejected_at, now()); end if;
  return new;
end;
$$;

drop trigger if exists trg_lead_quotes_lifecycle on public.lead_quotes;
create trigger trg_lead_quotes_lifecycle
before insert or update on public.lead_quotes
for each row execute function public.normalize_quote_lifecycle();

-- ---------------------------------------------------------------------------
-- 5. Won -> post-sale case
-- ---------------------------------------------------------------------------

create table if not exists public.post_sale_cases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  case_type text not null default 'delivery',
  title text not null,
  status text not null default 'open' check (status in ('open','in_progress','blocked','completed','cancelled')),
  owner_id uuid references public.profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id)
);

create index if not exists post_sale_cases_workspace_status_idx
  on public.post_sale_cases(workspace_id, status, owner_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- 6. Automation/event outbox and AI suggestions
-- ---------------------------------------------------------------------------

create table if not exists public.business_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_type text not null,
  entity_type text not null,
  entity_id text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists business_events_pending_idx
  on public.business_events(workspace_id, created_at)
  where processed_at is null;

create table if not exists public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  conversation_id uuid references public.lead_conversations(id) on delete cascade,
  kind text not null check (kind in ('summary','field_updates','next_action','reply')),
  status text not null default 'proposed' check (status in ('proposed','accepted','rejected','expired')),
  payload jsonb not null default '{}'::jsonb,
  model text,
  requested_by uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create index if not exists ai_suggestions_review_idx
  on public.ai_suggestions(workspace_id, status, created_at desc);

create or replace function public.emit_crm_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace uuid;
  v_type text;
  v_entity text;
  v_entity_id text;
  v_payload jsonb;
begin
  if tg_table_name = 'work_items' then
    v_workspace := new.workspace_id; v_entity := 'work_item'; v_entity_id := new.id::text;
    v_type := case when tg_op = 'INSERT' then 'work_item.created'
                   when old.status is distinct from new.status then 'work_item.' || new.status
                   else 'work_item.updated' end;
    v_payload := jsonb_build_object('lead_id',new.lead_id,'contact_id',new.contact_id,'owner_id',new.owner_id,'due_at',new.due_at,'type',new.type,'status',new.status);
  elsif tg_table_name = 'lead_quotes' then
    select workspace_id into v_workspace from public.leads where id = new.lead_id;
    v_entity := 'proposal'; v_entity_id := new.lead_id::text || ':' || new.id;
    v_type := case when tg_op = 'INSERT' then 'proposal.created'
                   when old.status is distinct from new.status then 'proposal.' || new.status
                   else 'proposal.updated' end;
    v_payload := jsonb_build_object('lead_id',new.lead_id,'quote_id',new.id,'status',new.status,'version',new.version);
  elsif tg_table_name = 'lead_documents' then
    select workspace_id into v_workspace from public.leads where id = new.lead_id;
    v_entity := 'document'; v_entity_id := new.lead_id::text || ':' || new.id;
    v_type := case when tg_op = 'INSERT' then 'document.created'
                   when old.lifecycle_status is distinct from new.lifecycle_status then 'document.' || new.lifecycle_status
                   else 'document.updated' end;
    v_payload := jsonb_build_object('lead_id',new.lead_id,'document_id',new.id,'document_type',new.document_type,'status',new.lifecycle_status);
  elsif tg_table_name = 'post_sale_cases' then
    v_workspace := new.workspace_id; v_entity := 'case'; v_entity_id := new.id::text;
    v_type := case when tg_op = 'INSERT' then 'case.created'
                   when old.status is distinct from new.status then 'case.' || new.status
                   else 'case.updated' end;
    v_payload := jsonb_build_object('lead_id',new.lead_id,'case_type',new.case_type,'status',new.status,'owner_id',new.owner_id);
  else
    return new;
  end if;

  insert into public.business_events(workspace_id,event_type,entity_type,entity_id,actor_id,payload)
  values (v_workspace,v_type,v_entity,v_entity_id,auth.uid(),coalesce(v_payload,'{}'::jsonb));
  return new;
end;
$$;

drop trigger if exists trg_work_item_business_event on public.work_items;
create trigger trg_work_item_business_event after insert or update on public.work_items
for each row execute function public.emit_crm_event();
drop trigger if exists trg_quote_business_event on public.lead_quotes;
create trigger trg_quote_business_event after insert or update on public.lead_quotes
for each row execute function public.emit_crm_event();
drop trigger if exists trg_document_business_event on public.lead_documents;
create trigger trg_document_business_event after insert or update on public.lead_documents
for each row execute function public.emit_crm_event();
drop trigger if exists trg_case_business_event on public.post_sale_cases;
create trigger trg_case_business_event after insert or update on public.post_sale_cases
for each row execute function public.emit_crm_event();

create or replace function public.ensure_post_sale_case()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stage_type text;
  v_business_type text;
  v_case_type text;
begin
  if new.pipeline_stage_id is not null then
    select stage_type into v_stage_type from public.pipeline_stages where id = new.pipeline_stage_id;
  end if;
  if coalesce(v_stage_type, case when new.stage = 'won' then 'won' else 'open' end) <> 'won' then
    return new;
  end if;

  select business_type into v_business_type from public.workspaces where id = new.workspace_id;
  v_case_type := case
    when v_business_type = 'travel' then 'booking'
    when v_business_type in ('consultancy','education') then 'application'
    when v_business_type = 'health' then 'program'
    else 'delivery'
  end;

  insert into public.post_sale_cases(workspace_id,lead_id,contact_id,case_type,title,owner_id,metadata)
  values (
    new.workspace_id,
    new.id,
    new.contact_id,
    v_case_type,
    coalesce(nullif(new.customer_name,''),'Customer') || ' · ' || initcap(v_case_type),
    new.assigned_to,
    jsonb_build_object('created_from_stage',new.stage,'pipeline_stage_id',new.pipeline_stage_id)
  )
  on conflict (lead_id) do update set
    contact_id = coalesce(excluded.contact_id, post_sale_cases.contact_id),
    owner_id = coalesce(excluded.owner_id, post_sale_cases.owner_id),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_lead_ensure_post_sale_case on public.leads;
create trigger trg_lead_ensure_post_sale_case
after insert or update of stage, pipeline_stage_id on public.leads
for each row execute function public.ensure_post_sale_case();

-- Backfill already-won opportunities.
update public.leads
set pipeline_stage_id = pipeline_stage_id
where stage = 'won'
   or exists (select 1 from public.pipeline_stages ps where ps.id = leads.pipeline_stage_id and ps.stage_type = 'won');

-- ---------------------------------------------------------------------------
-- 7. Opportunity health and conversion analytics
-- ---------------------------------------------------------------------------

create or replace view public.opportunity_health
with (security_invoker = true)
as
select
  l.id as lead_id,
  l.workspace_id,
  greatest(0, least(100,
    100
    - case when exists (
        select 1 from public.work_items wi
        where wi.lead_id = l.id and wi.status = 'open' and wi.due_at < now()
      ) then 30 else 0 end
    - case when coalesce(l.last_contacted_at,l.created_at) < now() - interval '7 days' then 20 else 0 end
    - case when l.next_follow_up_at is null and l.stage not in ('won','lost','junk') then 15 else 0 end
    - case when exists (
        select 1 from public.lead_quotes q
        where q.lead_id = l.id and q.status in ('sent','viewed')
          and coalesce(q.sent_at,q.created_at) < now() - interval '7 days'
      ) then 15 else 0 end
    - case when l.first_response_due_at is not null and l.first_contacted_at is null and l.first_response_due_at < now() then 20 else 0 end
  ))::integer as health_score,
  (select count(*) from public.work_items wi where wi.lead_id = l.id and wi.status = 'open' and wi.due_at < now())::integer as overdue_work_count,
  coalesce(l.last_contacted_at,l.created_at) as last_customer_activity_at,
  l.next_follow_up_at as next_action_at
from public.leads l;

create or replace function public.crm_conversion_summary()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select l.*,
      coalesce(ps.stage_type, case when l.stage = 'won' then 'won' when l.stage in ('lost','junk') then 'lost' else 'open' end) as normalized_stage_type
    from public.leads l
    left join public.pipeline_stages ps on ps.id = l.pipeline_stage_id
    where l.workspace_id = public.current_workspace_id()
  ), source_rollup as (
    select coalesce(source,'unknown') source,
           count(*) total,
           count(*) filter (where normalized_stage_type='won') won,
           count(*) filter (where normalized_stage_type='lost') lost,
           coalesce(sum(coalesce(package_sale_price,won_deal_value,0)) filter (where normalized_stage_type='won'),0) won_value
    from scoped group by coalesce(source,'unknown')
  )
  select jsonb_build_object(
    'total', (select count(*) from scoped),
    'open', (select count(*) from scoped where normalized_stage_type='open'),
    'won', (select count(*) from scoped where normalized_stage_type='won'),
    'lost', (select count(*) from scoped where normalized_stage_type='lost'),
    'win_rate', case when (select count(*) from scoped where normalized_stage_type in ('won','lost')) = 0 then 0
      else round(100.0 * (select count(*) from scoped where normalized_stage_type='won') /
        (select count(*) from scoped where normalized_stage_type in ('won','lost')), 2) end,
    'pipeline_value', (select coalesce(sum(coalesce(package_sale_price,won_deal_value,0)),0) from scoped where normalized_stage_type='open'),
    'won_value', (select coalesce(sum(coalesce(package_sale_price,won_deal_value,0)),0) from scoped where normalized_stage_type='won'),
    'average_sales_cycle_days', (select coalesce(round(avg(extract(epoch from (closed_at-created_at))/86400.0)::numeric,2),0) from scoped where normalized_stage_type in ('won','lost') and closed_at is not null),
    'sources', coalesce((select jsonb_agg(to_jsonb(source_rollup) order by total desc) from source_rollup),'[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- 8. RLS / grants / notification + audit vocabulary
-- ---------------------------------------------------------------------------

alter table public.work_items enable row level security;
alter table public.pipeline_stage_requirements enable row level security;
alter table public.post_sale_cases enable row level security;
alter table public.business_events enable row level security;
alter table public.ai_suggestions enable row level security;

create policy work_items_select_scoped on public.work_items
  for select to authenticated using (
    public.current_user_active() and workspace_id = public.current_workspace_id()
    and (public.is_management() or owner_id = auth.uid() or (lead_id is not null and public.can_access_lead(lead_id)))
  );
create policy work_items_insert_scoped on public.work_items
  for insert to authenticated with check (
    public.current_user_active() and workspace_id = public.current_workspace_id()
    and (public.is_management() or owner_id = auth.uid() or owner_id is null)
  );
create policy work_items_update_scoped on public.work_items
  for update to authenticated
  using (public.current_user_active() and workspace_id = public.current_workspace_id() and (public.is_management() or owner_id = auth.uid()))
  with check (public.current_user_active() and workspace_id = public.current_workspace_id() and (public.is_management() or owner_id = auth.uid()));
create policy work_items_delete_scoped on public.work_items
  for delete to authenticated using (public.current_user_active() and workspace_id = public.current_workspace_id() and (public.is_management() or owner_id = auth.uid()));

create policy pipeline_stage_requirements_read on public.pipeline_stage_requirements
  for select to authenticated using (public.current_user_active() and workspace_id = public.current_workspace_id());
create policy pipeline_stage_requirements_write on public.pipeline_stage_requirements
  for all to authenticated
  using (public.current_user_active() and public.is_management() and workspace_id = public.current_workspace_id())
  with check (public.current_user_active() and public.is_management() and workspace_id = public.current_workspace_id());

create policy post_sale_cases_read on public.post_sale_cases
  for select to authenticated using (
    public.current_user_active() and workspace_id = public.current_workspace_id()
    and (public.is_management() or owner_id = auth.uid() or public.can_access_lead(lead_id))
  );
create policy post_sale_cases_write on public.post_sale_cases
  for all to authenticated
  using (public.current_user_active() and workspace_id = public.current_workspace_id() and (public.is_management() or owner_id = auth.uid()))
  with check (public.current_user_active() and workspace_id = public.current_workspace_id() and (public.is_management() or owner_id = auth.uid()));

create policy business_events_read_management on public.business_events
  for select to authenticated using (public.current_user_active() and public.is_management() and workspace_id = public.current_workspace_id());

create policy ai_suggestions_read_scoped on public.ai_suggestions
  for select to authenticated using (
    public.current_user_active() and workspace_id = public.current_workspace_id()
    and (public.is_management() or requested_by = auth.uid() or (lead_id is not null and public.can_access_lead(lead_id)))
  );
create policy ai_suggestions_write_scoped on public.ai_suggestions
  for all to authenticated
  using (public.current_user_active() and workspace_id = public.current_workspace_id() and (public.is_management() or requested_by = auth.uid()))
  with check (public.current_user_active() and workspace_id = public.current_workspace_id() and (public.is_management() or requested_by = auth.uid()));

grant select,insert,update,delete on public.work_items to authenticated;
grant select,insert,update,delete on public.pipeline_stage_requirements to authenticated;
grant select,insert,update,delete on public.post_sale_cases to authenticated;
grant select on public.business_events to authenticated;
grant select,insert,update,delete on public.ai_suggestions to authenticated;
grant select on public.opportunity_health to authenticated;
grant execute on function public.lead_stage_missing_requirements(uuid,uuid) to authenticated;
grant execute on function public.crm_conversion_summary() to authenticated;

-- Expand notification/audit vocabularies while retaining all existing values.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'lead_assigned','sla_breach','follow_up_due','reassignment','system',
  'work_item_due','document_update','proposal_update','case_update','mention'
));

alter table public.activity_logs drop constraint if exists activity_logs_activity_type_check;
alter table public.activity_logs add constraint activity_logs_activity_type_check check (activity_type in (
  'call','whatsapp','email','note','quote','payment','document','stage_change','reassignment','sla_alert','system',
  'work_item','proposal','case','automation'
));

commit;
