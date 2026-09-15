import { NextResponse } from 'next/server';
import { getApiActor } from '@/lib/auth/api-actor';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function compatibilityRole(role: string) {
  if (role === 'owner' || role === 'admin') return 'admin';
  if (role === 'manager') return 'manager';
  return 'agent';
}

export async function GET(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('workspace_members')
    .select(`
      workspace_id,
      user_id,
      role,
      permissions,
      is_active,
      joined_at,
      profile:profiles!workspace_members_user_id_fkey(*)
    `)
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('is_active', true)
    .order('joined_at', { ascending: true });

  if (error) {
    console.error('Workspace team read failed:', error.message);
    return NextResponse.json({ error: 'Unable to load this workspace team.' }, { status: 500 });
  }

  const members = (data || []).flatMap((membership: any) => {
    const profile = Array.isArray(membership.profile) ? membership.profile[0] : membership.profile;
    if (!profile?.id || profile.is_active === false) return [];
    return [{
      ...profile,
      role: compatibilityRole(membership.role),
      workspace_id: actor.profile.workspace_id,
      workspace_role: membership.role,
      workspace_permissions: membership.permissions || {},
      workspace_joined_at: membership.joined_at || null,
    }];
  });

  return NextResponse.json(
    { workspaceId: actor.profile.workspace_id, members },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
