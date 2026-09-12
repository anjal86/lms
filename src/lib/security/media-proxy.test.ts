import { describe, expect, it } from 'vitest';
import { isAllowedMediaHostname, isAllowedMediaContentType, isPrivateOrReservedIp } from './media-proxy';

describe('media proxy security', () => {
  it('requires an exact allowlisted hostname boundary', () => {
    expect(isAllowedMediaHostname('scontent.xx.fbcdn.net')).toBe(true);
    expect(isAllowedMediaHostname('cdninstagram.com')).toBe(true);
    expect(isAllowedMediaHostname('evilfbcdn.net')).toBe(false);
    expect(isAllowedMediaHostname('facebook.com.evil.example')).toBe(false);
  });

  it('blocks private, loopback, link-local and reserved ranges', () => {
    expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('10.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('172.16.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('192.168.1.1')).toBe(true);
    expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true);
    expect(isPrivateOrReservedIp('::1')).toBe(true);
    expect(isPrivateOrReservedIp('fd00::1')).toBe(true);
    expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false);
  });

  it('only allows intended media content types', () => {
    expect(isAllowedMediaContentType('image/jpeg')).toBe(true);
    expect(isAllowedMediaContentType('audio/ogg; codecs=opus')).toBe(true);
    expect(isAllowedMediaContentType('application/pdf')).toBe(true);
    expect(isAllowedMediaContentType('text/html')).toBe(false);
  });
});
