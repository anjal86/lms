-- 202609150057_omnichannel_reply_capabilities.sql
-- Keep the universal Inbox honest: only providers with implemented outbound delivery
-- expose Reply. Intake-only sources still support internal notes and CRM conversion.

begin;

update public.lead_conversations
set metadata = coalesce(metadata, '{}'::jsonb) || '{"can_reply":false}'::jsonb,
    updated_at = now()
where provider in ('tiktok','email','website','api')
  and coalesce((metadata->>'can_reply')::boolean, true) is distinct from false;

-- Supported messaging providers use their existing provider-specific reply rules.
-- Remove stale false flags created by generic intake code, while preserving explicit
-- provider restrictions such as Meta's time-window check in the application layer.
update public.lead_conversations
set metadata = coalesce(metadata, '{}'::jsonb) - 'can_reply',
    updated_at = now()
where provider in ('facebook','instagram','whatsapp')
  and metadata ? 'can_reply'
  and metadata->>'reply_disabled_reason' is null;

commit;
