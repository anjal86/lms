import 'server-only';
import { isAllowedMediaHostname } from '@/lib/security/media-proxy';
import { metaFetchJson } from '@/lib/integrations/meta-http';

import {
  CustomerDemographics,
  parseCountryFromLocale,
  parseLanguageFromLocale,
  formatTimezoneOffset,
} from '@/lib/integrations/customer-profile';

export type MetaProfileProvider = 'facebook' | 'instagram';

export type MetaCustomerProfile = {
  id: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  demographics?: CustomerDemographics | null;
};

function cleanAvatarUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    if (!isAllowedMediaHostname(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function shouldRetryWithBasicFields(response: Response, data: Record<string, unknown>) {
  if (![400, 403].includes(response.status)) return false;
  const providerError = record(data.error);
  const code = Number(providerError.code);
  const subcode = Number(providerError.error_subcode);
  const message = typeof providerError.message === 'string' ? providerError.message.toLowerCase() : '';
  return [10, 100, 200].includes(code)
    || subcode === 33
    || /permission|field|unsupported|get unsupported/.test(message);
}

export async function fetchMetaCustomerProfile(input: {
  provider: MetaProfileProvider;
  customerId: string;
  accountId: string;
  token: string;
  version: string;
}): Promise<MetaCustomerProfile | null> {
  if (!input.customerId || input.customerId === input.accountId || !input.token) return null;

  const url = new URL(`https://graph.facebook.com/${input.version}/${encodeURIComponent(input.customerId)}`);
  url.searchParams.set(
    'fields',
    input.provider === 'instagram'
      ? 'id,name,username,profile_pic'
      : 'id,first_name,last_name,name,profile_pic,locale,timezone,gender'
  );
  url.searchParams.set('access_token', input.token);

  let { response, data } = await metaFetchJson<Record<string, unknown>>(url, {}, { retries: 1, timeoutMs: 8_000 });

  // Extended Facebook fields are not available for every app/customer. Downgrade only
  // for field/permission failures; rate limits and provider outages should not trigger
  // an immediate duplicate Graph request.
  if (!response.ok && input.provider === 'facebook' && shouldRetryWithBasicFields(response, data)) {
    url.searchParams.set('fields', 'id,first_name,last_name,name,profile_pic');
    const fallback = await metaFetchJson<Record<string, unknown>>(url, {}, { retries: 1, timeoutMs: 8_000 });
    if (fallback.response.ok) {
      response = fallback.response;
      data = fallback.data;
    }
  }

  if (!response.ok) return null;

  const id = typeof data.id === 'string' ? data.id : '';
  if (!id || id !== input.customerId || id === input.accountId) return null;

  const username = typeof data.username === 'string' && data.username.trim() ? data.username.trim() : null;
  const firstName = typeof data.first_name === 'string' ? data.first_name.trim() : '';
  const lastName = typeof data.last_name === 'string' ? data.last_name.trim() : '';
  const fullName = typeof data.name === 'string' && data.name.trim()
    ? data.name.trim()
    : [firstName, lastName].filter(Boolean).join(' ') || username;

  const locale = typeof data.locale === 'string' ? data.locale : null;
  const timezone = typeof data.timezone === 'number' && Number.isFinite(data.timezone) ? data.timezone : null;
  const gender = typeof data.gender === 'string' && data.gender.trim() ? data.gender.trim() : null;

  let demographics: CustomerDemographics | null = null;
  if (locale || timezone !== null || gender) {
    const { country, countryCode, countryFlag } = parseCountryFromLocale(locale);
    const language = parseLanguageFromLocale(locale);
    const { label: timezoneLabel } = formatTimezoneOffset(timezone);

    demographics = {
      locale,
      country,
      countryCode,
      countryFlag,
      language,
      timezoneOffset: timezone,
      timezoneLabel,
      gender,
      ...(country ? { locationSource: 'meta_profile' as const } : {}),
    };
  }

  return {
    id,
    name: fullName || null,
    username,
    avatarUrl: cleanAvatarUrl(data.profile_pic),
    demographics,
  };
}
