import { NextRequest, NextResponse } from 'next/server';
import { getApiActor } from '@/lib/auth/api-actor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SearchResult = {
  kind?: string;
  [key: string]: unknown;
};

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q')?.trim() || '';
  if (query.length < 2) {
    return NextResponse.json({ results: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }
  if (query.length > 80) {
    return NextResponse.json({ error: 'Search query is too long.' }, { status: 400 });
  }

  const actor = await getApiActor(req);
  if ('error' in actor) return actor.error;

  const [{ data, error }, { data: leadModule, error: moduleError }] = await Promise.all([
    actor.supabase.rpc('search_crm', {
      p_query: query,
      p_limit: 12,
    }),
    actor.supabase
      .from('workspace_modules')
      .select('is_enabled')
      .eq('workspace_id', actor.profile.workspace_id)
      .eq('module_key', 'leads')
      .maybeSingle(),
  ]);

  if (error) {
    console.error('Global search failed:', error.message);
    return NextResponse.json({ error: 'Search is temporarily unavailable.' }, { status: 500 });
  }
  if (moduleError) {
    console.error('Search module lookup failed:', moduleError.message);
    return NextResponse.json({ error: 'Search permissions are temporarily unavailable.' }, { status: 503 });
  }

  const results = Array.isArray(data) ? data as SearchResult[] : [];
  // Missing module rows remain enabled for legacy workspaces, matching the
  // proxy/module-context compatibility behavior. Explicit false is authoritative.
  const visibleResults = leadModule?.is_enabled === false
    ? results.filter((result) => result.kind !== 'lead')
    : results;

  return NextResponse.json(
    { results: visibleResults },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
