-- 202609150069_multi_phone_chat_detection.sql
-- Extend chat phone capture so one free-form inbound message can contribute every
-- plausible phone number it contains. Preserve the first detected number as the
-- canonical primary phone when customer/contact/lead phone fields are still empty.

begin;

create or replace function public.extract_chat_phones(p_text text)
returns text[]
language plpgsql
immutable
set search_path = public
as $$
declare
  v_match text[];
  v_candidate text;
  v_digits text;
  v_seen_digits text[] := array[]::text[];
  v_result text[] := array[]::text[];
begin
  if nullif(btrim(p_text), '') is null then
    return v_result;
  end if;

  for v_match in
    select regexp_matches(
      p_text,
      '(^|[^0-9])((\+|00)?[0-9(][0-9 ()\.\-]{6,22}[0-9])([^0-9]|$)',
      'g'
    )
  loop
    v_candidate := btrim(v_match[2]);
    v_digits := regexp_replace(v_candidate, '[^0-9]', '', 'g');

    if length(v_digits) not between 8 and 15 then
      continue;
    end if;

    -- Avoid common date-like values while remaining phrase-independent.
    if v_candidate ~ '^[0-9]{4}[-/.][0-9]{1,2}[-/.][0-9]{1,2}([ T].*)?$' then
      continue;
    end if;

    -- Deduplicate equivalent formatting such as +977 9841 234 567 and
    -- +977-9841-234-567 while preserving the first representation seen.
    if v_digits = any(v_seen_digits) then
      continue;
    end if;

    v_seen_digits := array_append(v_seen_digits, v_digits);
    v_result := array_append(v_result, v_candidate);
  end loop;

  return v_result;
end;
$$;

create or replace function public.extract_chat_phone(p_text text)
returns text
language sql
immutable
set search_path = public
as $$
  select (public.extract_chat_phones(p_text))[1];
$$;

