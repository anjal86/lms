-- 202609150055_omnichannel_concrete_account_backfill.sql
-- Expand legacy OAuth container rows into one integration_connection per concrete
-- provider account. Existing container rows remain as hidden compatibility sources
-- for any historical thread that cannot be safely re-parented.

begin;

-- Externally routed social/messaging accounts must have one owning CRM workspace so
-- a provider webhook can never be ambiguous. Owned/manual channels are unique only
-- inside their workspace.
drop index if exists public.integration_connections_workspace_provider_external_uidx;

create unique index if not exists integration_connections_routable_external_uidx
  on public.integration_connections(provider, external_account_id)
  where external_account_id is not null
    and provider in ('facebook','instagram','whatsapp','tiktok');

create unique index if not exists integration_connections_workspace_owned_external_uidx
  on public.integration_connections(workspace_id, provider, external_account_id)
  where workspace_id is not null
    and external_account_id is not null
    and provider not in ('facebook','instagram','whatsapp','tiktok');

-- ---------------------------------------------------------------------------
-- Facebook Pages
-- ---------------------------------------------------------------------------

insert into public.integration_connections(
  workspace_id, provider, display_name, external_account_id, status, capabilities,
  config, connected_by, last_sync_at, last_event_at, last_error, visibility_scope,
  created_at, updated_at
)
select
  parent.workspace_id,
  'facebook',
  'Facebook — ' || coalesce(nullif(page->>'name',''), page->>'id'),
  page->>'id',
  parent.status,
  parent.capabilities,
  parent.config || jsonb_build_object(
    'transport','meta',
    'page_id',page->>'id',
    'page_name',page->>'name',
    'legacy_parent_id',parent.id::text,
    'hidden_from_account_picker',false
  ),
  parent.connected_by,
  parent.last_sync_at,
  parent.last_event_at,
  parent.last_error,
  'workspace',
  parent.created_at,
  now()
from public.integration_connections parent
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(parent.config->'pages') = 'array' then parent.config->'pages' else '[]'::jsonb end
) page
where parent.provider = 'facebook'
  and parent.workspace_id is not null
  and nullif(page->>'id','') is not null
  and nullif(parent.config->>'page_id','') is null
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Instagram Business accounts
-- ---------------------------------------------------------------------------

insert into public.integration_connections(
  workspace_id, provider, display_name, external_account_id, status, capabilities,
  config, connected_by, last_sync_at, last_event_at, last_error, visibility_scope,
  created_at, updated_at
)
select
  parent.workspace_id,
  'instagram',
  'Instagram — ' || coalesce(
    nullif(page->'instagram_business_account'->>'username',''),
    nullif(page->'instagram_business_account'->>'name',''),
    page->'instagram_business_account'->>'id'
  ),
  page->'instagram_business_account'->>'id',
  parent.status,
  parent.capabilities,
  parent.config || jsonb_build_object(
    'transport','meta',
    'page_id',page->>'id',
    'page_name',page->>'name',
    'instagram_business_account_id',page->'instagram_business_account'->>'id',
    'instagram_username',page->'instagram_business_account'->>'username',
    'legacy_parent_id',parent.id::text,
    'hidden_from_account_picker',false
  ),
  parent.connected_by,
  parent.last_sync_at,
  parent.last_event_at,
  parent.last_error,
  'workspace',
  parent.created_at,
  now()
from public.integration_connections parent
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(parent.config->'pages') = 'array' then parent.config->'pages' else '[]'::jsonb end
) page
where parent.provider = 'instagram'
  and parent.workspace_id is not null
  and nullif(page->'instagram_business_account'->>'id','') is not null
  and nullif(parent.config->>'instagram_business_account_id','') is null
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- WhatsApp Cloud phone numbers (linked-device/Baileys rows are already concrete).
-- ---------------------------------------------------------------------------

