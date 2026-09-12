import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

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
      profile: { id: '11111111-1111-1111-1111-111111111111', role: 'admin', is_active: true, full_name: 'Admin' } as any,
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

export async function GET(request: Request) {
  const actor = await getActor(request);
  if ('error' in actor) return actor.error;

  const url = new URL(request.url);
  const filter = url.searchParams.get('filter') || 'all'; // all | unconverted | mine | converted
  const provider = url.searchParams.get('provider') || 'all';
  const search = url.searchParams.get('search')?.trim().toLowerCase();
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 40));
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);

  const admin = createSupabaseAdminClient();
  let query = admin
    .from('lead_conversations')
    .select(`
      id,
      lead_id,
      connection_id,
      provider,
      external_thread_id,
      external_contact_id,
      customer_name,
      customer_phone,
      customer_email,
      customer_avatar_url,
      last_message_preview,
      status,
      unread_count,
      assigned_to,
      last_message_at,
      created_at,
      updated_at,
      metadata,
      lead:leads(id, lead_code, customer_name, destination, stage, priority, assigned_to, created_at),
      assigned_profile:profiles!lead_conversations_assigned_to_fkey(id, full_name, email, role)
    `, { count: 'exact' });

  if (filter === 'unconverted') {
    query = query.is('lead_id', null);
  } else if (filter === 'converted') {
    query = query.not('lead_id', 'is', null);
  } else if (filter === 'mine') {
    query = query.eq('assigned_to', actor.user.id);
  }

  if (provider !== 'all') {
    query = query.eq('provider', provider);
  }

  if (search) {
    query = query.or(`customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%,customer_email.ilike.%${search}%,last_message_preview.ilike.%${search}%`);
  }

  query = query.order('last_message_at', { ascending: false, nullsFirst: false }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) {
    console.error('Conversation list failed:', error.message);
    return NextResponse.json({ error: 'Unable to load conversations.' }, { status: 500 });
  }

  // Count metrics for quick badge display
  const [unconvertedCountRes, allOpenRes] = await Promise.all([
    admin.from('lead_conversations').select('id', { count: 'exact', head: true }).is('lead_id', null).eq('status', 'open'),
    admin.from('lead_conversations').select('id', { count: 'exact', head: true }).eq('status', 'open'),
  ]);

  return NextResponse.json({
    conversations: data || [],
    total: count || 0,
    metrics: {
      unconvertedOpen: unconvertedCountRes.count || 0,
      totalOpen: allOpenRes.count || 0,
    },
  });
}
