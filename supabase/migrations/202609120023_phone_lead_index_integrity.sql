-- 202609120023_phone_lead_index_integrity.sql
-- Keep Phone Leads derived metadata in sync regardless of which ingestion path
-- writes an inbound message (webhook, live Meta polling, page discovery, or
-- historical backfill). Also repairs already-stored inbound messages.

begin;

create or replace function public.extract_phone_numbers_from_text(p_text text)
returns text[]
language plpgsql
immutable
set search_path = public
as $$
declare
  v_match text[];
  v_candidate text;
  v_digits text;
  v_result text[] := array[]::text[];
begin
  if nullif(btrim(coalesce(p_text, '')), '') is null then
    return v_result;
  end if;

  for v_match in
    select regexp_matches(
      p_text,
      '(^|[^0-9])(((\+|00)[0-9]{1,3}[ .-]?)?(\(?[0-9]{2,4}\)?[ .-]?)?[0-9]{3,4}[ .-]?[0-9]{3,5})([^0-9]|$)',
      'g'
    )
  loop
    v_candidate := btrim(v_match[2]);
    v_digits := regexp_replace(v_candidate, '[^0-9]', '', 'g');

    if length(v_digits) between 8 and 15
       and v_candidate !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       and not (v_candidate = any(v_result)) then
      v_result := array_append(v_result, v_candidate);
    end if;
  end loop;

  return v_result;
end;
$$;

create or replace function public.merge_detected_phone_arrays(
  p_existing jsonb,
  p_new text[]
)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select coalesce(jsonb_agg(value order by value), '[]'::jsonb)
  from (
    select distinct value
    from (
      select jsonb_array_elements_text(
        case when jsonb_typeof(p_existing) = 'array' then p_existing else '[]'::jsonb end
      ) as value
      union all
      select unnest(coalesce(p_new, array[]::text[])) as value
    ) combined
    where nullif(btrim(value), '') is not null
  ) deduped;
$$;

create or replace function public.index_phone_numbers_from_message(
  p_conversation_id uuid,
  p_body text,
  p_sent_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phones text[];
  v_metadata jsonb;
  v_customer_phone text;
  v_provider text;
  v_existing_at timestamptz;
  v_effective_at timestamptz := coalesce(p_sent_at, now());
  v_promote boolean := false;
begin
  if p_conversation_id is null or nullif(btrim(coalesce(p_body, '')), '') is null then
    return;
  end if;

  v_phones := public.extract_phone_numbers_from_text(p_body);
  if coalesce(cardinality(v_phones), 0) = 0 then
    return;
  end if;

  select coalesce(metadata, '{}'::jsonb), customer_phone, provider
    into v_metadata, v_customer_phone, v_provider
  from public.lead_conversations
  where id = p_conversation_id
  for update;

  if not found then
    return;
  end if;

  begin
    v_existing_at := nullif(v_metadata->>'detected_phone_at', '')::timestamptz;
  exception when others then
    v_existing_at := null;
  end;

  v_promote := v_existing_at is null or v_effective_at >= v_existing_at;

  v_metadata := jsonb_set(
    v_metadata,
    '{detected_phones}',
    public.merge_detected_phone_arrays(v_metadata->'detected_phones', v_phones),
    true
  );

  if v_promote then
    v_metadata := v_metadata || jsonb_build_object(
      'detected_phone', v_phones[1],
      'detected_phone_at', v_effective_at,
      'detected_phone_snippet', left(p_body, 160),
      'detected_phone_source', 'chat_message'
    );
  end if;

  update public.lead_conversations
  set
    metadata = v_metadata,
    customer_phone = case
      when nullif(btrim(coalesce(v_customer_phone, '')), '') is null
        or v_customer_phone like v_provider || ':%'
      then v_phones[1]
      else v_customer_phone
    end,
    updated_at = greatest(updated_at, v_effective_at)
  where id = p_conversation_id;
end;
$$;

create or replace function public.trg_index_phone_from_lead_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.direction = 'inbound'
     and new.conversation_id is not null
     and nullif(btrim(coalesce(new.body, '')), '') is not null then
    perform public.index_phone_numbers_from_message(
      new.conversation_id,
      new.body,
      new.sent_at
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_index_phone_from_lead_message on public.lead_messages;
create trigger trg_index_phone_from_lead_message
after insert or update of body, direction, conversation_id, sent_at
on public.lead_messages
for each row
execute function public.trg_index_phone_from_lead_message();

-- Repair the derived index for inbound messages that were imported before this
-- trigger existed. The cheap pre-filter avoids invoking the extractor for rows
-- that clearly contain no phone-like digit sequence.
do $$
declare
  v_message record;
begin
  for v_message in
    select m.conversation_id, m.body, m.sent_at
    from public.lead_messages m
    where m.direction = 'inbound'
      and m.conversation_id is not null
      and nullif(btrim(coalesce(m.body, '')), '') is not null
      and m.body ~ '[0-9][0-9 .()+-]{6,}[0-9]'
    order by m.sent_at asc
  loop
    perform public.index_phone_numbers_from_message(
      v_message.conversation_id,
      v_message.body,
      v_message.sent_at
    );
  end loop;
end;
$$;

create index if not exists lead_conversations_detected_phone_idx
  on public.lead_conversations ((metadata->>'detected_phone'))
  where metadata->>'detected_phone' is not null;

-- These are internal data-integrity helpers. Application users do not need to
-- execute them directly; the lead_messages trigger owns the indexing lifecycle.
revoke all on function public.extract_phone_numbers_from_text(text) from public, anon, authenticated;
revoke all on function public.merge_detected_phone_arrays(jsonb, text[]) from public, anon, authenticated;
revoke all on function public.index_phone_numbers_from_message(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.trg_index_phone_from_lead_message() from public, anon, authenticated;

commit;
