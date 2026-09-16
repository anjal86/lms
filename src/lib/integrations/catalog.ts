export type IntegrationProvider =
  | 'facebook'
  | 'instagram'
  | 'whatsapp'
  | 'tiktok'
  | 'email'
  | 'website'
  | 'api';

export type ProviderDefinition = {
  id: IntegrationProvider;
  name: string;
  shortName: string;
  description: string;
  group: 'Meta' | 'Social' | 'Messaging' | 'Owned';
  capabilities: string[];
  envKeys: string[];
  connectMode: 'meta_oauth' | 'tiktok_oauth' | 'manual';
  color: 'blue' | 'pink' | 'emerald' | 'zinc' | 'amber' | 'cyan' | 'violet';
};

export const PROVIDERS: ProviderDefinition[] = [
  {
    id: 'facebook',
    name: 'Facebook Lead Ads',
    shortName: 'Facebook',
    description: 'Connect Facebook Pages for Instant Form leads and Messenger conversations in the unified Inbox.',
    group: 'Meta',
    capabilities: ['Lead Ads', 'Messenger', 'Replies', 'Campaign source', 'Automatic routing', 'Automatic ad context'],
    envKeys: ['META_APP_ID', 'META_APP_SECRET', 'META_WEBHOOK_VERIFY_TOKEN', 'INTEGRATION_TOKEN_ENCRYPTION_KEY'],
    connectMode: 'meta_oauth',
    color: 'blue',
  },
  {
    id: 'instagram',
    name: 'Instagram Business',
    shortName: 'Instagram',
    description: 'Connect each Instagram Business account as its own messaging account in the unified Inbox.',
    group: 'Meta',
    capabilities: ['DMs', 'Replies', 'Conversation history', 'Contact matching', 'Automatic ad context'],
    envKeys: ['META_APP_ID', 'META_APP_SECRET', 'META_WEBHOOK_VERIFY_TOKEN', 'INTEGRATION_TOKEN_ENCRYPTION_KEY'],
    connectMode: 'meta_oauth',
    color: 'pink',
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp Business',
    shortName: 'WhatsApp',
    description: 'Connect official WhatsApp phone numbers or self-hosted linked devices as separate Inbox accounts.',
    group: 'Messaging',
    capabilities: ['Messages', 'Replies', 'Delivery status', 'Conversation history', 'Click-to-WhatsApp ad context'],
    envKeys: ['META_APP_ID', 'META_APP_SECRET', 'META_WEBHOOK_VERIFY_TOKEN', 'INTEGRATION_TOKEN_ENCRYPTION_KEY'],
    connectMode: 'meta_oauth',
    color: 'emerald',
  },
  {
    id: 'tiktok',
    name: 'TikTok Lead Generation',
    shortName: 'TikTok',
    description: 'Receive TikTok Instant Form leads from each advertiser account and route them into the CRM.',
    group: 'Social',
    capabilities: ['Lead forms', 'Campaign source', 'Webhook intake', 'Automatic routing'],
    envKeys: ['TIKTOK_APP_ID', 'TIKTOK_APP_SECRET', 'INTEGRATION_TOKEN_ENCRYPTION_KEY'],
    connectMode: 'tiktok_oauth',
    color: 'zinc',
  },
  {
    id: 'email',
    name: 'Email Source',
    shortName: 'Email',
    description: 'Register an email inbox as a CRM source. Outbound email replies stay disabled until an email transport is configured.',
    group: 'Messaging',
    capabilities: ['Source registration', 'CRM attribution', 'Internal notes'],
    envKeys: [],
    connectMode: 'manual',
    color: 'amber',
  },
  {
    id: 'website',
    name: 'Website & Forms',
    shortName: 'Website',
    description: 'Accept leads from websites, landing pages, booking forms, and custom forms through the secure webhook.',
    group: 'Owned',
    capabilities: ['Forms', 'UTM data', 'Campaign source', 'Duplicate detection'],
    envKeys: ['LEADS_WEBHOOK_SECRET'],
    connectMode: 'manual',
    color: 'cyan',
  },
  {
    id: 'api',
    name: 'Custom API / Automation',
    shortName: 'API',
    description: 'Connect another lead source through the secure webhook or an automation platform.',
    group: 'Owned',
    capabilities: ['Webhooks', 'Zapier/Make', 'Custom apps', 'Idempotent intake'],
    envKeys: ['LEADS_WEBHOOK_SECRET'],
    connectMode: 'manual',
    color: 'violet',
  },
];

export function getProvider(provider: string) {
  return PROVIDERS.find((item) => item.id === provider);
}

export function providerConfigured(provider: ProviderDefinition) {
  return provider.envKeys.every((key) => Boolean(process.env[key]?.trim()));
}

export function providerSupportsOutbound(provider: string) {
  return provider === 'facebook' || provider === 'instagram' || provider === 'whatsapp';
}

function withRequiredMetaScopes(provider: IntegrationProvider, scopes: string) {
  const values = scopes.split(',').map((value) => value.trim()).filter(Boolean);
  // ads_read is part of the product contract for connected Meta channels: the
  // webhook provides immediate creative context, while this permission enables
  // automatic campaign/ad-set/status enrichment. Keep explicit custom scope
  // overrides, but never let an older override silently disable the feature.
  if (['facebook', 'instagram', 'whatsapp'].includes(provider) && !values.includes('ads_read')) values.push('ads_read');
  return Array.from(new Set(values)).join(',');
}

export function metaScopes(provider: IntegrationProvider) {
  const configured = process.env[`META_${provider.toUpperCase()}_SCOPES`]?.trim();
  if (configured) return withRequiredMetaScopes(provider, configured);

  if (provider === 'facebook') {
    return withRequiredMetaScopes(provider, 'pages_show_list,pages_read_engagement,pages_manage_metadata,pages_messaging,leads_retrieval,business_management');
  }
  if (provider === 'instagram') {
    return withRequiredMetaScopes(provider, 'pages_show_list,pages_read_engagement,pages_manage_metadata,instagram_basic,instagram_manage_messages,business_management');
  }
  if (provider === 'whatsapp') {
    return withRequiredMetaScopes(provider, 'business_management,whatsapp_business_management,whatsapp_business_messaging');
  }
  return 'business_management';
}
