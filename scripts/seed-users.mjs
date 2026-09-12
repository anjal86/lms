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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL || 'http://localhost:8000';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIstateIjoxNjAwMDAwMDAwLCJleHAiOjIwMDAwMDAwMDB9.s1e2r3v4i5c6e7_r8o9l0e1_k2e3y4_t5o6k7e8n9';

function getArg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const defaultPassword = getArg('password') || 'TravelLMS2026!';

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
const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(`\nCreating ${USERS.length} system users with default password: "${defaultPassword}"\n`);

for (const u of USERS) {
  let userId = u.id;
  
  // Try to create auth user
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    id: u.id,
    email: u.email,
    password: defaultPassword,
    email_confirm: true,
    user_metadata: { full_name: u.fullName },
  });

  if (createError) {
    if (createError.message.includes('already exists') || createError.status === 422 || createError.status === 400) {
      // Find existing user id
      const { data: listData } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existing = listData?.users?.find((item) => item.email?.toLowerCase() === u.email.toLowerCase());
      if (existing) {
        userId = existing.id;
        // Update password to match
        await supabase.auth.admin.updateUserById(userId, {
          password: defaultPassword,
          email_confirm: true,
          user_metadata: { full_name: u.fullName },
        });
      }
    } else {
      console.warn(`Warning creating auth user ${u.email}: ${createError.message}`);
    }
  } else if (created.user) {
    userId = created.user.id;
  }

  // Upsert profile in DB
  const { error: profileError } = await supabase.from('profiles').upsert({
    id: userId,
    email: u.email,
    full_name: u.fullName,
    role: u.role,
    employee_code: u.employee_code,
    phone: u.phone,
    direct_extension: u.direct_extension,
    avatar_url: u.avatar_url,
    destination_tags: u.destination_tags,
    max_capacity: u.max_capacity,
    current_load: 0,
    status: 'available',
    is_active: true,
    accepting_leads: u.accepting_leads,
    bio: u.bio,
    languages: u.languages,
    office_location: u.office_location,
    certifications: u.certifications,
  });

  if (profileError) {
    console.error(`❌ Failed to upsert profile for ${u.email}: ${profileError.message}`);
  } else {
    console.log(`✅ [${u.role.toUpperCase()}] ${u.fullName} (${u.email}) - Ready! ID: ${userId}`);
  }
}

console.log('\n✨ All users created successfully!\n');
