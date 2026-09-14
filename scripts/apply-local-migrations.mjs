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

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

try {
  execFileSync('docker', ['inspect', dbContainer], { stdio: 'ignore' });
} catch {
  console.error(`Local database container ${dbContainer} is not available. Start the Docker stack first.`);
  process.exit(1);
}

if (!exists("select to_regclass('public.profiles') is not null and to_regclass('public.leads') is not null")) {
  console.error('The local database does not contain the base CRM schema. Do not apply incremental repairs to this database.');
  console.error('Create a fresh local database volume or restore a valid database first.');
  process.exit(1);
}

const functionDefinitionContains = (signature, marker) => exists(
  `select coalesce(position(${sqlLiteral(marker)} in pg_get_functiondef(to_regprocedure(${sqlLiteral(signature)}))), 0) > 0`
);

const migrations = [
  { file: '202609120009_management_audit_log.sql', applied: () => exists("select to_regclass('public.audit_events') is not null") },
  { file: '202609120010_lead_readiness_score.sql', applied: () => exists("select exists(select 1 from information_schema.columns where table_schema='public' and table_name='leads' and column_name='lead_score')") },
  { file: '202609120011_normalized_operations_and_active_users.sql', applied: () => exists("select to_regclass('public.lead_quotes') is not null and to_regprocedure('public.current_user_active()') is not null") },
  { file: '202609120012_server_dashboard_queries.sql', applied: () => exists("select to_regprocedure('public.dashboard_operational_summary()') is not null and to_regprocedure('public.lead_pipeline_summary()') is not null") },
  { file: '202609120013_omnichannel_integrations.sql', applied: () => exists("select to_regclass('public.integration_connections') is not null and to_regclass('public.lead_messages') is not null and exists(select 1 from information_schema.columns where table_schema='public' and table_name='leads' and column_name='source_channel')") },
  { file: '202609120014_inbox_and_lead_conversion.sql', applied: () => exists("select exists(select 1 from information_schema.columns where table_schema='public' and table_name='lead_conversations' and column_name='lead_id' and is_nullable='YES') and exists(select 1 from information_schema.columns where table_schema='public' and table_name='lead_conversations' and column_name='customer_name')") },
  { file: '202609120015_full_unique_indexes_for_upsert.sql', applied: () => exists("select to_regclass('public.idx_lead_messages_provider_ext_msg_full') is not null") },
  { file: '202609120016_inbox_security_and_integrity.sql', applied: () => exists("select exists(select 1 from information_schema.columns where table_schema='public' and table_name='lead_messages' and column_name='delivery_status') and exists(select 1 from information_schema.columns where table_schema='public' and table_name='lead_conversations' and column_name='converted_at')") },
  { file: '202609120017_omnichannel_delivery_and_retry.sql', applied: () => exists("select exists(select 1 from information_schema.columns where table_schema='public' and table_name='lead_messages' and column_name='provider_message_id')") },
  { file: '202609120018_customer_profile_integrity.sql', applied: () => exists("select to_regprocedure('public.update_conversation_location(uuid,text,text)') is not null") },
  { file: '202609120019_customer_profile_merge_protection.sql', applied: () => exists("select to_regprocedure('public.merge_customer_profile_jsonb(jsonb,jsonb)') is not null and exists(select 1 from pg_trigger where tgname='trg_preserve_conversation_customer_metadata' and not tgisinternal)") },
  { file: '202609120020_sync_cursor_safety.sql', applied: () => exists("select exists(select 1 from pg_trigger where tgname='trg_preserve_integration_cursor_on_error' and not tgisinternal)") },
  { file: '202609120021_customer_profile_merge_consistency.sql', applied: () => functionDefinitionContains('public.merge_customer_profile_jsonb(jsonb,jsonb)', 'v_existing_country') },
  { file: '202609120022_profile_load_trigger_integrity.sql', applied: () => functionDefinitionContains('public.protect_profile_privileged_fields()', 'pg_trigger_depth() > 1') },
  { file: '202609120023_phone_lead_index_integrity.sql', applied: () => exists("select to_regprocedure('public.extract_phone_numbers_from_text(text)') is not null and exists(select 1 from pg_trigger where tgname='trg_index_phone_from_lead_message' and not tgisinternal)") },
  { file: '202609120024_dynamic_business_platform.sql', applied: () => exists("select to_regclass('public.workspaces') is not null and to_regclass('public.field_definitions') is not null and to_regprocedure('public.apply_business_template(uuid,text)') is not null and exists(select 1 from information_schema.columns where table_schema='public' and table_name='leads' and column_name='custom_data')") },
  { file: '202609120025_workspace_runtime_integrity.sql', applied: () => exists("select exists(select 1 from pg_trigger where tgname='trg_profiles_workspace_membership' and not tgisinternal) and position('v_business_type' in pg_get_functiondef(to_regprocedure('public.prepare_lead()'))) > 0") },
  { file: '202609120026_business_configuration_provenance.sql', applied: () => exists("select exists(select 1 from information_schema.columns where table_schema='public' and table_name='field_definitions' and column_name='definition_source') and exists(select 1 from information_schema.columns where table_schema='public' and table_name='pipelines' and column_name='definition_source')") },
  { file: '202609120027_adaptive_inbox_conversion.sql', applied: () => exists("select to_regprocedure('public.convert_conversation_to_business_lead(uuid,text,text,text,text,text,text,uuid,text,jsonb)') is not null and to_regprocedure('public.repair_workspace_pipeline_assignments(uuid)') is not null") },
  { file: '202609120028_configurable_pipeline_editor.sql', applied: () => exists("select to_regprocedure('public.save_workspace_pipeline(uuid,text,jsonb)') is not null") },
  { file: '202609120029_pipeline_legacy_stage_sync.sql', applied: () => exists("select exists(select 1 from pg_trigger where tgname='trg_sync_lead_legacy_stage_from_pipeline' and not tgisinternal) and exists(select 1 from pg_trigger where tgname='trg_sync_pipeline_stage_legacy_leads' and not tgisinternal)") },
  { file: '202609120030_conversation_operations_platform.sql', applied: () => exists("select to_regclass('public.contacts') is not null and to_regclass('public.conversation_events') is not null and to_regclass('public.automation_workflows') is not null and exists(select 1 from information_schema.columns where table_schema='public' and table_name='lead_conversations' and column_name='workflow_state') and to_regprocedure('public.assign_conversation(uuid,uuid,text,uuid)') is not null") },
  { file: '202609120031_automation_execution_integrity.sql', applied: () => exists("select to_regprocedure('public.automation_run_authorized(uuid,uuid)') is not null and position('v_is_automation' in pg_get_functiondef(to_regprocedure('public.transition_conversation(uuid,text,timestamptz,text,text,timestamptz,uuid)'))) > 0") },
  { file: '202609120032_contact_merge_integrity.sql', applied: () => exists("select to_regprocedure('public.merge_contacts(uuid,uuid)') is not null") },
  { file: '202609120033_inbox_operational_views.sql', applied: () => exists("select exists(select 1 from information_schema.columns where table_schema='public' and table_name='lead_conversations' and column_name='needs_reply') and exists(select 1 from pg_trigger where tgname='trg_clear_needs_reply_when_closed' and not tgisinternal)") },
  { file: '202609120034_profile_assignment_metrics.sql', applied: () => exists("select exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='last_assigned_at') and exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='conversion_rate')") },
  { file: '202609120035_conversation_sessions_saved_views_permissions.sql', applied: () => exists("select to_regclass('public.conversation_sessions') is not null and to_regclass('public.conversation_saved_views') is not null and to_regclass('public.workspace_role_permissions') is not null and to_regprocedure('public.has_workspace_permission(text)') is not null") },
  { file: '202609120036_operational_worker_and_automation_actions.sql', applied: () => exists("select to_regprocedure('public.assign_conversation_worker(uuid,text)') is not null and position('set_lifecycle' in pg_get_functiondef(to_regprocedure('public.run_conversation_automations()'))) > 0") },
  { file: '202609120037_contact_profile_edit_integrity.sql', applied: () => exists("select to_regprocedure('public.update_contact_profile(uuid,text,text,text,text,uuid,jsonb,jsonb)') is not null") },
];

console.log('\nChecking local CRM database migrations...\n');
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