import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const InviteSchema = z.object({
  email: z.string().trim().email().max(254),
  full_name: z.string().trim().min(2).max(160),
  role: z.enum(['admin', 'manager', 'agent']).default('agent'),
  phone: z.string().trim().max(40).optional(),
  direct_extension: z.string().trim().max(40).optional(),
  avatar_url: z.string().url().max(1000).optional(),
  destination_tags: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
  max_capacity: z.number().int().min(1).max(500).default(25),
  accepting_leads: z.boolean().default(true),
  bio: z.string().trim().max(2000).optional(),
  languages: z.array(z.string().trim().min(1).max(80)).max(30).default(['English']),
  office_location: z.string().trim().max(200).optional(),
  certifications: z.array(z.string().trim().min(1).max(160)).max(50).default([]),
});

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const { data: actor, error: actorError } = await supabase
    .from('profiles')
    .select('role,is_active')
    .eq('id', user.id)
    .single();

  if (actorError || !actor?.is_active || !['admin', 'manager'].includes(actor.role)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = InviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed.', fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const input = parsed.data;
  if (actor.role === 'manager' && input.role !== 'agent') {
    return NextResponse.json({ error: 'Managers may only invite travel consultants.' }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const { data: invite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    input.email.toLowerCase(),
    {
      redirectTo: `${appUrl}/auth/callback?next=/profile`,
      data: { full_name: input.full_name },
    }
  );

  if (inviteError || !invite.user) {
    console.error('Team invite failed:', inviteError?.message);
    const status = inviteError?.message?.toLowerCase().includes('already') ? 409 : 500;
    return NextResponse.json({ error: status === 409 ? 'An account with that email already exists.' : 'Unable to invite team member.' }, { status });
  }

  const employeeCode = `TRV-${input.role === 'admin' ? 'ADM' : input.role === 'manager' ? 'MGR' : 'AGT'}-${invite.user.id.slice(0, 8).toUpperCase()}`;
  const profilePayload = {
    id: invite.user.id,
    email: input.email.toLowerCase(),
    full_name: input.full_name,
    role: input.role,
    employee_code: employeeCode,
    phone: input.phone || null,
    direct_extension: input.direct_extension || null,
    avatar_url: input.avatar_url || null,
    destination_tags: input.destination_tags,
    max_capacity: input.max_capacity,
    status: 'offline',
    is_active: true,
    accepting_leads: input.role === 'agent' ? input.accepting_leads : false,
    bio: input.bio || null,
    languages: input.languages,
    office_location: input.office_location || null,
    certifications: input.certifications,
  };

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .upsert(profilePayload)
    .select('*')
    .single();

  if (profileError) {
    console.error('Invited user profile provisioning failed:', profileError.message);
    await admin.auth.admin.deleteUser(invite.user.id);
    return NextResponse.json({ error: 'Unable to provision team member.' }, { status: 500 });
  }

  return NextResponse.json({ profile }, { status: 201 });
}
