import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

const DEFAULT_LOCAL_BRIDGE_URL = 'http://127.0.0.1:3101';

function requiredSecret(name: 'WHATSAPP_BRIDGE_API_KEY' | 'WHATSAPP_BRIDGE_WEBHOOK_SECRET') {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export function whatsappBridgeUrl() {
  return (process.env.WHATSAPP_BRIDGE_URL?.trim() || DEFAULT_LOCAL_BRIDGE_URL).replace(/\/$/, '');
}

export async function whatsappBridgeRequest<T = Record<string, unknown>>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${whatsappBridgeUrl()}${path}`, {
      ...init,
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-bridge-api-key': requiredSecret('WHATSAPP_BRIDGE_API_KEY'),
        ...(init.headers || {}),
      },
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(typeof payload.error === 'string' ? payload.error : `WhatsApp bridge request failed (${response.status}).`);
    }
    return payload as T;
  } finally {
    clearTimeout(timeout);
  }
}

export function verifyWhatsappBridgeSignature(rawBody: string, signature: string | null) {
  if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', requiredSecret('WHATSAPP_BRIDGE_WEBHOOK_SECRET'))
    .update(rawBody)
    .digest('hex');
  const actualBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
