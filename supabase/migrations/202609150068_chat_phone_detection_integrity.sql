-- 202609150068_chat_phone_detection_integrity.sql
-- Detect real phone numbers from inbound chat messages at the persistence boundary.
-- This makes phone capture independent of the Inbox view, Meta history polling, or the
-- currently selected provider account. Detected numbers fill empty customer/contact/lead
-- phone fields but never overwrite an existing real phone number.

begin;

create or replace function public.extract_chat_phone(p_text text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_match text[];
  v_candidate text;
  v_digits text;
begin
  if nullif(btrim(p_text), '') is null then
    return null;
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

    if length(v_digits) between 8 and 15
       and v_candidate !~ '^[0-9]{4}[-/.][0-9]{1,2}[-/.][0-9]{1,2}([ T].*)?$' then
      return v_candidate;
    end if;
  end loop;

  return null;
end;
$$;

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
declare
  v_conversation public.lead_conversations%rowtype;
  v_phone text := nullif(btrim(p_phone), '');
  v_detected_phones jsonb;
  v_metadata jsonb;
  v_existing_detected text;
  v_existing_detected_at text;
  v_existing_snippet text;
  v_existing_source text;
begin
  if v_phone is null then
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

  if not exists (
    select 1
    from jsonb_array_elements_text(v_detected_phones) as existing(value)
    where existing.value = v_phone
  ) then
    v_detected_phones := v_detected_phones || jsonb_build_array(v_phone);
  end if;

  v_existing_detected := nullif(v_conversation.metadata->>'detected_phone', '');
  v_existing_detected_at := nullif(v_conversation.metadata->>'detected_phone_at', '');
  v_existing_snippet := nullif(v_conversation.metadata->>'detected_phone_snippet', '');
  v_existing_source := nullif(v_conversation.metadata->>'detected_phone_source', '');

  v_metadata := coalesce(v_conversation.metadata, '{}'::jsonb) || jsonb_build_object(
    'detected_phone', coalesce(v_existing_detected, v_phone),
    'detected_phones', v_detected_phones,
    'detected_phone_at', coalesce(v_existing_detected_at, coalesce(p_sent_at, now())::text),
    'detected_phone_snippet', coalesce(v_existing_snippet, left(coalesce(p_body, ''), 160)),
    'detected_phone_source', coalesce(v_existing_source, 'message_ingestion')
  );

  update public.lead_conversations
  set customer_phone = case
        when nullif(btrim(customer_phone), '') is null
          or lower(btrim(customer_phone)) ~ '^(facebook|instagram):'
        then v_phone
        else customer_phone
      end,
      metadata = v_metadata,
      updated_at = now()
  where id = v_conversation.id
    and workspace_id = v_conversation.workspace_id;

  if v_conversation.contact_id is not null then
    update public.contacts
    set primary_phone = v_phone,
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
    set customer_phone = v_phone,
        updated_at = now()
    where id = v_conversation.lead_id
      and workspace_id = v_conversation.workspace_id
      and (
        nullif(btrim(customer_phone), '') is null
        or lower(btrim(customer_phone)) ~ '^(facebook|instagram):'
      );
  end if;

  -- Keep the Contact identity table in sync as well. This helper creates/updates the
  -- canonical contact and phone identity without crossing the conversation workspace.
  perform public.ensure_contact_for_conversation(v_conversation.id);
end;
$$;

create or replace function public.detect_chat_phone_from_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
begin
  if new.direction <> 'inbound' or nullif(btrim(new.body), '') is null then
    return new;
  end if;

  v_phone := public.extract_chat_phone(new.body);
  if v_phone is not null then
    perform public.apply_detected_chat_phone(
      new.conversation_id,
      v_phone,
      new.body,
      new.sent_at
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_detect_chat_phone_from_message on public.lead_messages;
create trigger trg_detect_chat_phone_from_message
after insert or update of body, direction
on public.lead_messages
for each row execute function public.detect_chat_phone_from_message();

-- Repair conversations whose message history is already present locally. Use only the
-- newest inbound message containing a plausible phone number for each conversation.
do $$
declare
  v_row record;
begin
  for v_row in
    select
      c.id as conversation_id,
      candidate.detected_phone,
      candidate.body,
      candidate.sent_at
    from public.lead_conversations c
    join lateral (
      select
        public.extract_chat_phone(m.body) as detected_phone,
        m.body,
        m.sent_at
      from public.lead_messages m
      where m.conversation_id = c.id
        and m.workspace_id = c.workspace_id
        and m.direction = 'inbound'
        and nullif(btrim(m.body), '') is not null
        and public.extract_chat_phone(m.body) is not null
      order by m.sent_at desc
      limit 1
    ) candidate on true
    where nullif(btrim(c.customer_phone), '') is null
       or lower(btrim(c.customer_phone)) ~ '^(facebook|instagram):'
  loop
    perform public.apply_detected_chat_phone(
      v_row.conversation_id,
      v_row.detected_phone,
      v_row.body,
      v_row.sent_at
    );
  end loop;
end
$$;

revoke all on function public.apply_detected_chat_phone(uuid,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.detect_chat_phone_from_message() from public, anon, authenticated;
grant execute on function public.extract_chat_phone(text) to authenticated, service_role;
grant execute on function public.apply_detected_chat_phone(uuid,text,text,timestamptz) to service_role;

comment on function public.extract_chat_phone(text) is
  'Returns the first plausible 8-15 digit telephone number found in free-form chat text.';
comment on function public.apply_detected_chat_phone(uuid,text,text,timestamptz) is
  'Persists a chat-detected phone into an empty conversation/contact/opportunity phone field within the same workspace.';
comment on function public.detect_chat_phone_from_message() is
  'Captures phone numbers from inbound persisted chat messages immediately after insert/update.';

commit;
