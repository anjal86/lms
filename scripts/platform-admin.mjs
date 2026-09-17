import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

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

const [action, rawEmail] = process.argv.slice(2);
if (!['grant', 'revoke'].includes(action || '') || !rawEmail) {
  console.error('Usage: npm run platform-admin -- grant user@example.com');
  console.error('       npm run platform-admin -- revoke user@example.com');
  process.exit(1);
}

const env = { ...parseEnv('.env'), ...parseEnv('.env.local'), ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL || env.PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL/PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const email = rawEmail.trim().toLowerCase();
const { data: profile, error: profileError } = await supabase.from('profiles').select('id,email,full_name,is_active').eq('email', email).maybeSingle();
if (profileError || !profile) {
  console.error(profileError?.message || `No profile found for ${email}.`);
  process.exit(1);
}
if (!profile.is_active && action === 'grant') {
  console.error(`Cannot grant platform access to disabled profile ${email}.`);
  process.exit(1);
}

if (action === 'grant') {
  const { error } = await supabase.from('platform_admins').upsert({ user_id: profile.id, note: 'Provisioned with scripts/platform-admin.mjs' }, { onConflict: 'user_id' });
  if (error) { console.error(error.message); process.exit(1); }
  console.log(`✓ Platform super-admin granted to ${profile.full_name || email} (${email}).`);
} else {
  const { error } = await supabase.from('platform_admins').delete().eq('user_id', profile.id);
  if (error) { console.error(error.message); process.exit(1); }
  console.log(`✓ Platform super-admin revoked from ${profile.full_name || email} (${email}).`);
}
