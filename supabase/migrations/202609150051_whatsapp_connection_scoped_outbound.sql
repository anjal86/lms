-- 202609150051_whatsapp_connection_scoped_outbound.sql
-- Provider message IDs are only unique inside an integration connection.

begin;

create or replace function public.finalize_outbound_message(
  p_message_id uuid,
  p_external_message_id text,
  p_sent_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pending public.lead_messages%rowtype;
  v_existing public.lead_messages%rowtype;
  v_result uuid;
begin
  select * into v_pending
  from public.lead_messages
  where id = p_message_id
  for update;

  if not found then
    raise exception 'Pending outbound message not found' using errcode = 'P0002';
  end if;

  if nullif(p_external_message_id, '') is null then
    raise exception 'external_message_id is required' using errcode = '22023';
  end if;

  select * into v_existing
  from public.lead_messages
  where provider = v_pending.provider
    and external_message_id = p_external_message_id
    and connection_id is not distinct from v_pending.connection_id
    and id <> p_message_id
  for update;

  if found then
    update public.lead_messages
    set client_request_id = null
    where id = p_message_id;

    update public.lead_messages
    set conversation_id = coalesce(conversation_id, v_pending.conversation_id),
        lead_id = coalesce(lead_id, v_pending.lead_id),
        connection_id = coalesce(connection_id, v_pending.connection_id),
        direction = 'outbound',
        message_type = coalesce(nullif(v_pending.message_type, ''), message_type),
        body = coalesce(v_pending.body, body),
        metadata = coalesce(metadata, '{}'::jsonb) || coalesce(v_pending.metadata, '{}'::jsonb),
        created_by = coalesce(v_pending.created_by, created_by),
        client_request_id = v_pending.client_request_id,
        delivery_status = 'sent',
        sent_at = coalesce(p_sent_at, v_pending.sent_at, sent_at)
    where id = v_existing.id
    returning id into v_result;

    delete from public.lead_messages where id = p_message_id;
    return v_result;
  end if;

  update public.lead_messages
  set external_message_id = p_external_message_id,
      delivery_status = 'sent',
      sent_at = coalesce(p_sent_at, sent_at)
  where id = p_message_id
  returning id into v_result;

  return v_result;
end;
$$;

revoke all on function public.finalize_outbound_message(uuid,text,timestamptz) from public, anon, authenticated;
grant execute on function public.finalize_outbound_message(uuid,text,timestamptz) to service_role;

commit;
