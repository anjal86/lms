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
    file: '202609160087_ai_runtime_observability.sql',
    marker: "select to_regclass('public.ai_runs') is not null and exists(select 1 from information_schema.columns where table_schema='public' and table_name='ai_agent_jobs' and column_name='phase')",
  },
  {
    file: '202609160088_workspace_ai_knowledge.sql',
    marker: "select to_regclass('public.knowledge_sources') is not null and to_regclass('public.knowledge_chunks') is not null and to_regprocedure('public.search_ai_agent_knowledge(uuid,uuid,text,integer)') is not null",
  },
  {
    file: '202609170090_conversation_ai_state_insert_policy.sql',
    marker: "select exists(select 1 from pg_policies where schemaname='public' and tablename='conversation_ai_states' and policyname='conversation_ai_states_insert')",
  },
  {
    file: '202609170091_inbox_assignment_activity.sql',
    marker: "select exists(select 1 from information_schema.columns where table_schema='public' and table_name='lead_conversations' and column_name='inbox_activity_at') and to_regprocedure('public.maintain_conversation_inbox_activity()') is not null",
  },
  {
    file: '202609170092_inbox_query_performance.sql',
    marker: "select to_regclass('public.lead_conversations_workspace_open_message_idx') is not null and to_regclass('public.lead_conversations_workspace_snooze_due_idx') is not null",
  },
  {
    file: '202609170093_inbox_queue_metrics.sql',
    marker: "select to_regprocedure('public.inbox_queue_metrics(uuid,uuid,text)') is not null",
  },
  {
    file: '202609170094_chatwoot_foundation.sql',
    marker: "select to_regclass('public.chatwoot_accounts') is not null and to_regclass('public.chatwoot_inboxes') is not null and to_regclass('public.chatwoot_conversation_links') is not null and to_regclass('public.chatwoot_webhook_events') is not null",
  },
  {
    file: '202609170095_chatwoot_per_account_webhook_secret.sql',
    marker: "select exists(select 1 from information_schema.columns where table_schema='public' and table_name='chatwoot_accounts' and column_name='webhook_secret_encrypted')",
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