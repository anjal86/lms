-- Messenger and Instagram can identify a paid ad with ad_id while their
-- referral type is OPEN_THREAD rather than literally "ad". Maintain the
-- automatic registry from the verified ad ID itself across all Meta channels.

begin;

create or replace function public.capture_meta_ad_registry_from_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attr jsonb;
  v_source_type text;
  v_ad_id text;
  v_registry_id uuid;
begin
  if new.direction <> 'inbound' or new.workspace_id is null then
    return new;
  end if;

  v_attr := coalesce(new.metadata, '{}'::jsonb) -> 'ad_attribution';
  if v_attr is null or jsonb_typeof(v_attr) <> 'object' or v_attr = '{}'::jsonb then
    return new;
  end if;

  v_source_type := lower(coalesce(nullif(btrim(v_attr->>'source_type'), ''), ''));
  v_ad_id := nullif(btrim(v_attr->>'ad_id'), '');
  if v_ad_id is null and v_source_type = 'ad' then
    v_ad_id := nullif(btrim(v_attr->>'source_id'), '');
  end if;
  if v_ad_id is null then
    return new;
  end if;

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

  return new;
end;
$$;

revoke all on function public.capture_meta_ad_registry_from_message() from public,anon,authenticated;

drop trigger if exists trg_capture_meta_ad_registry on public.lead_messages;
create trigger trg_capture_meta_ad_registry
after insert or update of metadata on public.lead_messages
for each row execute function public.capture_meta_ad_registry_from_message();

-- Backfill Messenger/Instagram rows captured before this cross-channel fix.
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
where ca.ad_id is not null
order by ca.workspace_id, ca.ad_id, ca.captured_at desc
on conflict (workspace_id, ad_id) do update
  set connection_id = coalesce(excluded.connection_id, public.meta_ad_registry.connection_id),
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
      webhook_payload = excluded.webhook_payload,
      updated_at = now();

insert into public.meta_ad_enrichment_jobs(workspace_id, registry_id)
select r.workspace_id, r.id
from public.meta_ad_registry r
on conflict (registry_id) do nothing;

commit;
