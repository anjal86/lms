import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q')?.trim() || '';
  if (query.length < 2) {
    return NextResponse.json({ results: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }
  if (query.length > 80) {
    return NextResponse.json({ error: 'Search query is too long.' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { data, error } = await supabase.rpc('search_crm', {
    p_query: query,
    p_limit: 12,
  });

  if (error) {
    console.error('Global search failed:', error.message);
    return NextResponse.json({ error: 'Search is temporarily unavailable.' }, { status: 500 });
  }

  return NextResponse.json(
    { results: data || [] },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
