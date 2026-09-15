-- 202609150057_omnichannel_reply_capabilities.sql
-- Keep the universal Inbox honest: only providers with implemented outbound delivery
-- expose Reply. Intake-only sources still support internal notes and CRM conversion.

begin;

create or replace function public.provider_supports_outbound_reply(p_provider text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select lower(coalesce(p_provider, '')) in ('facebook','instagram','whatsapp');
$$;

revoke all on function public.provider_supports_outbound_reply(text) from public, anon;
grant execute on function public.provider_supports_outbound_reply(text) to authenticated, service_role;

update public.lead_conversations
set metadata = coalesce(metadata, '{}'::jsonb) || '{"can_reply":false}'::jsonb,
    updated_at = now()
where not public.provider_supports_outbound_reply(provider)
  and coalesce((metadata->>'can_reply')::boolean, true) is distinct from false;

-- Supported messaging providers use their existing provider-specific reply rules.
-- Remove stale false flags created by generic intake code, while preserving explicit
-- provider restrictions such as Meta's time-window check in the application layer.
update public.lead_conversations
set metadata = coalesce(metadata, '{}'::jsonb) - 'can_reply',
    updated_at = now()
where public.provider_supports_outbound_reply(provider)
  and metadata ? 'can_reply'
  and metadata->>'reply_disabled_reason' is null;

commit;
