import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const PREFIX = 'enc:v1';

function encryptionKey() {
  const raw = process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error('INTEGRATION_TOKEN_ENCRYPTION_KEY is not configured.');

  let key: Buffer;
  if (/^[0-9a-f]{64}$/i.test(raw)) {
    key = Buffer.from(raw, 'hex');
  } else {
    key = Buffer.from(raw, 'base64');
  }
  if (key.length !== 32) {
    throw new Error('INTEGRATION_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.');
  }
  return key;
}

export function encryptIntegrationSecret(value: string | null | undefined) {
  if (!value) return null;
  if (value.startsWith(`${PREFIX}:`)) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join(':');
}

export function decryptIntegrationSecret(value: string | null | undefined) {
  if (!value) return null;
  if (!value.startsWith(`${PREFIX}:`)) return value;
  const [, , ivPart, tagPart, dataPart] = value.split(':');
  if (!ivPart || !tagPart || !dataPart) throw new Error('Encrypted integration secret is malformed.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
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
      if (typeof item === 'string' && item.startsWith(`${PREFIX}:`)) {
        return [key, decryptIntegrationSecret(item)];
      }
      return [key, decryptSecretPayload(item)];
    }));
  }
  return value;
}
