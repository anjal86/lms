import 'server-only';

import { randomUUID } from 'node:crypto';
import { isRedisConfigured, redisCommand } from '@/lib/redis/client';

const QUEUE_KEY = 'crm:queue:integration-sync';
const PROCESSING_KEY = 'crm:queue:integration-sync:processing';
const STREAM_KEY = 'crm:stream:integration-sync';
const STREAM_GROUP = 'integration-sync-workers';
const STREAM_CONSUMER = `crm-worker-${process.pid}-${randomUUID()}`;
const STREAM_TOKEN = 'stream:';
const JOB_TTL_SECONDS = 86_400;
const DEDUPE_TTL_SECONDS = 3_600;
const STALE_PROCESSING_MS = 10 * 60_000;
const ENQUEUE_SCRIPT = `
local existing = redis.call('GET', KEYS[1])
if existing then return existing end
redis.call('XADD', KEYS[3], '*', 'job', ARGV[3])
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[5])
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[4])
return ARGV[1]
`;
const REQUEUE_SCRIPT = `
if not redis.call('LPOS', KEYS[1], ARGV[1]) then return 0 end
redis.call('LPUSH', KEYS[2], ARGV[2])
redis.call('SET', KEYS[3], ARGV[3], 'EX', ARGV[4])
redis.call('SET', KEYS[4], ARGV[5], 'EX', ARGV[6])
redis.call('LREM', KEYS[1], 1, ARGV[1])
return 1
`;
const STREAM_REQUEUE_SCRIPT = `
if #redis.call('XPENDING', KEYS[1], ARGV[1], ARGV[2], ARGV[2], 1) == 0 then return 0 end
redis.call('XADD', KEYS[1], '*', 'job', ARGV[3])
redis.call('SET', KEYS[2], ARGV[4], 'EX', ARGV[5])
redis.call('SET', KEYS[3], ARGV[6], 'EX', ARGV[7])
redis.call('XACK', KEYS[1], ARGV[1], ARGV[2])
redis.call('XDEL', KEYS[1], ARGV[2])
return 1
`;
const STREAM_FINISH_SCRIPT = `
if #redis.call('XPENDING', KEYS[1], ARGV[1], ARGV[2], ARGV[2], 1) == 0 then return 0 end
redis.call('SET', KEYS[2], ARGV[3], 'EX', ARGV[4])
redis.call('XACK', KEYS[1], ARGV[1], ARGV[2])
redis.call('XDEL', KEYS[1], ARGV[2])
redis.call('DEL', KEYS[3])
return 1
`;

async function ensureStreamGroup() {
  try {
    await redisCommand(['XGROUP', 'CREATE', STREAM_KEY, STREAM_GROUP, '0', 'MKSTREAM']);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('BUSYGROUP')) throw error;
  }
}

function streamId(raw: string) {
  return raw.startsWith(STREAM_TOKEN) ? raw.slice(STREAM_TOKEN.length) : null;
}

function streamEntry(value: unknown): { id: string; job: IntegrationSyncJob } | null {
  if (!Array.isArray(value) || typeof value[0] !== 'string' || !Array.isArray(value[1])) return null;
  const fields = value[1];
  const index = fields.indexOf('job');
  const job = parseJob(typeof fields[index + 1] === 'string' ? fields[index + 1] : null);
  return job ? { id: value[0], job } : null;
}

async function discardInvalidStreamEntry(value: unknown) {
  if (!Array.isArray(value) || typeof value[0] !== 'string') return;
  await redisCommand(['XACK', STREAM_KEY, STREAM_GROUP, value[0]]);
  await redisCommand(['XDEL', STREAM_KEY, value[0]]);
}

const FINISH_SCRIPT = `
if not redis.call('LPOS', KEYS[1], ARGV[1]) then return 0 end
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3])
redis.call('LREM', KEYS[1], 1, ARGV[1])
redis.call('DEL', KEYS[3])
return 1
`;

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

