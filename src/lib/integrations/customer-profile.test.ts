import { describe, expect, it } from 'vitest';
import {
  countryCodeToFlag,
  parseCountryFromLocale,
  formatTimezoneOffset,
  extractLeadFormDemographics,
  detectLocationFromText,
} from './customer-profile';

describe('customer-profile utils', () => {
  it('converts country code to emoji flag', () => {
    expect(countryCodeToFlag('NP')).toBe('🇳🇵');
    expect(countryCodeToFlag('US')).toBe('🇺🇸');
    expect(countryCodeToFlag('IN')).toBe('🇮🇳');
    expect(countryCodeToFlag('GB')).toBe('🇬🇧');
    expect(countryCodeToFlag(null)).toBeNull();
  });

  it('parses country and flag from locale', () => {
    const np = parseCountryFromLocale('ne_NP');
    expect(np.country).toBe('Nepal');
    expect(np.countryCode).toBe('NP');
    expect(np.countryFlag).toBe('🇳🇵');

    const us = parseCountryFromLocale('en_US');
    expect(us.country).toBe('United States');
    expect(us.countryCode).toBe('US');
    expect(us.countryFlag).toBe('🇺🇸');
  });

  it('formats timezone offset with friendly labels', () => {
    const nepalTz = formatTimezoneOffset(5.75);
    expect(nepalTz.label).toContain('UTC+05:45');
    expect(nepalTz.label).toContain('Nepal Standard Time');

    const indiaTz = formatTimezoneOffset(5.5);
    expect(indiaTz.label).toContain('UTC+05:30');
    expect(indiaTz.label).toContain('India Standard Time');

    const estTz = formatTimezoneOffset(-5);
    expect(estTz.label).toContain('UTC-05:00');
  });

  it('extracts Facebook Lead Ads Instant Form demographics and custom answers', () => {
    const fieldData = [
      { name: 'full_name', values: ['Liam Henderson'] },
      { name: 'phone_number', values: ['+1555019248'] },
      { name: 'email', values: ['liam@example.com'] },
      { name: 'city', values: ['Austin'] },
      { name: 'state', values: ['Texas'] },
      { name: 'country', values: ['United States'] },
      { name: 'zip_code', values: ['78701'] },
      { name: 'gender', values: ['male'] },
      { name: 'job_title', values: ['Solutions Architect'] },
      { name: 'company_name', values: ['Acme Corp'] },
      { name: 'preferred_travel_month', values: ['October 2026'] },
      { name: 'number_of_travelers', values: ['4 Adults'] },
    ];

    const demographics = extractLeadFormDemographics(fieldData);
    expect(demographics.city).toBe('Austin');
    expect(demographics.state).toBe('Texas');
    expect(demographics.country).toBe('United States');
    expect(demographics.postalCode).toBe('78701');
    expect(demographics.gender).toBe('male');
    expect(demographics.jobTitle).toBe('Solutions Architect');
    expect(demographics.companyName).toBe('Acme Corp');
    expect(demographics.countryFlag).toBe('🇺🇸');
    expect(demographics.formFields?.length).toBe(12);
  });

  it('detects location mentions from chat message text heuristics', () => {
    const res1 = detectLocationFromText('Hello, I am writing from Kathmandu and want to plan a family vacation.');
    expect(res1.city).toBe('Kathmandu');
    expect(res1.country).toBe('Nepal');

    const res2 = detectLocationFromText('We are living in Pokhara right now.');
    expect(res2.city).toBe('Pokhara');
    expect(res2.country).toBe('Nepal');

    const res3 = detectLocationFromText('Hi! I am based in Dallas and looking for trekking packages.');
    expect(res3.city).toBe('Dallas');
  });
});
