import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { isRedisConfigured, redisPing } from './client';

afterEach(() => vi.unstubAllEnvs());

describe('Redis configuration', () => {
  it('reports a malformed configured URL without throwing from the configuration check', async () => {
    vi.stubEnv('REDIS_URL', 'not-a-url');

    expect(isRedisConfigured()).toBe(true);
    await expect(redisPing()).rejects.toThrow();
  });
});
