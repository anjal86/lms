/**
 * Customer Profile & Demographics Extractor
 * Standardizes customer attributes collected from Meta/Facebook (Lead Ads Instant Forms,
 * Messenger Profile API, Instagram, and conversational text heuristics).
 */

export type FormAnswerField = {
  key: string;
  label: string;
  value: string;
};

export type CustomerDemographics = {
  city?: string | null;
  state?: string | null;
  country?: string | null;
  countryCode?: string | null;
  countryFlag?: string | null;
  streetAddress?: string | null;
  postalCode?: string | null;
  locale?: string | null;
  language?: string | null;
  timezoneOffset?: number | null;
  timezoneLabel?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  jobTitle?: string | null;
  companyName?: string | null;
  formFields?: FormAnswerField[];
  inferredFromText?: boolean;
};

/**
 * Convert ISO 3166-1 alpha-2 country code to emoji flag (e.g. NP -> 🇳🇵, US -> 🇺🇸)
 */
export function countryCodeToFlag(countryCode: string | null | undefined): string | null {
  if (!countryCode || countryCode.length !== 2) return null;
  const upper = countryCode.toUpperCase();
  const first = upper.codePointAt(0);
  const second = upper.codePointAt(1);
  if (!first || !second || first < 65 || first > 90 || second < 65 || second > 90) return null;
  return String.fromCodePoint(first + 127397, second + 127397);
}

/**
 * Parse country name and flag from Meta locale string (e.g., "ne_NP", "en_US", "hi_IN")
 */
export function parseCountryFromLocale(locale: string | null | undefined): {
  country: string | null;
  countryCode: string | null;
  countryFlag: string | null;
} {
  if (!locale || typeof locale !== 'string') {
    return { country: null, countryCode: null, countryFlag: null };
  }

  const parts = locale.replace('-', '_').split('_');
  const code = parts.length > 1 ? parts[1].toUpperCase() : null;

  if (!code || code.length !== 2) {
    return { country: null, countryCode: null, countryFlag: null };
  }

  try {
    const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
    const country = regionNames.of(code) || null;
    const countryFlag = countryCodeToFlag(code);
    return { country, countryCode: code, countryFlag };
  } catch {
    return { country: code, countryCode: code, countryFlag: countryCodeToFlag(code) };
  }
}

/**
 * Parse language name from Meta locale string (e.g., "ne_NP" -> "Nepali")
 */
export function parseLanguageFromLocale(locale: string | null | undefined): string | null {
  if (!locale || typeof locale !== 'string') return null;
  const langCode = locale.replace('-', '_').split('_')[0].toLowerCase();
  try {
    const langNames = new Intl.DisplayNames(['en'], { type: 'language' });
    return langNames.of(langCode) || null;
  } catch {
    return langCode;
  }
}

/**
 * Format numeric timezone offset in hours to friendly label (e.g. 5.75 -> "UTC+05:45 (Nepal Standard Time)")
 */
