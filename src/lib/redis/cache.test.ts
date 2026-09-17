import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const redis = vi.hoisted(() => new Map<string, string>());
vi.mock('./client', () => ({
  isRedisConfigured: () => true,
  redisCommand: async ([command, key, value]: string[]) => {
    if (command === 'GET') return redis.get(key) ?? null;
    if (command === 'INCR') {
      const next = String(Number(redis.get(key) ?? '0') + 1);
      redis.set(key, next);
      return Number(next);
    }
    if (command === 'SET') {
      redis.set(key, value);
      return 'OK';
    }
    throw new Error(`Unexpected command ${command}`);
  },
}));

import { invalidateRedisCache, readRedisJson, scopedRedisCacheKey, writeRedisJson } from './cache';

describe('scoped Redis cache invalidation', () => {
  it('invalidates all users and queries in one workspace without affecting another workspace', async () => {
    redis.clear();
    const scope = { workspaceId: 'one', namespace: 'contacts:list' };
    const first = await scopedRedisCacheKey({ ...scope, userId: 'alice', dimensions: { search: 'A' } });
    const second = await scopedRedisCacheKey({ ...scope, userId: 'bob', dimensions: { search: 'B' } });
    const other = await scopedRedisCacheKey({ workspaceId: 'two', namespace: 'contacts:list', userId: 'alice' });
    await Promise.all([writeRedisJson(first, { value: 1 }, 20), writeRedisJson(second, { value: 2 }, 20), writeRedisJson(other, { value: 3 }, 20)]);

    await invalidateRedisCache(scope);

    const firstAfter = await scopedRedisCacheKey({ ...scope, userId: 'alice', dimensions: { search: 'A' } });
    const secondAfter = await scopedRedisCacheKey({ ...scope, userId: 'bob', dimensions: { search: 'B' } });
    const otherAfter = await scopedRedisCacheKey({ workspaceId: 'two', namespace: 'contacts:list', userId: 'alice' });
    expect(firstAfter).not.toBe(first);
    expect(secondAfter).not.toBe(second);
    expect(otherAfter).toBe(other);
    expect((await readRedisJson(firstAfter)).status).toBe('MISS');
    expect((await readRedisJson(otherAfter)).status).toBe('HIT');
  });
});
