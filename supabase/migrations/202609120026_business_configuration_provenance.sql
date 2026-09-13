-- 202609120026_business_configuration_provenance.sql
-- Distinguish template-managed configuration from owner-created configuration so
-- changing an industry pack never deletes custom fields or pipelines.

begin;

alter table public.field_definitions
  add column if not exists definition_source text not null default 'custom'
    check (definition_source in ('template','custom'));

alter table public.pipelines
  add column if not exists definition_source text not null default 'custom'
    check (definition_source in ('template','custom'));

-- No custom-field editor existed before this migration, so rows already present
-- were created by apply_business_template and can safely be marked as template-owned.
update public.field_definitions
set definition_source = 'template'
where definition_source = 'custom';

update public.pipelines
set definition_source = 'template'
where definition_source = 'custom';

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

  -- Replace only fields owned by the selected template. Custom definitions survive.
  delete from public.field_definitions
  where workspace_id = p_workspace_id
    and entity_type = 'lead'
    and definition_source = 'template';

  for v_field in select value from jsonb_array_elements(v_template.fields)
  loop
    insert into public.field_definitions(
      workspace_id, entity_type, field_key, label, field_type, section_key,
      options, is_required, is_searchable, is_filterable, is_system, sort_order,
      definition_source
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
      coalesce((v_field->>'order')::integer,100),
      'template'
    )
    on conflict (workspace_id, entity_type, field_key)
    do update set
      label = excluded.label,
      field_type = excluded.field_type,
      section_key = excluded.section_key,
      options = excluded.options,
      is_required = excluded.is_required,
      is_searchable = excluded.is_searchable,
      is_filterable = excluded.is_filterable,
      is_system = excluded.is_system,
      sort_order = excluded.sort_order,
      definition_source = 'template',
      is_active = true,
      updated_at = now();
  end loop;

  -- A template switch changes the workspace default but does not remove custom pipelines.
  update public.pipelines
  set is_default = false, updated_at = now()
  where workspace_id = p_workspace_id and entity_type = 'lead';

  delete from public.pipelines
  where workspace_id = p_workspace_id
    and entity_type = 'lead'
    and definition_source = 'template';

  insert into public.pipelines(
    workspace_id,entity_type,pipeline_key,name,is_default,definition_source
  ) values (
    p_workspace_id,
    'lead',
    coalesce(v_template.pipeline->>'key','default'),
    coalesce(v_template.pipeline->>'name','Sales Pipeline'),
    true,
    'template'
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

create index if not exists field_definitions_source_idx
  on public.field_definitions(workspace_id,entity_type,definition_source,is_active,sort_order);

create index if not exists pipelines_source_idx
  on public.pipelines(workspace_id,entity_type,definition_source,is_active);

commit;
