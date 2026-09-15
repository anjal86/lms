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

const migrations = [
  {
    file: '202609150066_social_identity_phone_cleanup.sql',
    marker: "select to_regprocedure('public.sanitize_social_pseudo_phone()') is not null and exists(select 1 from pg_trigger where tgname='trg_sanitize_social_pseudo_phone' and not tgisinternal)",
  },
  {
    file: '202609150067_workspace_scoped_channel_ingestion.sql',
    marker: "select position('connection_id is not distinct from p_connection_id' in pg_get_functiondef(to_regprocedure('public.ingest_channel_message(uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,timestamptz,jsonb,jsonb,text)'))) > 0",
  },
];

for (const migration of migrations) {
  const applied = psql(['-tAc', migration.marker]).trim() === 't';
  if (applied) {
    console.log(`  ✓ ${migration.file}`);
    continue;
  }

  console.log(`  → Applying ${migration.file}`);
  try {
    psql(['-f', `/app-migrations/${migration.file}`], 'inherit');
    console.log(`  ✓ ${migration.file}`);
  } catch {
    console.error(`Migration failed: ${migration.file}`);
    process.exit(1);
  }
}

psql(['-c', "NOTIFY pgrst, 'reload schema';"], 'inherit');
