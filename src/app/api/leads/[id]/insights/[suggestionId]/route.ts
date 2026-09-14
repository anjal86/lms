import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor } from '@/lib/auth/api-actor';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PatchSchema = z.object({
  status: z.enum(['accepted', 'rejected']),
});

type Context = { params: Promise<{ id: string; suggestionId: string }> };

export async function PATCH(request: Request, context: Context) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  const { id, suggestionId } = await context.params;
  if (!uuidSchema.safeParse(id).success || !uuidSchema.safeParse(suggestionId).success) {
    return NextResponse.json({ error: 'Invalid suggestion reference.' }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid suggestion review.' }, { status: 400 });
  }

  const { data: lead, error: leadError } = await actor.supabase
    .from('leads')
    .select('id')
    .eq('id', id)
    .eq('workspace_id', actor.profile.workspace_id)
    .maybeSingle();
  if (leadError) return NextResponse.json({ error: 'Unable to validate opportunity.' }, { status: 500 });
  if (!lead) return NextResponse.json({ error: 'Opportunity not found or unavailable.' }, { status: 404 });

  const { data, error } = await actor.supabase
    .from('ai_suggestions')
    .update({
      status: parsed.data.status,
      reviewed_by: actor.user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', suggestionId)
    .eq('lead_id', id)
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('status', 'proposed')
    .select('id,kind,status,reviewed_at')
    .maybeSingle();

  if (error) {
    if (error.code === '42501') return NextResponse.json({ error: 'You cannot review this suggestion.' }, { status: 403 });
    console.error('Suggestion review failed:', error.message);
    return NextResponse.json({ error: 'Unable to review suggestion.' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Suggestion not found or already reviewed.' }, { status: 404 });
  }

  return NextResponse.json({ suggestion: data });
}
