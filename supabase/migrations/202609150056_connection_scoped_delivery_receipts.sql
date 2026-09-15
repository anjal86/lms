-- 202609150056_connection_scoped_delivery_receipts.sql
-- Provider message ids are not assumed globally unique across multiple connected
-- channel accounts. Delivery/read receipts must resolve inside the exact connection.

begin;

create or replace function public.update_message_delivery_scoped(
  p_connection_id uuid,
  p_provider text,
  p_external_message_id text,
  p_status text,
  p_event_at timestamptz,
  p_failure_code text default null,
  p_failure_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_status text;
begin
  if p_connection_id is null then
    raise exception 'connection_id is required' using errcode = '22023';
  end if;
  if p_status not in ('sent','delivered','read','failed') then
    raise exception 'Invalid delivery status' using errcode = '22023';
  end if;

  select id, delivery_status into v_id, v_status
  from public.lead_messages
  where provider = p_provider
    and connection_id = p_connection_id
    and (external_message_id = p_external_message_id or provider_message_id = p_external_message_id)
  order by sent_at desc
  limit 1
  for update;

  if not found then return null; end if;
  if v_status = 'read' and p_status in ('sent','delivered') then return v_id; end if;
  if v_status = 'delivered' and p_status = 'sent' then return v_id; end if;

  update public.lead_messages
  set provider_message_id = coalesce(provider_message_id, p_external_message_id),
      delivery_status = p_status,
      delivered_at = case when p_status in ('delivered','read') then coalesce(delivered_at, p_event_at, now()) else delivered_at end,
      read_at = case when p_status = 'read' then coalesce(read_at, p_event_at, now()) else read_at end,
      failure_code = case when p_status = 'failed' then p_failure_code else null end,
      failure_message = case when p_status = 'failed' then p_failure_message else null end
  where id = v_id;

  return v_id;
end;
$$;

revoke all on function public.update_message_delivery_scoped(uuid,text,text,text,timestamptz,text,text)
  from public, anon, authenticated;
grant execute on function public.update_message_delivery_scoped(uuid,text,text,text,timestamptz,text,text)
  to service_role;

commit;
