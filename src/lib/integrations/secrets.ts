import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const PREFIX_V1 = 'enc:v1';
const PREFIX_V2 = 'enc:v2';
const AAD_V2 = Buffer.from('travel-lms:integration-secret:v2', 'utf8');

function decodeKey(raw: string, name: string) {
  let key: Buffer;
  if (/^[0-9a-f]{64}$/i.test(raw)) {
    key = Buffer.from(raw, 'hex');
  } else {
    key = Buffer.from(raw, 'base64');
  }
  if (key.length !== 32) {
    throw new Error(`${name} must decode to exactly 32 bytes.`);
  }
  return key;
}

function encryptionKeys() {
  const current = process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY?.trim();
  if (!current) throw new Error('INTEGRATION_TOKEN_ENCRYPTION_KEY is not configured.');

  const keys = [decodeKey(current, 'INTEGRATION_TOKEN_ENCRYPTION_KEY')];
  const previous = process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY_PREVIOUS?.trim();
  if (previous && previous !== current) {
    keys.push(decodeKey(previous, 'INTEGRATION_TOKEN_ENCRYPTION_KEY_PREVIOUS'));
  }
  return keys;
}

function decryptEncryptedValue(value: string, key: Buffer, version: 'v1' | 'v2') {
  const parts = value.split(':');
  const ivPart = parts[2];
  const tagPart = parts[3];
  const dataPart = parts[4];
  if (!ivPart || !tagPart || !dataPart) throw new Error('Encrypted integration secret is malformed.');

  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivPart, 'base64url'));
  if (version === 'v2') decipher.setAAD(AAD_V2);
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function decryptIntegrationSecret(value: string | null | undefined) {
  if (!value) return null;
  const version = value.startsWith(`${PREFIX_V2}:`)
    ? 'v2'
    : value.startsWith(`${PREFIX_V1}:`)
      ? 'v1'
      : null;

  // Legacy plaintext remains readable so existing installations can be migrated without downtime.
  // Any subsequent write through encryptIntegrationSecret upgrades it to authenticated v2 storage.
  if (!version) return value;

  let lastError: unknown;
  for (const key of encryptionKeys()) {
    try {
      return decryptEncryptedValue(value, key, version);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Unable to decrypt integration secret.');
}

export function encryptIntegrationSecret(value: string | null | undefined) {
  if (!value) return null;
  if (value.startsWith(`${PREFIX_V2}:`)) return value;

  const plaintext = value.startsWith(`${PREFIX_V1}:`)
    ? decryptIntegrationSecret(value)
    : value;
  if (!plaintext) return null;

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKeys()[0], iv);
  cipher.setAAD(AAD_V2);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX_V2, iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join(':');
}

export function encryptSecretPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => encryptSecretPayload(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      if (typeof item === 'string' && /(token|secret|password|key)$/i.test(key)) {
        return [key, encryptIntegrationSecret(item)];
      }
      return [key, encryptSecretPayload(item)];
    }));
  }
  return value;
}

export function decryptSecretPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => decryptSecretPayload(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      if (typeof item === 'string' && (item.startsWith(`${PREFIX_V1}:`) || item.startsWith(`${PREFIX_V2}:`))) {
        return [key, decryptIntegrationSecret(item)];
      }
      return [key, decryptSecretPayload(item)];
    }));
  }
  return value;
}
