import { describe, expect, it } from 'vitest';
import { mergeReferralObjects, normalizeMetaAdAttribution } from './ad-attribution';

describe('ad attribution normalization', () => {
  it('normalizes Click-to-WhatsApp referral data', () => {
    const result = normalizeMetaAdAttribution({
      source_url: 'https://www.facebook.com/ads/example',
      source_id: '120203456789012345',
      source_type: 'ad',
      headline: 'Study in Japan — October Intake',
      body: 'Free counselling available',
      image_url: 'https://example.com/creative.jpg',
      ctwa_clid: 'clid-123',
    }, 'whatsapp');

    expect(result).toMatchObject({
      origin: 'paid_ad',
      provider: 'whatsapp',
      platform: 'meta',
      source_id: '120203456789012345',
      headline: 'Study in Japan — October Intake',
      ctwa_clid: 'clid-123',
      media_url: 'https://example.com/creative.jpg',
    });
  });

  it('merges Messenger referral locations before normalization', () => {
    const merged = mergeReferralObjects(
      { source: 'ADS', type: 'OPEN_THREAD' },
      { ad_id: 'ad-42', ref: 'campaign-ref' },
    );
    const result = normalizeMetaAdAttribution(merged, 'facebook');
    expect(result?.ad_id).toBe('ad-42');
    expect(result?.platform).toBe('facebook');
  });

  it('ignores non-ad referral payloads with no paid-ad identifiers', () => {
    expect(normalizeMetaAdAttribution({ source: 'SHORTLINK', type: 'OPEN_THREAD' }, 'facebook')).toBeNull();
  });

  it('does not treat an organic source id as paid attribution by itself', () => {
    expect(normalizeMetaAdAttribution({ source: 'POST', source_id: 'organic-post-1', type: 'OPEN_THREAD' }, 'instagram')).toBeNull();
  });
});
