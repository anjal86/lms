import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,is_active')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.is_active) return NextResponse.json({ error: 'Account disabled.' }, { status: 403 });

  const { data, error } = await supabase.rpc('dashboard_operational_summary');
  if (error) {
    console.error('Dashboard summary failed:', error.message);
    return NextResponse.json({ error: 'Unable to load Action Center.' }, { status: 500 });
  }

  return NextResponse.json(
    { summary: data || {}, isManagement: profile.role === 'admin' || profile.role === 'manager' },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