insert into public.integration_connections(
  workspace_id, provider, display_name, external_account_id, status, capabilities,
  config, connected_by, last_sync_at, last_event_at, last_error, visibility_scope,
  created_at, updated_at
)
select
  parent.workspace_id,
  'whatsapp',
  'WhatsApp — ' || coalesce(
    nullif(phone->>'verified_name',''),
    nullif(phone->>'display_phone_number',''),
    phone->>'id'
  ),
  phone->>'id',
  parent.status,
  parent.capabilities,
  parent.config || jsonb_build_object(
    'transport','cloud',
    'waba_id',waba->>'id',
    'waba_name',waba->>'name',
    'business_id',waba->>'business_id',
    'phone_number_id',phone->>'id',
    'display_phone_number',phone->>'display_phone_number',
    'verified_name',phone->>'verified_name',
    'whatsapp_business_accounts',jsonb_build_array(
      jsonb_build_object(
        'id',waba->>'id',
        'name',waba->>'name',
        'business_id',waba->>'business_id',
        'phone_numbers',jsonb_build_array(phone)
      )
    ),
    'legacy_parent_id',parent.id::text,
    'hidden_from_account_picker',false
  ),
  parent.connected_by,
  parent.last_sync_at,
  parent.last_event_at,
  parent.last_error,
  'workspace',
  parent.created_at,
  now()
from public.integration_connections parent
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(parent.config->'whatsapp_business_accounts') = 'array'
    then parent.config->'whatsapp_business_accounts' else '[]'::jsonb end
) waba
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(waba->'phone_numbers') = 'array' then waba->'phone_numbers' else '[]'::jsonb end
) phone
where parent.provider = 'whatsapp'
  and parent.workspace_id is not null
  and coalesce(parent.config->>'transport','') <> 'baileys'
  and nullif(parent.config->>'phone_number_id','') is null
  and nullif(phone->>'id','') is not null
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- TikTok advertisers. The first legacy advertiser may already be the parent row;
-- create concrete rows for the remaining advertisers and shrink the parent config.
-- ---------------------------------------------------------------------------

insert into public.integration_connections(
  workspace_id, provider, display_name, external_account_id, status, capabilities,
  config, connected_by, last_sync_at, last_event_at, last_error, visibility_scope,
  created_at, updated_at
)
select
  parent.workspace_id,
  'tiktok',
  'TikTok Ads — ' || advertiser_id,
  advertiser_id,
  parent.status,
  parent.capabilities,
  parent.config || jsonb_build_object(
    'transport','tiktok_business',
    'advertiser_id',advertiser_id,
    'advertiser_ids',jsonb_build_array(advertiser_id),
    'legacy_parent_id',parent.id::text,
    'hidden_from_account_picker',false
  ),
  parent.connected_by,
  parent.last_sync_at,
  parent.last_event_at,
  parent.last_error,
  'workspace',
  parent.created_at,
  now()
from public.integration_connections parent
cross join lateral jsonb_array_elements_text(
  case when jsonb_typeof(parent.config->'advertiser_ids') = 'array'
    then parent.config->'advertiser_ids' else '[]'::jsonb end
) advertiser_id
where parent.provider = 'tiktok'
  and parent.workspace_id is not null
  and nullif(advertiser_id,'') is not null
  and advertiser_id is distinct from parent.external_account_id
on conflict do nothing;

update public.integration_connections
set config = config || jsonb_build_object(
      'transport','tiktok_business',
      'advertiser_id',external_account_id,
      'advertiser_ids',jsonb_build_array(external_account_id)
    ),
    updated_at = now()
where provider = 'tiktok'
  and external_account_id is not null
  and jsonb_typeof(config->'advertiser_ids') = 'array'
  and jsonb_array_length(config->'advertiser_ids') > 1;

