-- Automatically turn paid Meta referral payloads into durable workspace ad context.
-- Webhook creative is available immediately; Marketing API enrichment runs later.

begin;

create table if not exists public.meta_ad_registry (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connection_id uuid references public.integration_connections(id) on delete set null,
  provider text not null,
  platform text,
  ad_id text not null,
  source_id text,
  source_url text,
  campaign_id text,
  campaign_name text,
  adset_id text,
  adset_name text,
  ad_name text,
  creative_id text,
  headline text,
  body text,
  call_to_action_type text,
  destination_url text,
  media_type text,
  media_url text,
  status text,
  effective_status text,
  adset_status text,
  adset_effective_status text,
  campaign_status text,
  campaign_effective_status text,
  adset_start_time timestamptz,
  adset_end_time timestamptz,
  enrichment_status text not null default 'pending'
    check (enrichment_status in ('pending','enriched','permission_required','failed','unsupported')),
  last_meta_sync_at timestamptz,
  last_meta_sync_error text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  webhook_payload jsonb not null default '{}'::jsonb,
  meta_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, ad_id)
);

create index if not exists meta_ad_registry_workspace_seen_idx
  on public.meta_ad_registry(workspace_id, last_seen_at desc);
create index if not exists meta_ad_registry_connection_idx
  on public.meta_ad_registry(workspace_id, connection_id, last_seen_at desc);
create index if not exists meta_ad_registry_source_idx
  on public.meta_ad_registry(workspace_id, source_id)
  where source_id is not null;
create index if not exists meta_ad_registry_campaign_idx
  on public.meta_ad_registry(workspace_id, campaign_id)
  where campaign_id is not null;