async function requeueProcessingJob(raw: string, job: IntegrationSyncJob, status: IntegrationSyncJobStatus) {
  const id = streamId(raw);
  const moved = id ? await redisCommand([
    'EVAL', STREAM_REQUEUE_SCRIPT, '3', STREAM_KEY, jobKey(job.id),
    dedupeKey(job.workspaceId, job.connectionId), STREAM_GROUP, id, JSON.stringify(job),
    JSON.stringify(status), String(JOB_TTL_SECONDS), job.id, String(DEDUPE_TTL_SECONDS),
  ]) : await redisCommand([
    'EVAL', REQUEUE_SCRIPT, '4', PROCESSING_KEY, QUEUE_KEY, jobKey(job.id),
    dedupeKey(job.workspaceId, job.connectionId), raw, JSON.stringify(job),
    JSON.stringify(status), String(JOB_TTL_SECONDS), job.id, String(DEDUPE_TTL_SECONDS),
  ]);
  return moved === 1;
}

async function finishProcessingJob(raw: string, job: IntegrationSyncJob, status: IntegrationSyncJobStatus) {
  const id = streamId(raw);
  const finished = id ? await redisCommand([
    'EVAL', STREAM_FINISH_SCRIPT, '3', STREAM_KEY, jobKey(job.id),
    dedupeKey(job.workspaceId, job.connectionId), STREAM_GROUP, id, JSON.stringify(status),
    String(JOB_TTL_SECONDS),
  ]) : await redisCommand([
    'EVAL', FINISH_SCRIPT, '3', PROCESSING_KEY, jobKey(job.id),
    dedupeKey(job.workspaceId, job.connectionId), raw, JSON.stringify(status), String(JOB_TTL_SECONDS),
  ]);
  if (finished !== 1) throw new Error('Integration sync job is no longer in the processing queue.');
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

  await ensureStreamGroup();
  const result = await redisCommand([
    'EVAL', ENQUEUE_SCRIPT, '3', dedupeKey(input.workspaceId, input.connectionId),
    jobKey(id), STREAM_KEY, id, JSON.stringify(status), JSON.stringify(job),
    String(DEDUPE_TTL_SECONDS), String(JOB_TTL_SECONDS),
  ]);
  if (typeof result !== 'string') throw new Error('Redis did not confirm the integration sync job.');
  if (result !== id) {
    return {
      queued: true as const,
      deduplicated: true,
      jobId: result,
      status: await getIntegrationSyncJobStatus(result),
    };
  }

  return { queued: true as const, deduplicated: false, jobId: id, status };
}

