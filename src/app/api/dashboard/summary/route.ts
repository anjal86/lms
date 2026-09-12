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

  const [operationalResult, pipelineResult] = await Promise.all([
    supabase.rpc('dashboard_operational_summary'),
    supabase.rpc('lead_pipeline_summary'),
  ]);

  if (operationalResult.error || pipelineResult.error) {
    console.error('Dashboard summary failed:', operationalResult.error?.message || pipelineResult.error?.message);
    return NextResponse.json({ error: 'Unable to load Action Center.' }, { status: 500 });
  }

  return NextResponse.json(
    {
      summary: operationalResult.data || {},
      pipelineSummary: pipelineResult.data || {},
      isManagement: profile.role === 'admin' || profile.role === 'manager',
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
