import fs from 'node:fs';
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

const dbContainer = 'travel-lms-db';
const database = env.POSTGRES_DB || 'postgres';
const postgresPassword = env.POSTGRES_PASSWORD;

function dockerPsql(args, options = {}) {
  const envArgs = postgresPassword ? ['-e', `PGPASSWORD=${postgresPassword}`] : [];
  return execFileSync(
    'docker',
    ['exec', ...envArgs, dbContainer, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', database, ...args],
    { encoding: 'utf8', stdio: options.stdio || ['ignore', 'pipe', 'pipe'] }
  );
}

function query(sql) {
  return dockerPsql(['-tAc', sql]).trim();
}

function exists(sql) {
  return query(sql) === 't';
}

try {
  execFileSync('docker', ['inspect', dbContainer], { stdio: 'ignore' });
} catch {
  console.error(`Local database container ${dbContainer} is not available. Start the Docker stack first.`);
  process.exit(1);
}

if (!exists("select to_regclass('public.profiles') is not null and to_regclass('public.leads') is not null")) {
  console.error('The local database does not contain the base Wanderlust schema. Do not apply incremental repairs to this database.');
  console.error('Create a fresh local database volume or restore a valid database first.');
  process.exit(1);
}

const migrations = [
  {
    file: '202609120009_management_audit_log.sql',
    applied: () => exists("select to_regclass('public.audit_events') is not null"),
  },
  {
    file: '202609120010_lead_readiness_score.sql',
    applied: () => exists("select exists(select 1 from information_schema.columns where table_schema='public' and table_name='leads' and column_name='lead_score')"),
  },
  {
    file: '202609120011_normalized_operations_and_active_users.sql',
    applied: () => exists("select to_regclass('public.lead_quotes') is not null and to_regprocedure('public.current_user_active()') is not null"),
  },
  {
    file: '202609120012_server_dashboard_queries.sql',
    applied: () => exists("select to_regprocedure('public.dashboard_operational_summary()') is not null and to_regprocedure('public.lead_pipeline_summary()') is not null"),
  },
  {
    file: '202609120013_omnichannel_integrations.sql',
    applied: () => exists("select to_regclass('public.integration_connections') is not null and to_regclass('public.lead_messages') is not null and exists(select 1 from information_schema.columns where table_schema='public' and table_name='leads' and column_name='source_channel')"),
  },
  {
    file: '202609120014_inbox_and_lead_conversion.sql',
    applied: () => exists("select exists(select 1 from information_schema.columns where table_schema='public' and table_name='lead_conversations' and column_name='lead_id' and is_nullable='YES') and exists(select 1 from information_schema.columns where table_schema='public' and table_name='lead_conversations' and column_name='customer_name')"),
  },
  {
    file: '202609120015_full_unique_indexes_for_upsert.sql',
    applied: () => exists("select to_regclass('public.idx_lead_messages_provider_ext_msg_full') is not null"),
  },
  {
    file: '202609120016_inbox_security_and_integrity.sql',
    applied: () => exists("select exists(select 1 from information_schema.columns where table_schema='public' and table_name='lead_messages' and column_name='delivery_status') and exists(select 1 from information_schema.columns where table_schema='public' and table_name='lead_conversations' and column_name='converted_at')"),
  },
  {
    file: '202609120017_omnichannel_delivery_and_retry.sql',
    applied: () => exists("select exists(select 1 from information_schema.columns where table_schema='public' and table_name='lead_messages' and column_name='provider_message_id')"),
  },
];

console.log('\nChecking local Wanderlust database migrations...\n');
let changed = false;

for (const migration of migrations) {
  if (migration.applied()) {
    console.log(`  ✓ ${migration.file}`);
    continue;
  }

  console.log(`  → Applying ${migration.file}`);
  try {
    dockerPsql(['-f', `/app-migrations/${migration.file}`], { stdio: 'inherit' });
  } catch {
    console.error(`\nMigration failed: ${migration.file}`);
    console.error('No later migration was applied. Read the PostgreSQL error above before retrying.');
    process.exit(1);
  }

  if (!migration.applied()) {
    console.error(`Migration completed without creating its expected schema marker: ${migration.file}`);
    process.exit(1);
  }
  changed = true;
  console.log(`  ✓ ${migration.file}`);
}

if (changed) {
  try {
    dockerPsql(['-c', "NOTIFY pgrst, 'reload schema';"], { stdio: 'inherit' });
  } catch {
    console.warn('PostgREST schema-cache reload notification failed. Restart travel-lms-rest if a new table is not visible immediately.');
  }
}

console.log(changed ? '\nLocal database is now up to date.\n' : '\nLocal database was already up to date.\n');