export function formatTimezoneOffset(tzOffsetHours: number | null | undefined): {
  label: string | null;
  approximateRegion: string | null;
} {
  if (typeof tzOffsetHours !== 'number' || Number.isNaN(tzOffsetHours)) {
    return { label: null, approximateRegion: null };
  }

  const sign = tzOffsetHours >= 0 ? '+' : '-';
  const totalMinutes = Math.round(Math.abs(tzOffsetHours) * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const formattedHours = String(hours).padStart(2, '0');
  const formattedMinutes = String(minutes).padStart(2, '0');
  const offsetString = `UTC${sign}${formattedHours}:${formattedMinutes}`;

  // Common regional timezone mapping for travel industry
  let region = '';
  if (tzOffsetHours === 5.75) region = 'Nepal Standard Time';
  else if (tzOffsetHours === 5.5) region = 'India Standard Time';
  else if (tzOffsetHours === 6) region = 'Bangladesh / Bhutan';
  else if (tzOffsetHours === 0) region = 'GMT / Western Europe';
  else if (tzOffsetHours === 1) region = 'Central European Time';
  else if (tzOffsetHours === 2) region = 'Eastern European / Cairo';
  else if (tzOffsetHours === 3) region = 'Arabia Standard / Moscow';
  else if (tzOffsetHours === 4) region = 'Gulf Standard (Dubai)';
  else if (tzOffsetHours === 7) region = 'Indochina / Bangkok';
  else if (tzOffsetHours === 8) region = 'Singapore / Hong Kong / Perth';
  else if (tzOffsetHours === 9) region = 'Japan / Korea';
  else if (tzOffsetHours === 10) region = 'Sydney / Eastern Australia';
  else if (tzOffsetHours === 11) region = 'Solomon Islands';
  else if (tzOffsetHours === 12) region = 'New Zealand';
  else if (tzOffsetHours === -5) region = 'US Eastern Time (EST)';
  else if (tzOffsetHours === -6) region = 'US Central Time (CST)';
  else if (tzOffsetHours === -7) region = 'US Mountain Time (MST)';
  else if (tzOffsetHours === -8) region = 'US Pacific Time (PST)';
  else if (tzOffsetHours === -4) region = 'Atlantic Standard';

  return {
    label: region ? `${offsetString} (${region})` : offsetString,
    approximateRegion: region || null,
  };
}

/**
 * Calculate current local time for traveler based on timezone offset hours
 */
export function calculateTravelerLocalTime(tzOffsetHours: number | null | undefined): string | null {
  if (typeof tzOffsetHours !== 'number' || Number.isNaN(tzOffsetHours)) return null;
  try {
    const now = new Date();
    const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
    const travelerDate = new Date(utcMs + (tzOffsetHours * 3600000));
    return travelerDate.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return null;
  }
}

/**
 * Normalize Facebook Lead Ads Instant Form field names to match common customer demographics
 */
export function extractLeadFormDemographics(
  fields: Array<{ name?: string; values?: string[] }> | undefined
): CustomerDemographics {
  const result: CustomerDemographics = {
    formFields: [],
  };

  if (!Array.isArray(fields) || fields.length === 0) return result;

  const valueMap = new Map<string, string>();
  for (const f of fields) {
    if (f.name && Array.isArray(f.values) && f.values[0]?.trim()) {
      const key = f.name.toLowerCase().trim();
      const val = f.values[0].trim();
      valueMap.set(key, val);
      result.formFields?.push({
        key: f.name,
        label: formatFieldLabel(f.name),
        value: val,
      });
    }
  }

  const findValue = (aliases: string[]) => {
    for (const alias of aliases) {
      const match = valueMap.get(alias.toLowerCase());
      if (match) return match;
    }
    return null;
  };

  result.city = findValue(['city', 'customer_city', 'home_city', 'current_city', 'user_city']);
  result.state = findValue(['state', 'province', 'region', 'state_province', 'state/province']);
  result.country = findValue(['country', 'customer_country', 'country_name', 'residence_country']);
  result.streetAddress = findValue(['street_address', 'address', 'street', 'address_line_1', 'home_address']);
  result.postalCode = findValue(['zip_code', 'zip', 'post_code', 'postal_code', 'postcode']);
  result.gender = findValue(['gender', 'sex']);
  result.dateOfBirth = findValue(['date_of_birth', 'dob', 'birth_date', 'birthdate']);
  result.jobTitle = findValue(['job_title', 'profession', 'occupation', 'work_title', 'position']);
  result.companyName = findValue(['company_name', 'company', 'organization', 'employer', 'workplace']);

  if (result.country) {
    // Try resolving flag if country name matches
    result.countryFlag = getCountryFlagFromName(result.country);
  }

  return result;
}

function formatFieldLabel(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

const KNOWN_COUNTRY_CODES: Record<string, string> = {
  nepal: 'NP',
  india: 'IN',
  'united states': 'US',
  usa: 'US',
  'united kingdom': 'GB',
  uk: 'GB',
  australia: 'AU',
  canada: 'CA',
  germany: 'DE',
  france: 'FR',
  japan: 'JP',
  china: 'CN',
  uae: 'AE',
  'united arab emirates': 'AE',
  qatar: 'QA',
  singapore: 'SG',
  malaysia: 'MY',
  thailand: 'TH',
};

export function getCountryFlagFromName(countryName: string): string | null {
  const code = KNOWN_COUNTRY_CODES[countryName.toLowerCase().trim()];
  return code ? countryCodeToFlag(code) : null;
}

/**
 * Heuristic location extraction from customer chat messages
 * Detects phrases like "from Kathmandu", "living in Pokhara", "based in Texas", etc.
 */
export function detectLocationFromText(text: string | null | undefined): {
  city: string | null;
  country: string | null;
  formattedLocation: string | null;
} {
  if (!text || typeof text !== 'string') {
    return { city: null, country: null, formattedLocation: null };
  }

  const patterns = [
    /(?:i am|i'm|im|we are|we're|living|located|based|staying|from)\s+(?:in|at|from)?\s*([A-Za-z\s]+?)(?:[.,!?]|\s+and|\s+now|$)/i,
    /(?:currently in|hometown is|residing in)\s+([A-Za-z\s]+?)(?:[.,!?]|$)/i,
  ];

  // Specific high-frequency cities
  const knownCities = [
    'Kathmandu', 'Pokhara', 'Lalitpur', 'Bhaktapur', 'Chitwan', 'Biratnagar',
    'Dharan', 'Butwal', 'Bhairahawa', 'Nepalgunj', 'Hetauda', 'Delhi', 'Mumbai',
    'Bangalore', 'Dubai', 'Sydney', 'Melbourne', 'London', 'New York', 'Dallas',
    'Austin', 'Toronto', 'Vancouver', 'Tokyo', 'Singapore'
  ];

  for (const city of knownCities) {
    const cityRegex = new RegExp(`\\b${city}\\b`, 'i');
    if (cityRegex.test(text)) {
      const isNepal = ['Kathmandu', 'Pokhara', 'Lalitpur', 'Bhaktapur', 'Chitwan', 'Biratnagar', 'Dharan', 'Butwal', 'Bhairahawa', 'Nepalgunj', 'Hetauda'].includes(city);
      return {
        city,
        country: isNepal ? 'Nepal' : null,
        formattedLocation: isNepal ? `${city}, Nepal` : city,
      };
    }
  }

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const raw = match[1].trim();
      if (raw.length > 2 && raw.length < 35 && !/^(here|there|home|travel|vacation|holiday)$/i.test(raw)) {
        return {
          city: raw,
          country: null,
          formattedLocation: raw,
        };
      }
    }
  }

  return { city: null, country: null, formattedLocation: null };
}
