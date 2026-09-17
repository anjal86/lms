-- Workspace-scoped knowledge retrieval for AI agents.
-- This first production layer uses PostgreSQL full-text ranking so it works in
-- every supported deployment without requiring an external vector service.
-- The schema keeps chunks separate so semantic embeddings can be added later
-- without changing the source/agent permission model.

begin;

create table if not exists public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  source_type text not null default 'manual'
    check (source_type in ('manual','faq','service','pricing','policy','website','document')),
  source_url text,
  is_active boolean not null default true,
  content_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, name)
);

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_id uuid not null references public.knowledge_sources(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null,
  search_vector tsvector generated always as (to_tsvector('simple', coalesce(content, ''))) stored,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_id, chunk_index)
);

create table if not exists public.ai_agent_knowledge_sources (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id uuid not null references public.ai_agents(id) on delete cascade,
  source_id uuid not null references public.knowledge_sources(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(agent_id, source_id)
);

create index if not exists knowledge_sources_workspace_idx
  on public.knowledge_sources(workspace_id, is_active, updated_at desc);
create index if not exists knowledge_chunks_source_idx
  on public.knowledge_chunks(workspace_id, source_id, chunk_index);
create index if not exists knowledge_chunks_search_idx
  on public.knowledge_chunks using gin(search_vector);
create index if not exists ai_agent_knowledge_sources_workspace_idx
  on public.ai_agent_knowledge_sources(workspace_id, agent_id);

create or replace function public.validate_ai_agent_knowledge_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agent_workspace uuid;
  v_source_workspace uuid;
begin
  select workspace_id into v_agent_workspace from public.ai_agents where id = new.agent_id;
  select workspace_id into v_source_workspace from public.knowledge_sources where id = new.source_id;
  if v_agent_workspace is null or v_source_workspace is null
     or v_agent_workspace is distinct from new.workspace_id
     or v_source_workspace is distinct from new.workspace_id then
    raise exception 'AI knowledge mapping must stay inside one workspace' using errcode='23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_ai_agent_knowledge_source on public.ai_agent_knowledge_sources;
create trigger trg_validate_ai_agent_knowledge_source
before insert or update on public.ai_agent_knowledge_sources
for each row execute function public.validate_ai_agent_knowledge_source();

create or replace function public.search_ai_agent_knowledge(
  p_workspace_id uuid,
  p_agent_id uuid,
  p_query text,
  p_limit integer default 6
)
returns table(
  chunk_id uuid,
  source_id uuid,
  source_name text,
  source_type text,
  source_url text,
  content text,
  score real
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_query tsquery;
  v_has_mappings boolean;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if not exists (
    select 1 from public.ai_agents a
    where a.id = p_agent_id and a.workspace_id = p_workspace_id
  ) then
    return;
  end if;

  select exists(
    select 1 from public.ai_agent_knowledge_sources aks
    where aks.workspace_id = p_workspace_id and aks.agent_id = p_agent_id
  ) into v_has_mappings;

  v_query := plainto_tsquery('simple', left(coalesce(p_query, ''), 1000));

  return query
  select
    c.id,
    s.id,
    s.name,
    s.source_type,
    s.source_url,
    c.content,
    (
      case when v_query <> ''::tsquery then ts_rank_cd(c.search_vector, v_query) else 0 end
      + case
          when length(btrim(coalesce(p_query,''))) >= 3
           and lower(c.content) like '%' || lower(left(btrim(p_query), 240)) || '%'
          then 0.35 else 0 end
    )::real as score
  from public.knowledge_chunks c
  join public.knowledge_sources s
    on s.id = c.source_id and s.workspace_id = c.workspace_id
  where c.workspace_id = p_workspace_id
    and s.is_active = true
    and (
      not v_has_mappings
      or exists (
        select 1 from public.ai_agent_knowledge_sources aks
        where aks.workspace_id = p_workspace_id
          and aks.agent_id = p_agent_id
          and aks.source_id = s.id
      )
    )
    and (
      (v_query <> ''::tsquery and c.search_vector @@ v_query)
      or (
        length(btrim(coalesce(p_query,''))) >= 3
        and lower(c.content) like '%' || lower(left(btrim(p_query), 240)) || '%'
      )
    )
  order by score desc, s.updated_at desc, c.chunk_index asc
  limit greatest(1, least(coalesce(p_limit, 6), 12));
end;
$$;

revoke all on function public.search_ai_agent_knowledge(uuid,uuid,text,integer) from public, anon, authenticated;
grant execute on function public.search_ai_agent_knowledge(uuid,uuid,text,integer) to service_role;

alter table public.knowledge_sources enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.ai_agent_knowledge_sources enable row level security;

drop policy if exists knowledge_sources_manage on public.knowledge_sources;
create policy knowledge_sources_manage on public.knowledge_sources
for all to authenticated
using (workspace_id = public.current_workspace_id() and public.is_management())
with check (workspace_id = public.current_workspace_id() and public.is_management());

drop policy if exists knowledge_chunks_manage on public.knowledge_chunks;
create policy knowledge_chunks_manage on public.knowledge_chunks
for all to authenticated
using (workspace_id = public.current_workspace_id() and public.is_management())
with check (workspace_id = public.current_workspace_id() and public.is_management());

drop policy if exists ai_agent_knowledge_sources_manage on public.ai_agent_knowledge_sources;
create policy ai_agent_knowledge_sources_manage on public.ai_agent_knowledge_sources
for all to authenticated
using (workspace_id = public.current_workspace_id() and public.is_management())
with check (workspace_id = public.current_workspace_id() and public.is_management());

grant select, insert, update, delete on public.knowledge_sources to authenticated, service_role;
grant select, insert, update, delete on public.knowledge_chunks to authenticated, service_role;
grant select, insert, update, delete on public.ai_agent_knowledge_sources to authenticated, service_role;

commit;
