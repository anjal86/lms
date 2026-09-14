-- 202609120049_collaboration_notification_type.sql
-- Allow durable collaborator notifications created by migration 048.

begin;

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'lead_assigned',
    'sla_breach',
    'follow_up_due',
    'reassignment',
    'system',
    'collaboration'
  ));

commit;
