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
  { file: '202609150066_social_identity_phone_cleanup.sql', marker: "select to_regprocedure('public.sanitize_social_pseudo_phone()') is not null and exists(select 1 from pg_trigger where tgname='trg_sanitize_social_pseudo_phone' and not tgisinternal)" },
  { file: '202609150067_workspace_scoped_channel_ingestion.sql', marker: "select position('connection_id is not distinct from p_connection_id' in pg_get_functiondef(to_regprocedure('public.ingest_channel_message(uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,timestamptz,jsonb,jsonb,text)'))) > 0" },
  { file: '202609150068_chat_phone_detection_integrity.sql', marker: "select to_regprocedure('public.extract_chat_phone(text)') is not null and to_regprocedure('public.apply_detected_chat_phone(uuid,text,text,timestamptz)') is not null and exists(select 1 from pg_trigger where tgname='trg_detect_chat_phone_from_message' and not tgisinternal)" },
  { file: '202609150069_multi_phone_chat_detection.sql', marker: "select to_regprocedure('public.extract_chat_phones(text)') is not null and to_regprocedure('public.apply_detected_chat_phones(uuid,text[],text,text,timestamptz)') is not null and position('extract_chat_phones' in pg_get_functiondef(to_regprocedure('public.detect_chat_phone_from_message()'))) > 0" },
  { file: '202609150070_chat_contact_detail_detection.sql', marker: "select to_regprocedure('public.extract_chat_emails(text)') is not null and to_regprocedure('public.detect_chat_location(text)') is not null and to_regprocedure('public.apply_detected_chat_contact_details(uuid,text[],jsonb,text[],text,timestamptz)') is not null and exists(select 1 from pg_trigger where tgname='trg_detect_chat_contact_details' and not tgisinternal)" },
  { file: '202609150071_live_conversation_auto_routing.sql', marker: "select to_regprocedure('public.route_live_inbound_conversation()') is not null and exists(select 1 from pg_trigger where tgname='trg_route_live_inbound_conversation' and not tgisinternal)" },
  { file: '202609150072_conversation_team_queues.sql', marker: "select to_regclass('public.conversation_teams') is not null and to_regclass('public.conversation_team_members') is not null and to_regprocedure('public.set_conversation_team(uuid,text,boolean,text)') is not null" },
  { file: '202609150073_conversation_team_management.sql', marker: "select to_regprocedure('public.save_conversation_team(uuid,text,text,text,boolean,uuid[])') is not null" },
  { file: '202609150074_conversation_team_key_integrity.sql', marker: "select exists(select 1 from pg_trigger where tgname='trg_protect_conversation_team_key' and not tgisinternal)" },
  { file: '202609160075_workspace_ai_agents.sql', marker: "select to_regclass('public.ai_agents') is not null and to_regclass('public.ai_agent_jobs') is not null and to_regprocedure('public.claim_ai_agent_job()') is not null and exists(select 1 from pg_trigger where tgname='trg_queue_live_ai_agent_message' and not tgisinternal)" },
  {
    file: '202609160076_ai_agent_management.sql',
    marker: "select to_regclass('public.ai_agents') is not null and (to_regprocedure('public.save_workspace_ai_agent(uuid,text,text,text,text,text,text[],text,boolean,numeric,numeric,integer,integer,text,text[],boolean,uuid[])') is not null or to_regprocedure('public.save_workspace_ai_agent(uuid,text,text,text,uuid,text,text,text[],text,boolean,numeric,numeric,integer,integer,text,text[],boolean,uuid[])') is not null)",
  },
  { file: '202609160077_ai_agent_routing_interop.sql', marker: "select position('v_ai_auto' in pg_get_functiondef(to_regprocedure('public.route_live_inbound_conversation()'))) > 0 and position('v_agent.mode <> ''assist''' in pg_get_functiondef(to_regprocedure('public.queue_live_ai_agent_message()'))) > 0" },
  { file: '202609160078_ai_assist_human_ownership.sql', marker: "select exists(select 1 from pg_trigger where tgname='trg_normalize_ai_agent_mode_settings' and not tgisinternal)" },
  { file: '202609160079_ai_state_access_integrity.sql', marker: "select exists(select 1 from pg_policies where schemaname='public' and tablename='conversation_ai_states' and policyname='conversation_ai_states_update' and position('can_access_conversation' in coalesce(qual,'')) > 0)" },
  {
    file: '202609160080_workspace_ai_provider_byok.sql',
    marker: "select to_regclass('public.ai_provider_configs') is not null and to_regclass('public.ai_provider_secrets') is not null and to_regprocedure('public.save_workspace_ai_provider(uuid,text,text,text,text,boolean,text,boolean)') is not null",
  },
  {
    file: '202609160081_ai_agent_provider_binding.sql',
    marker: "select to_regprocedure('public.save_workspace_ai_agent(uuid,text,text,text,uuid,text,text,text[],text,boolean,numeric,numeric,integer,integer,text,text[],boolean,uuid[])') is not null",
  },
];

for (const migration of migrations) {
  if (psql(['-tAc', migration.marker]).trim() === 't') {
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
