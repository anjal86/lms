import { describe, expect, it } from 'vitest';
import { isAllowedMediaHostname, isAllowedMediaContentType, isPrivateOrReservedIp } from './media-proxy';

describe('media proxy security', () => {
  it('requires an exact allowlisted hostname boundary', () => {
    expect(isAllowedMediaHostname('scontent.xx.fbcdn.net')).toBe(true);
    expect(isAllowedMediaHostname('cdninstagram.com')).toBe(true);
    expect(isAllowedMediaHostname('evilfbcdn.net')).toBe(false);
    expect(isAllowedMediaHostname('facebook.com.attacker.example')).toBe(false);
  });

  it('rejects private, loopback, link-local, and reserved addresses', () => {
    for (const address of ['127.0.0.1', '10.2.3.4', '172.16.0.1', '192.168.1.1', '169.254.169.254', '::1', 'fd00::1', 'fe80::1']) {
      expect(isPrivateOrReservedIp(address)).toBe(true);
    }
    expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false);
    expect(isPrivateOrReservedIp('2606:4700:4700::1111')).toBe(false);
  });

  it('allows only media-safe response MIME types', () => {
    expect(isAllowedMediaContentType('image/jpeg')).toBe(true);
    expect(isAllowedMediaContentType('audio/mpeg')).toBe(true);
    expect(isAllowedMediaContentType('application/pdf')).toBe(true);
    expect(isAllowedMediaContentType('text/html')).toBe(false);
  });
});
