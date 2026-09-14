import { NextResponse } from 'next/server';
import { getApiActor } from '@/lib/auth/api-actor';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  const { id } = await context.params;
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid opportunity id.' }, { status: 400 });
  }

  const { data: lead, error: leadError } = await actor.supabase
    .from('leads')
    .select('id')
    .eq('id', id)
    .eq('workspace_id', actor.profile.workspace_id)
    .maybeSingle();
  if (leadError) return NextResponse.json({ error: 'Unable to validate opportunity.' }, { status: 500 });
  if (!lead) return NextResponse.json({ error: 'Opportunity not found or unavailable.' }, { status: 404 });

  const [healthResult, suggestionsResult] = await Promise.all([
    actor.supabase
      .from('opportunity_health')
      .select('lead_id,workspace_id,health_score,overdue_work_count,last_customer_activity_at,next_action_at')
      .eq('lead_id', id)
      .eq('workspace_id', actor.profile.workspace_id)
      .maybeSingle(),
    actor.supabase
      .from('ai_suggestions')
      .select('id,kind,status,payload,model,created_at,expires_at')
      .eq('workspace_id', actor.profile.workspace_id)
      .eq('lead_id', id)
      .eq('status', 'proposed')
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  if (healthResult.error) {
    console.error('Opportunity health query failed:', healthResult.error.message);
    return NextResponse.json({ error: 'Unable to load opportunity health.' }, { status: 500 });
  }
  if (suggestionsResult.error) {
    console.error('Opportunity suggestions query failed:', suggestionsResult.error.message);
    return NextResponse.json({ error: 'Unable to load opportunity suggestions.' }, { status: 500 });
  }

  return NextResponse.json({
    health: healthResult.data || null,
    suggestions: suggestionsResult.data || [],
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
