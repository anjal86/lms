-- 202609150070_chat_contact_detail_detection.sql
-- Extend phrase-independent chat contact extraction beyond phone numbers.
-- Emails are safe to detect anywhere in free-form inbound text. Locations are promoted
-- only when they are explicit/high-confidence (or a short standalone known place) so a
-- travel destination mention is not accidentally treated as the customer's residence.
-- URLs are retained as detected contact hints in conversation metadata.

begin;

create or replace function public.extract_chat_emails(p_text text)
returns text[]
language plpgsql
immutable
set search_path = public
as $fn$
declare
  v_match text[];
  v_email text;
  v_result text[] := array[]::text[];
begin
  if nullif(btrim(p_text), '') is null then
    return v_result;
  end if;

  for v_match in
    select regexp_matches(
      p_text,
      $rx$([A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,63})$rx$,
      'gi'
    )
  loop
    v_email := lower(btrim(v_match[1]));
    if v_email is not null and v_email <> '' and not (v_email = any(v_result)) then
      v_result := array_append(v_result, v_email);
    end if;
  end loop;

  return v_result;
end;
$fn$;

create or replace function public.extract_chat_urls(p_text text)
returns text[]
language plpgsql
immutable
set search_path = public
as $fn$
declare
  v_match text[];
  v_url text;
  v_result text[] := array[]::text[];
