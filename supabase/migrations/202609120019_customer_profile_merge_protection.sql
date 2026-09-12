-- Preserve local/customer-verified conversation metadata when provider syncs refresh a thread.
begin;

create or replace function public.customer_profile_source_rank(p_profile jsonb)
returns integer
language sql
immutable
set search_path = public
as $$
  select case coalesce(p_profile->>'locationSource',
    case
      when coalesce((p_profile->>'inferredFromText')::boolean, false) then 'chat_heuristic'
      when jsonb_typeof(p_profile->'formFields') = 'array' and jsonb_array_length(p_profile->'formFields') > 0 then 'lead_form'
      when p_profile ? 'locale' or p_profile ? 'timezoneOffset' or p_profile ? 'timezoneLabel' then 'meta_profile'
      else null
    end)
    when 'manual' then 5
    when 'lead_form' then 4
    when 'existing_lead' then 3
    when 'meta_profile' then 2
    when 'chat_heuristic' then 1
    else 0
  end;
$$;

create or replace function public.merge_customer_profile_jsonb(p_existing jsonb, p_incoming jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_existing jsonb := coalesce(p_existing, '{}'::jsonb);
  v_incoming jsonb := coalesce(p_incoming, '{}'::jsonb);
  v_result jsonb;
  v_existing_rank integer;
  v_incoming_rank integer;
  v_key text;
  v_source text;
begin
  if v_existing = '{}'::jsonb then return v_incoming; end if;
  if v_incoming = '{}'::jsonb then return v_existing; end if;

  v_result := v_existing || v_incoming;
  v_existing_rank := public.customer_profile_source_rank(v_existing);
  v_incoming_rank := public.customer_profile_source_rank(v_incoming);

  if v_existing_rank > v_incoming_rank then
    foreach v_key in array array['city','state','country','countryCode','countryFlag','streetAddress','postalCode'] loop
      if v_existing ? v_key then
        v_result := jsonb_set(v_result, array[v_key], v_existing->v_key, true);
      else
        v_result := v_result - v_key;
      end if;
    end loop;

    v_source := coalesce(v_existing->>'locationSource',
      case
        when coalesce((v_existing->>'inferredFromText')::boolean, false) then 'chat_heuristic'
        when jsonb_typeof(v_existing->'formFields') = 'array' and jsonb_array_length(v_existing->'formFields') > 0 then 'lead_form'
        when v_existing ? 'locale' or v_existing ? 'timezoneOffset' or v_existing ? 'timezoneLabel' then 'meta_profile'
        else null
      end);

    if v_source is not null then
      v_result := jsonb_set(v_result, '{locationSource}', to_jsonb(v_source), true);
      v_result := jsonb_set(v_result, '{inferredFromText}', to_jsonb(v_source = 'chat_heuristic'), true);
    end if;
  end if;

  if jsonb_typeof(v_existing->'formFields') = 'array'
     and jsonb_array_length(v_existing->'formFields') > 0
     and (jsonb_typeof(v_incoming->'formFields') <> 'array' or jsonb_array_length(coalesce(v_incoming->'formFields', '[]'::jsonb)) = 0) then
    v_result := jsonb_set(v_result, '{formFields}', v_existing->'formFields', true);
  end if;

  return v_result;
end;
$$;

create or replace function public.preserve_conversation_customer_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_existing_profile jsonb;
  v_incoming_profile jsonb;
  v_profile jsonb;
begin
  if new.metadata is not distinct from old.metadata then
    return new;
  end if;

  -- Incoming provider metadata may refresh provider-owned fields, but omission must not
  -- delete locally generated fields such as detected_phone or manual profile edits.
  new.metadata := coalesce(old.metadata, '{}'::jsonb) || coalesce(new.metadata, '{}'::jsonb);

  v_existing_profile := coalesce(old.metadata->'customer_profile', '{}'::jsonb);
  v_incoming_profile := coalesce(new.metadata->'customer_profile', '{}'::jsonb);
  v_profile := public.merge_customer_profile_jsonb(v_existing_profile, v_incoming_profile);

  if v_profile <> '{}'::jsonb then
    new.metadata := jsonb_set(new.metadata, '{customer_profile}', v_profile, true);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_preserve_conversation_customer_metadata on public.lead_conversations;
create trigger trg_preserve_conversation_customer_metadata
before update of metadata on public.lead_conversations
for each row execute function public.preserve_conversation_customer_metadata();

revoke all on function public.customer_profile_source_rank(jsonb) from public, anon, authenticated;
revoke all on function public.merge_customer_profile_jsonb(jsonb,jsonb) from public, anon, authenticated;

commit;
