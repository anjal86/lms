-- Keep the operator-facing Inbox list and queue counters index-backed.
-- These complement the older legacy-status index with the workflow_state fields
-- used by the current omnichannel Inbox API.

begin;

create index if not exists lead_conversations_workspace_open_message_idx
  on public.lead_conversations(workspace_id, last_message_at desc nulls last)
  where workflow_state <> 'closed';

create index if not exists lead_conversations_workspace_state_message_idx
  on public.lead_conversations(workspace_id, workflow_state, last_message_at desc nulls last);

create index if not exists lead_conversations_workspace_open_assignee_idx
  on public.lead_conversations(workspace_id, assigned_to)
  where workflow_state <> 'closed';

create index if not exists lead_conversations_workspace_connection_open_message_idx
  on public.lead_conversations(workspace_id, connection_id, last_message_at desc nulls last)
  where workflow_state <> 'closed';

create index if not exists lead_conversations_workspace_provider_open_message_idx
  on public.lead_conversations(workspace_id, provider, last_message_at desc nulls last)
  where workflow_state <> 'closed';

create index if not exists lead_conversations_workspace_unread_open_idx
  on public.lead_conversations(workspace_id, last_message_at desc nulls last)
  where workflow_state <> 'closed' and unread_count > 0;

create index if not exists lead_conversations_workspace_priority_open_idx
  on public.lead_conversations(workspace_id, priority, last_message_at desc nulls last)
  where workflow_state <> 'closed' and priority in ('high', 'urgent');

create index if not exists lead_conversations_workspace_sla_open_idx
  on public.lead_conversations(workspace_id, first_response_due_at)
  where workflow_state <> 'closed'
    and first_responded_at is null
    and first_response_due_at is not null;

create index if not exists lead_conversations_workspace_snooze_due_idx
  on public.lead_conversations(workspace_id, snoozed_until)
  where workflow_state = 'snoozed' and snoozed_until is not null;

commit;
