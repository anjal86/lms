-- Chatwoot webhook signing secrets belong to individual Chatwoot webhooks/accounts.
-- Store them encrypted per CRM workspace mapping instead of relying on one
-- installation-wide plaintext environment value.

begin;

alter table public.chatwoot_accounts
  add column if not exists webhook_secret_encrypted text;

comment on column public.chatwoot_accounts.webhook_secret_encrypted is
  'AES-GCM encrypted Chatwoot webhook signing secret. Service role only; never return to clients.';

commit;
