import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/redis/client', () => ({
  isRedisConfigured: () => true,
  redisCommand: vi.fn(async () => 1),
}));

import { redisCommand } from '@/lib/redis/client';
import {
  claimIntegrationSyncJob, completeIntegrationSyncJob, continueIntegrationSyncJob,
  enqueueMetaHistorySyncJob, recoverStaleIntegrationSyncJobs, type IntegrationSyncJob,
} from './integration-sync-queue';

const job: IntegrationSyncJob = {
  id: 'job-1', type: 'meta-history-sync', workspaceId: 'workspace-1',
  connectionId: 'connection-1', requestedBy: 'user-1',
  createdAt: '2026-09-17T00:00:00.000Z', attempts: 0, maxAttempts: 5,
  cycle: 0, maxCycles: 200,
  totals: { conversationsDiscovered: 0, messagesInserted: 0, conversationsCompleted: 0 },
};
const streamEntry = ['1750000000000-0', ['job', JSON.stringify(job)]];

describe('integration sync stream queue', () => {
  beforeEach(() => {
    vi.mocked(redisCommand).mockReset();
    vi.mocked(redisCommand).mockResolvedValue(1);
  });

  it('creates a group and atomically enqueues status, dedupe, and stream entry', async () => {
    vi.mocked(redisCommand).mockResolvedValueOnce('OK').mockImplementationOnce(async (args) => args[6]);
    const result = await enqueueMetaHistorySyncJob({
      workspaceId: 'workspace-1', connectionId: 'connection-1', requestedBy: 'user-1',
    });
    expect(result.queued).toBe(true);
    expect(result.deduplicated).toBe(false);
    const commands = vi.mocked(redisCommand).mock.calls.map(([args]) => args);
    expect(commands[0].slice(0, 4)).toEqual(['XGROUP', 'CREATE', 'crm:stream:integration-sync', 'integration-sync-workers']);
    expect(commands[1][1]).toContain("redis.call('XADD'");
    expect(commands[1]).toContain('crm:stream:integration-sync');
  });

  it('claims a stream entry and returns an opaque token for transitions', async () => {
    vi.mocked(redisCommand)
      .mockResolvedValueOnce('OK')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce([['crm:stream:integration-sync', [streamEntry]]]);
    const claimed = await claimIntegrationSyncJob();
    expect(claimed).toEqual({ job, raw: 'stream:1750000000000-0' });
    expect(vi.mocked(redisCommand).mock.calls[2][0][0]).toBe('XREADGROUP');
  });

  it('atomically acknowledges and requeues a continuing stream job', async () => {
    await continueIntegrationSyncJob({ job, raw: 'stream:1750000000000-0', totals: job.totals, result: {} });
    const command = vi.mocked(redisCommand).mock.calls[0][0];
    expect(command[0]).toBe('EVAL');
    expect(command[1]).toContain("redis.call('XACK'");
    expect(command[1]).toContain("redis.call('XADD'");
    expect(command).toContain('1750000000000-0');
  });

  it('atomically acknowledges and completes a stream job', async () => {
    await completeIntegrationSyncJob({ job, raw: 'stream:1750000000000-0', totals: job.totals, result: {} });
    const command = vi.mocked(redisCommand).mock.calls[0][0];
    expect(command[1]).toContain("redis.call('XACK'");
    expect(command[1]).toContain("redis.call('XDEL'");
  });

  it('recovers a stale pending stream entry before checking legacy processing', async () => {
    vi.mocked(redisCommand)
      .mockResolvedValueOnce('OK')
      .mockResolvedValueOnce(['0-0', [streamEntry], []])
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce([]);
    expect(await recoverStaleIntegrationSyncJobs(20)).toBe(1);
    const commands = vi.mocked(redisCommand).mock.calls.map(([args]) => args);
    expect(commands[1].slice(0, 4)).toEqual(['XAUTOCLAIM', 'crm:stream:integration-sync', 'integration-sync-workers', expect.any(String)]);
    expect(commands[3][1]).toContain("redis.call('XADD'");
  });

  it('continues to process legacy list jobs during migration', async () => {
    await continueIntegrationSyncJob({ job, raw: JSON.stringify(job), totals: job.totals, result: {} });
    const command = vi.mocked(redisCommand).mock.calls[0][0];
    expect(command).toContain('crm:queue:integration-sync:processing');
    expect(command[1]).toContain("redis.call('LPUSH'");
  });
});
