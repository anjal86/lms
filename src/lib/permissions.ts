import { Role } from './types';

export type Permission =
  | 'settings:view'
  | 'settings:edit_sla'
  | 'settings:edit_routing'
  | 'settings:edit_financials'
  | 'settings:edit_audio'
  | 'settings:edit_taxonomies'
  | 'settings:edit_integrations'
  | 'settings:manage_storage'
  | 'team:invite_member'
  | 'team:rebalance_leads'
  | 'team:bulk_reassign'
  | 'leads:export_all';

export type SettingsTabId =
  | 'sla'
  | 'routing'
  | 'financials'
  | 'audio'
  | 'taxonomies'
  | 'integrations'
  | 'storage';

/**
 * Role-Based Access Control matrix
 */
const ROLE_PERMISSIONS: Record<Role, Set<Permission>> = {
  admin: new Set<Permission>([
    'settings:view',
    'settings:edit_sla',
    'settings:edit_routing',
    'settings:edit_financials',
    'settings:edit_audio',
    'settings:edit_taxonomies',
    'settings:edit_integrations',
    'settings:manage_storage',
    'team:invite_member',
    'team:rebalance_leads',
    'team:bulk_reassign',
    'leads:export_all',
  ]),
  manager: new Set<Permission>([
    'settings:view',
    'settings:edit_routing',
    'settings:edit_audio',
    'settings:edit_taxonomies',
    'settings:edit_integrations',
    'team:invite_member',
    'team:rebalance_leads',
    'team:bulk_reassign',
    'leads:export_all',
  ]),
  agent: new Set<Permission>([
    // Agents have frontline execution permissions, but zero administrative access
  ]),
};

/**
 * Checks whether a given role has a specific permission
 */
export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

/**
 * Determines whether a role can navigate to the Settings page at all
 */
export function canAccessSettings(role: Role): boolean {
  return hasPermission(role, 'settings:view');
}

export interface TabAccessResult {
  allowed: boolean;
  isReadOnly?: boolean;
  reason?: string;
}

/**
 * Evaluates access level for a specific Settings tab
 */
export function canAccessSettingsTab(role: Role, tab: SettingsTabId): TabAccessResult {
  if (role === 'admin') {
    return { allowed: true };
  }

  if (role === 'manager') {
    switch (tab) {
      case 'routing':
      case 'audio':
      case 'taxonomies':
      case 'integrations':
        return { allowed: true };
      case 'sla':
        return {
          allowed: true,
          isReadOnly: true,
          reason: 'Manager Review: SLA thresholds & breach escalation rules are locked to Super Admin.',
        };
      case 'financials':
        return {
          allowed: true,
          isReadOnly: true,
          reason: 'Manager Review: Base profit margins and commission TDS rates are locked to Super Admin.',
        };
      case 'storage':
        return {
          allowed: false,
          reason: 'Administrator Clearance Required: Database backups, restore operations, and factory resets require Super Admin authorization.',
        };
      default:
        return { allowed: false, reason: 'Unauthorized section' };
    }
  }

  // Agent role has zero settings access
  return {
    allowed: false,
    reason: 'Frontline Consultant Access: Agency administrative settings require Manager or Admin credentials.',
  };
}