begin
  if nullif(btrim(p_text), '') is null then
    return v_result;
  end if;

  for v_match in
    select regexp_matches(
      p_text,
      $rx$((https?://|www\.)[^[:space:]<>"']+)$rx$,
      'gi'
    )
  loop
    v_url := regexp_replace(btrim(v_match[1]), '[.,!?;:]+$', '', 'g');
    if v_url is not null and v_url <> '' and not (v_url = any(v_result)) then
      v_result := array_append(v_result, v_url);
    end if;
  end loop;

  return v_result;
end;
$fn$;

create or replace function public.canonical_chat_country(p_value text)
returns text
language sql
immutable
set search_path = public
as $fn$
  select case lower(btrim(coalesce(p_value, '')))
    when 'nepal' then 'Nepal'
    when 'india' then 'India'
    when 'australia' then 'Australia'
    when 'japan' then 'Japan'
    when 'china' then 'China'
    when 'canada' then 'Canada'
    when 'germany' then 'Germany'
    when 'france' then 'France'
    when 'singapore' then 'Singapore'
    when 'malaysia' then 'Malaysia'
    when 'thailand' then 'Thailand'
    when 'bangladesh' then 'Bangladesh'
    when 'bhutan' then 'Bhutan'
    when 'qatar' then 'Qatar'
    when 'uae' then 'United Arab Emirates'
    when 'united arab emirates' then 'United Arab Emirates'
    when 'uk' then 'United Kingdom'
    when 'united kingdom' then 'United Kingdom'
    when 'usa' then 'United States'
    when 'us' then 'United States'
    when 'united states' then 'United States'
    when 'united states of america' then 'United States'
    when 'new zealand' then 'New Zealand'
    when 'south korea' then 'South Korea'
    when 'korea' then 'South Korea'
    when 'saudi arabia' then 'Saudi Arabia'
    when 'italy' then 'Italy'
    when 'spain' then 'Spain'
    when 'switzerland' then 'Switzerland'
    else null
  end;
$fn$;

create or replace function public.detect_chat_location(p_text text)
returns jsonb
language plpgsql
immutable
set search_path = public
as $fn$
declare
  v_input text := btrim(coalesce(p_text, ''));
  v_match text[];
  v_place text;
  v_city text;
  v_country text;
  v_country_part text;
  v_lower text;
begin
  if v_input = '' then
    return '{}'::jsonb;
  end if;

  -- Explicit self-location statements. These deliberately do not match generic
  -- destination phrases such as "travel to Kathmandu".
  v_match := regexp_match(
    v_input,
    $rx$(i am|i'm|im|we are|we're)[[:space:]]+from[[:space:]]+([[:alpha:]][[:alpha:] ,.''’-]{1,60})$rx$,
    'i'
  );
  if v_match is not null then
    v_place := v_match[2];
  end if;

  if v_place is null then
    v_match := regexp_match(
      v_input,
      $rx$(i live|we live|living|based|located|staying|residing|currently living|currently based|currently located|currently residing)[[:space:]]+(in|at)[[:space:]]+([[:alpha:]][[:alpha:] ,.''’-]{1,60})$rx$,
      'i'
    );
    if v_match is not null then
      v_place := v_match[3];
    end if;
  end if;

  if v_place is null then
    v_match := regexp_match(
      v_input,
      $rx$(my hometown|my home town|my home city|my city|hometown|city)[[:space:]]+(is|:)[[:space:]]*([[:alpha:]][[:alpha:] ,.''’-]{1,60})$rx$,
      'i'
    );
    if v_match is not null then
      v_place := v_match[3];
    end if;
  end if;

  -- A short message containing only a known city/country is also a useful, high-
  -- confidence answer to a location question (for example simply "Kathmandu").
  if v_place is null and char_length(v_input) <= 50 then
    v_lower := lower(btrim(v_input, ' .,!?;:'));
    if v_lower in (
      'kathmandu','pokhara','lalitpur','bhaktapur','chitwan','biratnagar','dharan','butwal','bhairahawa','nepalgunj','hetauda',
      'darwin','sydney','melbourne','brisbane','perth','adelaide',
      'delhi','mumbai','bangalore','bengaluru','dubai','london','new york','dallas','austin','toronto','vancouver','tokyo','singapore','doha',
      'nepal','india','australia','japan','china','canada','germany','france','malaysia','thailand','bangladesh','bhutan','qatar','uae','united arab emirates','uk','united kingdom','usa','us','united states','new zealand','south korea','korea','saudi arabia','italy','spain','switzerland'
    ) then
      v_place := btrim(v_input, ' .,!?;:');
    end if;
  end if;

  if v_place is null then
    return '{}'::jsonb;
  end if;

  -- Stop an otherwise-valid location capture before common continuation words.
  v_place := regexp_replace(
    v_place,
    $rx$[[:space:]]+(right now|at the moment|currently|now|and|but|looking|want|would|planning|interested|need|travel|travelling|traveling)([[:space:]].*)?$rx$,
    '',
    'i'
  );
  v_place := btrim(regexp_replace(v_place, '[[:space:]]+', ' ', 'g'), ' .,!?;:');
  if char_length(v_place) < 2 or char_length(v_place) > 70 then
    return '{}'::jsonb;
  end if;

  v_lower := lower(v_place);
  case v_lower
    when 'kathmandu' then v_city := 'Kathmandu'; v_country := 'Nepal';
    when 'pokhara' then v_city := 'Pokhara'; v_country := 'Nepal';
    when 'lalitpur' then v_city := 'Lalitpur'; v_country := 'Nepal';
    when 'bhaktapur' then v_city := 'Bhaktapur'; v_country := 'Nepal';
    when 'chitwan' then v_city := 'Chitwan'; v_country := 'Nepal';
    when 'biratnagar' then v_city := 'Biratnagar'; v_country := 'Nepal';
    when 'dharan' then v_city := 'Dharan'; v_country := 'Nepal';
    when 'butwal' then v_city := 'Butwal'; v_country := 'Nepal';
    when 'bhairahawa' then v_city := 'Bhairahawa'; v_country := 'Nepal';
    when 'nepalgunj' then v_city := 'Nepalgunj'; v_country := 'Nepal';
    when 'hetauda' then v_city := 'Hetauda'; v_country := 'Nepal';
    when 'darwin' then v_city := 'Darwin'; v_country := 'Australia';
    when 'sydney' then v_city := 'Sydney'; v_country := 'Australia';
    when 'melbourne' then v_city := 'Melbourne'; v_country := 'Australia';
    when 'brisbane' then v_city := 'Brisbane'; v_country := 'Australia';
    when 'perth' then v_city := 'Perth'; v_country := 'Australia';
    when 'adelaide' then v_city := 'Adelaide'; v_country := 'Australia';
    when 'delhi' then v_city := 'Delhi'; v_country := 'India';
    when 'mumbai' then v_city := 'Mumbai'; v_country := 'India';
    when 'bangalore' then v_city := 'Bangalore'; v_country := 'India';
    when 'bengaluru' then v_city := 'Bengaluru'; v_country := 'India';
    when 'dubai' then v_city := 'Dubai'; v_country := 'United Arab Emirates';
    when 'london' then v_city := 'London'; v_country := 'United Kingdom';
    when 'new york' then v_city := 'New York'; v_country := 'United States';
    when 'dallas' then v_city := 'Dallas'; v_country := 'United States';
    when 'austin' then v_city := 'Austin'; v_country := 'United States';
    when 'toronto' then v_city := 'Toronto'; v_country := 'Canada';
    when 'vancouver' then v_city := 'Vancouver'; v_country := 'Canada';
    when 'tokyo' then v_city := 'Tokyo'; v_country := 'Japan';
    when 'singapore' then v_city := 'Singapore'; v_country := 'Singapore';
    when 'doha' then v_city := 'Doha'; v_country := 'Qatar';
    else
      v_country := public.canonical_chat_country(v_place);
      if v_country is null then
        if position(',' in v_place) > 0 then
          v_city := nullif(initcap(btrim(split_part(v_place, ',', 1))), '');
          v_country_part := btrim(substr(v_place, position(',' in v_place) + 1));
          v_country := coalesce(public.canonical_chat_country(v_country_part), nullif(initcap(v_country_part), ''));
        else
          v_city := initcap(v_place);
        end if;
      end if;
  end case;

  return jsonb_strip_nulls(jsonb_build_object(
    'city', v_city,
    'country', v_country,
    'formattedLocation', case
      when v_city is not null and v_country is not null then v_city || ', ' || v_country
      when v_city is not null then v_city
      else v_country
    end,
    'inferredFromText', true,
    'locationSource', 'chat_heuristic'
  ));
end;
$fn$;

create or replace function public.apply_detected_chat_contact_details(
  p_conversation_id uuid,
  p_emails text[],
  p_location jsonb,
  p_urls text[],
  p_body text,
  p_sent_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_conversation public.lead_conversations%rowtype;
  v_email text;
  v_primary_email text;
  v_emails jsonb;
  v_urls jsonb;
  v_url text;
  v_metadata jsonb;
  v_profile jsonb;
  v_city text := nullif(btrim(coalesce(p_location->>'city', '')), '');
  v_country text := nullif(btrim(coalesce(p_location->>'country', '')), '');
  v_email_conflict boolean := false;
  v_contact_custom jsonb;
begin
  if coalesce(array_length(p_emails, 1), 0) = 0
     and coalesce(array_length(p_urls, 1), 0) = 0
     and v_city is null
     and v_country is null then
    return;
  end if;

  select * into v_conversation
  from public.lead_conversations
  where id = p_conversation_id
  for update;
  if not found then
    return;
  end if;

  v_metadata := coalesce(v_conversation.metadata, '{}'::jsonb);
  v_emails := coalesce(v_metadata->'detected_emails', '[]'::jsonb);
  if jsonb_typeof(v_emails) is distinct from 'array' then
    v_emails := '[]'::jsonb;
  end if;
  v_urls := coalesce(v_metadata->'detected_urls', '[]'::jsonb);
  if jsonb_typeof(v_urls) is distinct from 'array' then
    v_urls := '[]'::jsonb;
  end if;

  foreach v_email in array coalesce(p_emails, array[]::text[])
  loop
    v_email := lower(nullif(btrim(v_email), ''));
    if v_email is null then continue; end if;
    if v_primary_email is null then v_primary_email := v_email; end if;
    if not exists (
      select 1 from jsonb_array_elements_text(v_emails) existing(value)
      where lower(existing.value) = v_email
    ) then
      v_emails := v_emails || jsonb_build_array(v_email);
    end if;
  end loop;

  foreach v_url in array coalesce(p_urls, array[]::text[])
  loop
    v_url := nullif(btrim(v_url), '');
    if v_url is null then continue; end if;
    if not exists (
      select 1 from jsonb_array_elements_text(v_urls) existing(value)
      where existing.value = v_url
    ) then
      v_urls := v_urls || jsonb_build_array(v_url);
    end if;
  end loop;

  if v_primary_email is not null and v_conversation.contact_id is not null then
    v_email_conflict := exists (
      select 1
      from public.contact_identities i
      where i.workspace_id = v_conversation.workspace_id
        and i.identity_type = 'email'
        and i.identity_normalized = lower(v_primary_email)
        and i.contact_id <> v_conversation.contact_id
    );
  end if;

  if jsonb_array_length(v_emails) > 0 then
    v_metadata := v_metadata || jsonb_build_object(
      'detected_email', coalesce(nullif(v_metadata->>'detected_email', ''), v_primary_email),
      'detected_emails', v_emails,
      'detected_email_at', coalesce(nullif(v_metadata->>'detected_email_at', ''), coalesce(p_sent_at, now())::text),
      'detected_email_source', coalesce(nullif(v_metadata->>'detected_email_source', ''), 'message_ingestion')
    );
  end if;

  if jsonb_array_length(v_urls) > 0 then
    v_metadata := v_metadata || jsonb_build_object(
      'detected_url', coalesce(nullif(v_metadata->>'detected_url', ''), v_urls->>0),
      'detected_urls', v_urls
    );
  end if;

  if v_city is not null or v_country is not null then
    v_profile := coalesce(v_metadata->'customer_profile', '{}'::jsonb);
    if jsonb_typeof(v_profile) is distinct from 'object' then
      v_profile := '{}'::jsonb;
    end if;
    if nullif(v_profile->>'city', '') is null and v_city is not null then
      v_profile := v_profile || jsonb_build_object('city', v_city);
    end if;
    if nullif(v_profile->>'country', '') is null and v_country is not null then
      v_profile := v_profile || jsonb_build_object('country', v_country);
    end if;
    if nullif(v_profile->>'locationSource', '') is null then
      v_profile := v_profile || jsonb_build_object('locationSource', 'chat_heuristic');
    end if;
    v_profile := v_profile || jsonb_build_object('inferredFromText', true);
    v_metadata := v_metadata || jsonb_build_object(
      'customer_profile', v_profile,
      'detected_location', jsonb_strip_nulls(jsonb_build_object('city', v_city, 'country', v_country)),
      'detected_location_at', coalesce(p_sent_at, now())::text,
      'detected_location_source', 'message_ingestion'
    );
  end if;

  v_metadata := v_metadata || jsonb_build_object(
    'detected_contact_at', coalesce(p_sent_at, now())::text,
    'detected_contact_snippet', left(coalesce(p_body, ''), 200),
    'detected_contact_source', 'message_ingestion'
  );

  update public.lead_conversations
  set customer_email = case
        when v_primary_email is not null
             and not v_email_conflict
             and nullif(btrim(customer_email), '') is null
        then v_primary_email
        else customer_email
      end,
      metadata = v_metadata,
      updated_at = now()
  where id = v_conversation.id
    and workspace_id = v_conversation.workspace_id;

  -- Let the existing Contact identity helper create/link a contact from a newly
  -- discovered email when safe. If a different linked contact already owns that email,
  -- the email remains a detection hint instead of silently merging people.
  if not v_email_conflict then
    perform public.ensure_contact_for_conversation(v_conversation.id);
  end if;

  select * into v_conversation
  from public.lead_conversations
  where id = p_conversation_id;

  if v_conversation.contact_id is not null then
    select coalesce(custom_data, '{}'::jsonb) into v_contact_custom
    from public.contacts
    where id = v_conversation.contact_id
      and workspace_id = v_conversation.workspace_id;

    if v_contact_custom is not null then
      if nullif(v_contact_custom->>'city', '') is null and v_city is not null then
        v_contact_custom := v_contact_custom || jsonb_build_object('city', v_city);
      end if;
      if nullif(v_contact_custom->>'country', '') is null and v_country is not null then
        v_contact_custom := v_contact_custom || jsonb_build_object('country', v_country);
      end if;
      if (v_city is not null or v_country is not null) and nullif(v_contact_custom->>'location_source', '') is null then
        v_contact_custom := v_contact_custom || jsonb_build_object('location_source', 'chat_heuristic');
      end if;

      update public.contacts
      set primary_email = case
            when v_primary_email is not null
                 and not v_email_conflict
                 and nullif(btrim(primary_email), '') is null
            then v_primary_email
            else primary_email
          end,
          custom_data = v_contact_custom,
          updated_at = now()
      where id = v_conversation.contact_id
        and workspace_id = v_conversation.workspace_id;
    end if;
  end if;

  if v_conversation.lead_id is not null then
    update public.leads
    set customer_email = case
          when v_primary_email is not null
               and not v_email_conflict
               and nullif(btrim(customer_email), '') is null
          then v_primary_email
          else customer_email
        end,
        customer_city = case
          when v_city is not null and nullif(btrim(customer_city), '') is null then v_city
          else customer_city
        end,
        customer_country = case
          when v_country is not null and nullif(btrim(customer_country), '') is null then v_country
          else customer_country
        end,
        updated_at = now()
    where id = v_conversation.lead_id
      and workspace_id = v_conversation.workspace_id;
  end if;
end;
$fn$;

create or replace function public.detect_chat_contact_details_from_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_emails text[];
  v_location jsonb;
  v_urls text[];
begin
  if new.direction <> 'inbound' or nullif(btrim(new.body), '') is null then
    return new;
  end if;

  v_emails := public.extract_chat_emails(new.body);
  v_location := public.detect_chat_location(new.body);
  v_urls := public.extract_chat_urls(new.body);

  if coalesce(array_length(v_emails, 1), 0) > 0
     or coalesce(array_length(v_urls, 1), 0) > 0
     or coalesce(v_location, '{}'::jsonb) <> '{}'::jsonb then
    perform public.apply_detected_chat_contact_details(
      new.conversation_id,
      v_emails,
      v_location,
      v_urls,
      new.body,
      new.sent_at
    );
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_detect_chat_contact_details on public.lead_messages;
create trigger trg_detect_chat_contact_details
after insert or update of body, direction
on public.lead_messages
for each row execute function public.detect_chat_contact_details_from_message();

-- Backfill already-persisted inbound chat history. Existing canonical values are never
-- overwritten; only empty fields and detection metadata are populated.
do $backfill$
declare
  v_row record;
  v_emails text[];
  v_location jsonb;
  v_urls text[];
begin
  for v_row in
    select m.conversation_id, m.body, m.sent_at
    from public.lead_messages m
    join public.lead_conversations c
      on c.id = m.conversation_id
     and c.workspace_id = m.workspace_id
    where m.direction = 'inbound'
      and nullif(btrim(m.body), '') is not null
    order by m.conversation_id, m.sent_at desc
  loop
    v_emails := public.extract_chat_emails(v_row.body);
    v_location := public.detect_chat_location(v_row.body);
    v_urls := public.extract_chat_urls(v_row.body);
    if coalesce(array_length(v_emails, 1), 0) > 0
       or coalesce(array_length(v_urls, 1), 0) > 0
       or coalesce(v_location, '{}'::jsonb) <> '{}'::jsonb then
      perform public.apply_detected_chat_contact_details(
        v_row.conversation_id,
        v_emails,
        v_location,
        v_urls,
        v_row.body,
        v_row.sent_at
      );
    end if;
  end loop;
end;
$backfill$;

-- Lightweight migration-time regression checks for the pure extractors.
do $checks$
declare
  v_location jsonb;
begin
  if not ('hello test.user+crm@example.com thanks' is not null
          and 'test.user+crm@example.com' = any(public.extract_chat_emails('hello test.user+crm@example.com thanks'))) then
    raise exception 'chat email extractor regression';
  end if;

  if coalesce(array_length(public.extract_chat_urls('site https://example.com/contact'), 1), 0) <> 1 then
    raise exception 'chat URL extractor regression';
  end if;

  v_location := public.detect_chat_location('I live in Darwin');
  if v_location->>'city' <> 'Darwin' or v_location->>'country' <> 'Australia' then
    raise exception 'chat location extractor regression';
  end if;

  if coalesce(public.detect_chat_location('I want to travel to Kathmandu')->>'city', '') <> '' then
    raise exception 'destination text must not be promoted as customer location';
  end if;
end;
$checks$;

revoke all on function public.apply_detected_chat_contact_details(uuid,text[],jsonb,text[],text,timestamptz) from public, anon, authenticated;
revoke all on function public.detect_chat_contact_details_from_message() from public, anon, authenticated;
grant execute on function public.extract_chat_emails(text) to authenticated, service_role;
grant execute on function public.extract_chat_urls(text) to authenticated, service_role;
grant execute on function public.detect_chat_location(text) to authenticated, service_role;
grant execute on function public.canonical_chat_country(text) to authenticated, service_role;
grant execute on function public.apply_detected_chat_contact_details(uuid,text[],jsonb,text[],text,timestamptz) to service_role;

comment on function public.extract_chat_emails(text) is
  'Returns all distinct email addresses found anywhere in free-form chat text.';
comment on function public.detect_chat_location(text) is
  'Returns a high-confidence city/country only for explicit self-location text or a short standalone known place.';
comment on function public.extract_chat_urls(text) is
  'Returns distinct URLs/contact links found in free-form chat text.';
comment on function public.apply_detected_chat_contact_details(uuid,text[],jsonb,text[],text,timestamptz) is
  'Persists chat-detected email/location/contact-link details without overwriting existing canonical customer data.';

commit;
