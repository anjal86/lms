import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor, isManagement } from '@/lib/auth/api-actor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PatchWorkflowSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  trigger_key: z.string().trim().min(1).max(80).optional(),
  conditions: z.record(z.string(), z.unknown()).optional(),
  actions: z.array(z.record(z.string(), z.unknown())).min(1).max(25).optional(),
  is_enabled: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(10000).optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!isManagement(actor.profile)) return NextResponse.json({ error: 'Manager access required.' }, { status: 403 });
  const { id } = await context.params;

  let raw: unknown;
  try { raw = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }); }
  const parsed = PatchWorkflowSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed.', details: parsed.error.flatten() }, { status: 400 });
  if (Object.keys(parsed.data).length === 0) return NextResponse.json({ error: 'No changes requested.' }, { status: 400 });

  const { data, error } = await actor.supabase
    .from('automation_workflows')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Unable to update automation.' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Automation not found.' }, { status: 404 });
  return NextResponse.json({ workflow: data });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!isManagement(actor.profile)) return NextResponse.json({ error: 'Manager access required.' }, { status: 403 });
  const { id } = await context.params;

  const { error, count } = await actor.supabase
    .from('automation_workflows')
    .delete({ count: 'exact' })
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', id);
  if (error) return NextResponse.json({ error: 'Unable to delete automation.' }, { status: 500 });
  if (!count) return NextResponse.json({ error: 'Automation not found.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
