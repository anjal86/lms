-- Bind each AI agent to a workspace-scoped provider connection while preserving
-- the previous server-level Mistral fallback when provider_config_id is null.

begin;

drop function if exists public.save_workspace_ai_agent(uuid,text,text,text,text,text,text[],text,boolean,numeric,numeric,integer,integer,text,text[],boolean,uuid[]);

create or replace function public.save_workspace_ai_agent(
  p_agent_id uuid,
  p_name text,
  p_description text,
  p_model text,
  p_provider_config_id uuid,
  p_instructions text,
  p_tone text,
  p_languages text[],
  p_mode text,
  p_is_active boolean,
  p_temperature numeric,
  p_confidence_threshold numeric,
  p_response_delay_min_seconds integer,
  p_response_delay_max_seconds integer,
  p_handoff_team_key text,
  p_handoff_keywords text[],
  p_allow_when_human_assigned boolean,
  p_connection_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid := public.current_workspace_id();
  v_agent_id uuid := p_agent_id;
  v_connection_id uuid;
  v_provider text := 'mistral';
begin
  if v_workspace_id is null or not public.is_management() then
    raise exception 'Manager access required' using errcode='42501';
  end if;

  if nullif(btrim(p_name), '') is null then
    raise exception 'Agent name is required' using errcode='22023';
  end if;
  if p_mode not in ('off','assist','auto','auto_handoff') then
    raise exception 'Invalid AI agent mode' using errcode='22023';
  end if;
  if p_response_delay_min_seconds < 0 or p_response_delay_max_seconds < p_response_delay_min_seconds then
    raise exception 'Invalid AI response delay range' using errcode='22023';
  end if;
  if nullif(btrim(coalesce(p_handoff_team_key,'')), '') is not null and not exists (
    select 1 from public.conversation_teams t
    where t.workspace_id = v_workspace_id
      and t.team_key = btrim(p_handoff_team_key)
      and t.is_active = true
  ) then
    raise exception 'Handoff team does not exist or is not active' using errcode='22023';
  end if;

  if p_provider_config_id is not null then
    select c.provider into v_provider
    from public.ai_provider_configs c
    where c.id=p_provider_config_id
      and c.workspace_id=v_workspace_id
      and c.is_active=true;
    if v_provider is null then
      raise exception 'AI provider connection is not active in this workspace' using errcode='22023';
    end if;
  end if;

  foreach v_connection_id in array coalesce(p_connection_ids, '{}'::uuid[]) loop
    if not exists (
      select 1 from public.integration_connections c
      where c.id = v_connection_id
        and c.workspace_id = v_workspace_id
        and c.status in ('connected','pending','needs_attention','token_expiring')
        and c.provider in ('whatsapp','facebook','instagram')
    ) then
      raise exception 'AI agent channel connection is invalid for this workspace' using errcode='22023';
    end if;
  end loop;

  if v_agent_id is null then
    insert into public.ai_agents(
      workspace_id,name,description,provider,provider_config_id,model,instructions,tone,languages,mode,is_active,
      temperature,confidence_threshold,response_delay_min_seconds,response_delay_max_seconds,
      handoff_team_key,handoff_keywords,allow_when_human_assigned,created_by
    ) values (
      v_workspace_id,btrim(p_name),nullif(btrim(coalesce(p_description,'')),''),v_provider,p_provider_config_id,
      coalesce(nullif(btrim(p_model),''),'mistral-medium-latest'),coalesce(p_instructions,''),
      coalesce(nullif(btrim(p_tone),''),'professional and friendly'),coalesce(p_languages,array['auto']::text[]),
      p_mode,p_is_active,coalesce(p_temperature,0.30),coalesce(p_confidence_threshold,0.650),
      p_response_delay_min_seconds,p_response_delay_max_seconds,
      nullif(btrim(coalesce(p_handoff_team_key,'')),''),coalesce(p_handoff_keywords,'{}'::text[]),
      p_allow_when_human_assigned,auth.uid()
    ) returning id into v_agent_id;
  else
    if not exists (select 1 from public.ai_agents where id=v_agent_id and workspace_id=v_workspace_id) then
      raise exception 'AI agent not found in this workspace' using errcode='P0002';
    end if;

    update public.ai_agents
    set name=btrim(p_name),
        description=nullif(btrim(coalesce(p_description,'')),''),
        provider=v_provider,
        provider_config_id=p_provider_config_id,
        model=coalesce(nullif(btrim(p_model),''),'mistral-medium-latest'),
        instructions=coalesce(p_instructions,''),
        tone=coalesce(nullif(btrim(p_tone),''),'professional and friendly'),
        languages=coalesce(p_languages,array['auto']::text[]),
        mode=p_mode,
        is_active=p_is_active,
        temperature=coalesce(p_temperature,0.30),
        confidence_threshold=coalesce(p_confidence_threshold,0.650),
        response_delay_min_seconds=p_response_delay_min_seconds,
        response_delay_max_seconds=p_response_delay_max_seconds,
        handoff_team_key=nullif(btrim(coalesce(p_handoff_team_key,'')),''),
        handoff_keywords=coalesce(p_handoff_keywords,'{}'::text[]),
        allow_when_human_assigned=p_allow_when_human_assigned,
        updated_at=now()
    where id=v_agent_id and workspace_id=v_workspace_id;
  end if;

  delete from public.ai_agent_connections
  where agent_id=v_agent_id and workspace_id=v_workspace_id;

  foreach v_connection_id in array coalesce(p_connection_ids, '{}'::uuid[]) loop
    insert into public.ai_agent_connections(agent_id,workspace_id,connection_id,is_enabled)
    values(v_agent_id,v_workspace_id,v_connection_id,true);
  end loop;

  return v_agent_id;
end;
$$;

revoke all on function public.save_workspace_ai_agent(uuid,text,text,text,uuid,text,text,text[],text,boolean,numeric,numeric,integer,integer,text,text[],boolean,uuid[]) from public,anon;
grant execute on function public.save_workspace_ai_agent(uuid,text,text,text,uuid,text,text,text[],text,boolean,numeric,numeric,integer,integer,text,text[],boolean,uuid[]) to authenticated,service_role;

commit;
