import 'server-only';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export const ALLOWED_MEDIA_HOSTS = [
  'fbcdn.net',
  'fbsbx.com',
  'facebook.com',
  'cdninstagram.com',
  'instagram.com',
  'whatsapp.net',
  'tiktokcdn.com',
  'images.unsplash.com',
  'unsplash.com',
  'api.dicebear.com',
  'dicebear.com',
  'ui-avatars.com',
] as const;

export function isAllowedMediaHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return ALLOWED_MEDIA_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

function ipv4Parts(address: string) {
  const parts = address.split('.').map(Number);
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    ? parts
    : null;
}

export function isPrivateOrReservedIp(address: string) {
  const version = isIP(address);
  if (version === 4) {
    const parts = ipv4Parts(address);
    if (!parts) return true;
    const [a, b] = parts;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }

  if (version === 6) {
    const normalized = address.toLowerCase();
    if (normalized === '::' || normalized === '::1') return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    if (/^fe[89ab]/.test(normalized)) return true;
    if (normalized.startsWith('ff')) return true;
    if (normalized.startsWith('2001:db8:')) return true;
    if (normalized.startsWith('::ffff:')) {
      const mapped = normalized.slice('::ffff:'.length);
      return isPrivateOrReservedIp(mapped);
    }
    return false;
  }

  return true;
}

export async function validateRemoteMediaUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Invalid media URL.');
  }

  if (url.protocol !== 'https:') throw new Error('Only HTTPS media URLs are allowed.');
  if (url.username || url.password) throw new Error('Credentials in media URLs are not allowed.');
  if (!isAllowedMediaHostname(url.hostname)) throw new Error('Media hostname is not allowed.');

  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateOrReservedIp(address))) {
    throw new Error('Media hostname resolved to a private or reserved address.');
  }

  return url;
}

export function isAllowedMediaContentType(contentType: string | null) {
  if (!contentType) return false;
  const value = contentType.split(';', 1)[0].trim().toLowerCase();
  return value.startsWith('image/') ||
    value.startsWith('audio/') ||
    value.startsWith('video/') ||
    value === 'application/pdf' ||
    value === 'application/octet-stream';
}
