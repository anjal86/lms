-- 202609120027_adaptive_inbox_conversion.sql
-- Convert omnichannel conversations into the active workspace schema instead of
-- requiring travel-specific fields. Legacy travel columns remain populated only
-- as compatibility values for mature travel modules and older queries.

begin;

create or replace function public.convert_conversation_to_business_lead(
  p_conversation_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_customer_city text,
  p_customer_country text,
  p_priority text,
  p_assigned_to uuid,
  p_notes text,
  p_custom_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation public.lead_conversations%rowtype;
  v_lead public.leads%rowtype;
  v_workspace_id uuid;
  v_pipeline_id uuid;
  v_stage_id uuid;
  v_stage_type text;
  v_assigned_to uuid;
  v_role text;
  v_now timestamptz := now();
  v_custom jsonb := coalesce(p_custom_data, '{}'::jsonb);
  v_destination text;
  v_travel_dates text;
  v_budget_range text;
  v_pax_adults integer;
  v_pax_children integer;
begin
  if not public.current_user_active() then
    raise exception 'Account is not active' using errcode = '42501';
  end if;

  if not public.can_access_conversation(p_conversation_id) then
    raise exception 'Conversation access denied' using errcode = '42501';
  end if;

  v_workspace_id := public.current_workspace_id();
  if v_workspace_id is null then
    raise exception 'Workspace is not configured' using errcode = '22023';
  end if;

  select * into v_conversation
  from public.lead_conversations
  where id = p_conversation_id
  for update;

  if not found then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;

  if v_conversation.lead_id is not null then
    select * into v_lead
    from public.leads
    where id = v_conversation.lead_id
      and workspace_id = v_workspace_id;

    if not found then
      raise exception 'Conversation is linked to a record outside this workspace' using errcode = '42501';
    end if;

    return jsonb_build_object(
      'lead', to_jsonb(v_lead),
      'conversation_id', v_conversation.id,
      'already_converted', true
    );
  end if;

  v_role := public.current_user_role();
  v_assigned_to := coalesce(p_assigned_to, case when v_role = 'agent' then auth.uid() else null end);

  if v_role = 'agent' and v_assigned_to is distinct from auth.uid() then
    raise exception 'Agents may only assign converted records to themselves' using errcode = '42501';
  end if;

  if v_assigned_to is not null and not exists (
    select 1
    from public.profiles
    where id = v_assigned_to
      and workspace_id = v_workspace_id
      and is_active = true
  ) then
    raise exception 'Assigned user is not active in this workspace' using errcode = '22023';
  end if;

  select p.id into v_pipeline_id
  from public.pipelines p
  where p.workspace_id = v_workspace_id
    and p.entity_type = 'lead'
    and p.is_active = true
  order by p.is_default desc, p.created_at asc
  limit 1;

  if v_pipeline_id is not null then
    select ps.id, ps.stage_type
    into v_stage_id, v_stage_type
    from public.pipeline_stages ps
    where ps.pipeline_id = v_pipeline_id
    order by ps.sort_order asc, ps.created_at asc
    limit 1;
  end if;

  -- Compatibility projections for old travel-oriented columns. They are not the
  -- canonical business schema for non-travel workspaces.
  v_destination := coalesce(
    nullif(v_custom->>'destination',''),
    nullif(v_custom->>'study_destination',''),
    nullif(v_custom->>'service_interest',''),
    nullif(v_custom->>'interest',''),
    'Not specified'
  );
  v_travel_dates := nullif(v_custom->>'travel_dates','');
  v_budget_range := coalesce(
    nullif(v_custom->>'budget_range',''),
    nullif(v_custom->>'project_budget',''),
    nullif(v_custom->>'budget','')
  );
  begin
    v_pax_adults := greatest(coalesce(nullif(v_custom->>'pax_adults','')::integer, 1), 0);
  exception when others then
    v_pax_adults := 1;
  end;
  begin
    v_pax_children := greatest(coalesce(nullif(v_custom->>'pax_children','')::integer, 0), 0);
  exception when others then
    v_pax_children := 0;
  end;

  insert into public.leads(
    workspace_id, customer_name, customer_phone, customer_email, customer_city, customer_country,
    destination, travel_dates, budget_range, pax_adults, pax_children, pax_infants,
    travel_type, special_notes, source, source_channel, source_connection_id,
    stage, priority, assigned_to, assigned_at, assigned_by, last_contacted_at,
    last_activity_type, custom_data, pipeline_id, pipeline_stage_id
  ) values (
    v_workspace_id,
    coalesce(nullif(btrim(p_customer_name), ''), nullif(btrim(v_conversation.customer_name), ''), 'Contact'),
    coalesce(nullif(btrim(p_customer_phone), ''), nullif(btrim(v_conversation.customer_phone), ''), v_conversation.provider || ':' || left(v_conversation.id::text, 8)),
    coalesce(nullif(btrim(p_customer_email), ''), nullif(btrim(v_conversation.customer_email), '')),
    nullif(btrim(p_customer_city), ''),
    nullif(btrim(p_customer_country), ''),
    v_destination,
    v_travel_dates,
    v_budget_range,
    v_pax_adults,
    v_pax_children,
    0,
    'custom',
    coalesce(nullif(btrim(p_notes), ''), 'Converted from omnichannel conversation.'),
    v_conversation.provider || ' chat',
    v_conversation.provider,
    v_conversation.connection_id,
    case when v_stage_type = 'won' then 'won' when v_stage_type = 'lost' then 'lost' else 'new' end,
    case when p_priority in ('low','normal','high','urgent') then p_priority else 'normal' end,
    v_assigned_to,
    case when v_assigned_to is not null then v_now else null end,
    auth.uid(),
    coalesce(v_conversation.last_message_at, v_now),
    case when v_conversation.provider = 'whatsapp' then 'whatsapp' else 'system' end,
    v_custom,
    v_pipeline_id,
    v_stage_id
  )
  returning * into v_lead;

  update public.lead_conversations
  set lead_id = v_lead.id,
      customer_name = v_lead.customer_name,
      customer_phone = v_lead.customer_phone,
      customer_email = v_lead.customer_email,
      assigned_to = v_assigned_to,
      converted_at = v_now,
      converted_by = auth.uid(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'converted_at', v_now,
        'converted_by', auth.uid(),
        'workspace_id', v_workspace_id
      )
  where id = v_conversation.id;

  update public.lead_messages
  set lead_id = v_lead.id
  where conversation_id = v_conversation.id;

  insert into public.activity_logs(lead_id, agent_id, activity_type, title, notes, metadata)
  values (
    v_lead.id,
    auth.uid(),
    'system',
    'Converted from ' || v_conversation.provider || ' chat',
    'Conversation history attached during CRM conversion.',
    jsonb_build_object(
      'conversation_id', v_conversation.id,
      'provider', v_conversation.provider,
      'external_contact_id', v_conversation.external_contact_id,
      'workspace_id', v_workspace_id
    )
  );

  if v_assigned_to is not null and v_assigned_to <> auth.uid() then
    insert into public.notifications(user_id, title, message, type, link)
    values (
      v_assigned_to,
      'New record assigned from chat',
      v_lead.customer_name || ' was converted from ' || v_conversation.provider || ' and assigned to you.',
      'lead_assigned',
      '/leads/' || v_lead.id || '/workspace'
    );
  end if;

  return jsonb_build_object(
    'lead', to_jsonb(v_lead),
    'conversation_id', v_conversation.id,
    'already_converted', false
  );
end;
$$;

revoke all on function public.convert_conversation_to_business_lead(uuid,text,text,text,text,text,text,uuid,text,jsonb) from public, anon;
grant execute on function public.convert_conversation_to_business_lead(uuid,text,text,text,text,text,text,uuid,text,jsonb) to authenticated;

-- Template changes now give every existing record a valid stage in the new default
-- pipeline even when the old legacy stage key has no equivalent in the new pack.
create or replace function public.repair_workspace_pipeline_assignments(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pipeline_id uuid;
  v_first_stage uuid;
begin
  if auth.uid() is not null then
    if not public.current_user_active()
       or not public.is_management()
       or public.current_workspace_id() is distinct from p_workspace_id then
      raise exception 'Not authorized to repair this workspace';
    end if;
  end if;

  select id into v_pipeline_id
  from public.pipelines
  where workspace_id = p_workspace_id and entity_type = 'lead' and is_active = true
  order by is_default desc, created_at asc
  limit 1;

  if v_pipeline_id is null then return; end if;

  select id into v_first_stage
  from public.pipeline_stages
  where pipeline_id = v_pipeline_id
  order by sort_order asc, created_at asc
  limit 1;

  update public.leads l
  set pipeline_id = v_pipeline_id,
      pipeline_stage_id = coalesce(
        (
          select ps.id
          from public.pipeline_stages ps
          where ps.pipeline_id = v_pipeline_id
            and ps.stage_key = l.stage
          limit 1
        ),
        v_first_stage
      )
  where l.workspace_id = p_workspace_id
    and (l.pipeline_id is distinct from v_pipeline_id or l.pipeline_stage_id is null);
end;
$$;

revoke all on function public.repair_workspace_pipeline_assignments(uuid) from public;
grant execute on function public.repair_workspace_pipeline_assignments(uuid) to authenticated;

commit;