export async function claimIntegrationSyncJob() {
  if (!isRedisConfigured()) return null;
  await ensureStreamGroup();
  // Drain jobs produced by the previous list-based implementation before new stream jobs.
  const legacyRaw = await redisCommand(['RPOPLPUSH', QUEUE_KEY, PROCESSING_KEY]);
  let raw: string;
  let job: IntegrationSyncJob | null;
  if (typeof legacyRaw === 'string') {
    raw = legacyRaw;
    job = parseJob(raw);
    if (!job) {
      await redisCommand(['LREM', PROCESSING_KEY, '1', raw]);
      return null;
    }
  } else {
    const reply = await redisCommand([
      'XREADGROUP', 'GROUP', STREAM_GROUP, STREAM_CONSUMER, 'COUNT', '1',
      'STREAMS', STREAM_KEY, '>',
    ]);
    const entries = Array.isArray(reply) && Array.isArray(reply[0]) ? reply[0][1] : null;
    const entry = Array.isArray(entries) ? streamEntry(entries[0]) : null;
    if (!entry) {
      if (Array.isArray(entries)) await discardInvalidStreamEntry(entries[0]);
      return null;
    }
    raw = `${STREAM_TOKEN}${entry.id}`;
    job = entry.job;
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

  const moved = await requeueProcessingJob(input.raw, nextJob, {
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
  if (!moved) throw new Error('Integration sync job is no longer in the processing queue.');
}

export async function completeIntegrationSyncJob(input: {
  job: IntegrationSyncJob;
  raw: string;
  totals: IntegrationSyncJob['totals'];
  result: Record<string, unknown>;
}) {
  const now = new Date().toISOString();
  await finishProcessingJob(input.raw, input.job, {
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
}

export async function failIntegrationSyncJob(input: {
  job: IntegrationSyncJob;
  raw: string;
  error: string;
}) {
  const attempts = input.job.attempts + 1;
  const now = new Date().toISOString();
  if (attempts < input.job.maxAttempts) {
    const retryJob: IntegrationSyncJob = { ...input.job, attempts };
    const moved = await requeueProcessingJob(input.raw, retryJob, {
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
    if (!moved) throw new Error('Integration sync job is no longer in the processing queue.');
    return { retried: true, attempts };
  }

  await finishProcessingJob(input.raw, input.job, {
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
  return { retried: false, attempts };
}

async function recoverStaleStreamJobs(limit: number) {
  await ensureStreamGroup();
  const reply = await redisCommand([
    'XAUTOCLAIM', STREAM_KEY, STREAM_GROUP, STREAM_CONSUMER, String(STALE_PROCESSING_MS),
    '0-0', 'COUNT', String(limit),
  ]);
  const entries = Array.isArray(reply) && Array.isArray(reply[1]) ? reply[1] : [];
  let recovered = 0;
  for (const value of entries) {
    const entry = streamEntry(value);
    if (!entry) {
      await discardInvalidStreamEntry(value);
      continue;
    }
    const { job, id } = entry;
    const raw = `${STREAM_TOKEN}${id}`;
    const status = await getIntegrationSyncJobStatus(job.id);
    if (status?.state === 'completed' || status?.state === 'failed') {
      await finishProcessingJob(raw, job, status);
      recovered += 1;
      continue;
    }
    const attempts = job.attempts + 1;
    const now = new Date().toISOString();
    if (attempts >= job.maxAttempts) {
      await finishProcessingJob(raw, job, {
        id: job.id, workspaceId: job.workspaceId, connectionId: job.connectionId,
        type: job.type, state: 'failed', createdAt: job.createdAt,
        finishedAt: now, updatedAt: now, attempts, cycle: job.cycle,
        totals: job.totals, lastError: 'Exceeded retry limit after interrupted worker cycles.', result: null,
      });
    } else {
      const retryJob = { ...job, attempts };
      await requeueProcessingJob(raw, retryJob, {
        id: job.id, workspaceId: job.workspaceId, connectionId: job.connectionId,
        type: job.type, state: 'queued', createdAt: job.createdAt,
        updatedAt: now, attempts, cycle: job.cycle, totals: job.totals,
        lastError: 'Recovered after an interrupted worker cycle.', result: null,
      });
    }
    recovered += 1;
  }
  return recovered;
}

export async function recoverStaleIntegrationSyncJobs(limit = 25) {
  if (!isRedisConfigured()) return 0;
  const streamRecovered = await recoverStaleStreamJobs(Math.max(1, limit));
  const rows = await redisCommand(['LRANGE', PROCESSING_KEY, String(-Math.max(1, limit)), '-1']);
  if (!Array.isArray(rows)) return streamRecovered;

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
    if (status?.state === 'completed' || status?.state === 'failed') {
      await finishProcessingJob(value, job, status);
      recovered += 1;
      continue;
    }
    const startedAt = status?.startedAt ? new Date(status.startedAt).getTime() : 0;
    if (startedAt && startedAt > threshold) continue;

    const attempts = job.attempts + 1;
    if (attempts >= job.maxAttempts) {
      await finishProcessingJob(value, job, {
        id: job.id,
        workspaceId: job.workspaceId,
        connectionId: job.connectionId,
        type: job.type,
        state: 'failed',
        createdAt: job.createdAt,
        finishedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        attempts,
        cycle: job.cycle,
        totals: job.totals,
        lastError: 'Exceeded retry limit after interrupted worker cycles.',
        result: null,
      });
      recovered += 1;
      continue;
    }

    const recoveredJob: IntegrationSyncJob = {
      ...job,
      attempts,
    };
    const moved = await requeueProcessingJob(value, recoveredJob, {
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
    if (!moved) continue;
    recovered += 1;
  }

  return recovered + streamRecovered;
}
