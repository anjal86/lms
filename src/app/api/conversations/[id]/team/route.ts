import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor, isManagement } from '@/lib/auth/api-actor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  team_key: z.string().trim().max(80).nullable(),
  route: z.boolean().default(true),
  strategy: z.enum(['workload_balanced','least_open','round_robin','conversion_weighted']).default('workload_balanced'),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!isManagement(actor.profile)) return NextResponse.json({ error: 'Manager access required.' }, { status: 403 });

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid team routing request.', details: parsed.error.flatten() }, { status: 400 });

  const { id } = await context.params;
  const { data: assignedTo, error } = await actor.supabase.rpc('set_conversation_team', {
    p_conversation_id: id,
    p_team_key: parsed.data.team_key || null,
    p_route: parsed.data.route,
    p_strategy: parsed.data.strategy,
  });

  if (error) {
    console.error('Conversation team routing failed:', error.message);
    const status = error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : error.code === '22023' ? 400 : 500;
    return NextResponse.json({ error: error.message || 'Unable to change conversation team.' }, { status });
  }

  const { data: conversation } = await actor.supabase
    .from('lead_conversations')
    .select('id,team_key,assigned_to,assigned_profile:profiles!lead_conversations_assigned_to_fkey(id,full_name,email,role,status)')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', id)
    .maybeSingle();

  return NextResponse.json({ conversation, assigned_to: assignedTo || conversation?.assigned_to || null });
}
