import { describe, expect, it } from 'vitest';
import { extractPhoneNumbers } from './phone-extractor';

describe('extractPhoneNumbers', () => {
  it('extracts common international and formatted phone numbers', () => {
    expect(extractPhoneNumbers('WhatsApp me on +977 9841 234 567')).toContain('+977 9841 234 567');
    expect(extractPhoneNumbers('Australia: +61 412 345 678')).toContain('+61 412 345 678');
    expect(extractPhoneNumbers('Call (415) 555-0123 after 5')).toContain('(415) 555-0123');
  });

  it('detects a plausible number without requiring phone-related wording', () => {
    expect(extractPhoneNumbers('9841234567')).toEqual(['9841234567']);
    expect(extractPhoneNumbers('okay 9863731612 tomorrow')).toEqual(['9863731612']);
  });

  it('returns every distinct plausible number from the same message', () => {
    const result = extractPhoneNumbers('Use 9841234567 or +977 9863 731 612, office 01-5453854');
    expect(result).toEqual(['9841234567', '+977 9863 731 612', '01-5453854']);
  });

  it('deduplicates equivalent formatting of the same number', () => {
    const result = extractPhoneNumbers('First +977 9841234567, again +977-9841234567');
    expect(result).toEqual(['+977 9841234567']);
  });

  it('rejects dates and values outside normal phone lengths', () => {
    expect(extractPhoneNumbers('Travel date 2026-10-25')).toEqual([]);
    expect(extractPhoneNumbers('Code 1234567')).toEqual([]);
    expect(extractPhoneNumbers('Reference 1234567890123456')).toEqual([]);
  });

  it('fails safely for empty input', () => {
    expect(extractPhoneNumbers(null)).toEqual([]);
    expect(extractPhoneNumbers(undefined)).toEqual([]);
    expect(extractPhoneNumbers('')).toEqual([]);
  });
});
