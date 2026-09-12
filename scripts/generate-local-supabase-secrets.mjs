import fs from 'node:fs';
import crypto from 'node:crypto';

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function signJwt(payload, secret) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function writeEnv(path, updates) {
  const existing = fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : '';
  const lines = existing ? existing.split(/\r?\n/) : [];
  const seen = new Set();
  const next = lines.map((line) => {
    const match = line.match(/^([A-Z0-9_]+)=/);
    if (!match || !(match[1] in updates)) return line;
    seen.add(match[1]);
    return `${match[1]}=${updates[match[1]]}`;
  });

  if (next.length && next[next.length - 1] !== '') next.push('');
  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) next.push(`${key}=${value}`);
  }
  next.push('');
  fs.writeFileSync(path, next.join('\n'), 'utf8');
}

const write = process.argv.includes('--write');
const now = Math.floor(Date.now() / 1000);
const exp = now + 60 * 60 * 24 * 365 * 10;
const jwtSecret = crypto.randomBytes(32).toString('hex');
const anonKey = signJwt({ role: 'anon', iss: 'supabase', iat: now, exp }, jwtSecret);
const serviceRoleKey = signJwt({ role: 'service_role', iss: 'supabase', iat: now, exp }, jwtSecret);
const secretKeyBase = crypto.randomBytes(48).toString('base64');
const realtimeDbEncKey = crypto.randomBytes(8).toString('hex');

const shared = {
  JWT_SECRET: jwtSecret,
  ANON_KEY: anonKey,
  SERVICE_ROLE_KEY: serviceRoleKey,
  SECRET_KEY_BASE: secretKeyBase,
  REALTIME_DB_ENC_KEY: realtimeDbEncKey,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
};

if (!write) {
  console.log('Generated local Supabase credentials (not written):\n');
  for (const [key, value] of Object.entries(shared)) console.log(`${key}=${value}`);
  console.log('\nRun with --write to update .env and .env.local automatically.');
  process.exit(0);
}

writeEnv('.env', shared);
writeEnv('.env.local', {
  NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:8000',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
});

console.log('Updated .env and .env.local with one consistent local Supabase key set.');
console.log('Existing local sessions are now invalid. Recreate the Supabase services and sign in again.');
