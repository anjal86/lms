import 'server-only';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export type ApiProfile = {
  id: string;
  role: 'admin' | 'manager' | 'agent';
  is_active: boolean;
  full_name: string | null;
};

export type ApiActor = {
  supabase: SupabaseClient;
  user: User;
  profile: ApiProfile;
};

function bearerToken(request: Request) {
  const header = request.headers.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function userScopedBearerClient(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('Supabase server configuration is missing.');

  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function finalizeActor(user: User, supabase: SupabaseClient) {
  const admin = createSupabaseAdminClient();
  const { data: profile, error } = await admin
    .from('profiles')
    .select('id,role,is_active,full_name')
    .eq('id', user.id)
    .maybeSingle();

  if (error || !profile) {
    return { error: NextResponse.json({ error: 'User profile not found.' }, { status: 403 }) } as const;
  }
  if (!profile.is_active) {
    return { error: NextResponse.json({ error: 'Account disabled.' }, { status: 403 }) } as const;
  }

  return {
    supabase,
    user,
    profile: profile as ApiProfile,
  } satisfies ApiActor;
}

export async function getApiActor(request: Request) {
  const cookieClient = await createSupabaseServerClient();
  const { data: { user: cookieUser } } = await cookieClient.auth.getUser();
  if (cookieUser) return finalizeActor(cookieUser, cookieClient);

  const token = bearerToken(request);
  const serviceRole = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!token || (serviceRole && token === serviceRole)) {
    return { error: NextResponse.json({ error: 'Unauthorized.' }, { status: 401 }) } as const;
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) {
    return { error: NextResponse.json({ error: 'Unauthorized.' }, { status: 401 }) } as const;
  }

  return finalizeActor(data.user, userScopedBearerClient(token));
}

export function isManagement(profile: ApiProfile) {
  return profile.role === 'admin' || profile.role === 'manager';
}
