import 'server-only';
import { isAllowedMediaHostname } from '@/lib/security/media-proxy';
import { metaFetchJson } from '@/lib/integrations/meta-http';

export type MetaProfileProvider = 'facebook' | 'instagram';

export type MetaCustomerProfile = {
  id: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
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
      : 'id,first_name,last_name,name,profile_pic'
  );
  url.searchParams.set('access_token', input.token);

  const { response, data } = await metaFetchJson<Record<string, unknown>>(url, {}, { retries: 1, timeoutMs: 8_000 });
  if (!response.ok) return null;

  const id = typeof data.id === 'string' ? data.id : '';
  if (!id || id !== input.customerId || id === input.accountId) return null;

  const username = typeof data.username === 'string' && data.username.trim() ? data.username.trim() : null;
  const firstName = typeof data.first_name === 'string' ? data.first_name.trim() : '';
  const lastName = typeof data.last_name === 'string' ? data.last_name.trim() : '';
  const fullName = typeof data.name === 'string' && data.name.trim()
    ? data.name.trim()
    : [firstName, lastName].filter(Boolean).join(' ') || username;

  return {
    id,
    name: fullName || null,
    username,
    avatarUrl: cleanAvatarUrl(data.profile_pic),
  };
}
