import 'server-only';

import net from 'node:net';
import tls from 'node:tls';

export type RedisValue = string | number | null | RedisValue[];

type ParsedReply = { value: RedisValue; nextOffset: number };

class RedisReplyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RedisReplyError';
  }
}

function redisUrl() {
  const value = process.env.REDIS_URL?.trim();
  return value ? new URL(value) : null;
}

export function isRedisConfigured() {
  return Boolean(process.env.REDIS_URL?.trim());
}

function encodeCommand(args: string[]) {
  const chunks = [`*${args.length}\r\n`];
  for (const arg of args) {
    const bytes = Buffer.byteLength(arg);
    chunks.push(`$${bytes}\r\n${arg}\r\n`);
  }
  return chunks.join('');
}

function lineEnd(buffer: Buffer, offset: number) {
  return buffer.indexOf('\r\n', offset, 'utf8');
}

function parseReply(buffer: Buffer, offset = 0): ParsedReply | null {
  if (offset >= buffer.length) return null;
  const prefix = String.fromCharCode(buffer[offset]);
  const end = lineEnd(buffer, offset + 1);
  if (end < 0) return null;
  const line = buffer.toString('utf8', offset + 1, end);

  if (prefix === '+') return { value: line, nextOffset: end + 2 };
  if (prefix === '-') throw new RedisReplyError(line);
  if (prefix === ':') return { value: Number(line), nextOffset: end + 2 };

  if (prefix === '$') {
    const length = Number(line);
    if (length === -1) return { value: null, nextOffset: end + 2 };
    if (!Number.isInteger(length) || length < 0) throw new Error('Invalid Redis bulk reply length.');
    const bodyStart = end + 2;
    const bodyEnd = bodyStart + length;
    if (buffer.length < bodyEnd + 2) return null;
    return {
      value: buffer.toString('utf8', bodyStart, bodyEnd),
      nextOffset: bodyEnd + 2,
    };
  }

  if (prefix === '*') {
    const count = Number(line);
    if (count === -1) return { value: null, nextOffset: end + 2 };
    if (!Number.isInteger(count) || count < 0) throw new Error('Invalid Redis array reply length.');
    const values: RedisValue[] = [];
    let cursor = end + 2;
    for (let index = 0; index < count; index += 1) {
      const parsed = parseReply(buffer, cursor);
      if (!parsed) return null;
      values.push(parsed.value);
      cursor = parsed.nextOffset;
    }
    return { value: values, nextOffset: cursor };
  }

  throw new Error(`Unsupported Redis reply prefix: ${prefix}`);
}

function connectionCommands(url: URL, command: string[]) {
  const commands: string[][] = [];
  const password = url.password ? decodeURIComponent(url.password) : '';
  const username = url.username ? decodeURIComponent(url.username) : '';
  if (password) commands.push(username ? ['AUTH', username, password] : ['AUTH', password]);
  const db = url.pathname.replace(/^\//, '').trim();
  if (db && db !== '0') commands.push(['SELECT', db]);
  commands.push(command);
  return commands;
}

async function execute(commands: string[][], timeoutMs: number): Promise<RedisValue[]> {
  const url = redisUrl();
  if (!url) throw new Error('REDIS_URL is not configured.');
  if (!['redis:', 'rediss:'].includes(url.protocol)) throw new Error('REDIS_URL must use redis:// or rediss://.');

  const host = url.hostname;
  const port = Number(url.port || (url.protocol === 'rediss:' ? 6380 : 6379));
  if (!host || !Number.isInteger(port) || port <= 0) throw new Error('REDIS_URL has an invalid host or port.');

  return new Promise<RedisValue[]>((resolve, reject) => {
    let settled = false;
    let buffer = Buffer.alloc(0);
    const replies: RedisValue[] = [];

    const socket = url.protocol === 'rediss:'
      ? tls.connect({ host, port, servername: host })
      : net.createConnection({ host, port });

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve(replies);
    };

    socket.setTimeout(timeoutMs, () => finish(new Error(`Redis command timed out after ${timeoutMs}ms.`)));
    socket.once('error', (error) => finish(error));
    socket.once('connect', () => {
      socket.write(commands.map(encodeCommand).join(''));
    });
    socket.on('data', (chunk) => {
      try {
        buffer = Buffer.concat([buffer, chunk]);
        let offset = 0;
        while (replies.length < commands.length) {
          const parsed = parseReply(buffer, offset);
          if (!parsed) break;
          replies.push(parsed.value);
          offset = parsed.nextOffset;
        }
        if (offset > 0) buffer = buffer.subarray(offset);
        if (replies.length === commands.length) finish();
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
  });
}

export async function redisCommand(args: string[], options?: { timeoutMs?: number }) {
  if (!args.length) throw new Error('Redis command requires at least one argument.');
  const url = redisUrl();
  if (!url) throw new Error('REDIS_URL is not configured.');
  const commands = connectionCommands(url, args);
  const replies = await execute(commands, Math.max(250, options?.timeoutMs || 2_500));
  return replies[replies.length - 1] ?? null;
}

export async function redisPing() {
  return redisCommand(['PING']);
}
