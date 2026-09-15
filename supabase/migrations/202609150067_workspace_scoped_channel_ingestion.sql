-- 202609150067_workspace_scoped_channel_ingestion.sql
-- Replace the original pre-workspace channel ingestion RPC. The old implementation
-- located conversations and provider message IDs globally, which can resolve historical
-- rows from a previous workspace after a concrete Page/account is transferred.

begin;

create or replace function public.ingest_channel_message(
  p_lead_id uuid,
  p_connection_id uuid,
  p_provider text,
  p_external_thread_id text,
  p_external_contact_id text,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_customer_avatar_url text,
  p_external_message_id text,
  p_direction text,
  p_message_type text,
  p_body text,
  p_sent_at timestamptz,
  p_message_metadata jsonb,
  p_conversation_metadata jsonb,
  p_source_label text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation public.lead_conversations%rowtype;
  v_message_id uuid;
  v_existing_message public.lead_messages%rowtype;
  v_effective_lead_id uuid;
  v_workspace_id uuid;
  v_connection_provider text;
  v_customer_phone text := nullif(btrim(p_customer_phone), '');
  v_preview text;
  v_lock_key text;
begin
  if p_direction not in ('inbound','outbound','internal') then
    raise exception 'Invalid message direction' using errcode = '22023';
  end if;

  if nullif(btrim(p_provider), '') is null then
    raise exception 'Provider is required' using errcode = '22023';
  end if;

  if p_connection_id is not null then
    select workspace_id, provider
      into v_workspace_id, v_connection_provider
    from public.integration_connections
    where id = p_connection_id;

    if v_workspace_id is null then
      raise exception 'Integration connection has no workspace' using errcode = '23503';
    end if;
    if v_connection_provider is distinct from p_provider then
      raise exception 'Integration connection provider does not match message provider' using errcode = '23514';
    end if;
  elsif p_lead_id is not null then
    select workspace_id into v_workspace_id
    from public.leads
    where id = p_lead_id;
  else
    v_workspace_id := public.current_workspace_id();
  end if;

  if v_workspace_id is null then
    raise exception 'Channel message workspace could not be resolved' using errcode = '22023';
  end if;

  -- Social scoped IDs belong in external_contact_id / contact identities, never phone.
  if p_provider in ('facebook','instagram')
     and v_customer_phone is not null
     and lower(v_customer_phone) ~ '^(facebook|instagram):' then
    v_customer_phone := null;
  end if;

  v_lock_key := coalesce(
    nullif(p_external_thread_id, ''),
    coalesce(p_lead_id::text, p_external_contact_id, gen_random_uuid()::text)
  );
  perform pg_advisory_xact_lock(hashtextextended(
    v_workspace_id::text || ':' || coalesce(p_connection_id::text, 'legacy') || ':' || coalesce(p_provider, '') || ':' || v_lock_key,
    0
  ));

  if nullif(p_external_thread_id, '') is not null then
    select * into v_conversation
    from public.lead_conversations
    where workspace_id = v_workspace_id
      and provider = p_provider
      and connection_id is not distinct from p_connection_id
      and external_thread_id = p_external_thread_id
    limit 1
    for update;
  elsif p_lead_id is not null then
    select * into v_conversation
    from public.lead_conversations
    where workspace_id = v_workspace_id
      and lead_id = p_lead_id
      and provider = p_provider
      and connection_id is not distinct from p_connection_id
    order by last_message_at desc nulls last
    limit 1
    for update;
  end if;

  if not found then
    insert into public.lead_conversations(
      workspace_id, lead_id, connection_id, provider, external_thread_id, external_contact_id,
      customer_name, customer_phone, customer_email, customer_avatar_url,
      last_message_preview, status, unread_count, last_message_at, metadata
    ) values (
      v_workspace_id, p_lead_id, p_connection_id, p_provider,
      nullif(p_external_thread_id, ''), nullif(p_external_contact_id, ''),
      nullif(p_customer_name, ''), v_customer_phone, nullif(p_customer_email, ''), nullif(p_customer_avatar_url, ''),
      null, 'open', 0, p_sent_at, coalesce(p_conversation_metadata, '{}'::jsonb)
    )
    returning * into v_conversation;
  end if;

  v_effective_lead_id := coalesce(v_conversation.lead_id, p_lead_id);
  v_preview := coalesce(
    nullif(left(coalesce(p_body, ''), 180), ''),
    '[' || coalesce(nullif(p_message_type, ''), 'message') || ']'
  );

  -- Provider message IDs can legitimately repeat after a concrete account is moved to a
  -- different workspace. Idempotency therefore follows the connection + workspace.
  if nullif(p_external_message_id, '') is not null then
    select * into v_existing_message
    from public.lead_messages
    where workspace_id = v_workspace_id
      and connection_id is not distinct from p_connection_id
      and provider = p_provider
      and external_message_id = p_external_message_id
    limit 1
    for update;
  end if;

  if found then
    if v_effective_lead_id is not null then
      update public.lead_messages
      set lead_id = coalesce(lead_id, v_effective_lead_id),
          conversation_id = coalesce(conversation_id, v_conversation.id)
      where id = v_existing_message.id;
    end if;

    return jsonb_build_object(
      'conversation_id', v_conversation.id,
      'lead_id', v_effective_lead_id,
      'message_id', v_existing_message.id,
      'message_inserted', false
    );
  end if;

  insert into public.lead_messages(
    workspace_id, conversation_id, lead_id, connection_id, provider, external_message_id,
    direction, message_type, body, metadata, sent_at, delivery_status
  ) values (
    v_workspace_id, v_conversation.id, v_effective_lead_id, p_connection_id, p_provider,
    nullif(p_external_message_id, ''), p_direction,
    coalesce(nullif(p_message_type, ''), 'text'), p_body,
    coalesce(p_message_metadata, '{}'::jsonb), p_sent_at, 'sent'
  )
  returning id into v_message_id;

  update public.lead_conversations
  set lead_id = coalesce(lead_id, v_effective_lead_id),
      connection_id = coalesce(connection_id, p_connection_id),
      external_contact_id = coalesce(nullif(p_external_contact_id, ''), external_contact_id),
      customer_name = coalesce(nullif(p_customer_name, ''), customer_name),
      customer_phone = coalesce(v_customer_phone, customer_phone),
      customer_email = coalesce(nullif(p_customer_email, ''), customer_email),
      customer_avatar_url = coalesce(nullif(p_customer_avatar_url, ''), customer_avatar_url),
      metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_conversation_metadata, '{}'::jsonb),
      last_message_at = case
        when last_message_at is null or p_sent_at >= last_message_at then p_sent_at
        else last_message_at
      end,
      last_message_preview = case
        when last_message_at is null or p_sent_at >= last_message_at then v_preview
        else last_message_preview
      end,
      unread_count = unread_count + case when p_direction = 'inbound' then 1 else 0 end,
      status = 'open'
  where id = v_conversation.id
    and workspace_id = v_workspace_id
    and connection_id is not distinct from p_connection_id
  returning lead_id into v_effective_lead_id;

  if v_effective_lead_id is not null
     and exists (
       select 1 from public.leads l
       where l.id = v_effective_lead_id
         and l.workspace_id = v_workspace_id
     ) then
    insert into public.activity_logs(lead_id, activity_type, title, notes, metadata)
    values (
      v_effective_lead_id,
      case
        when p_provider = 'whatsapp' then 'whatsapp'
        when p_provider = 'email' then 'email'
        else 'system'
      end,
      case when p_direction = 'outbound'
        then coalesce(nullif(p_source_label, ''), p_provider) || ' reply sent (Meta Business Suite)'
        else coalesce(nullif(p_source_label, ''), p_provider) || ' message received'
      end,
      coalesce(p_body, case when p_direction = 'outbound' then 'Outbound message.' else 'Inbound message.' end),
      jsonb_build_object(
        'provider', p_provider,
        'direction', p_direction,
        'external_message_id', p_external_message_id,
        'external_thread_id', p_external_thread_id,
        'connection_id', p_connection_id,
        'workspace_id', v_workspace_id
      )
    );

    update public.leads
    set last_contacted_at = case
          when last_contacted_at is null or p_sent_at >= last_contacted_at then p_sent_at
          else last_contacted_at
        end,
        last_activity_type = case
          when p_provider = 'whatsapp' then 'whatsapp'
          when p_provider = 'email' then 'email'
          else 'system'
        end
    where id = v_effective_lead_id
      and workspace_id = v_workspace_id;
  end if;

  return jsonb_build_object(
    'conversation_id', v_conversation.id,
    'lead_id', v_effective_lead_id,
    'message_id', v_message_id,
    'message_inserted', true
  );
end;
$$;

revoke all on function public.ingest_channel_message(uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,timestamptz,jsonb,jsonb,text)
  from public, anon, authenticated;
grant execute on function public.ingest_channel_message(uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,timestamptz,jsonb,jsonb,text)
  to service_role;

comment on function public.ingest_channel_message(uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,timestamptz,jsonb,jsonb,text) is
  'Connection/workspace-scoped idempotent channel message ingestion for service workers.';

commit;
