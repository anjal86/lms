import { describe, expect, it } from 'vitest';
import { mergeConversationMetadata, mergeCustomerDemographics } from './customer-profile-merge';

describe('customer profile merge precedence', () => {
  it('preserves manual location over Meta enrichment while allowing non-location refreshes', () => {
    const merged = mergeCustomerDemographics(
      {
        city: 'Sydney',
        country: 'Australia',
        locationSource: 'manual',
        language: 'English',
      },
      {
        city: 'Kathmandu',
        country: 'Nepal',
        countryCode: 'NP',
        countryFlag: '🇳🇵',
        locationSource: 'meta_profile',
        language: 'Nepali',
        timezoneOffset: 5.75,
      }
    );

    expect(merged).toMatchObject({
      city: 'Sydney',
      country: 'Australia',
      locationSource: 'manual',
      language: 'Nepali',
      timezoneOffset: 5.75,
    });
    expect(merged?.countryCode).toBeUndefined();
    expect(merged?.countryFlag).toBeUndefined();
  });

  it('preserves lead-form location over lower-confidence chat heuristics', () => {
    const merged = mergeCustomerDemographics(
      {
        city: 'Austin',
        country: 'United States',
        locationSource: 'lead_form',
        formFields: [{ key: 'city', label: 'City', value: 'Austin' }],
      },
      {
        city: 'Kathmandu',
        country: 'Nepal',
        inferredFromText: true,
        locationSource: 'chat_heuristic',
      }
    );

    expect(merged?.city).toBe('Austin');
    expect(merged?.country).toBe('United States');
    expect(merged?.locationSource).toBe('lead_form');
    expect(merged?.formFields).toHaveLength(1);
    expect(merged?.inferredFromText).toBe(false);
  });

  it('allows a higher-confidence provider profile to replace a chat heuristic', () => {
    const merged = mergeCustomerDemographics(
      { city: 'Dallas', inferredFromText: true, locationSource: 'chat_heuristic' },
      { country: 'United States', countryCode: 'US', countryFlag: '🇺🇸', locationSource: 'meta_profile' }
    );

    expect(merged?.country).toBe('United States');
    expect(merged?.countryCode).toBe('US');
    expect(merged?.locationSource).toBe('meta_profile');
    expect(merged?.inferredFromText).toBe(false);
  });

  it('keeps local top-level metadata that provider refreshes omit', () => {
    const merged = mergeConversationMetadata(
      {
        detected_phone: '+61400111222',
        customer_profile: { city: 'Sydney', country: 'Australia', locationSource: 'manual' },
      },
      {
        meta_page_name: 'Travel Page',
        customer_profile: { country: 'Nepal', locationSource: 'meta_profile', timezoneOffset: 5.75 },
      }
    );

    expect(merged.detected_phone).toBe('+61400111222');
    expect(merged.meta_page_name).toBe('Travel Page');
    expect(merged.customer_profile).toMatchObject({
      city: 'Sydney',
      country: 'Australia',
      locationSource: 'manual',
      timezoneOffset: 5.75,
    });
  });
});
