import { beforeEach, describe, expect, it } from 'vitest';
import { decryptIntegrationSecret, encryptIntegrationSecret, encryptSecretPayload, decryptSecretPayload } from './secrets';

describe('integration secret encryption', () => {
  beforeEach(() => {
    process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
    delete process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY_PREVIOUS;
  });

  it('round-trips authenticated encrypted values', () => {
    const encrypted = encryptIntegrationSecret('super-secret-token');
    expect(encrypted).toMatch(/^enc:v2:/);
    expect(decryptIntegrationSecret(encrypted)).toBe('super-secret-token');
  });

  it('detects ciphertext tampering', () => {
    const encrypted = encryptIntegrationSecret('super-secret-token')!;
    const last = encrypted.at(-1) === 'A' ? 'B' : 'A';
    const tampered = `${encrypted.slice(0, -1)}${last}`;
    expect(() => decryptIntegrationSecret(tampered)).toThrow();
  });

  it('encrypts token-like fields inside secret payloads', () => {
    const encrypted = encryptSecretPayload({ access_token: 'token', nested: { client_secret: 'secret', label: 'safe' } });
    const json = JSON.stringify(encrypted);
    expect(json).not.toContain('"access_token":"token"');
    expect(decryptSecretPayload(encrypted)).toEqual({ access_token: 'token', nested: { client_secret: 'secret', label: 'safe' } });
  });
});
