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
function query(sql) { return psql(['-tAc', sql]).trim(); }
function exists(sql) { return query(sql) === 't'; }

try {
  execFileSync('docker', ['inspect', container], { stdio: 'ignore' });
} catch {
  console.error(`Local database container ${container} is not available. Start the Docker stack first.`);
  process.exit(1);
}

const migrations = [
  {
    file: '202609120039_contact_opportunity_identity.sql',
    applied: () => exists("select exists(select 1 from information_schema.columns where table_schema='public' and table_name='leads' and column_name='contact_id') and to_regprocedure('public.derived_contact_lifecycle(uuid)') is not null"),
  },
  {
    file: '202609120040_qualification_and_identity_cleanup.sql',
    applied: () => exists("select coalesce(position('UPDATE OF customer_name, customer_phone, customer_email' in pg_get_triggerdef(oid)),0) > 0 from pg_trigger where tgname='trg_leads_link_contact_identity' and not tgisinternal limit 1"),
  },
  {
    file: '202609120041_crm_core_completion.sql',
    applied: () => exists("select to_regclass('public.work_items') is not null and to_regclass('public.business_events') is not null and to_regclass('public.opportunity_health') is not null and to_regprocedure('public.crm_conversion_summary()') is not null"),
  },
  {
    file: '202609120042_conversation_work_item_sync.sql',
    applied: () => exists("select exists(select 1 from pg_trigger where tgname='trg_conversation_next_action_work_item' and not tgisinternal)"),
  },
  {
    file: '202609120043_crm_core_integrity_hardening.sql',
    applied: () => exists("select exists(select 1 from pg_trigger where tgname='trg_work_items_validate_workspace_refs' and not tgisinternal) and exists(select 1 from pg_trigger where tgname='trg_quote_lifecycle_integrity' and not tgisinternal) and exists(select 1 from pg_trigger where tgname='trg_document_lifecycle_integrity' and not tgisinternal)"),
  },
  {
    file: '202609120044_proposal_revision_and_business_event_automation.sql',
    applied: () => exists("select to_regprocedure('public.create_proposal_revision(uuid,text,text,text,text,numeric,numeric,text,jsonb)') is not null and exists(select 1 from information_schema.columns where table_schema='public' and table_name='automation_runs' and column_name='business_event_id')"),
  },
  {
    file: '202609120045_business_event_runtime_integrity.sql',
    applied: () => exists("select exists(select 1 from information_schema.columns where table_schema='public' and table_name='business_events' and column_name='status') and exists(select 1 from pg_trigger where tgname='trg_lead_business_event' and not tgisinternal) and position('automation_generated' in pg_get_functiondef(to_regprocedure('public.run_business_event_automations()'))) > 0"),
  },
  {
    file: '202609120046_inbox_realtime_publication.sql',
    applied: () => exists("select not exists(select 1 from pg_publication where pubname='supabase_realtime') or (exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='lead_conversations') and exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='lead_messages'))"),
  },
];

console.log('\nChecking local CRM core migrations...\n');
let changed = false;

for (const migration of migrations) {
  if (migration.applied()) {
    console.log(`  ✓ ${migration.file}`);
    continue;
  }

  console.log(`  → Applying ${migration.file}`);
  try {
    psql(['-f', `/app-migrations/${migration.file}`], 'inherit');
  } catch {
    console.error(`Migration failed: ${migration.file}`);
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
    psql(['-c', "NOTIFY pgrst, 'reload schema';"], 'inherit');
  } catch {
    console.warn('PostgREST schema-cache reload notification failed. Restart travel-lms-rest if new CRM objects are not visible immediately.');
  }
}

console.log(changed ? '\nLocal CRM core is now up to date.\n' : '\nLocal CRM core was already up to date.\n');
