import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', authData.user.id)
    .single();
  if (profileError || !profile || !['admin', 'manager'].includes(profile.role)) {
    return NextResponse.json({ error: 'Management access required.' }, { status: 403 });
  }

  const rawLimit = Number(req.nextUrl.searchParams.get('limit') || '100');
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(Math.floor(rawLimit), 250)) : 100;

  const { data, error } = await supabase
    .from('audit_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Audit log query failed:', error.message);
    return NextResponse.json({ error: 'Unable to load audit history.' }, { status: 500 });
  }

  return NextResponse.json(
    { events: data || [] },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
