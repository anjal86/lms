-- 202609120028_configurable_pipeline_editor.sql
-- Transactional manager-facing pipeline customization. Existing stage IDs are
-- preserved when their keys remain unchanged so open CRM records do not lose position.

begin;

create or replace function public.save_workspace_pipeline(
  p_pipeline_id uuid,
  p_name text,
  p_stages jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pipeline public.pipelines%rowtype;
  v_stage jsonb;
  v_stage_key text;
  v_first_stage_id uuid;
  v_desired_keys text[] := '{}';
begin
  if not public.current_user_active() or not public.is_management() then
    raise exception 'Not authorized to configure pipeline' using errcode = '42501';
  end if;

  select * into v_pipeline
  from public.pipelines
  where id = p_pipeline_id
    and workspace_id = public.current_workspace_id()
    and entity_type = 'lead'
    and is_active = true
  for update;

  if not found then
    raise exception 'Pipeline not found' using errcode = 'P0002';
  end if;

  if nullif(btrim(p_name), '') is null then
    raise exception 'Pipeline name is required' using errcode = '22023';
  end if;

  if jsonb_typeof(p_stages) <> 'array' or jsonb_array_length(p_stages) < 2 then
    raise exception 'Pipeline requires at least two stages' using errcode = '22023';
  end if;

  -- Validate stage keys are unique and safe before mutating anything.
  for v_stage in select value from jsonb_array_elements(p_stages)
  loop
    v_stage_key := nullif(btrim(v_stage->>'key'), '');
    if v_stage_key is null or v_stage_key !~ '^[a-z][a-z0-9_]{0,63}$' then
      raise exception 'Invalid pipeline stage key' using errcode = '22023';
    end if;
    if v_stage_key = any(v_desired_keys) then
      raise exception 'Duplicate pipeline stage key: %', v_stage_key using errcode = '22023';
    end if;
    if coalesce(v_stage->>'type','open') not in ('open','won','lost') then
      raise exception 'Invalid stage type for %', v_stage_key using errcode = '22023';
    end if;
    if coalesce((v_stage->>'probability')::integer,0) not between 0 and 100 then
      raise exception 'Invalid probability for %', v_stage_key using errcode = '22023';
    end if;
    v_desired_keys := array_append(v_desired_keys, v_stage_key);
  end loop;

  update public.pipelines
  set name = btrim(p_name),
      definition_source = 'custom',
      updated_at = now()
  where id = p_pipeline_id;

  for v_stage in select value from jsonb_array_elements(p_stages)
  loop
    v_stage_key := btrim(v_stage->>'key');
    insert into public.pipeline_stages(
      pipeline_id, stage_key, name, stage_type, probability, sort_order, color_token
    ) values (
      p_pipeline_id,
      v_stage_key,
      coalesce(nullif(btrim(v_stage->>'name'), ''), initcap(replace(v_stage_key,'_',' '))),
      coalesce(v_stage->>'type','open'),
      coalesce((v_stage->>'probability')::integer,0),
      coalesce((v_stage->>'order')::integer,100),
      coalesce(nullif(btrim(v_stage->>'color'), ''),'zinc')
    )
    on conflict (pipeline_id, stage_key)
    do update set
      name = excluded.name,
      stage_type = excluded.stage_type,
      probability = excluded.probability,
      sort_order = excluded.sort_order,
      color_token = excluded.color_token,
      updated_at = now();
  end loop;

  select id into v_first_stage_id
  from public.pipeline_stages
  where pipeline_id = p_pipeline_id
    and stage_key = any(v_desired_keys)
  order by sort_order asc, created_at asc
  limit 1;

  -- Any record sitting in a removed stage is safely moved to the first remaining stage.
  update public.leads l
  set pipeline_stage_id = v_first_stage_id,
      updated_at = now()
  where l.workspace_id = v_pipeline.workspace_id
    and l.pipeline_id = p_pipeline_id
    and l.pipeline_stage_id in (
      select ps.id
      from public.pipeline_stages ps
      where ps.pipeline_id = p_pipeline_id
        and not (ps.stage_key = any(v_desired_keys))
    );

  delete from public.pipeline_stages
  where pipeline_id = p_pipeline_id
    and not (stage_key = any(v_desired_keys));
end;
$$;

revoke all on function public.save_workspace_pipeline(uuid,text,jsonb) from public, anon;
grant execute on function public.save_workspace_pipeline(uuid,text,jsonb) to authenticated;

commit;
