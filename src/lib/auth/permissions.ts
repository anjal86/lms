import 'server-only';
import type { ApiActor } from '@/lib/auth/api-actor';

export type WorkspacePermission =
  | 'inbox.view'
  | 'inbox.assign'
  | 'inbox.resolve'
  | 'inbox.saved_views.manage'
  | 'contacts.view'
  | 'contacts.edit'
  | 'contacts.merge'
  | 'automations.view'
  | 'automations.edit'
  | 'automations.publish'
  | 'reports.view'
  | 'permissions.view'
  | 'permissions.manage';

export async function actorHasPermission(actor: ApiActor, permission: WorkspacePermission) {
  if (actor.profile.role === 'admin') return true;
  const { data, error } = await actor.supabase.rpc('has_workspace_permission', { p_key: permission });
  if (error) {
    console.error(`Permission check failed for ${permission}:`, error.message);
    return false;
  }
  return data === true;
}
