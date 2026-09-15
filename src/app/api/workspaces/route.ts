import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CreateWorkspaceSchema = z.object({
  name: z.string().trim().min(2).max(120),
  templateKey: z.enum(['generic', 'agency', 'health', 'consultancy', 'travel']).default('generic'),
});

async function authenticatedUser() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return { supabase, user };
}

export async function GET() {
  const auth = await authenticatedUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const admin = createSupabaseAdminClient();

  // Pick up any invitations that were created before this session.
  await auth.supabase.rpc('claim_my_workspace_invitations').catch(() => null);

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('workspace_id,is_active')
    .eq('id', auth.user.id)
    .maybeSingle();

  if (profileError || !profile?.is_active) {
    return NextResponse.json({ error: 'Active profile not found.' }, { status: 403 });
  }

  const { data: memberships, error } = await admin
    .from('workspace_members')
    .select(`
      workspace_id,
      role,
      is_active,
      joined_at,
      workspace:workspaces(
        id,
        name,
        slug,
        business_type,
        template_key,
        timezone,
        currency,
        locale,
        is_active
      )
    `)
    .eq('user_id', auth.user.id)
    .eq('is_active', true)
    .order('joined_at', { ascending: true });

  if (error) {
    console.error('Unable to list workspaces:', error.message);
    return NextResponse.json({ error: 'Unable to load workspaces.' }, { status: 500 });
  }

  const workspaces = (memberships || [])
    .map((membership: any) => {
      const workspace = Array.isArray(membership.workspace) ? membership.workspace[0] : membership.workspace;
      if (!workspace?.id || workspace.is_active === false) return null;
      return {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        business_type: workspace.business_type,
        template_key: workspace.template_key,
        timezone: workspace.timezone,
        currency: workspace.currency,
        locale: workspace.locale,
        role: membership.role,
        joined_at: membership.joined_at,
        is_current: workspace.id === profile.workspace_id,
      };
    })
    .filter(Boolean);

  return NextResponse.json(
    { currentWorkspaceId: profile.workspace_id || null, workspaces },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}

export async function POST(request: Request) {
  const auth = await authenticatedUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const parsed = CreateWorkspaceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid workspace.' }, { status: 400 });
  }

  const { data: workspaceId, error } = await auth.supabase.rpc('create_workspace_for_current_user', {
    p_name: parsed.data.name,
    p_template_key: parsed.data.templateKey,
  });

  if (error || !workspaceId) {
    console.error('Workspace creation failed:', error?.message);
    return NextResponse.json({ error: error?.message || 'Unable to create workspace.' }, { status: 500 });
  }

  const admin = createSupabaseAdminClient();
  const { data: workspace } = await admin
    .from('workspaces')
    .select('id,name,slug,business_type,template_key,timezone,currency,locale')
    .eq('id', workspaceId)
    .maybeSingle();

  return NextResponse.json({ workspace, role: 'owner' }, { status: 201 });
}
