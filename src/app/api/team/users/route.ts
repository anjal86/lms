import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('disable'), user_id: z.string().uuid() }),
  z.object({ action: z.literal('enable'), user_id: z.string().uuid() }),
  z.object({ action: z.literal('reset_password'), user_id: z.string().uuid() }),
  z.object({ action: z.literal('role'), user_id: z.string().uuid(), role: z.enum(['admin', 'manager', 'agent']) }),
]);

async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { response: NextResponse.json({ error: 'Unauthorized.' }, { status: 401 }) } as const;

  const { data: actor } = await supabase
    .from('profiles')
    .select('role,is_active')
    .eq('id', user.id)
    .maybeSingle();

  if (!actor?.is_active || actor.role !== 'admin') {
    return { response: NextResponse.json({ error: 'Administrator access required.' }, { status: 403 }) } as const;
  }
  return { user, supabase } as const;
}

export async function GET() {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;

  const admin = createSupabaseAdminClient();
  const [{ data: authUsers, error: authError }, { data: profiles, error: profileError }] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin.from('profiles').select('*').order('full_name'),
  ]);

  if (authError || profileError) {
    console.error('User management load failed:', authError?.message || profileError?.message);
    return NextResponse.json({ error: 'Unable to load users.' }, { status: 500 });
  }

  const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));
  const now = Date.now();
  const users = (authUsers.users || []).map((user) => {
    const profile = profileMap.get(user.id) || null;
    const bannedUntil = user.banned_until ? new Date(user.banned_until).getTime() : 0;
    return {
      id: user.id,
      email: user.email || profile?.email || '',
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at || null,
      email_confirmed_at: user.email_confirmed_at || null,
      banned_until: user.banned_until || null,
      is_banned: Boolean(bannedUntil && bannedUntil > now),
      profile,
    };
  });

  return NextResponse.json({ users }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed.', fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const input = parsed.data;
  if (input.user_id === auth.user.id && (input.action === 'disable' || (input.action === 'role' && input.role !== 'admin'))) {
    return NextResponse.json({ error: 'You cannot disable or demote your own administrator account.' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: targetResult, error: targetError } = await admin.auth.admin.getUserById(input.user_id);
  const target = targetResult?.user;
  if (targetError || !target) return NextResponse.json({ error: 'User not found.' }, { status: 404 });

  if (input.action === 'disable') {
    const { error: authError } = await admin.auth.admin.updateUserById(input.user_id, { ban_duration: '876000h' });
    if (authError) return NextResponse.json({ error: 'Unable to disable login.' }, { status: 500 });
    const { error: profileError } = await admin
      .from('profiles')
      .update({ is_active: false, accepting_leads: false, status: 'offline' })
      .eq('id', input.user_id);
    if (profileError) return NextResponse.json({ error: 'Login was disabled, but profile status could not be updated.' }, { status: 500 });
  }

  if (input.action === 'enable') {
    const { error: authError } = await admin.auth.admin.updateUserById(input.user_id, { ban_duration: 'none' });
    if (authError) return NextResponse.json({ error: 'Unable to enable login.' }, { status: 500 });
    const { error: profileError } = await admin
      .from('profiles')
      .update({ is_active: true })
      .eq('id', input.user_id);
    if (profileError) return NextResponse.json({ error: 'Login was enabled, but profile status could not be updated.' }, { status: 500 });
  }

  if (input.action === 'role') {
    const { error } = await admin.from('profiles').update({ role: input.role }).eq('id', input.user_id);
    if (error) return NextResponse.json({ error: 'Unable to update role.' }, { status: 500 });
  }

  if (input.action === 'reset_password') {
    if (!target.email) return NextResponse.json({ error: 'This account has no email address.' }, { status: 400 });
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const redirectTo = `${appUrl}/auth/callback?next=/reset-password`;
    const { error } = await admin.auth.resetPasswordForEmail(target.email, { redirectTo });
    if (error) {
      console.error('Password reset email failed:', error.message);
      return NextResponse.json({ error: 'Unable to send password reset email.' }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
