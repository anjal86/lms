import { createClient } from '@supabase/supabase-js';

if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    try {
      process.loadEnvFile('.env');
    } catch {}
  }
}

function getArg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;
const seedPassword = getArg('password') || process.env.SEED_USER_PASSWORD;
const confirmed = process.argv.includes('--confirm-demo-seed') || process.env.ALLOW_DEMO_SEED === 'true';

if (!confirmed) {
  console.error('Demo seeding is disabled by default. Re-run with --confirm-demo-seed or ALLOW_DEMO_SEED=true.');
  process.exit(1);
}
if (!url || !serviceRoleKey) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL/PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SERVICE_ROLE_KEY before seeding.');
  process.exit(1);
}
if (!seedPassword || seedPassword.length < 12) {
  console.error('Provide a seed password of at least 12 characters with --password or SEED_USER_PASSWORD.');
  process.exit(1);
}

const USERS = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'admin@travellms.com',
    fullName: 'Sarah Jenkins',
    role: 'admin',
    employee_code: 'TRV-ADM-001',
    phone: '+1 415 555 0100',
    direct_extension: 'Ext. 101',
    avatar_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    destination_tags: ['Global', 'VIP Luxury', 'Executive'],
    max_capacity: 50,
    accepting_leads: false,
    bio: 'Agency founder & operations head. Oversees company-wide SLAs, global vendor contracts, and premium client escalations.',
    languages: ['English', 'Spanish'],
    office_location: 'San Francisco HQ',
    certifications: ['IATA Travel Executive', 'Virtuoso Certified Advisor'],
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    email: 'manager@travellms.com',
    fullName: 'David Miller',
    role: 'manager',
    employee_code: 'TRV-MGR-002',
    phone: '+1 415 555 0101',
    direct_extension: 'Ext. 102',
    avatar_url: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
    destination_tags: ['All Teams', 'Escalations', 'Group Charters'],
    max_capacity: 40,
    accepting_leads: false,
    bio: 'Sales Director overseeing consultant performance, round-robin lead allocation, and monthly profit margins.',
    languages: ['English', 'German'],
    office_location: 'San Francisco HQ',
    certifications: ['Certified Travel Industry Leader', 'Cruises & Groups Master'],
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    email: 'alex@travellms.com',
    fullName: 'Alex Rivera',
    role: 'agent',
    employee_code: 'TRV-AGT-003',
    phone: '+1 415 555 0102',
    direct_extension: 'Ext. 103',
    avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    destination_tags: ['Bali', 'Thailand', 'Vietnam', 'Singapore', 'Asia'],
    max_capacity: 25,
    accepting_leads: true,
    bio: 'Southeast Asia specialist focusing on luxury honeymoons, private villa stays in Ubud & Seminyak, and exotic multi-city tours.',
    languages: ['English', 'Spanish', 'Indonesian (Basic)'],
    office_location: 'Remote - West Coast',
    certifications: ['Wonderful Indonesia Certified Specialist', 'Thailand Tourism Board Expert'],
  },
  {
    id: '44444444-4444-4444-4444-444444444444',
    email: 'emma@travellms.com',
    fullName: 'Emma Watson',
    role: 'agent',
    employee_code: 'TRV-AGT-004',
    phone: '+1 415 555 0103',
    direct_extension: 'Ext. 104',
    avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    destination_tags: ['Switzerland', 'Paris', 'Italy', 'Europe', 'Greece'],
    max_capacity: 25,
    accepting_leads: true,
    bio: 'European grand tour curator. Specializes in Swiss panoramic trains, romantic Parisian boutique getaways, and Amalfi Coast charters.',
    languages: ['English', 'French', 'Italian'],
    office_location: 'Remote - East Coast',
    certifications: ['Switzerland Travel Academy Gold', 'France Destination Specialist'],
  },
  {
    id: '55555555-5555-5555-5555-555555555555',
    email: 'michael@travellms.com',
    fullName: 'Michael Chang',
    role: 'agent',
    employee_code: 'TRV-AGT-005',
    phone: '+1 415 555 0104',
    direct_extension: 'Ext. 105',
    avatar_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    destination_tags: ['Dubai', 'Maldives', 'Mauritius', 'Egypt', 'Middle East'],
    max_capacity: 25,
    accepting_leads: true,
    bio: 'Middle East & Indian Ocean bespoke designer. Expert in overwater Maldives resorts, Dubai desert glamping, and private Nile River cruises.',
    languages: ['English', 'Mandarin', 'Arabic (Basic)'],
    office_location: 'San Francisco HQ',
    certifications: ['Dubai Expert Plus', 'Maldives Border Miles Partner'],
  },
];

console.log(`Connecting to Supabase at: ${url}`);
console.log(`Creating/updating ${USERS.length} explicitly confirmed demo users.`);

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

for (const user of USERS) {
  let userId = user.id;
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    id: user.id,
    email: user.email,
    password: seedPassword,
    email_confirm: true,
    user_metadata: { full_name: user.fullName },
  });

  if (createError) {
    if (createError.message.includes('already exists') || createError.status === 422 || createError.status === 400) {
      const { data: listData, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (listError) throw listError;
      const existing = listData?.users?.find((item) => item.email?.toLowerCase() === user.email.toLowerCase());
      if (!existing) throw createError;
      userId = existing.id;
      const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
        password: seedPassword,
        email_confirm: true,
        user_metadata: { full_name: user.fullName },
      });
      if (updateError) throw updateError;
    } else {
      throw createError;
    }
  } else if (created.user) {
    userId = created.user.id;
  }

  const { error: profileError } = await supabase.from('profiles').upsert({
    id: userId,
    email: user.email,
    full_name: user.fullName,
    role: user.role,
    employee_code: user.employee_code,
    phone: user.phone,
    direct_extension: user.direct_extension,
    avatar_url: user.avatar_url,
    destination_tags: user.destination_tags,
    max_capacity: user.max_capacity,
    current_load: 0,
    status: 'available',
    is_active: true,
    accepting_leads: user.accepting_leads,
    bio: user.bio,
    languages: user.languages,
    office_location: user.office_location,
    certifications: user.certifications,
  });

  if (profileError) throw profileError;
  console.log(`[${user.role.toUpperCase()}] ${user.email} ready.`);
}

console.log('Demo users seeded. Password was supplied externally and was not printed.');
