import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

function parseEnv(path) {
  if (!fs.existsSync(path)) return {};
  const values = {};
  for (const raw of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index < 1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[key] = value;
  }
  return values;
}

const env = { ...parseEnv('.env'), ...parseEnv('.env.local'), ...process.env };
const container = 'travel-lms-db';
const database = env.POSTGRES_DB || 'postgres';
const envArgs = env.POSTGRES_PASSWORD ? ['-e', `PGPASSWORD=${env.POSTGRES_PASSWORD}`] : [];
const base = ['exec', ...envArgs, container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', database];

function psql(args, stdio = ['ignore', 'pipe', 'pipe']) {
  return execFileSync('docker', [...base, ...args], { encoding: 'utf8', stdio });
}

try {
  execFileSync('docker', ['inspect', container], { stdio: 'ignore' });
} catch {
  console.error(`Local database container ${container} is not available. Start the Docker stack first.`);
  process.exit(1);
}

const marker = psql([
  '-tAc',
  "select to_regprocedure('public.normalize_concrete_meta_connection_config()') is not null and exists(select 1 from pg_trigger where tgname='trg_normalize_concrete_meta_connection_config' and not tgisinternal)",
]).trim();

if (marker === 't') {
  console.log('  ✓ 202609150065_concrete_meta_live_sync_compatibility.sql');
  process.exit(0);
}

console.log('  → Applying 202609150065_concrete_meta_live_sync_compatibility.sql');
try {
  psql(['-f', '/app-migrations/202609150065_concrete_meta_live_sync_compatibility.sql'], 'inherit');
  psql(['-c', "NOTIFY pgrst, 'reload schema';"], 'inherit');
  console.log('  ✓ 202609150065_concrete_meta_live_sync_compatibility.sql');
} catch {
  console.error('Migration failed: 202609150065_concrete_meta_live_sync_compatibility.sql');
  process.exit(1);
}
