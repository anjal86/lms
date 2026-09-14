import { NextResponse } from 'next/server';
import { getApiActor } from '@/lib/auth/api-actor';
import { actorHasPermission, type WorkspacePermission } from '@/lib/auth/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PERMISSIONS: WorkspacePermission[] = [
  'inbox.view',
  'inbox.assign',
  'inbox.resolve',
  'inbox.saved_views.manage',
  'contacts.view',
  'contacts.edit',
  'contacts.merge',
  'automations.view',
  'automations.edit',
  'automations.publish',
  'reports.view',
  'permissions.view',
  'permissions.manage',
  'service_levels.view',
  'service_levels.edit',
];

export async function GET(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  const values = await Promise.all(
    PERMISSIONS.map(async (permission) => [permission, await actorHasPermission(actor, permission)] as const)
  );

  return NextResponse.json(
    { role: actor.profile.role, permissions: Object.fromEntries(values) },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
