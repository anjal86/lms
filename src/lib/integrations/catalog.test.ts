import { describe, expect, it } from 'vitest';
import { PROVIDERS, providerSupportsOutbound } from './catalog';

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
});
