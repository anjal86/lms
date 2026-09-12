/**
 * Customer Profile & Demographics Extractor
 * Standardizes customer attributes collected from Meta/Facebook (Lead Ads Instant Forms,
 * Messenger Profile API, Instagram, and conversational text heuristics).
 */

export type CustomerLocationSource = 'manual' | 'lead_form' | 'meta_profile' | 'chat_heuristic' | 'existing_lead';

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
  locationSource?: CustomerLocationSource | null;
};

function emptyCountryResult() {
  return { country: null, countryCode: null, countryFlag: null };
}

function normalizeLocale(locale: string) {
  return locale.trim().replace(/_/g, '-');
}

function localeParts(locale: string): { language: string | null; region: string | null } {
  const normalized = normalizeLocale(locale);
  if (!normalized) return { language: null, region: null };

  try {
    const parsed = new Intl.Locale(normalized);
    return {
      language: parsed.language || null,
      region: parsed.region?.toUpperCase() || null,
    };
  } catch {
    const parts = normalized.split('-').filter(Boolean);
    const language = /^[A-Za-z]{2,3}$/.test(parts[0] || '') ? parts[0].toLowerCase() : null;
    const regionPart = parts.find((part, index) => index > 0 && /^[A-Za-z]{2}$/.test(part));
    return { language, region: regionPart?.toUpperCase() || null };
  }
}

export function countryCodeToFlag(countryCode: string | null | undefined): string | null {
  if (!countryCode || typeof countryCode !== 'string') return null;
  const upper = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return null;
  const first = upper.codePointAt(0);
  const second = upper.codePointAt(1);
  if (!first || !second) return null;
  return String.fromCodePoint(first + 127397, second + 127397);
}

export function parseCountryFromLocale(locale: string | null | undefined): {
  country: string | null;
  countryCode: string | null;
  countryFlag: string | null;
} {
  if (!locale || typeof locale !== 'string') return emptyCountryResult();
  const { region: code } = localeParts(locale);
  if (!code || !/^[A-Z]{2}$/.test(code)) return emptyCountryResult();

  try {
    const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
    const country = regionNames.of(code);
    if (!country || country === code) return emptyCountryResult();
    return { country, countryCode: code, countryFlag: countryCodeToFlag(code) };
  } catch {
    return { country: code, countryCode: code, countryFlag: countryCodeToFlag(code) };
  }
}

export function parseLanguageFromLocale(locale: string | null | undefined): string | null {
  if (!locale || typeof locale !== 'string') return null;
  const { language } = localeParts(locale);
  if (!language) return null;
  try {
    const langNames = new Intl.DisplayNames(['en'], { type: 'language' });
    const display = langNames.of(language);
    return display && display !== language ? display : null;
  } catch {
    return language;
  }
}

function isValidTimezoneOffset(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -14 && value <= 14;
}

