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
  {
    file: '202609150068_chat_phone_detection_integrity.sql',
    marker: "select to_regprocedure('public.extract_chat_phone(text)') is not null and to_regprocedure('public.apply_detected_chat_phone(uuid,text,text,timestamptz)') is not null and exists(select 1 from pg_trigger where tgname='trg_detect_chat_phone_from_message' and not tgisinternal)",
  },
  {
    file: '202609150069_multi_phone_chat_detection.sql',
    marker: "select to_regprocedure('public.extract_chat_phones(text)') is not null and to_regprocedure('public.apply_detected_chat_phones(uuid,text[],text,text,timestamptz)') is not null and position('extract_chat_phones' in pg_get_functiondef(to_regprocedure('public.detect_chat_phone_from_message()'))) > 0",
  },
  {
    file: '202609150070_chat_contact_detail_detection.sql',
    marker: "select to_regprocedure('public.extract_chat_emails(text)') is not null and to_regprocedure('public.detect_chat_location(text)') is not null and to_regprocedure('public.apply_detected_chat_contact_details(uuid,text[],jsonb,text[],text,timestamptz)') is not null and exists(select 1 from pg_trigger where tgname='trg_detect_chat_contact_details' and not tgisinternal)",
  },
  {
    file: '202609150071_live_conversation_auto_routing.sql',
    marker: "select to_regprocedure('public.route_live_inbound_conversation()') is not null and exists(select 1 from pg_trigger where tgname='trg_route_live_inbound_conversation' and not tgisinternal)",
  },
  {
    file: '202609150072_conversation_team_queues.sql',
    marker: "select to_regclass('public.conversation_teams') is not null and to_regclass('public.conversation_team_members') is not null and to_regprocedure('public.set_conversation_team(uuid,text,boolean,text)') is not null",
  },
  {
    file: '202609150073_conversation_team_management.sql',
    marker: "select to_regprocedure('public.save_conversation_team(uuid,text,text,text,boolean,uuid[])') is not null",
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