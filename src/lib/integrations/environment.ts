import { PROVIDERS, type ProviderDefinition } from './catalog';

export type IntegrationEnvStatus = {
  configured: boolean;
  required: string[];
  missing: string[];
};

export type IntegrationSetup = {
  baseUrl: string;
  urls: {
    metaOauthCallbacks: {
      facebook: string;
      instagram: string;
      whatsapp: string;
    };
    tiktokOauthCallback: string;
    metaWebhook: string;
    tiktokWebhook: string;
    leadWebhook: string;
  };
};

export function publicAppUrl(requestUrl?: string) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '');
  if (configured) return configured;
  if (requestUrl) return new URL(requestUrl).origin;
  return 'http://localhost:3000';
}

export function integrationEnvStatus(provider: ProviderDefinition): IntegrationEnvStatus {
  const missing = provider.envKeys.filter((key) => !process.env[key]?.trim());
  return {
    configured: missing.length === 0,
    required: provider.envKeys,
    missing,
  };
}

export function integrationCatalogWithEnvStatus() {
  return PROVIDERS.map((provider) => {
    const setup = integrationEnvStatus(provider);
    return {
      ...provider,
      setup,
      configured: setup.configured,
    };
  });
}

export function buildIntegrationSetup(baseUrlInput?: string): IntegrationSetup {
  const baseUrl = (baseUrlInput || publicAppUrl()).replace(/\/$/, '');
  return {
    baseUrl,
    urls: {
      metaOauthCallbacks: {
        facebook: `${baseUrl}/api/integrations/oauth/facebook/callback`,
        instagram: `${baseUrl}/api/integrations/oauth/instagram/callback`,
        whatsapp: `${baseUrl}/api/integrations/oauth/whatsapp/callback`,
      },
      tiktokOauthCallback: `${baseUrl}/api/integrations/oauth/tiktok/callback`,
      metaWebhook: `${baseUrl}/api/integrations/webhooks/meta`,
      tiktokWebhook: `${baseUrl}/api/integrations/webhooks/tiktok`,
      leadWebhook: `${baseUrl}/api/leads/webhook`,
    },
  };
}
