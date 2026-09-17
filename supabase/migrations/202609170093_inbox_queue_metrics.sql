-- Keep Inbox queue counters consistent and cheap across all connected channels.
-- One aggregate query replaces independent exact-count requests that could fail
-- independently and briefly surface false zeroes in the operator UI.

begin;

create or replace function public.inbox_queue_metrics(
  p_workspace_id uuid default public.current_workspace_id(),
  p_account_id uuid default null,
  p_provider text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_account_provider text;
  v_account_external_id text;
  v_account_status text;
  v_result jsonb;
begin
  if not public.current_user_active() then
    raise exception 'Active user required' using errcode = '42501';
  end if;

  if p_workspace_id is distinct from public.current_workspace_id() then
    raise exception 'Workspace access denied' using errcode = '42501';
  end if;

  if p_provider is not null
     and p_provider not in ('facebook','instagram','whatsapp','tiktok','email','website','api') then
    raise exception 'Invalid provider' using errcode = '22023';
  end if;

  if p_account_id is not null then
    select ic.provider, ic.external_account_id, ic.status
      into v_account_provider, v_account_external_id, v_account_status
    from public.integration_connections ic
    where ic.id = p_account_id
      and ic.workspace_id = p_workspace_id;

    if not found then
      raise exception 'Channel account not found' using errcode = '42501';
    end if;

    if v_account_status not in ('connected','paused') then
      return jsonb_build_object(
        'totalOpen', 0,
        'mine', 0,
        'unassigned', 0,
        'collaborations', 0,
        'waiting', 0,
        'snoozed', 0,
        'unread', 0,
        'needsReply', 0,
        'slaOverdue', 0,
        'highPriority', 0,
        'hasPhone', 0,
        'resolved', 0,
        'unconvertedOpen', 0
      );
    end if;

    if p_provider is not null and v_account_provider is distinct from p_provider then
      raise exception 'Channel account/provider mismatch' using errcode = '22023';
    end if;
  end if;

  with scoped as (
    select c.*
    from public.lead_conversations c
    where c.workspace_id = p_workspace_id
      and (
        case
          when p_account_id is not null then
            c.connection_id = p_account_id
            or (
              c.connection_id is null
              and (
                (
                  v_account_provider in ('facebook','instagram')
                  and c.provider = v_account_provider
                  and nullif(v_account_external_id, '') is not null
                  and c.external_thread_id like v_account_external_id || ':%'
                )
                or (v_account_provider = 'whatsapp' and c.provider = 'whatsapp')
              )
            )
          when p_provider is not null then
            c.provider = p_provider
            and (
              c.connection_id is null
              or exists (
                select 1
                from public.integration_connections ic
                where ic.id = c.connection_id
                  and ic.workspace_id = p_workspace_id
                  and ic.provider = p_provider
                  and ic.status in ('connected','paused')
              )
            )
          else
            exists (
              select 1
              from public.integration_connections ic
              where ic.id = c.connection_id
                and ic.workspace_id = p_workspace_id
                and ic.status in ('connected','paused')
            )
            or (
              c.connection_id is null
              and exists (
                select 1
                from public.integration_connections ic
                where ic.workspace_id = p_workspace_id
                  and ic.provider = c.provider
                  and ic.status in ('connected','paused')
              )
            )
        end
      )
  )
  select jsonb_build_object(
    'totalOpen', count(*) filter (where workflow_state <> 'closed'),
    'mine', count(*) filter (where workflow_state <> 'closed' and assigned_to = auth.uid()),
    'unassigned', count(*) filter (where workflow_state <> 'closed' and assigned_to is null),
    'collaborations', count(*) filter (
      where workflow_state <> 'closed'
        and exists (
          select 1
          from public.conversation_collaborators cc
          where cc.workspace_id = p_workspace_id
            and cc.conversation_id = scoped.id
            and cc.user_id = auth.uid()
        )
    ),
    'waiting', count(*) filter (where workflow_state = 'waiting'),
    'snoozed', count(*) filter (where workflow_state = 'snoozed'),
    'unread', count(*) filter (where workflow_state <> 'closed' and unread_count > 0),
    'needsReply', count(*) filter (where workflow_state <> 'closed' and needs_reply = true),
    'slaOverdue', count(*) filter (
      where workflow_state <> 'closed'
        and first_responded_at is null
        and first_response_due_at is not null
        and first_response_due_at < now()
    ),
    'highPriority', count(*) filter (
      where workflow_state <> 'closed' and priority in ('high','urgent')
    ),
    'hasPhone', count(*) filter (
      where workflow_state <> 'closed'
        and nullif(btrim(metadata ->> 'detected_phone'), '') is not null
    ),
    'resolved', count(*) filter (where workflow_state = 'closed'),
    'unconvertedOpen', count(*) filter (where workflow_state <> 'closed' and lead_id is null)
  )
  into v_result
  from scoped;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

grant execute on function public.inbox_queue_metrics(uuid, uuid, text) to authenticated;

commit;
