'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

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

type PermissionMap = Record<WorkspacePermission, boolean>;

const EMPTY: PermissionMap = {
  'inbox.view': false,
  'inbox.assign': false,
  'inbox.resolve': false,
  'inbox.saved_views.manage': false,
  'contacts.view': false,
  'contacts.edit': false,
  'contacts.merge': false,
  'automations.view': false,
  'automations.edit': false,
  'automations.publish': false,
  'reports.view': false,
  'permissions.view': false,
  'permissions.manage': false,
};

let cached: PermissionMap | null = null;
let pending: Promise<PermissionMap> | null = null;

async function loadPermissions() {
  if (cached) return cached;
  if (!pending) {
    pending = fetch('/api/permissions/me', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load workspace permissions.');
        const payload = await response.json() as { permissions?: Partial<PermissionMap> };
        cached = { ...EMPTY, ...(payload.permissions || {}) };
        return cached;
      })
      .finally(() => { pending = null; });
  }
  return pending;
}

export function invalidateWorkspacePermissions() {
  cached = null;
}

export function useWorkspacePermissions() {
  const [permissions, setPermissions] = useState<PermissionMap>(cached || EMPTY);
  const [loading, setLoading] = useState(!cached);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      invalidateWorkspacePermissions();
      setPermissions(await loadPermissions());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void loadPermissions()
        .then((value) => { if (active) setPermissions(value); })
        .finally(() => { if (active) setLoading(false); });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, []);

  return useMemo(() => ({
    permissions,
    loading,
    can: (permission: WorkspacePermission) => permissions[permission] === true,
    refresh,
  }), [loading, permissions, refresh]);
}
