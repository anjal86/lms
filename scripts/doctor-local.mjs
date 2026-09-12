import fs from 'node:fs';
import net from 'node:net';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

function parseEnvFile(path) {
  if (!fs.existsSync(path)) return {};
  const result = {};
  for (const rawLine of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index < 1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

const env = {
  ...parseEnvFile('.env'),
  ...parseEnvFile('.env.local'),
  ...process.env,
};

const errors = [];
const warnings = [];
const ok = [];

function report(condition, success, failure, target = errors) {
  if (condition) ok.push(success);
  else target.push(failure);
}

function isPlaceholder(value) {
  return !value || /replace-with|your-|example|placeholder/i.test(value);
}

function base64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function verifyHs256Jwt(token, secret, expectedRole) {
  if (!token || !secret) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (expectedRole && payload.role !== expectedRole) return false;
    const signature = crypto.createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest();
    return crypto.timingSafeEqual(Buffer.from(parts[2]), Buffer.from(base64Url(signature)));
  } catch {
    return false;
  }
}

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const publicUrl = env.PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const dockerAnon = env.ANON_KEY;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
const dockerService = env.SERVICE_ROLE_KEY;
const jwtSecret = env.JWT_SECRET;

report(!isPlaceholder(supabaseUrl), 'NEXT_PUBLIC_SUPABASE_URL is configured.', 'NEXT_PUBLIC_SUPABASE_URL is missing or still a placeholder.');
report(!isPlaceholder(anon), 'Browser anon key is configured.', 'NEXT_PUBLIC_SUPABASE_ANON_KEY is missing or still a placeholder.');
report(!isPlaceholder(service), 'Server service-role key is configured.', 'SUPABASE_SERVICE_ROLE_KEY is missing or still a placeholder.');

if (supabaseUrl?.includes('localhost') || supabaseUrl?.includes('127.0.0.1')) {
  report(publicUrl === supabaseUrl, 'Browser and Docker Supabase URLs match.', `PUBLIC_SUPABASE_URL (${publicUrl || 'missing'}) must match NEXT_PUBLIC_SUPABASE_URL (${supabaseUrl}).`);
  report(anon === dockerAnon, 'Browser anon key matches Docker ANON_KEY.', 'NEXT_PUBLIC_SUPABASE_ANON_KEY and ANON_KEY do not match. Realtime/REST requests will be rejected.');
  report(service === dockerService, 'Server service-role key matches Docker SERVICE_ROLE_KEY.', 'SUPABASE_SERVICE_ROLE_KEY and SERVICE_ROLE_KEY do not match. Admin Auth calls will fail.');
  report(!isPlaceholder(jwtSecret), 'JWT secret is configured.', 'JWT_SECRET is missing or still a placeholder.');

  if (!isPlaceholder(jwtSecret) && !isPlaceholder(dockerAnon)) {
    report(verifyHs256Jwt(dockerAnon, jwtSecret, 'anon'), 'ANON_KEY is signed by the configured JWT_SECRET.', 'ANON_KEY is not a valid HS256 anon token for the configured JWT_SECRET.');
  }
  if (!isPlaceholder(jwtSecret) && !isPlaceholder(dockerService)) {
    report(verifyHs256Jwt(dockerService, jwtSecret, 'service_role'), 'SERVICE_ROLE_KEY is signed by the configured JWT_SECRET.', 'SERVICE_ROLE_KEY is not a valid HS256 service_role token for the configured JWT_SECRET.');
  }

  report((env.SECRET_KEY_BASE || '').length >= 64, 'Realtime SECRET_KEY_BASE length is valid.', 'SECRET_KEY_BASE must be at least 64 characters for Realtime.');
  report((env.REALTIME_DB_ENC_KEY || '').length === 16, 'Realtime DB encryption key length is valid.', 'REALTIME_DB_ENC_KEY must be exactly 16 characters.');
}

async function checkPort(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(1200);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

if (supabaseUrl?.includes('localhost') || supabaseUrl?.includes('127.0.0.1')) {
  try {
    const parsed = new URL(supabaseUrl);
    const reachable = await checkPort(parsed.hostname, Number(parsed.port || 80));
    report(reachable, `Supabase gateway is reachable at ${parsed.host}.`, `Nothing is listening at ${parsed.host}. Start the local Docker stack.`);
  } catch {
    errors.push(`NEXT_PUBLIC_SUPABASE_URL is not a valid URL: ${supabaseUrl}`);
  }

  try {
    const output = execFileSync('docker', ['ps', '--format', '{{.Names}}\t{{.Status}}'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const lines = output.trim().split(/\r?\n/).filter(Boolean);
    const expected = ['travel-lms-db', 'travel-lms-auth', 'travel-lms-rest', 'realtime-dev.supabase-realtime', 'travel-lms-kong'];
    for (const name of expected) {
      const line = lines.find((item) => item.startsWith(`${name}\t`));
      if (!line) errors.push(`Docker container ${name} is not running.`);
      else if (/unhealthy|restarting/i.test(line)) errors.push(`${name} is ${line.split('\t').slice(1).join(' ')}.`);
      else ok.push(`${name} is running.`);
    }
  } catch {
    warnings.push('Docker status could not be checked. Make sure Docker Desktop is running.');
  }
}

console.log('\nWanderlust local environment doctor\n');
for (const message of ok) console.log(`  ✓ ${message}`);
for (const message of warnings) console.log(`  ! ${message}`);
for (const message of errors) console.log(`  ✗ ${message}`);
console.log('');

if (errors.length) {
  console.error(`${errors.length} blocking local configuration problem${errors.length === 1 ? '' : 's'} found.`);
  process.exit(1);
}

console.log('Local Supabase configuration looks consistent.');
