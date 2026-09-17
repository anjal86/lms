-- Workspace-level BYOK provider connections for AI agents.
-- Provider metadata is readable by managers, while encrypted API keys live in a
-- service-role-only table so browser clients can never select ciphertext/secrets.

begin;

create table if not exists public.ai_provider_configs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  provider text not null check (provider in (
    'openai','anthropic','google','mistral','openrouter','groq','deepseek','xai','together','fireworks','custom_openai'
  )),
  api_style text not null check (api_style in ('openai_chat','anthropic_messages','google_generate_content')),
  base_url text not null,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, name)
);

create table if not exists public.ai_provider_secrets (
  provider_config_id uuid primary key references public.ai_provider_configs(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  encrypted_api_key text,
  updated_at timestamptz not null default now()
);

create index if not exists ai_provider_configs_workspace_idx
  on public.ai_provider_configs(workspace_id, is_active, updated_at desc);

alter table public.ai_agents
  add column if not exists provider_config_id uuid references public.ai_provider_configs(id) on delete set null;

create index if not exists ai_agents_provider_config_idx
  on public.ai_agents(workspace_id, provider_config_id);

-- Existing agents remain valid as legacy server-level Mistral agents until a
-- workspace provider is selected.
alter table public.ai_agents drop constraint if exists ai_agents_provider_check;
alter table public.ai_agents
  add constraint ai_agents_provider_check
  check (provider in ('openai','anthropic','google','mistral','openrouter','groq','deepseek','xai','together','fireworks','custom_openai'));

create or replace function public.validate_ai_agent_provider_config()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_provider text;
begin
  if new.provider_config_id is null then
    return new;
  end if;

  select provider into v_provider
  from public.ai_provider_configs
  where id = new.provider_config_id
    and workspace_id = new.workspace_id
    and is_active = true;

  if v_provider is null then
    raise exception 'AI provider connection is not active in this workspace' using errcode='23514';
  end if;

  new.provider := v_provider;
  return new;
end;
$$;

drop trigger if exists trg_validate_ai_agent_provider_config on public.ai_agents;
create trigger trg_validate_ai_agent_provider_config
before insert or update of provider_config_id,workspace_id on public.ai_agents
for each row execute function public.validate_ai_agent_provider_config();

create or replace function public.save_workspace_ai_provider(
  p_provider_id uuid,
  p_name text,
  p_provider text,
  p_api_style text,
  p_base_url text,
  p_is_active boolean,
  p_encrypted_api_key text,
  p_clear_api_key boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid := public.current_workspace_id();
  v_provider_id uuid := p_provider_id;
begin
  if v_workspace_id is null or not public.is_management() then
    raise exception 'Manager access required' using errcode='42501';
  end if;
  if nullif(btrim(coalesce(p_name,'')), '') is null then
    raise exception 'Provider name is required' using errcode='22023';
  end if;
  if p_provider not in ('openai','anthropic','google','mistral','openrouter','groq','deepseek','xai','together','fireworks','custom_openai') then
    raise exception 'Unsupported AI provider' using errcode='22023';
  end if;
  if p_api_style not in ('openai_chat','anthropic_messages','google_generate_content') then
    raise exception 'Unsupported AI API style' using errcode='22023';
  end if;
  if nullif(btrim(coalesce(p_base_url,'')), '') is null then
    raise exception 'Provider base URL is required' using errcode='22023';
  end if;
  if p_encrypted_api_key is not null and p_encrypted_api_key not like 'enc:v2:%' then
    raise exception 'Provider API key must be encrypted by the server' using errcode='22023';
  end if;

  if v_provider_id is null then
    insert into public.ai_provider_configs(
      workspace_id,name,provider,api_style,base_url,is_active,created_by
    ) values (
      v_workspace_id,btrim(p_name),p_provider,p_api_style,btrim(p_base_url),coalesce(p_is_active,true),auth.uid()
    ) returning id into v_provider_id;
  else
    if not exists (
      select 1 from public.ai_provider_configs
      where id=v_provider_id and workspace_id=v_workspace_id
    ) then
      raise exception 'AI provider connection not found in this workspace' using errcode='P0002';
    end if;

    update public.ai_provider_configs
    set name=btrim(p_name),
        provider=p_provider,
        api_style=p_api_style,
        base_url=btrim(p_base_url),
        is_active=coalesce(p_is_active,true),
        updated_at=now()
    where id=v_provider_id and workspace_id=v_workspace_id;
  end if;

  if coalesce(p_clear_api_key,false) then
    delete from public.ai_provider_secrets
    where provider_config_id=v_provider_id and workspace_id=v_workspace_id;
  elsif p_encrypted_api_key is not null then
    insert into public.ai_provider_secrets(provider_config_id,workspace_id,encrypted_api_key,updated_at)
    values(v_provider_id,v_workspace_id,p_encrypted_api_key,now())
    on conflict (provider_config_id) do update
      set workspace_id=excluded.workspace_id,
          encrypted_api_key=excluded.encrypted_api_key,
          updated_at=now();
  end if;

  return v_provider_id;
end;
$$;

revoke all on function public.save_workspace_ai_provider(uuid,text,text,text,text,boolean,text,boolean) from public,anon;
grant execute on function public.save_workspace_ai_provider(uuid,text,text,text,text,boolean,text,boolean) to authenticated,service_role;

alter table public.ai_provider_configs enable row level security;
alter table public.ai_provider_secrets enable row level security;

drop policy if exists ai_provider_configs_select on public.ai_provider_configs;
create policy ai_provider_configs_select on public.ai_provider_configs
for select to authenticated
using (workspace_id=public.current_workspace_id() and public.is_management());

drop policy if exists ai_provider_configs_manage on public.ai_provider_configs;
create policy ai_provider_configs_manage on public.ai_provider_configs
for all to authenticated
using (workspace_id=public.current_workspace_id() and public.is_management())
with check (workspace_id=public.current_workspace_id() and public.is_management());

-- Provider secrets never leave server-side code. No authenticated grants/policies.
revoke all on public.ai_provider_secrets from public,anon,authenticated;
grant all on public.ai_provider_secrets to service_role;
grant select,insert,update,delete on public.ai_provider_configs to authenticated,service_role;

commit;
