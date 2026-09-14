import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor } from '@/lib/auth/api-actor';
import { actorHasPermission } from '@/lib/auth/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PermissionKeys = [
  'inbox.view','inbox.assign','inbox.resolve','inbox.saved_views.manage',
  'contacts.view','contacts.edit','contacts.merge',
  'automations.view','automations.edit','automations.publish',
  'reports.view','permissions.view','permissions.manage',
  'service_levels.view','service_levels.edit',
] as const;

const PatchSchema = z.object({
  role: z.enum(['manager','agent']),
  permissions: z.record(z.enum(PermissionKeys), z.boolean()),
});

export async function GET(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!(await actorHasPermission(actor, 'permissions.view'))) {
    return NextResponse.json({ error: 'Permission settings access required.' }, { status: 403 });
  }

  const { data, error } = await actor.supabase
    .from('workspace_role_permissions')
    .select('role,permissions,updated_at,updated_by')
    .eq('workspace_id', actor.profile.workspace_id)
    .order('role');
  if (error) return NextResponse.json({ error: 'Unable to load permissions.' }, { status: 500 });

  return NextResponse.json({ permission_keys: PermissionKeys, roles: data || [] }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PATCH(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!(await actorHasPermission(actor, 'permissions.manage'))) {
    return NextResponse.json({ error: 'Only workspace administrators can change permissions.' }, { status: 403 });
  }

  let raw: unknown;
  try { raw = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }); }
  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed.', details: parsed.error.flatten() }, { status: 400 });

  const { data, error } = await actor.supabase
    .from('workspace_role_permissions')
    .upsert({
      workspace_id: actor.profile.workspace_id,
      role: parsed.data.role,
      permissions: parsed.data.permissions,
      updated_by: actor.user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,role' })
    .select('role,permissions,updated_at,updated_by')
    .single();
  if (error) return NextResponse.json({ error: 'Unable to update permissions.' }, { status: 500 });
  return NextResponse.json({ role: data });
}
