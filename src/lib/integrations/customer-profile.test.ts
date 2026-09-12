import { describe, expect, it } from 'vitest';
import {
  calculateTravelerLocalTime,
  countryCodeToFlag,
  detectLocationFromText,
  extractLeadFormDemographics,
  formatTimezoneOffset,
  parseCountryFromLocale,
  parseLanguageFromLocale,
} from './customer-profile';

describe('customer-profile utils', () => {
  it('converts valid country codes to emoji flags and rejects malformed values', () => {
    expect(countryCodeToFlag('NP')).toBe('🇳🇵');
    expect(countryCodeToFlag('us')).toBe('🇺🇸');
    expect(countryCodeToFlag(' GB ')).toBe('🇬🇧');
    expect(countryCodeToFlag(null)).toBeNull();
    expect(countryCodeToFlag(undefined)).toBeNull();
    expect(countryCodeToFlag('N')).toBeNull();
    expect(countryCodeToFlag('123')).toBeNull();
    expect(countryCodeToFlag('N1')).toBeNull();
  });

  it('parses underscore, hyphenated, and script-aware BCP-47 locales', () => {
    expect(parseCountryFromLocale('ne_NP')).toMatchObject({
      country: 'Nepal',
      countryCode: 'NP',
      countryFlag: '🇳🇵',
    });
    expect(parseCountryFromLocale('en-US')).toMatchObject({
      country: 'United States',
      countryCode: 'US',
      countryFlag: '🇺🇸',
    });
    expect(parseCountryFromLocale('zh-Hant-TW')).toMatchObject({
      country: 'Taiwan',
      countryCode: 'TW',
      countryFlag: '🇹🇼',
    });
    expect(parseCountryFromLocale('en')).toEqual({ country: null, countryCode: null, countryFlag: null });
    expect(parseCountryFromLocale('not_a_valid_locale_value')).toEqual({ country: null, countryCode: null, countryFlag: null });
    expect(parseCountryFromLocale(undefined)).toEqual({ country: null, countryCode: null, countryFlag: null });
  });

  it('parses language names without throwing on malformed locales', () => {
    expect(parseLanguageFromLocale('ne_NP')).toBe('Nepali');
    expect(parseLanguageFromLocale('en-US')).toBe('English');
    expect(parseLanguageFromLocale('zh-Hant-TW')).toBe('Chinese');
    expect(parseLanguageFromLocale(undefined)).toBeNull();
    expect(parseLanguageFromLocale('---')).toBeNull();
  });

  it('formats valid timezone offsets and rejects invalid numeric values', () => {
    expect(formatTimezoneOffset(5.75).label).toContain('UTC+05:45');
    expect(formatTimezoneOffset(5.75).label).toContain('Nepal Standard Time');
    expect(formatTimezoneOffset(5.5).label).toContain('UTC+05:30');
    expect(formatTimezoneOffset(-5).label).toContain('UTC-05:00');
    expect(formatTimezoneOffset(0).label).toContain('UTC+00:00');

    for (const invalid of [NaN, Infinity, -Infinity, 14.25, -14.25]) {
      expect(formatTimezoneOffset(invalid)).toEqual({ label: null, approximateRegion: null });
    }
    expect(formatTimezoneOffset(undefined)).toEqual({ label: null, approximateRegion: null });
  });

  it('calculates traveler time independently of the runtime timezone', () => {
    const now = new Date('2026-09-12T12:00:00.000Z');
    expect(calculateTravelerLocalTime(5.75, now)).toBe('5:45 PM');
    expect(calculateTravelerLocalTime(-5, now)).toBe('7:00 AM');
    expect(calculateTravelerLocalTime(Infinity, now)).toBeNull();
    expect(calculateTravelerLocalTime(0, new Date('invalid'))).toBeNull();
  });

  it('extracts Facebook Instant Form demographics and preserves custom answers', () => {
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
    expect(demographics).toMatchObject({
      city: 'Austin',
      state: 'Texas',
      country: 'United States',
      postalCode: '78701',
      gender: 'male',
      jobTitle: 'Solutions Architect',
      companyName: 'Acme Corp',
      countryFlag: '🇺🇸',
      locationSource: 'lead_form',
    });
    expect(demographics.formFields).toHaveLength(12);
  });

  it('fails safely for missing or malformed Instant Form fields', () => {
    expect(extractLeadFormDemographics(undefined)).toEqual({ formFields: [] });
    expect(extractLeadFormDemographics(null)).toEqual({ formFields: [] });
    expect(extractLeadFormDemographics([
      { name: undefined, values: ['Kathmandu'] },
      { name: 'city', values: undefined },
      { name: 'country', values: ['', 'Nepal'] },
      { name: 42, values: ['ignored'] },
    ])).toMatchObject({ country: 'Nepal', countryFlag: '🇳🇵', locationSource: 'lead_form' });
  });

  it('detects explicit residence/origin phrases', () => {
    expect(detectLocationFromText('Hello, I am from Kathmandu and want to plan a family vacation.')).toMatchObject({
      city: 'Kathmandu',
      country: 'Nepal',
    });
    expect(detectLocationFromText('We are living in Pokhara right now.')).toMatchObject({
      city: 'Pokhara',
      country: 'Nepal',
    });
    expect(detectLocationFromText('Hi! I am based in Dallas and looking for trekking packages.').city).toBe('Dallas');
    expect(detectLocationFromText('I live in São Paulo.').city).toBe('São Paulo');
  });

  it('does not treat travel destinations as the customer home location', () => {
    expect(detectLocationFromText('I want to visit Kathmandu in October.')).toEqual({ city: null, country: null, formattedLocation: null });
    expect(detectLocationFromText('Please send me a Tokyo package for two people.')).toEqual({ city: null, country: null, formattedLocation: null });
    expect(detectLocationFromText('We are planning a holiday in Sydney next year.')).toEqual({ city: null, country: null, formattedLocation: null });
    expect(detectLocationFromText(undefined)).toEqual({ city: null, country: null, formattedLocation: null });
  });
});
