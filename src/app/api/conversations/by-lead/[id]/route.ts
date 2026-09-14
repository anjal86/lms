import { NextResponse } from 'next/server';
import { getApiActor } from '@/lib/auth/api-actor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: 'Opportunity id is required.' }, { status: 400 });

  const openResult = await actor.supabase
    .from('lead_conversations')
    .select('id, workflow_state, provider, last_message_at')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('lead_id', id)
    .neq('workflow_state', 'closed')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (openResult.error) {
    console.error('Conversation lookup failed:', openResult.error.message);
    return NextResponse.json({ error: 'Unable to locate conversation.' }, { status: 500 });
  }

  if (openResult.data) {
    return NextResponse.json({ conversationId: openResult.data.id, state: openResult.data.workflow_state });
  }

  const latestResult = await actor.supabase
    .from('lead_conversations')
    .select('id, workflow_state, provider, last_message_at')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('lead_id', id)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (latestResult.error) {
    console.error('Conversation fallback lookup failed:', latestResult.error.message);
    return NextResponse.json({ error: 'Unable to locate conversation.' }, { status: 500 });
  }

  return NextResponse.json({
    conversationId: latestResult.data?.id || null,
    state: latestResult.data?.workflow_state || null,
  });
}
