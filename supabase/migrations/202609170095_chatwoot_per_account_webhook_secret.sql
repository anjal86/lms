-- Chatwoot webhook signing secrets belong to individual Chatwoot webhooks/accounts.
-- Store them encrypted per CRM workspace mapping instead of relying on one
-- installation-wide plaintext environment value.

begin;

alter table public.chatwoot_accounts
  add column if not exists webhook_secret_encrypted text;

comment on column public.chatwoot_accounts.webhook_secret_encrypted is
  'AES-GCM encrypted Chatwoot webhook signing secret. Service role only; never return to clients.';

-- RLS controls rows, not columns. Replace the table-wide authenticated SELECT
-- grant with an explicit safe-column grant so ciphertext never reaches browsers.
revoke select on table public.chatwoot_accounts from authenticated;
grant select (
  id,
  workspace_id,
  chatwoot_account_id,
  name,
  status,
  last_verified_at,
  created_at,
  updated_at
) on table public.chatwoot_accounts to authenticated;

commit;
