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

const file = '202609160089_settings_ownership_boundaries.sql';
const marker = "select to_regclass('public.platform_admins') is not null and to_regprocedure('public.is_platform_super_admin()') is not null";

if (psql(['-tAc', marker]).trim() === 't') {
  console.log(`  ✓ ${file}`);
} else {
  console.log(`  → Applying ${file}`);
  try {
    psql(['-f', `/app-migrations/${file}`], 'inherit');
    console.log(`  ✓ ${file}`);
  } catch {
    console.error(`Migration failed: ${file}`);
    process.exit(1);
  }
}

psql(['-c', "NOTIFY pgrst, 'reload schema';"], 'inherit');
