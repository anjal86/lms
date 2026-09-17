import { afterEach, describe, expect, it, vi } from 'vitest';
import { PROVIDERS } from './catalog';
import { buildIntegrationSetup, integrationEnvStatus } from './environment';

const ORIGINAL_ENV = process.env;

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllEnvs();
});

describe('integrationEnvStatus', () => {
  it('reports missing server-only OAuth credentials without exposing values', () => {
    vi.stubEnv('META_APP_ID', 'meta-id');
    vi.stubEnv('META_APP_SECRET', '');
    vi.stubEnv('TIKTOK_APP_ID', 'tiktok-id');
    vi.stubEnv('TIKTOK_APP_SECRET', 'tiktok-secret');
    vi.stubEnv('INTEGRATION_TOKEN_ENCRYPTION_KEY', '0000000000000000000000000000000000000000000000000000000000000000');

    const facebook = integrationEnvStatus(PROVIDERS.find((provider) => provider.id === 'facebook')!);
    const tiktok = integrationEnvStatus(PROVIDERS.find((provider) => provider.id === 'tiktok')!);

    expect(facebook).toEqual({
      configured: false,
      required: ['META_APP_ID', 'META_APP_SECRET', 'META_WEBHOOK_VERIFY_TOKEN', 'INTEGRATION_TOKEN_ENCRYPTION_KEY'],
      missing: ['META_APP_SECRET', 'META_WEBHOOK_VERIFY_TOKEN'],
    });
    expect(tiktok.configured).toBe(true);
    expect(JSON.stringify(tiktok)).not.toContain('tiktok-secret');
  });
});

describe('buildIntegrationSetup', () => {
  it('returns exact callback and webhook URLs administrators must configure', () => {
    const setup = buildIntegrationSetup('https://crm.example.com/');

    expect(setup.urls).toEqual({
      metaOauthCallbacks: {
        facebook: 'https://crm.example.com/api/integrations/oauth/facebook/callback',
        instagram: 'https://crm.example.com/api/integrations/oauth/instagram/callback',
        whatsapp: 'https://crm.example.com/api/integrations/oauth/whatsapp/callback',
      },
      tiktokOauthCallback: 'https://crm.example.com/api/integrations/oauth/tiktok/callback',
      metaWebhook: 'https://crm.example.com/api/integrations/webhooks/meta',
      tiktokWebhook: 'https://crm.example.com/api/integrations/webhooks/tiktok',
      chatwootWebhook: 'https://crm.example.com/api/integrations/webhooks/chatwoot',
      leadWebhook: 'https://crm.example.com/api/leads/webhook',
    });
  });
});
