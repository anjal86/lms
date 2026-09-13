import { NextResponse } from 'next/server';
import { getApiActor } from '@/lib/auth/api-actor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sanitizeSearch(value: string) {
  return value.replace(/[,%()'"\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

export async function GET(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  const url = new URL(request.url);
  const search = sanitizeSearch(url.searchParams.get('search') || '');
  const lifecycle = url.searchParams.get('lifecycle') || '';
  const limit = Math.min(300, Math.max(1, Number(url.searchParams.get('limit')) || 100));
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);

  let query = actor.supabase
    .from('contacts')
    .select(`
      id,
      display_name,
      primary_phone,
      primary_email,
      avatar_url,
      lifecycle_key,
      owner_id,
      tags,
      custom_data,
      last_seen_at,
      created_at,
      updated_at,
      owner:profiles!contacts_owner_id_fkey(id,full_name,email,role,status),
      identities:contact_identities(provider,identity_type,identity_value,is_primary,created_at)
    `, { count: 'exact' })
    .eq('workspace_id', actor.profile.workspace_id);

  if (lifecycle) query = query.eq('lifecycle_key', lifecycle);
  if (search) {
    const pattern = `%${search}%`;
    query = query.or(`display_name.ilike.${pattern},primary_phone.ilike.${pattern},primary_email.ilike.${pattern}`);
  }

  const { data, error, count } = await query
    .order('last_seen_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('Contact directory failed:', error.message);
    return NextResponse.json({ error: 'Unable to load contacts.' }, { status: 500 });
  }

  return NextResponse.json({
    contacts: data || [],
    total: count || 0,
    hasMore: offset + (data?.length || 0) < (count || 0),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
