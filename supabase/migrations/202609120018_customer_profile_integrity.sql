-- Make customer location persistence transactional and keep conversation/lead geography in sync.
begin;

-- Replace the conversion RPC so city/country are part of the same transaction that
-- creates the lead and attaches the conversation history.
drop function if exists public.convert_conversation_to_lead(uuid,text,text,text,text,text,text,integer,integer,text,uuid,text);

create or replace function public.convert_conversation_to_lead(
  p_conversation_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_customer_city text,
  p_customer_country text,
  p_destination text,
  p_travel_dates text,
  p_budget_range text,
  p_pax_adults integer,
  p_pax_children integer,
  p_priority text,
  p_assigned_to uuid,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation public.lead_conversations%rowtype;
  v_lead public.leads%rowtype;
  v_assigned_to uuid;
  v_role text;
  v_now timestamptz := now();
  v_customer_city text;
  v_customer_country text;
begin
  if not public.current_user_active() then
    raise exception 'Account is not active' using errcode = '42501';
  end if;

  if not public.can_access_conversation(p_conversation_id) then
    raise exception 'Conversation access denied' using errcode = '42501';
  end if;

  select * into v_conversation
  from public.lead_conversations
  where id = p_conversation_id
  for update;

  if not found then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;

  v_customer_city := coalesce(
    nullif(btrim(p_customer_city), ''),
    nullif(btrim(v_conversation.metadata #>> '{customer_profile,city}'), '')
  );
  v_customer_country := coalesce(
    nullif(btrim(p_customer_country), ''),
    nullif(btrim(v_conversation.metadata #>> '{customer_profile,country}'), '')
  );

  if v_conversation.lead_id is not null then
    update public.leads
    set customer_city = coalesce(v_customer_city, customer_city),
        customer_country = coalesce(v_customer_country, customer_country)
    where id = v_conversation.lead_id
    returning * into v_lead;

    if not found then
      raise exception 'Converted lead not found' using errcode = 'P0002';
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
    raise exception 'Agents may only assign converted leads to themselves' using errcode = '42501';
  end if;

  if v_assigned_to is not null and not exists (
    select 1 from public.profiles where id = v_assigned_to and is_active = true
  ) then
    raise exception 'Assigned user is not active' using errcode = '22023';
  end if;

  insert into public.leads(
    customer_name, customer_phone, customer_email, customer_city, customer_country,
    destination, travel_dates, budget_range,
    pax_adults, pax_children, pax_infants, travel_type, special_notes, source,
    source_channel, source_connection_id, stage, priority, assigned_to, assigned_at, assigned_by,
    last_contacted_at, last_activity_type
  ) values (
    coalesce(nullif(btrim(p_customer_name), ''), nullif(btrim(v_conversation.customer_name), ''), 'Traveler'),
    coalesce(nullif(btrim(p_customer_phone), ''), nullif(btrim(v_conversation.customer_phone), ''), v_conversation.provider || ':' || left(v_conversation.id::text, 8)),
    coalesce(nullif(btrim(p_customer_email), ''), nullif(btrim(v_conversation.customer_email), '')),
    v_customer_city,
    v_customer_country,
    coalesce(nullif(btrim(p_destination), ''), 'Not specified'),
    nullif(btrim(p_travel_dates), ''),
    nullif(btrim(p_budget_range), ''),
    greatest(coalesce(p_pax_adults, 2), 1),
    greatest(coalesce(p_pax_children, 0), 0),
    0,
    'custom',
    coalesce(nullif(btrim(p_notes), ''), 'Converted from omnichannel chat conversation.'),
    v_conversation.provider || ' chat',
    v_conversation.provider,
    v_conversation.connection_id,
    'new',
    case when p_priority in ('low','normal','high','urgent') then p_priority else 'normal' end,
    v_assigned_to,
    case when v_assigned_to is not null then v_now else null end,
    auth.uid(),
    coalesce(v_conversation.last_message_at, v_now),
    case when v_conversation.provider = 'whatsapp' then 'whatsapp' else 'system' end
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
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('converted_at', v_now, 'converted_by', auth.uid())
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
    'Conversation history attached during lead conversion.',
    jsonb_build_object(
      'conversation_id', v_conversation.id,
      'provider', v_conversation.provider,
      'external_contact_id', v_conversation.external_contact_id
    )
  );

  if v_assigned_to is not null and v_assigned_to <> auth.uid() then
    insert into public.notifications(user_id, title, message, type, link)
    values (
      v_assigned_to,
      'New lead assigned from chat',
      v_lead.customer_name || ' (' || v_lead.destination || ') was converted from ' || v_conversation.provider || ' and assigned to you.',
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

revoke all on function public.convert_conversation_to_lead(uuid,text,text,text,text,text,text,text,text,integer,integer,text,uuid,text) from public, anon;
grant execute on function public.convert_conversation_to_lead(uuid,text,text,text,text,text,text,text,text,integer,integer,text,uuid,text) to authenticated;

-- Update the conversation profile and linked lead in one transaction. This avoids the
-- split-write state where one record succeeds and the other silently fails.
create or replace function public.update_conversation_location(
  p_conversation_id uuid,
  p_customer_city text,
  p_customer_country text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation public.lead_conversations%rowtype;
  v_profile jsonb;
  v_metadata jsonb;
  v_old_country text;
  v_city text;
  v_country text;
begin
  if not public.current_user_active() then
    raise exception 'Account is not active' using errcode = '42501';
  end if;

  if not public.can_access_conversation(p_conversation_id) then
    raise exception 'Conversation access denied' using errcode = '42501';
  end if;

  select * into v_conversation
  from public.lead_conversations
  where id = p_conversation_id
  for update;

  if not found then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;

  v_city := nullif(btrim(p_customer_city), '');
  v_country := nullif(btrim(p_customer_country), '');
  v_metadata := coalesce(v_conversation.metadata, '{}'::jsonb);
  v_profile := coalesce(v_metadata->'customer_profile', '{}'::jsonb);
  v_old_country := nullif(btrim(v_profile->>'country'), '');

  v_profile := jsonb_set(v_profile, '{city}', coalesce(to_jsonb(v_city), 'null'::jsonb), true);
  v_profile := jsonb_set(v_profile, '{country}', coalesce(to_jsonb(v_country), 'null'::jsonb), true);
  v_profile := jsonb_set(v_profile, '{locationSource}', to_jsonb('manual'::text), true);
  v_profile := jsonb_set(v_profile, '{inferredFromText}', 'false'::jsonb, true);

  -- A manual country correction invalidates any country-derived code/flag. Keep locale
  -- and timezone data separate because those may still be valid provider attributes.
  if v_old_country is distinct from v_country then
    v_profile := v_profile - 'countryCode' - 'countryFlag';
  end if;

  v_metadata := jsonb_set(v_metadata, '{customer_profile}', v_profile, true);

  update public.lead_conversations
  set metadata = v_metadata
  where id = v_conversation.id
  returning * into v_conversation;

  if v_conversation.lead_id is not null then
    update public.leads
    set customer_city = v_city,
        customer_country = v_country
    where id = v_conversation.lead_id;

    if not found then
      raise exception 'Linked lead not found' using errcode = 'P0002';
    end if;
  end if;

  return jsonb_build_object(
    'conversation', to_jsonb(v_conversation),
    'lead_id', v_conversation.lead_id
  );
end;
$$;

revoke all on function public.update_conversation_location(uuid,text,text) from public, anon;
grant execute on function public.update_conversation_location(uuid,text,text) to authenticated;

commit;
