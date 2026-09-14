import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor } from '@/lib/auth/api-actor';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PatchSchema = z.object({
  status: z.enum(['open', 'in_progress', 'blocked', 'completed', 'cancelled']).optional(),
  ownerId: z.union([uuidSchema, z.null()]).optional(),
  title: z.string().trim().min(1).max(240).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'No changes supplied.' });

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  const { id } = await context.params;
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: 'Invalid opportunity id.' }, { status: 400 });

  const { data, error } = await actor.supabase
    .from('post_sale_cases')
    .select('*')
    .eq('lead_id', id)
    .eq('workspace_id', actor.profile.workspace_id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Unable to load post-sale case.' }, { status: 500 });
  return NextResponse.json({ case: data || null }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PATCH(request: Request, context: Context) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  const { id } = await context.params;
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: 'Invalid opportunity id.' }, { status: 400 });

  const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid case update.' }, { status: 400 });
  const input = parsed.data;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.status !== undefined) {
    patch.status = input.status;
    patch.completed_at = input.status === 'completed' ? new Date().toISOString() : null;
  }
  if (input.ownerId !== undefined) patch.owner_id = input.ownerId;
  if (input.title !== undefined) patch.title = input.title;
  if (input.metadata !== undefined) patch.metadata = input.metadata;

  const { data, error } = await actor.supabase
    .from('post_sale_cases')
    .update(patch)
    .eq('lead_id', id)
    .eq('workspace_id', actor.profile.workspace_id)
    .select('*')
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Unable to update post-sale case.' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Post-sale case not found. Move the opportunity to Won first.' }, { status: 404 });
  return NextResponse.json({ case: data });
}
