-- Preserve paid-ad origin for chat conversations and provide workspace-managed
-- knowledge that AI agents can use to interpret vague ad replies safely.

begin;

create table if not exists public.conversation_attributions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references public.lead_conversations(id) on delete cascade,
  source_message_id uuid references public.lead_messages(id) on delete set null,
  connection_id uuid references public.integration_connections(id) on delete set null,
  provider text not null,
  origin text not null default 'paid_ad',
  platform text,
  source_type text not null default 'ad',
  campaign_id text,
  campaign_name text,
  adset_id text,
  adset_name text,
  ad_id text,
  ad_name text,
  source_id text,
  source_url text,
  headline text,
  body text,
  media_type text,
  media_url text,
  ctwa_clid text,
  fingerprint text not null,
  is_first_touch boolean not null default false,
  raw jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(workspace_id, conversation_id, fingerprint)
);

create unique index if not exists conversation_attributions_first_touch_uidx
  on public.conversation_attributions(workspace_id, conversation_id)
  where is_first_touch = true;

create index if not exists conversation_attributions_conversation_idx
  on public.conversation_attributions(workspace_id, conversation_id, captured_at asc);

create index if not exists conversation_attributions_ad_idx
  on public.conversation_attributions(workspace_id, ad_id)
  where ad_id is not null;

create index if not exists conversation_attributions_ctwa_idx
  on public.conversation_attributions(workspace_id, ctwa_clid)
  where ctwa_clid is not null;

create table if not exists public.ad_knowledge (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  provider text,
  platform text,
  campaign_id text,
  ad_id text,
  source_id text,
  title text,
  offer_summary text,
  knowledge_text text not null default '',
  valid_from timestamptz,
  valid_to timestamptz,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    nullif(btrim(coalesce(ad_id, '')), '') is not null
    or nullif(btrim(coalesce(source_id, '')), '') is not null
    or nullif(btrim(coalesce(campaign_id, '')), '') is not null
  ),
  check (valid_to is null or valid_from is null or valid_to > valid_from)
);

create index if not exists ad_knowledge_workspace_active_idx
  on public.ad_knowledge(workspace_id, is_active, updated_at desc);
create index if not exists ad_knowledge_ad_idx
  on public.ad_knowledge(workspace_id, ad_id)
  where ad_id is not null;
create index if not exists ad_knowledge_source_idx
  on public.ad_knowledge(workspace_id, source_id)
  where source_id is not null;
create index if not exists ad_knowledge_campaign_idx
  on public.ad_knowledge(workspace_id, campaign_id)
  where campaign_id is not null;

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
begin
  if new.direction <> 'inbound' or new.conversation_id is null then
    return new;
  end if;

  v_attr := coalesce(new.metadata, '{}'::jsonb) -> 'ad_attribution';
  if v_attr is null or jsonb_typeof(v_attr) <> 'object' or v_attr = '{}'::jsonb then
    return new;
  end if;

  -- Serialize first-touch assignment per conversation so concurrent webhook
  -- deliveries cannot create two first-touch rows.
  perform pg_advisory_xact_lock(hashtextextended(new.conversation_id::text, 0));

  v_fingerprint := coalesce(
    nullif(btrim(v_attr->>'ctwa_clid'), ''),
    nullif(btrim(v_attr->>'ad_id'), ''),
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
    nullif(v_attr->>'ad_id', ''),
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
        raw = excluded.raw,
        captured_at = least(public.conversation_attributions.captured_at, excluded.captured_at)
  returning id into v_id;

  v_snapshot := v_attr || jsonb_build_object(
    'attribution_id', v_id,
    'captured_at', coalesce(new.sent_at, now()),
    'provider', new.provider
  );

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

  return new;
end;
$$;

drop trigger if exists trg_capture_message_ad_attribution on public.lead_messages;
create trigger trg_capture_message_ad_attribution
after insert or update of metadata on public.lead_messages
for each row execute function public.capture_message_ad_attribution();

alter table public.conversation_attributions enable row level security;
alter table public.ad_knowledge enable row level security;

drop policy if exists conversation_attributions_select on public.conversation_attributions;
create policy conversation_attributions_select on public.conversation_attributions
for select to authenticated
using (
  workspace_id = public.current_workspace_id()
  and public.can_access_conversation(conversation_id)
);

drop policy if exists ad_knowledge_select on public.ad_knowledge;
create policy ad_knowledge_select on public.ad_knowledge
for select to authenticated
using (workspace_id = public.current_workspace_id());

drop policy if exists ad_knowledge_manage on public.ad_knowledge;
create policy ad_knowledge_manage on public.ad_knowledge
for all to authenticated
using (workspace_id = public.current_workspace_id() and public.is_management())
with check (workspace_id = public.current_workspace_id() and public.is_management());

grant select on public.conversation_attributions to authenticated;
grant all on public.conversation_attributions to service_role;
grant select,insert,update,delete on public.ad_knowledge to authenticated,service_role;

revoke all on function public.capture_message_ad_attribution() from public,anon,authenticated;

commit;