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
  const status = url.searchParams.get('status') || 'all';
  const provider = url.searchParams.get('provider') || 'all';
  const search = sanitizeSearchTerm(url.searchParams.get('search') || '');
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50));
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = actor.supabase
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
    `, { count: 'exact' })
    .not('metadata->detected_phone', 'is', null);

  if (status === 'unconverted') query = query.is('lead_id', null);
  else if (status === 'converted') query = query.not('lead_id', 'is', null);

  if (provider !== 'all') query = query.eq('provider', provider);

  if (search) {
    const pattern = `%${search}%`;
    query = query.or(`customer_name.ilike.${pattern},customer_phone.ilike.${pattern},last_message_preview.ilike.${pattern}`);
  }

  query = query.order('last_message_at', { ascending: false, nullsFirst: false }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) {
    console.error('Phone leads list failed:', error.message);
    return NextResponse.json({ error: 'Unable to load phone leads.' }, { status: 500 });
  }

  const [totalRes, unconvertedRes, convertedRes] = await Promise.all([
    actor.supabase.from('lead_conversations').select('id', { count: 'exact', head: true }).not('metadata->detected_phone', 'is', null),
    actor.supabase.from('lead_conversations').select('id', { count: 'exact', head: true }).not('metadata->detected_phone', 'is', null).is('lead_id', null),
    actor.supabase.from('lead_conversations').select('id', { count: 'exact', head: true }).not('metadata->detected_phone', 'is', null).not('lead_id', 'is', null),
  ]);

  return NextResponse.json({
    phoneLeads: data || [],
    total: count || 0,
    metrics: {
      total: totalRes.count || 0,
      unconverted: unconvertedRes.count || 0,
      converted: convertedRes.count || 0,
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
