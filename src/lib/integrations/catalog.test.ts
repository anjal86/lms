import { afterEach, describe, expect, it } from 'vitest';
import { PROVIDERS, metaScopes, providerSupportsOutbound } from './catalog';

const originalFacebookScopes = process.env.META_FACEBOOK_SCOPES;
const originalInstagramScopes = process.env.META_INSTAGRAM_SCOPES;
const originalWhatsappScopes = process.env.META_WHATSAPP_SCOPES;

afterEach(() => {
  if (originalFacebookScopes === undefined) delete process.env.META_FACEBOOK_SCOPES;
  else process.env.META_FACEBOOK_SCOPES = originalFacebookScopes;
  if (originalInstagramScopes === undefined) delete process.env.META_INSTAGRAM_SCOPES;
  else process.env.META_INSTAGRAM_SCOPES = originalInstagramScopes;
  if (originalWhatsappScopes === undefined) delete process.env.META_WHATSAPP_SCOPES;
  else process.env.META_WHATSAPP_SCOPES = originalWhatsappScopes;
});

describe('integration catalog', () => {
  it('keeps implemented messaging channels reply-capable', () => {
    expect(providerSupportsOutbound('facebook')).toBe(true);
    expect(providerSupportsOutbound('instagram')).toBe(true);
    expect(providerSupportsOutbound('whatsapp')).toBe(true);
  });

  it('keeps lead and intake-only sources non-replyable', () => {
    expect(providerSupportsOutbound('tiktok')).toBe(false);
    expect(providerSupportsOutbound('email')).toBe(false);
    expect(providerSupportsOutbound('website')).toBe(false);
    expect(providerSupportsOutbound('api')).toBe(false);
  });

  it('does not advertise unimplemented email reply capabilities', () => {
    const email = PROVIDERS.find((provider) => provider.id === 'email');
    expect(email).toBeDefined();
    expect(email?.capabilities).not.toContain('Replies');
    expect(email?.capabilities).not.toContain('Attachments');
  });

  it('requests ads_read for all Meta channels so ad context can enrich automatically', () => {
    delete process.env.META_FACEBOOK_SCOPES;
    delete process.env.META_INSTAGRAM_SCOPES;
    delete process.env.META_WHATSAPP_SCOPES;
    expect(metaScopes('facebook').split(',')).toContain('ads_read');
    expect(metaScopes('instagram').split(',')).toContain('ads_read');
    expect(metaScopes('whatsapp').split(',')).toContain('ads_read');
  });

  it('preserves custom Meta scopes while appending ads_read exactly once', () => {
    process.env.META_FACEBOOK_SCOPES = 'pages_messaging,business_management';
    const scopes = metaScopes('facebook').split(',');
    expect(scopes).toContain('pages_messaging');
    expect(scopes).toContain('business_management');
    expect(scopes.filter((scope) => scope === 'ads_read')).toHaveLength(1);
  });
});