create table if not exists public.meta_ad_enrichment_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  registry_id uuid not null unique references public.meta_ad_registry(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued','processing','completed','failed','permission_required')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 4 check (max_attempts between 1 and 20),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meta_ad_enrichment_jobs_queue_idx
  on public.meta_ad_enrichment_jobs(status, next_attempt_at, created_at)
  where status in ('queued','processing');

create or replace function public.claim_meta_ad_enrichment_job()
returns setof public.meta_ad_enrichment_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Not authorized' using errcode='42501';
  end if;

  -- Keep recently seen ads fresh and let a newly re-authorized Meta connection
  -- recover automatically after a previous permission failure.
  update public.meta_ad_enrichment_jobs j
  set status = 'queued',
      attempt_count = 0,
      next_attempt_at = now(),
      locked_at = null,
      completed_at = null,
      updated_at = now()
  from public.meta_ad_registry r
  where j.registry_id = r.id
    and j.status in ('completed','permission_required','failed')
    and j.updated_at < now() - interval '12 hours'
    and r.last_seen_at > now() - interval '90 days'
    and r.enrichment_status <> 'unsupported';

  select j.id into v_id
  from public.meta_ad_enrichment_jobs j
  where j.status = 'queued'
    and j.next_attempt_at <= now()
  order by j.created_at asc
  for update skip locked
  limit 1;

  if v_id is null then return; end if;

  update public.meta_ad_enrichment_jobs
  set status = 'processing',
      locked_at = now(),
      updated_at = now()
  where id = v_id;

  return query select * from public.meta_ad_enrichment_jobs where id = v_id;
end;
$$;

revoke all on function public.claim_meta_ad_enrichment_job() from public, anon, authenticated;
grant execute on function public.claim_meta_ad_enrichment_job() to service_role;

-- Upgrade the existing attribution trigger so every ad-origin message also
-- maintains the automatic registry and queues enrichment exactly once per ad.
create or replace function public.capture_message_ad_attribution()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attr jsonb;
  v_snapshot jsonb;
  v_fingerprint text;
  v_first boolean;
  v_id uuid;
  v_registry_id uuid;
  v_source_type text;
  v_ad_id text;
begin
  if new.direction <> 'inbound' or new.conversation_id is null then
    return new;
  end if;

  v_attr := coalesce(new.metadata, '{}'::jsonb) -> 'ad_attribution';
  if v_attr is null or jsonb_typeof(v_attr) <> 'object' or v_attr = '{}'::jsonb then
    return new;
  end if;

  v_source_type := lower(coalesce(nullif(btrim(v_attr->>'source_type'), ''), 'ad'));
  v_ad_id := nullif(btrim(v_attr->>'ad_id'), '');
  if v_ad_id is null and v_source_type = 'ad' then
    v_ad_id := nullif(btrim(v_attr->>'source_id'), '');
  end if;

  -- Serialize first-touch assignment per conversation so concurrent webhook
  -- deliveries cannot create two first-touch rows.
  perform pg_advisory_xact_lock(hashtextextended(new.conversation_id::text, 0));

  v_fingerprint := coalesce(
    nullif(btrim(v_attr->>'ctwa_clid'), ''),
    v_ad_id,
    nullif(btrim(v_attr->>'source_id'), ''),
    md5(v_attr::text)
  );

  select not exists (
    select 1
    from public.conversation_attributions ca
    where ca.workspace_id = new.workspace_id
      and ca.conversation_id = new.conversation_id
  ) into v_first;

  insert into public.conversation_attributions(
    workspace_id,
    conversation_id,
    source_message_id,
    connection_id,
    provider,
    origin,
    platform,
    source_type,
    campaign_id,
    campaign_name,
    adset_id,
    adset_name,
    ad_id,
    ad_name,
    source_id,
    source_url,
    headline,
    body,
    media_type,
    media_url,
    ctwa_clid,
    fingerprint,
    is_first_touch,
    raw,
    captured_at
  ) values (
    new.workspace_id,
    new.conversation_id,
    new.id,
    new.connection_id,
    new.provider,
    coalesce(nullif(v_attr->>'origin', ''), 'paid_ad'),
    nullif(v_attr->>'platform', ''),
    coalesce(nullif(v_attr->>'source_type', ''), 'ad'),
    nullif(v_attr->>'campaign_id', ''),
    nullif(v_attr->>'campaign_name', ''),
    nullif(v_attr->>'adset_id', ''),
    nullif(v_attr->>'adset_name', ''),
    v_ad_id,
    nullif(v_attr->>'ad_name', ''),
    nullif(v_attr->>'source_id', ''),
    nullif(v_attr->>'source_url', ''),
    nullif(v_attr->>'headline', ''),
    nullif(v_attr->>'body', ''),
    nullif(v_attr->>'media_type', ''),
    nullif(v_attr->>'media_url', ''),
    nullif(v_attr->>'ctwa_clid', ''),
    v_fingerprint,
    v_first,
    v_attr,
    coalesce(new.sent_at, now())
  )
  on conflict (workspace_id, conversation_id, fingerprint) do update
    set source_message_id = coalesce(public.conversation_attributions.source_message_id, excluded.source_message_id),
        connection_id = coalesce(public.conversation_attributions.connection_id, excluded.connection_id),
        ad_id = coalesce(public.conversation_attributions.ad_id, excluded.ad_id),
        raw = excluded.raw,
        captured_at = least(public.conversation_attributions.captured_at, excluded.captured_at)
  returning id into v_id;

  v_snapshot := v_attr || jsonb_build_object(
    'attribution_id', v_id,
    'captured_at', coalesce(new.sent_at, now()),
    'provider', new.provider
  );
  if v_ad_id is not null then
    v_snapshot := v_snapshot || jsonb_build_object('ad_id', v_ad_id);
  end if;

  update public.lead_conversations
  set metadata = case
        when coalesce(metadata, '{}'::jsonb) ? 'ad_attribution' then
          jsonb_set(coalesce(metadata, '{}'::jsonb), '{latest_ad_attribution}', v_snapshot, true)
        else
          jsonb_set(
            jsonb_set(coalesce(metadata, '{}'::jsonb), '{ad_attribution}', v_snapshot, true),
            '{latest_ad_attribution}',
            v_snapshot,
            true
          )
      end,
      updated_at = now()
  where id = new.conversation_id
    and workspace_id = new.workspace_id;

  if v_source_type = 'ad' and v_ad_id is not null then
    insert into public.meta_ad_registry(
      workspace_id,
      connection_id,
      provider,
      platform,
      ad_id,
      source_id,
      source_url,
      campaign_id,
      campaign_name,
      adset_id,
      adset_name,
      ad_name,
      headline,
      body,
      media_type,
      media_url,
      first_seen_at,
      last_seen_at,
      webhook_payload,
      updated_at
    ) values (
      new.workspace_id,
      new.connection_id,
      new.provider,
      nullif(v_attr->>'platform', ''),
      v_ad_id,
      nullif(v_attr->>'source_id', ''),
      nullif(v_attr->>'source_url', ''),
      nullif(v_attr->>'campaign_id', ''),
      nullif(v_attr->>'campaign_name', ''),
      nullif(v_attr->>'adset_id', ''),
      nullif(v_attr->>'adset_name', ''),
      nullif(v_attr->>'ad_name', ''),
      nullif(v_attr->>'headline', ''),
      nullif(v_attr->>'body', ''),
      nullif(v_attr->>'media_type', ''),
      nullif(v_attr->>'media_url', ''),
      coalesce(new.sent_at, now()),
      coalesce(new.sent_at, now()),
      v_attr,
      now()
    )
    on conflict (workspace_id, ad_id) do update
      set connection_id = coalesce(excluded.connection_id, public.meta_ad_registry.connection_id),
          provider = excluded.provider,
          platform = coalesce(excluded.platform, public.meta_ad_registry.platform),
          source_id = coalesce(excluded.source_id, public.meta_ad_registry.source_id),
          source_url = coalesce(excluded.source_url, public.meta_ad_registry.source_url),
          campaign_id = coalesce(excluded.campaign_id, public.meta_ad_registry.campaign_id),
          campaign_name = coalesce(excluded.campaign_name, public.meta_ad_registry.campaign_name),
          adset_id = coalesce(excluded.adset_id, public.meta_ad_registry.adset_id),
          adset_name = coalesce(excluded.adset_name, public.meta_ad_registry.adset_name),
          ad_name = coalesce(excluded.ad_name, public.meta_ad_registry.ad_name),
          headline = coalesce(excluded.headline, public.meta_ad_registry.headline),
          body = coalesce(excluded.body, public.meta_ad_registry.body),
          media_type = coalesce(excluded.media_type, public.meta_ad_registry.media_type),
          media_url = coalesce(excluded.media_url, public.meta_ad_registry.media_url),
          last_seen_at = greatest(public.meta_ad_registry.last_seen_at, excluded.last_seen_at),
          webhook_payload = case when excluded.webhook_payload <> '{}'::jsonb then excluded.webhook_payload else public.meta_ad_registry.webhook_payload end,
          updated_at = now()
    returning id into v_registry_id;

    insert into public.meta_ad_enrichment_jobs(workspace_id, registry_id)
    values (new.workspace_id, v_registry_id)
    on conflict (registry_id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.capture_message_ad_attribution() from public,anon,authenticated;

-- Normalize older Click-to-WhatsApp rows where source_id is the actual ad ID.
update public.conversation_attributions
set ad_id = source_id
where lower(coalesce(source_type, '')) = 'ad'
  and ad_id is null
  and source_id is not null;

-- Backfill ads already captured before this migration.
insert into public.meta_ad_registry(
  workspace_id,
  connection_id,
  provider,
  platform,
  ad_id,
  source_id,
  source_url,
  campaign_id,
  campaign_name,
  adset_id,
  adset_name,
  ad_name,
  headline,
  body,
  media_type,
  media_url,
  first_seen_at,
  last_seen_at,
  webhook_payload,
  updated_at
)
select distinct on (ca.workspace_id, ca.ad_id)
  ca.workspace_id,
  ca.connection_id,
  ca.provider,
  ca.platform,
  ca.ad_id,
  ca.source_id,
  ca.source_url,
  ca.campaign_id,
  ca.campaign_name,
  ca.adset_id,
  ca.adset_name,
  ca.ad_name,
  ca.headline,
  ca.body,
  ca.media_type,
  ca.media_url,
  ca.captured_at,
  ca.captured_at,
  ca.raw,
  now()
from public.conversation_attributions ca
where lower(coalesce(ca.source_type, '')) = 'ad'
  and ca.ad_id is not null
order by ca.workspace_id, ca.ad_id, ca.captured_at desc
on conflict (workspace_id, ad_id) do update
  set connection_id = coalesce(excluded.connection_id, public.meta_ad_registry.connection_id),
      source_id = coalesce(excluded.source_id, public.meta_ad_registry.source_id),
      source_url = coalesce(excluded.source_url, public.meta_ad_registry.source_url),
      headline = coalesce(excluded.headline, public.meta_ad_registry.headline),
      body = coalesce(excluded.body, public.meta_ad_registry.body),
      media_type = coalesce(excluded.media_type, public.meta_ad_registry.media_type),
      media_url = coalesce(excluded.media_url, public.meta_ad_registry.media_url),
      last_seen_at = greatest(public.meta_ad_registry.last_seen_at, excluded.last_seen_at),
      webhook_payload = excluded.webhook_payload,
      updated_at = now();

insert into public.meta_ad_enrichment_jobs(workspace_id, registry_id)
select r.workspace_id, r.id
from public.meta_ad_registry r
on conflict (registry_id) do nothing;

alter table public.meta_ad_registry enable row level security;
alter table public.meta_ad_enrichment_jobs enable row level security;

drop policy if exists meta_ad_registry_select on public.meta_ad_registry;
create policy meta_ad_registry_select on public.meta_ad_registry
for select to authenticated
using (workspace_id = public.current_workspace_id() and public.is_management());

revoke all on public.meta_ad_registry from public,anon;
revoke insert,update,delete on public.meta_ad_registry from authenticated;
grant select on public.meta_ad_registry to authenticated;
grant all on public.meta_ad_registry to service_role;

revoke all on public.meta_ad_enrichment_jobs from public,anon,authenticated;
grant all on public.meta_ad_enrichment_jobs to service_role;

commit;