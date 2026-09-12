import { createClient } from '@supabase/supabase-js';

function getArg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;
const email = getArg('email');
const password = getArg('password');
const fullName = getArg('name') || email?.split('@')[0] || 'Administrator';

if (!url || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL/PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SERVICE_ROLE_KEY.');
  process.exit(1);
}
if (!email || !password) {
  console.error('Usage: npm run admin:create -- --email admin@example.com --password "strong-password" --name "Admin Name"');
  process.exit(1);
}
if (password.length < 12) {
  console.error('Admin password must be at least 12 characters.');
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: created, error: createError } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: fullName },
});

let userId = created.user?.id;
if (createError) {
  const { data: users, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) {
    console.error(`Unable to create or resolve admin user: ${createError.message}`);
    process.exit(1);
  }
  userId = users.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())?.id;
  if (!userId) {
    console.error(`Unable to create admin user: ${createError.message}`);
    process.exit(1);
  }
}

const { error: profileError } = await supabase.from('profiles').upsert({
  id: userId,
  email,
  full_name: fullName,
  role: 'admin',
  is_active: true,
  accepting_leads: false,
});

if (profileError) {
  console.error(`Auth user exists, but admin profile provisioning failed: ${profileError.message}`);
  process.exit(1);
}

console.log(`Admin ready: ${email}`);
