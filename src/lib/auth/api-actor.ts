import 'server-only';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export type WorkspaceRole = 'owner' | 'admin' | 'manager' | 'agent';

export type ApiProfile = {
  id: string;
  role: 'admin' | 'manager' | 'agent';
  workspace_role: WorkspaceRole;
  is_active: boolean;
  full_name: string | null;
  workspace_id: string;
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

function compatibilityRole(role: WorkspaceRole): ApiProfile['role'] {
  if (role === 'owner' || role === 'admin') return 'admin';
  return role;
}

async function finalizeActor(user: User, supabase: SupabaseClient) {
  const admin = createSupabaseAdminClient();
  const { data: profile, error } = await admin
    .from('profiles')
    .select('id,is_active,full_name,workspace_id')
    .eq('id', user.id)
    .maybeSingle();

  if (error || !profile) {
    return { error: NextResponse.json({ error: 'User profile not found.' }, { status: 403 }) } as const;
  }
  if (!profile.is_active) {
    return { error: NextResponse.json({ error: 'Account disabled.' }, { status: 403 }) } as const;
  }
  if (!profile.workspace_id) {
    return { error: NextResponse.json({ error: 'Workspace is not configured for this account.' }, { status: 403 }) } as const;
  }

  const { data: membership, error: membershipError } = await admin
    .from('workspace_members')
    .select('role,is_active')
    .eq('workspace_id', profile.workspace_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (membershipError || !membership?.is_active) {
    return { error: NextResponse.json({ error: 'Workspace membership is not active.' }, { status: 403 }) } as const;
  }

  const workspaceRole = membership.role as WorkspaceRole;
  if (!['owner', 'admin', 'manager', 'agent'].includes(workspaceRole)) {
    return { error: NextResponse.json({ error: 'Workspace role is invalid.' }, { status: 403 }) } as const;
  }

  return {
    supabase,
    user,
    profile: {
      id: profile.id,
      role: compatibilityRole(workspaceRole),
      workspace_role: workspaceRole,
      is_active: profile.is_active,
      full_name: profile.full_name,
      workspace_id: profile.workspace_id,
    },
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
  return profile.workspace_role === 'owner' || profile.workspace_role === 'admin' || profile.workspace_role === 'manager';
}
