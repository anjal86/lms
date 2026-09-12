import { NextResponse } from 'next/server';
import { getApiActor } from '@/lib/auth/api-actor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sanitizeSearchTerm(value: string) {
  return value.replace(/[,%()'"\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

export async function GET(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  const url = new URL(request.url);
  const filter = url.searchParams.get('filter') || 'all';
  const provider = url.searchParams.get('provider') || 'all';
  const search = sanitizeSearchTerm(url.searchParams.get('search') || '');
  // The inbox is intentionally scroll-based today. The current production queue
  // already exceeds 300 conversations, so return 500 by default instead of
  // silently hiding older clients. Keep a hard cap until cursor pagination lands.
  const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit')) || 500));
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);

  let query = actor.supabase
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
      converted_at,
      metadata,
      lead:leads(id, lead_code, customer_name, customer_city, customer_country, destination, stage, priority, assigned_to, created_at),
      assigned_profile:profiles!lead_conversations_assigned_to_fkey(id, full_name, email, role)
    `, { count: 'exact' });

  if (filter === 'unconverted') query = query.is('lead_id', null);
  else if (filter === 'converted') query = query.not('lead_id', 'is', null);
  else if (filter === 'mine') query = query.eq('assigned_to', actor.user.id);
  else if (filter === 'has_phone') query = query.not('metadata->detected_phone', 'is', null);

  if (provider !== 'all') query = query.eq('provider', provider);

  if (search) {
    const pattern = `%${search}%`;
    query = query.or(`customer_name.ilike.${pattern},customer_phone.ilike.${pattern},customer_email.ilike.${pattern},last_message_preview.ilike.${pattern}`);
  }

  query = query.order('last_message_at', { ascending: false, nullsFirst: false }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) {
    console.error('Conversation list failed:', error.message);
    return NextResponse.json({ error: 'Unable to load conversations.' }, { status: 500 });
  }

  // Metrics also use the actor's RLS-scoped client; agents cannot infer other agents' inbox volume.
  const [unconvertedCountRes, allOpenRes, hasPhoneRes] = await Promise.all([
    actor.supabase.from('lead_conversations').select('id', { count: 'exact', head: true }).is('lead_id', null).eq('status', 'open'),
    actor.supabase.from('lead_conversations').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    actor.supabase.from('lead_conversations').select('id', { count: 'exact', head: true }).not('metadata->detected_phone', 'is', null),
  ]);

  return NextResponse.json({
    conversations: data || [],
    total: count || 0,
    hasMore: offset + (data?.length || 0) < (count || 0),
    metrics: {
      unconvertedOpen: unconvertedCountRes.count || 0,
      totalOpen: allOpenRes.count || 0,
      hasPhone: hasPhoneRes.count || 0,
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
