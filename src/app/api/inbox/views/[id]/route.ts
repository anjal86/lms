import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor } from '@/lib/auth/api-actor';
import { actorHasPermission } from '@/lib/auth/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FilterSchema = z.object({
  filter: z.enum(['all','mine','unassigned','collaborations','unread','needs_reply','sla_overdue','high_priority','has_phone','open','waiting','snoozed','closed']).optional(),
  provider: z.enum(['all','facebook','instagram','whatsapp','email','website']).optional(),
  state: z.enum(['','open','waiting','snoozed','closed']).optional(),
  priority: z.enum(['','low','normal','high','urgent']).optional(),
  sort: z.enum(['newest','oldest','waiting','sla']).optional(),
  search: z.string().trim().max(120).optional(),
});
const PatchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  filters: FilterSchema.optional(),
  is_shared: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(10000).optional(),
});

async function loadOwnedOrManaged(request: Request, id: string) {
  const actor = await getApiActor(request);
  if ('error' in actor) return { error: actor.error } as const;
  if (!(await actorHasPermission(actor, 'inbox.saved_views.manage'))) {
    return { error: NextResponse.json({ error: 'Saved-view permission required.' }, { status: 403 }) } as const;
  }
  const { data } = await actor.supabase
    .from('conversation_saved_views')
    .select('id,owner_id')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', id)
    .maybeSingle();
  if (!data) return { error: NextResponse.json({ error: 'Saved view not found.' }, { status: 404 }) } as const;
  if (data.owner_id !== actor.user.id && !['admin','manager'].includes(actor.profile.role)) {
    return { error: NextResponse.json({ error: 'You cannot modify this saved view.' }, { status: 403 }) } as const;
  }
  return { actor, row: data } as const;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await loadOwnedOrManaged(request, id);
  if ('error' in access) return access.error;

  let raw: unknown;
  try { raw = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }); }
  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'Validation failed.', details: parsed.success ? undefined : parsed.error.flatten() }, { status: 400 });
  }

  const patch = { ...parsed.data, updated_at: new Date().toISOString() } as Record<string, unknown>;
  if (access.actor.profile.role === 'agent' && patch.is_shared === true) patch.is_shared = false;

  const { data, error } = await access.actor.supabase
    .from('conversation_saved_views')
    .update(patch)
    .eq('workspace_id', access.actor.profile.workspace_id)
    .eq('id', id)
    .select('id,name,filters,is_shared,sort_order,owner_id,created_at,updated_at')
    .single();
  if (error) return NextResponse.json({ error: error.code === '23505' ? 'A saved view with this name already exists.' : 'Unable to update saved view.' }, { status: error.code === '23505' ? 409 : 500 });
  return NextResponse.json({ view: data });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await loadOwnedOrManaged(request, id);
  if ('error' in access) return access.error;
  const { error } = await access.actor.supabase
    .from('conversation_saved_views')
    .delete()
    .eq('workspace_id', access.actor.profile.workspace_id)
    .eq('id', id);
  if (error) return NextResponse.json({ error: 'Unable to delete saved view.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
