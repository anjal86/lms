import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  chatwootAccountId,
  chatwootDeliveryKey,
  verifyChatwootWebhook,
} from './chatwoot-webhook';

describe('verifyChatwootWebhook', () => {
  it('accepts the Chatwoot sha256 timestamp.raw_body signature', () => {
    const secret = 'test-webhook-secret';
    const timestamp = '1789660000';
    const rawBody = '{"event":"message_created","account":{"id":42}}';
    const signature = `sha256=${createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')}`;

    expect(verifyChatwootWebhook({
      rawBody,
      signature,
      timestamp,
      secret,
      nowMs: Number(timestamp) * 1000,
    })).toEqual({ ok: true, timestamp: Number(timestamp) });
  });

  it('rejects tampered and stale deliveries', () => {
    const timestamp = '1789660000';
    expect(verifyChatwootWebhook({
      rawBody: '{}',
      signature: 'sha256=bad',
      timestamp,
      secret: 'secret',
      nowMs: Number(timestamp) * 1000,
    })).toEqual({ ok: false, reason: 'invalid_signature' });

    const rawBody = '{}';
    const signature = `sha256=${createHmac('sha256', 'secret').update(`${timestamp}.${rawBody}`).digest('hex')}`;
    expect(verifyChatwootWebhook({
      rawBody,
      signature,
      timestamp,
      secret: 'secret',
      maxAgeSeconds: 300,
      nowMs: (Number(timestamp) + 301) * 1000,
    })).toEqual({ ok: false, reason: 'stale_timestamp' });
  });
});

describe('Chatwoot webhook identity', () => {
  it('resolves account identity across supported payload shapes', () => {
    expect(chatwootAccountId({ account: { id: 7 } })).toBe(7);
    expect(chatwootAccountId({ account_id: '8' })).toBe(8);
    expect(chatwootAccountId({ conversation: { account_id: 9 } })).toBe(9);
  });

  it('uses the Chatwoot delivery ID when available and a deterministic hash otherwise', () => {
    expect(chatwootDeliveryKey('delivery-123', '100', '{}')).toBe('delivery:delivery-123');
    expect(chatwootDeliveryKey(null, '100', '{}')).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(chatwootDeliveryKey(null, '100', '{}')).toBe(chatwootDeliveryKey(null, '100', '{}'));
  });
});
