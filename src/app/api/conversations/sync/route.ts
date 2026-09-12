import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { syncMetaConversations } from '@/lib/integrations/meta-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function getActor(request: Request) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (token && serviceKey && token === serviceKey) {
    return {
      supabase: null as any,
      user: { id: '11111111-1111-1111-1111-111111111111', email: 'admin@travellms.com' } as any,
      profile: { id: '11111111-1111-1111-1111-111111111111', role: 'admin', is_active: true, full_name: 'System Sync' } as any,
    };
  }

  const supabase = await createSupabaseServerClient();
  let { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const admin = createSupabaseAdminClient();
      const { data: adminUser } = await admin.auth.getUser(token);
      if (adminUser?.user) user = adminUser.user;
    }
  }

  if (!user) return { error: NextResponse.json({ error: 'Unauthorized.' }, { status: 401 }) } as const;

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('id,role,is_active,full_name')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.is_active) return { error: NextResponse.json({ error: 'Account disabled.' }, { status: 403 }) } as const;
  return { supabase, user, profile } as const;
}

export async function POST(request: Request) {
  const actor = await getActor(request);
  if ('error' in actor) return actor.error;

  try {
    const result = await syncMetaConversations();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Meta conversation sync failed.',
      },
      { status: 500 }
    );
  }
}
