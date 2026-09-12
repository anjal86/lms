import { NextResponse } from 'next/server';
import { getApiActor } from '@/lib/auth/api-actor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FILTERS = new Set(['all', 'unconverted', 'mine', 'converted']);
const PROVIDERS = new Set(['all', 'facebook', 'instagram', 'whatsapp', 'tiktok', 'email']);

function safeSearchTerm(value: string | null) {
  if (!value) return '';
  return value
    .trim()
    .slice(0, 100)
    .replace(/[,%()\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function GET(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  const url = new URL(request.url);
  const requestedFilter = url.searchParams.get('filter') || 'all';
  const filter = FILTERS.has(requestedFilter) ? requestedFilter : 'all';
  const requestedProvider = url.searchParams.get('provider') || 'all';
  const provider = PROVIDERS.has(requestedProvider) ? requestedProvider : 'all';
  const search = safeSearchTerm(url.searchParams.get('search'));
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 40));
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
      lead:leads(id, lead_code, customer_name, destination, stage, priority, assigned_to, created_at),
      assigned_profile:profiles!lead_conversations_assigned_to_fkey(id, full_name, email, role)
    `, { count: 'exact' });

  if (filter === 'unconverted') query = query.is('lead_id', null);
  else if (filter === 'converted') query = query.not('lead_id', 'is', null);
  else if (filter === 'mine') query = query.eq('assigned_to', actor.user.id);

  if (provider !== 'all') query = query.eq('provider', provider);

  if (search) {
    query = query.or(`customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%,customer_email.ilike.%${search}%,last_message_preview.ilike.%${search}%`);
  }

  const { data, error, count } = await query
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('Conversation list failed:', error.message);
    return NextResponse.json({ error: 'Unable to load conversations.' }, { status: 500 });
  }

  const [unconvertedCountRes, allOpenRes] = await Promise.all([
    actor.supabase.from('lead_conversations').select('id', { count: 'exact', head: true }).is('lead_id', null).eq('status', 'open'),
    actor.supabase.from('lead_conversations').select('id', { count: 'exact', head: true }).eq('status', 'open'),
  ]);

  return NextResponse.json({
    conversations: data || [],
    total: count || 0,
    metrics: {
      unconvertedOpen: unconvertedCountRes.count || 0,
      totalOpen: allOpenRes.count || 0,
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
