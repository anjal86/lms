import 'server-only';

import { createHash } from 'node:crypto';
import { isRedisConfigured, redisCommand } from './client';

export type RedisCacheStatus = 'HIT' | 'MISS' | 'BYPASS';

const CACHE_PREFIX = 'crm:cache:v1';
const CACHE_TIMEOUT_MS = 500;

function safeRedisConfigured() {
  try {
    return isRedisConfigured();
  } catch {
    return false;
  }
}

function digestDimensions(dimensions: unknown) {
  return createHash('sha256')
    .update(JSON.stringify(dimensions ?? null))
    .digest('hex')
    .slice(0, 24);
}

export function redisCacheKey(input: {
  workspaceId: string;
  namespace: string;
  userId?: string | null;
  dimensions?: unknown;
}) {
  const namespace = input.namespace.replace(/[^a-zA-Z0-9:_-]/g, '_').slice(0, 80);
  const userScope = input.userId?.trim() || 'workspace';
  const dimensions = digestDimensions(input.dimensions);
  return `${CACHE_PREFIX}:${input.workspaceId}:${namespace}:${userScope}:${dimensions}`;
}

export async function readRedisJson<T>(key: string): Promise<{ value: T | null; status: RedisCacheStatus }> {
  if (!safeRedisConfigured()) return { value: null, status: 'BYPASS' };

  try {
    const reply = await redisCommand(['GET', key], { timeoutMs: CACHE_TIMEOUT_MS });
    if (typeof reply !== 'string' || !reply) return { value: null, status: 'MISS' };
    return { value: JSON.parse(reply) as T, status: 'HIT' };
  } catch {
    return { value: null, status: 'BYPASS' };
  }
}

export async function writeRedisJson(key: string, value: unknown, ttlSeconds: number) {
  if (!safeRedisConfigured()) return false;

  try {
    await redisCommand(
      ['SET', key, JSON.stringify(value), 'EX', String(Math.max(1, Math.floor(ttlSeconds)))],
      { timeoutMs: CACHE_TIMEOUT_MS }
    );
    return true;
  } catch {
    return false;
  }
}

export function cacheResponseHeaders(status: RedisCacheStatus) {
  return {
    'Cache-Control': 'private, no-store',
    'X-CRM-Cache': status,
  };
}
