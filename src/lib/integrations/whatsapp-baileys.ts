import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_LOCAL_BRIDGE_URL = 'http://127.0.0.1:3101';

function getEnvValue(name: string): string | null {
  const existing = process.env[name]?.trim();
  if (existing) return existing;
  try {
    const envPath = path.join(process.cwd(), '.env.local');
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
        const [key, ...rest] = trimmed.split('=');
        if (key.trim() === name) {
          const value = rest.join('=').trim().replace(/^['"]|['"]$/g, '');
          process.env[name] = value;
          return value;
        }
      }
    }
  } catch {
    // Ignore error reading file
  }
  return null;
}

function requiredSecret(name: 'WHATSAPP_BRIDGE_API_KEY' | 'WHATSAPP_BRIDGE_WEBHOOK_SECRET') {
  const value = getEnvValue(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export function whatsappBridgeUrl() {
  return (getEnvValue('WHATSAPP_BRIDGE_URL') || DEFAULT_LOCAL_BRIDGE_URL).replace(/\/$/, '');
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

export type WhatsappHistoryRequest = {
  count?: number;
  oldestMsgId: string;
  oldestMsgRemoteJid: string;
  oldestMsgFromMe?: boolean;
  oldestMsgTimestamp: number;
};

export function fetchWhatsappHistory(instanceId: string, input: WhatsappHistoryRequest) {
  return whatsappBridgeRequest<{ ok: boolean; request_id?: string | null }>(
    `/instances/${encodeURIComponent(instanceId)}/fetch-history`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    }
  );
}

export async function fetchWhatsappBridgeMedia(instanceId: string, messageId: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const url = `${whatsappBridgeUrl()}/instances/${encodeURIComponent(instanceId)}/messages/${encodeURIComponent(messageId)}/media`;
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'x-bridge-api-key': requiredSecret('WHATSAPP_BRIDGE_API_KEY'),
      },
    });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const buffer = Buffer.from(await response.arrayBuffer());
    return { buffer, contentType };
  } catch (error) {
    console.warn('Failed to fetch media from WhatsApp bridge:', error instanceof Error ? error.message : error);
    return null;
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