create or replace function public.apply_detected_chat_phones(
  p_conversation_id uuid,
  p_phones text[],
  p_body text,
  p_sent_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation public.lead_conversations%rowtype;
  v_phone text;
  v_primary_phone text;
  v_digits text;
  v_detected_phones jsonb;
  v_metadata jsonb;
  v_existing_detected text;
  v_existing_detected_at text;
  v_existing_snippet text;
  v_existing_source text;
begin
  if p_phones is null or coalesce(array_length(p_phones, 1), 0) = 0 then
    return;
  end if;

  select * into v_conversation
  from public.lead_conversations
  where id = p_conversation_id
  for update;

  if not found then
    return;
  end if;

  v_detected_phones := coalesce(v_conversation.metadata->'detected_phones', '[]'::jsonb);
  if jsonb_typeof(v_detected_phones) is distinct from 'array' then
    v_detected_phones := '[]'::jsonb;
  end if;

  foreach v_phone in array p_phones
  loop
    v_phone := nullif(btrim(v_phone), '');
    if v_phone is null then
      continue;
    end if;

    v_digits := regexp_replace(v_phone, '[^0-9]', '', 'g');
    if length(v_digits) not between 8 and 15 then
      continue;
    end if;

    if v_phone ~ '^[0-9]{4}[-/.][0-9]{1,2}[-/.][0-9]{1,2}([ T].*)?$' then
      continue;
    end if;

    if v_primary_phone is null then
      v_primary_phone := v_phone;
    end if;

    if not exists (
      select 1
      from jsonb_array_elements_text(v_detected_phones) as existing(value)
      where regexp_replace(existing.value, '[^0-9]', '', 'g') = v_digits
    ) then
      v_detected_phones := v_detected_phones || jsonb_build_array(v_phone);
    end if;
  end loop;

  if v_primary_phone is null then
    return;
  end if;

  v_existing_detected := nullif(v_conversation.metadata->>'detected_phone', '');
  v_existing_detected_at := nullif(v_conversation.metadata->>'detected_phone_at', '');
  v_existing_snippet := nullif(v_conversation.metadata->>'detected_phone_snippet', '');
  v_existing_source := nullif(v_conversation.metadata->>'detected_phone_source', '');

  v_metadata := coalesce(v_conversation.metadata, '{}'::jsonb) || jsonb_build_object(
    'detected_phone', coalesce(v_existing_detected, v_primary_phone),
    'detected_phones', v_detected_phones,
    'detected_phone_at', coalesce(v_existing_detected_at, coalesce(p_sent_at, now())::text),
    'detected_phone_snippet', coalesce(v_existing_snippet, left(coalesce(p_body, ''), 160)),
    'detected_phone_source', coalesce(v_existing_source, 'message_ingestion')
  );

  update public.lead_conversations
  set customer_phone = case
        when nullif(btrim(customer_phone), '') is null
          or lower(btrim(customer_phone)) ~ '^(facebook|instagram):'
        then v_primary_phone
        else customer_phone
      end,
      metadata = v_metadata,
      updated_at = now()
  where id = v_conversation.id
    and workspace_id = v_conversation.workspace_id;

  if v_conversation.contact_id is not null then
    update public.contacts
    set primary_phone = v_primary_phone,
        updated_at = now()
    where id = v_conversation.contact_id
      and workspace_id = v_conversation.workspace_id
      and (
        nullif(btrim(primary_phone), '') is null
        or lower(btrim(primary_phone)) ~ '^(facebook|instagram):'
      );
  end if;

  if v_conversation.lead_id is not null then
    update public.leads
    set customer_phone = v_primary_phone,
        updated_at = now()
    where id = v_conversation.lead_id
      and workspace_id = v_conversation.workspace_id
      and (
        nullif(btrim(customer_phone), '') is null
        or lower(btrim(customer_phone)) ~ '^(facebook|instagram):'
      );
  end if;

  perform public.ensure_contact_for_conversation(v_conversation.id);
end;
$$;

-- Preserve the old single-number helper for callers introduced by migration 068.
create or replace function public.apply_detected_chat_phone(
  p_conversation_id uuid,
  p_phone text,
  p_body text,
  p_sent_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.apply_detected_chat_phones(
    p_conversation_id,
    case when nullif(btrim(p_phone), '') is null then array[]::text[] else array[p_phone] end,
    p_body,
    p_sent_at
  );
end;
$$;

create or replace function public.detect_chat_phone_from_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phones text[];
begin
  if new.direction <> 'inbound' or nullif(btrim(new.body), '') is null then
    return new;
  end if;

  v_phones := public.extract_chat_phones(new.body);
  if coalesce(array_length(v_phones, 1), 0) > 0 then
    perform public.apply_detected_chat_phones(
      new.conversation_id,
      v_phones,
      new.body,
      new.sent_at
    );
  end if;

  return new;
end;
$$;

-- Re-scan already-persisted inbound messages so conversations that were processed by
-- migration 068 can recover additional numbers from the same message or older messages.
do $$
declare
  v_row record;
begin
  for v_row in
    select
      m.conversation_id,
      public.extract_chat_phones(m.body) as detected_phones,
      m.body,
      m.sent_at
    from public.lead_messages m
    join public.lead_conversations c
      on c.id = m.conversation_id
     and c.workspace_id = m.workspace_id
    where m.direction = 'inbound'
      and nullif(btrim(m.body), '') is not null
      and coalesce(array_length(public.extract_chat_phones(m.body), 1), 0) > 0
    order by m.conversation_id, m.sent_at desc
  loop
    perform public.apply_detected_chat_phones(
      v_row.conversation_id,
      v_row.detected_phones,
      v_row.body,
      v_row.sent_at
    );
  end loop;
end
$$;

revoke all on function public.apply_detected_chat_phones(uuid,text[],text,timestamptz) from public, anon, authenticated;
revoke all on function public.apply_detected_chat_phone(uuid,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.detect_chat_phone_from_message() from public, anon, authenticated;
grant execute on function public.extract_chat_phones(text) to authenticated, service_role;
grant execute on function public.extract_chat_phone(text) to authenticated, service_role;
grant execute on function public.apply_detected_chat_phones(uuid,text[],text,timestamptz) to service_role;
grant execute on function public.apply_detected_chat_phone(uuid,text,text,timestamptz) to service_role;

comment on function public.extract_chat_phones(text) is
  'Returns all distinct plausible 8-15 digit telephone numbers found anywhere in free-form chat text.';
comment on function public.extract_chat_phone(text) is
  'Compatibility helper returning the first plausible phone number found in free-form chat text.';
comment on function public.apply_detected_chat_phones(uuid,text[],text,timestamptz) is
  'Persists all chat-detected phones into conversation metadata while filling only empty primary phone fields in the same workspace.';
comment on function public.detect_chat_phone_from_message() is
  'Captures all plausible phone numbers from every inbound persisted chat message.';

commit;
