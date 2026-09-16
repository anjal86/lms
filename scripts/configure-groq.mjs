import { createCipheriv, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function parseEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const values = {};
  for (const raw of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index < 1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const env = { ...parseEnv('.env'), ...parseEnv('.env.local'), ...process.env };

const GROQ_API_KEY = process.env.GROQ_API_KEY || process.argv[2];
if (!GROQ_API_KEY) {
  console.error('Error: GROQ_API_KEY must be provided via GROQ_API_KEY environment variable or as a CLI argument.');
  process.exit(1);
}
const WORKSPACE_ID = process.env.WORKSPACE_ID || 'a60c041e-afed-419f-9dfb-ce3512929cfc';
const AGENT_ID = process.env.AGENT_ID || '209f08bb-c7b8-4cd7-98e6-62d53a3cf5ae';
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

const PREFIX_V2 = 'enc:v2';
const AAD_V2 = Buffer.from('travel-lms:integration-secret:v2', 'utf8');

function decodeKey(raw, name) {
  let key;
  if (/^[0-9a-f]{64}$/i.test(raw)) {
    key = Buffer.from(raw, 'hex');
  } else {
    key = Buffer.from(raw, 'base64');
  }
  if (key.length !== 32) {
    throw new Error(`${name} must decode to exactly 32 bytes.`);
  }
  return key;
}

function encryptSecret(plaintext) {
  const encKeyRaw = env.INTEGRATION_TOKEN_ENCRYPTION_KEY?.trim();
  if (!encKeyRaw) throw new Error('INTEGRATION_TOKEN_ENCRYPTION_KEY is required in env');
  const key = decodeKey(encKeyRaw, 'INTEGRATION_TOKEN_ENCRYPTION_KEY');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(AAD_V2);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX_V2, iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join(':');
}

function psql(sql) {
  const container = 'travel-lms-db';
  const database = env.POSTGRES_DB || 'postgres';
  const envArgs = env.POSTGRES_PASSWORD ? ['-e', `PGPASSWORD=${env.POSTGRES_PASSWORD}`] : [];
  const base = ['exec', ...envArgs, container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', database, '-t', '-A', '-c', sql];
  return execFileSync('docker', base, { encoding: 'utf8' }).trim();
}

async function run() {
  console.log('1. Encrypting Groq API key...');
  const encryptedKey = encryptSecret(GROQ_API_KEY);
  console.log('   Encrypted format:', encryptedKey.slice(0, 30) + '...');

  console.log('2. Finding or inserting Groq in ai_provider_configs...');
  let configId = psql(`SELECT id FROM ai_provider_configs WHERE workspace_id = '${WORKSPACE_ID}' AND provider = 'groq' LIMIT 1;`).split('\n')[0].trim();
  
  if (!configId) {
    psql(`
      INSERT INTO ai_provider_configs (workspace_id, name, provider, api_style, base_url, is_active)
      VALUES ('${WORKSPACE_ID}', 'Groq', 'groq', 'openai_chat', 'https://api.groq.com/openai/v1', true);
    `);
    configId = psql(`SELECT id FROM ai_provider_configs WHERE workspace_id = '${WORKSPACE_ID}' AND provider = 'groq' LIMIT 1;`).split('\n')[0].trim();
    console.log('   Created new Groq provider config:', configId);
  } else {
    psql(`
      UPDATE ai_provider_configs 
      SET name = 'Groq',
          base_url = 'https://api.groq.com/openai/v1',
          api_style = 'openai_chat',
          is_active = true,
          updated_at = NOW()
      WHERE id = '${configId}';
    `);
    console.log('   Updated existing Groq provider config:', configId);
  }

  console.log('3. Storing encrypted secret in ai_provider_secrets...');
  psql(`
    INSERT INTO ai_provider_secrets (provider_config_id, workspace_id, encrypted_api_key, updated_at)
    VALUES ('${configId}', '${WORKSPACE_ID}', '${encryptedKey}', NOW())
    ON CONFLICT (provider_config_id) 
    DO UPDATE SET encrypted_api_key = EXCLUDED.encrypted_api_key, updated_at = NOW();
  `);
  console.log('   Secret securely stored in database.');

  console.log(`4. Updating AI agent ${AGENT_ID} to use Groq (${MODEL})...`);
  const updatedAgent = psql(`
    UPDATE ai_agents
    SET provider = 'groq',
        provider_config_id = '${configId}',
        model = '${MODEL}',
        is_active = true,
        updated_at = NOW()
    WHERE id = '${AGENT_ID}'
    RETURNING id || ' | ' || name || ' | ' || provider || ' | ' || model || ' | ' || is_active;
  `);
  console.log('   Agent updated:', updatedAgent);

  console.log('\n=== VERIFICATION: Querying back records ===');
  const checkConfig = psql(`SELECT id, name, provider, is_active FROM ai_provider_configs WHERE id = '${configId}';`);
  console.log('Config:', checkConfig);

  const checkSecret = psql(`SELECT provider_config_id, left(encrypted_api_key, 25) FROM ai_provider_secrets WHERE provider_config_id = '${configId}';`);
  console.log('Secret:', checkSecret);

  const checkAgent = psql(`SELECT id, name, provider, provider_config_id, model FROM ai_agents WHERE id = '${AGENT_ID}';`);
  console.log('Agent:', checkAgent);

  console.log('\nSUCCESS: Groq API key configured and agent assigned to openai/gpt-oss-120b!');
}

run().catch((err) => {
  console.error('Configuration failed:', err);
  process.exit(1);
});
