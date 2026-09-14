import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor } from '@/lib/auth/api-actor';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PatchSchema = z.object({
  title: z.string().trim().min(1).max(240).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  ownerId: z.union([uuidSchema, z.null()]).optional(),
  type: z.enum(['call', 'message', 'email', 'meeting', 'document', 'review', 'payment', 'proposal', 'custom']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  status: z.enum(['open', 'completed', 'cancelled']).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'No changes supplied.' });

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  const { id } = await context.params;
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: 'Invalid work item id.' }, { status: 400 });

  const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid work item update.' }, { status: 400 });
  }

  const input = parsed.data;
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description || null;
  if (input.dueAt !== undefined) patch.due_at = input.dueAt;
  if (input.ownerId !== undefined) patch.owner_id = input.ownerId;
  if (input.type !== undefined) patch.type = input.type;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.status !== undefined) patch.status = input.status;
  if (input.metadata !== undefined) patch.metadata = input.metadata;

  const { data, error } = await actor.supabase
    .from('work_items')
    .update(patch)
    .eq('id', id)
    .eq('workspace_id', actor.profile.workspace_id)
    .select('*')
    .maybeSingle();

  if (error) {
    console.error('Work item update failed:', error.message);
    return NextResponse.json({ error: 'Unable to update work item.' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Work item not found or unavailable.' }, { status: 404 });

  return NextResponse.json({ item: data });
}

export async function DELETE(request: Request, context: Context) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  const { id } = await context.params;
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: 'Invalid work item id.' }, { status: 400 });

  const { data, error } = await actor.supabase
    .from('work_items')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('workspace_id', actor.profile.workspace_id)
    .select('id')
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'Unable to cancel work item.' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Work item not found or unavailable.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
