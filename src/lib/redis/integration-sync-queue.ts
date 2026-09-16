import 'server-only';

import { randomUUID } from 'node:crypto';
import { isRedisConfigured, redisCommand } from '@/lib/redis/client';

const QUEUE_KEY = 'crm:queue:integration-sync';
const PROCESSING_KEY = 'crm:queue:integration-sync:processing';
const JOB_TTL_SECONDS = 86_400;
const DEDUPE_TTL_SECONDS = 3_600;
const STALE_PROCESSING_MS = 10 * 60_000;

export type IntegrationSyncJob = {
  id: string;
  type: 'meta-history-sync';
  workspaceId: string;
  connectionId: string;
  requestedBy: string;
  createdAt: string;
  attempts: number;
  maxAttempts: number;
  cycle: number;
  maxCycles: number;
  totals: {
    conversationsDiscovered: number;
    messagesInserted: number;
    conversationsCompleted: number;
  };
};

export type IntegrationSyncJobStatus = {
  id: string;
  workspaceId: string;
  connectionId: string;
  type: IntegrationSyncJob['type'];
  state: 'queued' | 'active' | 'completed' | 'failed';
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  updatedAt: string;
  attempts: number;
  cycle: number;
  totals: IntegrationSyncJob['totals'];
  lastError?: string | null;
  result?: Record<string, unknown> | null;
};

function jobKey(id: string) {
  return `crm:integration-sync-job:${id}`;
}

function dedupeKey(workspaceId: string, connectionId: string) {
  return `crm:integration-sync-dedupe:${workspaceId}:${connectionId}`;
}

function parseJob(raw: string | null): IntegrationSyncJob | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as IntegrationSyncJob;
    return parsed && parsed.id && parsed.workspaceId && parsed.connectionId ? parsed : null;
  } catch {
    return null;
  }
}

function parseStatus(raw: string | null): IntegrationSyncJobStatus | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as IntegrationSyncJobStatus;
    return parsed && parsed.id && parsed.workspaceId ? parsed : null;
  } catch {
    return null;
  }
}

async function writeStatus(status: IntegrationSyncJobStatus) {
  await redisCommand(['SET', jobKey(status.id), JSON.stringify(status), 'EX', String(JOB_TTL_SECONDS)]);
}

export async function getIntegrationSyncJobStatus(id: string) {
  if (!isRedisConfigured()) return null;
  const raw = await redisCommand(['GET', jobKey(id)]);
  return parseStatus(typeof raw === 'string' ? raw : null);
}

export async function enqueueMetaHistorySyncJob(input: {
  workspaceId: string;
  connectionId: string;
  requestedBy: string;
}) {
  if (!isRedisConfigured()) return { queued: false as const, reason: 'redis_unavailable' as const };

  const id = randomUUID();
  const dedupe = dedupeKey(input.workspaceId, input.connectionId);
  const acquired = await redisCommand(['SET', dedupe, id, 'NX', 'EX', String(DEDUPE_TTL_SECONDS)]);

  if (acquired !== 'OK') {
    const existing = await redisCommand(['GET', dedupe]);
    const existingId = typeof existing === 'string' ? existing : null;
    return {
      queued: true as const,
      deduplicated: true,
      jobId: existingId,
      status: existingId ? await getIntegrationSyncJobStatus(existingId) : null,
    };
  }

  const now = new Date().toISOString();
  const job: IntegrationSyncJob = {
    id,
    type: 'meta-history-sync',
    workspaceId: input.workspaceId,
    connectionId: input.connectionId,
    requestedBy: input.requestedBy,
    createdAt: now,
    attempts: 0,
    maxAttempts: 5,
    cycle: 0,
    maxCycles: 200,
    totals: {
      conversationsDiscovered: 0,
      messagesInserted: 0,
      conversationsCompleted: 0,
    },
  };

  const status: IntegrationSyncJobStatus = {
    id,
    workspaceId: input.workspaceId,
    connectionId: input.connectionId,
    type: job.type,
    state: 'queued',
    createdAt: now,
    updatedAt: now,
    attempts: 0,
    cycle: 0,
    totals: job.totals,
    lastError: null,
    result: null,
  };

  try {
    await writeStatus(status);
    await redisCommand(['LPUSH', QUEUE_KEY, JSON.stringify(job)]);
  } catch (error) {
    await redisCommand(['DEL', dedupe]).catch(() => null);
    await redisCommand(['DEL', jobKey(id)]).catch(() => null);
    throw error;
  }

  return { queued: true as const, deduplicated: false, jobId: id, status };
}

export async function claimIntegrationSyncJob() {
  if (!isRedisConfigured()) return null;
  const raw = await redisCommand(['RPOPLPUSH', QUEUE_KEY, PROCESSING_KEY]);
  if (typeof raw !== 'string') return null;
  const job = parseJob(raw);
  if (!job) {
    await redisCommand(['LREM', PROCESSING_KEY, '1', raw]);
    return null;
  }

  const now = new Date().toISOString();
  await writeStatus({
    id: job.id,
    workspaceId: job.workspaceId,
    connectionId: job.connectionId,
    type: job.type,
    state: 'active',
    createdAt: job.createdAt,
    startedAt: now,
    updatedAt: now,
    attempts: job.attempts,
    cycle: job.cycle,
    totals: job.totals,
    lastError: null,
    result: null,
  });

  return { job, raw };
}

