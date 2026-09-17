import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export type ChatwootWebhookEnvelope = Record<string, unknown> & {
  event?: string;
  account?: { id?: number | string } | null;
  account_id?: number | string | null;
  conversation?: ({ account_id?: number | string | null } & Record<string, unknown>) | null;
};

type VerifyInput = {
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
  secret: string;
  maxAgeSeconds?: number;
  nowMs?: number;
};

export type ChatwootWebhookVerification =
  | { ok: true; timestamp: number }
  | { ok: false; reason: 'missing_headers' | 'invalid_timestamp' | 'stale_timestamp' | 'invalid_signature' };

function positiveInteger(value: unknown) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function chatwootAccountId(payload: ChatwootWebhookEnvelope) {
  return positiveInteger(payload.account?.id)
    ?? positiveInteger(payload.account_id)
    ?? positiveInteger(payload.conversation?.account_id);
}

export function chatwootDeliveryKey(deliveryId: string | null, timestamp: string, rawBody: string) {
  const normalized = deliveryId?.trim();
  if (normalized) return `delivery:${normalized.slice(0, 240)}`;
  return `sha256:${createHash('sha256').update(`${timestamp}.${rawBody}`).digest('hex')}`;
}

export function verifyChatwootWebhook(input: VerifyInput): ChatwootWebhookVerification {
  const { rawBody, signature, timestamp, secret } = input;
  if (!signature || !timestamp) return { ok: false, reason: 'missing_headers' };

  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds) || timestampSeconds <= 0) {
    return { ok: false, reason: 'invalid_timestamp' };
  }

  const maxAgeSeconds = input.maxAgeSeconds ?? 300;
  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > maxAgeSeconds) {
    return { ok: false, reason: 'stale_timestamp' };
  }

  const expected = `sha256=${createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')}`;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signature.trim());
  if (expectedBuffer.length !== receivedBuffer.length) {
    return { ok: false, reason: 'invalid_signature' };
  }

  if (!timingSafeEqual(expectedBuffer, receivedBuffer)) {
    return { ok: false, reason: 'invalid_signature' };
  }

  return { ok: true, timestamp: timestampSeconds };
}