export function formatTimezoneOffset(tzOffsetHours: number | null | undefined): {
  label: string | null;
  approximateRegion: string | null;
} {
  if (!isValidTimezoneOffset(tzOffsetHours)) return { label: null, approximateRegion: null };

  const sign = tzOffsetHours >= 0 ? '+' : '-';
  const totalMinutes = Math.round(Math.abs(tzOffsetHours) * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const offsetString = `UTC${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

  let region = '';
  if (tzOffsetHours === 5.75) region = 'Nepal Standard Time';
  else if (tzOffsetHours === 5.5) region = 'India Standard Time';
  else if (tzOffsetHours === 6) region = 'Bangladesh / Bhutan';
  else if (tzOffsetHours === 0) region = 'GMT';
  else if (tzOffsetHours === 1) region = 'Central Europe offset (approx.)';
  else if (tzOffsetHours === 2) region = 'Eastern Europe offset (approx.)';
  else if (tzOffsetHours === 3) region = 'Arabia / Moscow offset (approx.)';
  else if (tzOffsetHours === 4) region = 'Gulf Standard Time';
  else if (tzOffsetHours === 7) region = 'Indochina / Bangkok';
  else if (tzOffsetHours === 8) region = 'Singapore / Hong Kong / Perth';
  else if (tzOffsetHours === 9) region = 'Japan / Korea';
  else if (tzOffsetHours === 10) region = 'Eastern Australia offset (approx.)';
  else if (tzOffsetHours === 11) region = 'Solomon Islands';
  else if (tzOffsetHours === 12) region = 'New Zealand offset (approx.)';
  else if (tzOffsetHours === -5) region = 'Eastern North America offset (approx.)';
  else if (tzOffsetHours === -6) region = 'Central North America offset (approx.)';
  else if (tzOffsetHours === -7) region = 'Mountain North America offset (approx.)';
  else if (tzOffsetHours === -8) region = 'Pacific North America offset (approx.)';
  else if (tzOffsetHours === -4) region = 'Atlantic offset (approx.)';

  return {
    label: region ? `${offsetString} (${region})` : offsetString,
    approximateRegion: region || null,
  };
}

export function calculateTravelerLocalTime(
  tzOffsetHours: number | null | undefined,
  now: Date = new Date()
): string | null {
  if (!isValidTimezoneOffset(tzOffsetHours) || Number.isNaN(now.getTime())) return null;
  try {
    const travelerDate = new Date(now.getTime() + tzOffsetHours * 3_600_000);
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(travelerDate);
  } catch {
    return null;
  }
}

type LeadFormField = { name?: unknown; values?: unknown };

export function extractLeadFormDemographics(fields: LeadFormField[] | null | undefined): CustomerDemographics {
  const result: CustomerDemographics = { formFields: [] };
  if (!Array.isArray(fields) || fields.length === 0) return result;

  const valueMap = new Map<string, string>();
  for (const field of fields) {
    if (!field || typeof field !== 'object' || typeof field.name !== 'string' || !Array.isArray(field.values)) continue;
    const firstValue = field.values.find((value): value is string => typeof value === 'string' && Boolean(value.trim()));
    if (!firstValue) continue;
    const key = field.name.toLowerCase().trim();
    const value = firstValue.trim();
    if (!key) continue;
    valueMap.set(key, value);
    result.formFields?.push({ key: field.name, label: formatFieldLabel(field.name), value });
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

  if (result.country) result.countryFlag = getCountryFlagFromName(result.country);
  if (result.city || result.country) result.locationSource = 'lead_form';
  return result;
}

function formatFieldLabel(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

const KNOWN_COUNTRY_CODES: Record<string, string> = {
  nepal: 'NP', india: 'IN', 'united states': 'US', usa: 'US', 'united states of america': 'US',
  'united kingdom': 'GB', uk: 'GB', australia: 'AU', canada: 'CA', germany: 'DE', france: 'FR',
  japan: 'JP', china: 'CN', uae: 'AE', 'united arab emirates': 'AE', qatar: 'QA', singapore: 'SG',
  malaysia: 'MY', thailand: 'TH', 'new zealand': 'NZ', bangladesh: 'BD', bhutan: 'BT',
  'south korea': 'KR', korea: 'KR', 'saudi arabia': 'SA', italy: 'IT', spain: 'ES', switzerland: 'CH',
};

export function getCountryFlagFromName(countryName: string): string | null {
  if (!countryName || typeof countryName !== 'string') return null;
  const code = KNOWN_COUNTRY_CODES[countryName.toLowerCase().trim()];
  return code ? countryCodeToFlag(code) : null;
}

const KNOWN_CITY_NAMES = new Map<string, { city: string; country: string | null }>([
  ['kathmandu', { city: 'Kathmandu', country: 'Nepal' }],
  ['pokhara', { city: 'Pokhara', country: 'Nepal' }],
  ['lalitpur', { city: 'Lalitpur', country: 'Nepal' }],
  ['bhaktapur', { city: 'Bhaktapur', country: 'Nepal' }],
  ['chitwan', { city: 'Chitwan', country: 'Nepal' }],
  ['biratnagar', { city: 'Biratnagar', country: 'Nepal' }],
  ['dharan', { city: 'Dharan', country: 'Nepal' }],
  ['butwal', { city: 'Butwal', country: 'Nepal' }],
  ['bhairahawa', { city: 'Bhairahawa', country: 'Nepal' }],
  ['nepalgunj', { city: 'Nepalgunj', country: 'Nepal' }],
  ['hetauda', { city: 'Hetauda', country: 'Nepal' }],
  ['delhi', { city: 'Delhi', country: null }], ['mumbai', { city: 'Mumbai', country: null }],
  ['bangalore', { city: 'Bangalore', country: null }], ['bengaluru', { city: 'Bengaluru', country: null }],
  ['dubai', { city: 'Dubai', country: null }], ['sydney', { city: 'Sydney', country: null }],
  ['melbourne', { city: 'Melbourne', country: null }], ['london', { city: 'London', country: null }],
  ['new york', { city: 'New York', country: null }], ['dallas', { city: 'Dallas', country: null }],
  ['austin', { city: 'Austin', country: null }], ['toronto', { city: 'Toronto', country: null }],
  ['vancouver', { city: 'Vancouver', country: null }], ['tokyo', { city: 'Tokyo', country: null }],
  ['singapore', { city: 'Singapore', country: null }],
]);

function cleanDetectedPlace(raw: string) {
  return raw.trim().replace(/\s+/g, ' ').replace(/[.,!?;:]+$/g, '').trim();
}

export function detectLocationFromText(text: string | null | undefined): {
  city: string | null;
  country: string | null;
  formattedLocation: string | null;
} {
  if (!text || typeof text !== 'string') return { city: null, country: null, formattedLocation: null };

  const place = String.raw`([\p{L}\p{M}][\p{L}\p{M}\s.'’-]{1,49}?)`;
  const end = String.raw`(?=[.,!?;:]|\s+(?:right\s+now|at\s+the\s+moment|and|but|now|currently|looking|want|would|planning|interested|need|travel|travelling|traveling)\b|$)`;
  const patterns = [
    new RegExp(String.raw`\b(?:i\s+am|i'm|im|we\s+are|we're)\s+from\s+${place}${end}`, 'iu'),
    new RegExp(String.raw`\b(?:i\s+live|we\s+live|living|based|located|staying|residing)\s+(?:in|at)\s+${place}${end}`, 'iu'),
    new RegExp(String.raw`\b(?:currently\s+living|currently\s+based|currently\s+located|currently\s+residing)\s+(?:in|at)\s+${place}${end}`, 'iu'),
    new RegExp(String.raw`\b(?:my\s+hometown|my\s+home\s+town|my\s+home\s+city|my\s+city|hometown)\s+(?:is|:)\s*${place}${end}`, 'iu'),
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const raw = cleanDetectedPlace(match[1]);
    if (raw.length < 2 || raw.length > 50 || /^(here|there|home|abroad|overseas)$/iu.test(raw)) continue;

    const known = KNOWN_CITY_NAMES.get(raw.toLowerCase());
    const city = known?.city || raw;
    const country = known?.country || null;
    return {
      city,
      country,
      formattedLocation: country ? `${city}, ${country}` : city,
    };
  }

  return { city: null, country: null, formattedLocation: null };
}