export async function continueIntegrationSyncJob(input: {
  job: IntegrationSyncJob;
  raw: string;
  totals: IntegrationSyncJob['totals'];
  result: Record<string, unknown>;
}) {
  const nextJob: IntegrationSyncJob = {
    ...input.job,
    cycle: input.job.cycle + 1,
    attempts: 0,
    totals: input.totals,
  };
  const now = new Date().toISOString();

  await redisCommand(['LREM', PROCESSING_KEY, '1', input.raw]);
  await writeStatus({
    id: nextJob.id,
    workspaceId: nextJob.workspaceId,
    connectionId: nextJob.connectionId,
    type: nextJob.type,
    state: 'queued',
    createdAt: nextJob.createdAt,
    updatedAt: now,
    attempts: nextJob.attempts,
    cycle: nextJob.cycle,
    totals: nextJob.totals,
    lastError: null,
    result: input.result,
  });
  await redisCommand(['LPUSH', QUEUE_KEY, JSON.stringify(nextJob)]);
}

export async function completeIntegrationSyncJob(input: {
  job: IntegrationSyncJob;
  raw: string;
  totals: IntegrationSyncJob['totals'];
  result: Record<string, unknown>;
}) {
  const now = new Date().toISOString();
  await redisCommand(['LREM', PROCESSING_KEY, '1', input.raw]);
  await writeStatus({
    id: input.job.id,
    workspaceId: input.job.workspaceId,
    connectionId: input.job.connectionId,
    type: input.job.type,
    state: 'completed',
    createdAt: input.job.createdAt,
    finishedAt: now,
    updatedAt: now,
    attempts: input.job.attempts,
    cycle: input.job.cycle,
    totals: input.totals,
    lastError: null,
    result: input.result,
  });
  await redisCommand(['DEL', dedupeKey(input.job.workspaceId, input.job.connectionId)]);
}

export async function failIntegrationSyncJob(input: {
  job: IntegrationSyncJob;
  raw: string;
  error: string;
}) {
  const attempts = input.job.attempts + 1;
  const now = new Date().toISOString();
  await redisCommand(['LREM', PROCESSING_KEY, '1', input.raw]);

  if (attempts < input.job.maxAttempts) {
    const retryJob: IntegrationSyncJob = { ...input.job, attempts };
    await writeStatus({
      id: retryJob.id,
      workspaceId: retryJob.workspaceId,
      connectionId: retryJob.connectionId,
      type: retryJob.type,
      state: 'queued',
      createdAt: retryJob.createdAt,
      updatedAt: now,
      attempts,
      cycle: retryJob.cycle,
      totals: retryJob.totals,
      lastError: input.error,
      result: null,
    });
    await redisCommand(['LPUSH', QUEUE_KEY, JSON.stringify(retryJob)]);
    return { retried: true, attempts };
  }

  await writeStatus({
    id: input.job.id,
    workspaceId: input.job.workspaceId,
    connectionId: input.job.connectionId,
    type: input.job.type,
    state: 'failed',
    createdAt: input.job.createdAt,
    finishedAt: now,
    updatedAt: now,
    attempts,
    cycle: input.job.cycle,
    totals: input.job.totals,
    lastError: input.error,
    result: null,
  });
  await redisCommand(['DEL', dedupeKey(input.job.workspaceId, input.job.connectionId)]);
  return { retried: false, attempts };
}

export async function recoverStaleIntegrationSyncJobs(limit = 25) {
  if (!isRedisConfigured()) return 0;
  const rows = await redisCommand(['LRANGE', PROCESSING_KEY, '0', String(Math.max(0, limit - 1))]);
  if (!Array.isArray(rows)) return 0;

  let recovered = 0;
  const threshold = Date.now() - STALE_PROCESSING_MS;
  for (const value of rows) {
    if (typeof value !== 'string') continue;
    const job = parseJob(value);
    if (!job) {
      await redisCommand(['LREM', PROCESSING_KEY, '1', value]);
      continue;
    }

    const status = await getIntegrationSyncJobStatus(job.id);
    const startedAt = status?.startedAt ? new Date(status.startedAt).getTime() : 0;
    if (startedAt && startedAt > threshold) continue;

    const removed = await redisCommand(['LREM', PROCESSING_KEY, '1', value]);
    if (Number(removed) <= 0) continue;

    const recoveredJob: IntegrationSyncJob = {
      ...job,
      attempts: Math.min(job.maxAttempts - 1, job.attempts + 1),
    };
    await writeStatus({
      id: recoveredJob.id,
      workspaceId: recoveredJob.workspaceId,
      connectionId: recoveredJob.connectionId,
      type: recoveredJob.type,
      state: 'queued',
      createdAt: recoveredJob.createdAt,
      updatedAt: new Date().toISOString(),
      attempts: recoveredJob.attempts,
      cycle: recoveredJob.cycle,
      totals: recoveredJob.totals,
      lastError: 'Recovered after an interrupted worker cycle.',
      result: null,
    });
    await redisCommand(['LPUSH', QUEUE_KEY, JSON.stringify(recoveredJob)]);
    recovered += 1;
  }

  return recovered;
}
