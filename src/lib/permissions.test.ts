import { describe, expect, it } from 'vitest';
import { canAccessSettings, canAccessSettingsTab, hasPermission } from './permissions';

describe('role permissions', () => {
  it('blocks agents from administrative settings', () => {
    expect(canAccessSettings('agent')).toBe(false);
    expect(canAccessSettingsTab('agent', 'routing').allowed).toBe(false);
  });

  it('keeps financial settings read-only for managers', () => {
    expect(canAccessSettings('manager')).toBe(true);
    expect(canAccessSettingsTab('manager', 'financials')).toMatchObject({ allowed: true, isReadOnly: true });
  });

  it('allows admin-only storage management', () => {
    expect(hasPermission('admin', 'settings:manage_storage')).toBe(true);
    expect(hasPermission('manager', 'settings:manage_storage')).toBe(false);
  });
});