-- Duplicate the encrypted credential material from legacy OAuth containers into
-- the new concrete rows. The ciphertext remains ciphertext; this migration never
-- decrypts provider credentials.
insert into public.integration_secrets(
  connection_id, access_token, refresh_token, token_expires_at, webhook_secret,
  secret_payload, updated_at
)
select
  child.id,
  parent_secret.access_token,
  parent_secret.refresh_token,
  parent_secret.token_expires_at,
  parent_secret.webhook_secret,
  parent_secret.secret_payload,
  now()
from public.integration_connections child
join public.integration_connections parent
  on nullif(child.config->>'legacy_parent_id','') = parent.id::text
join public.integration_secrets parent_secret on parent_secret.connection_id = parent.id
where child.id <> parent.id
on conflict (connection_id) do nothing;

-- Mark Facebook/Instagram/Cloud-WhatsApp OAuth containers hidden. They remain
-- connected so any historical conversation that cannot be safely mapped keeps
-- working until it is naturally retired or manually reconnected.
update public.integration_connections
set config = config || '{"legacy_container":true,"hidden_from_account_picker":true}'::jsonb,
    updated_at = now()
where provider in ('facebook','instagram','whatsapp')
  and (
    (provider in ('facebook','instagram')
      and jsonb_typeof(config->'pages') = 'array'
      and nullif(config->>'page_id','') is null
      and nullif(config->>'instagram_business_account_id','') is null)
    or
    (provider = 'whatsapp'
      and coalesce(config->>'transport','') <> 'baileys'
      and jsonb_typeof(config->'whatsapp_business_accounts') = 'array'
      and nullif(config->>'phone_number_id','') is null)
  );

-- Re-parent Facebook/Instagram conversations by their account id. Both webhook
-- implementations store account_id in metadata and prefix external_thread_id with it.
update public.lead_conversations conversation
set connection_id = child.id,
    updated_at = now()
from public.integration_connections parent,
     public.integration_connections child
where conversation.connection_id = parent.id
  and parent.provider in ('facebook','instagram')
  and parent.config->>'legacy_container' = 'true'
  and child.provider = parent.provider
  and child.workspace_id = parent.workspace_id
  and child.config->>'legacy_parent_id' = parent.id::text
  and child.external_account_id = coalesce(
    nullif(conversation.metadata->>'account_id',''),
    nullif(split_part(coalesce(conversation.external_thread_id,''),':',1),'')
  );

-- Re-parent WhatsApp Cloud conversations by the receiving phone_number_id stored
-- on the conversation metadata.
update public.lead_conversations conversation
set connection_id = child.id,
    updated_at = now()
from public.integration_connections parent,
     public.integration_connections child
where conversation.connection_id = parent.id
  and parent.provider = 'whatsapp'
  and parent.config->>'legacy_container' = 'true'
  and child.provider = 'whatsapp'
  and child.workspace_id = parent.workspace_id
  and child.config->>'legacy_parent_id' = parent.id::text
  and child.external_account_id = nullif(conversation.metadata->>'phone_number_id','');

-- Messages always inherit their concrete account from the owning conversation.
update public.lead_messages message
set connection_id = conversation.connection_id
from public.lead_conversations conversation
where message.conversation_id = conversation.id
  and conversation.connection_id is not null
  and message.connection_id is distinct from conversation.connection_id;

-- Re-parent provider-created opportunities when their source metadata identifies a
-- concrete account. Phone/email identity continues to unify the underlying Contact.
update public.leads lead
set source_connection_id = child.id,
    updated_at = now()
from public.integration_connections child
where lead.workspace_id = child.workspace_id
  and lead.source_channel = child.provider
  and child.external_account_id = coalesce(
    nullif(lead.source_metadata->>'page_id',''),
    nullif(lead.source_metadata->>'account_id',''),
    nullif(lead.source_metadata->>'phone_number_id',''),
    nullif(lead.source_metadata->>'advertiser_id','')
  )
  and lead.source_connection_id is distinct from child.id;

commit;
