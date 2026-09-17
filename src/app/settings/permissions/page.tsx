'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, RefreshCw, ShieldCheck } from 'lucide-react';
import { useApp } from '@/lib/store';
import { invalidateWorkspacePermissions } from '@/lib/use-workspace-permissions';
import {
  DirtySaveBar,
  InlineNotice,
  LoadingBlock,
  SettingsSection,
  StatusBadge,
  useUnsavedChangesGuard,
} from '@/components/settings/SettingsPrimitives';

type RoleRow = { role: 'admin' | 'manager' | 'agent'; permissions: Record<string, boolean>; updated_at: string | null };
type Payload = { permission_keys: string[]; roles: RoleRow[] };

const GROUPS: Array<{ title: string; items: Array<[string, string, string]> }> = [
  { title: 'Inbox', items: [
    ['inbox.view','View Inbox','Open conversation queues and threads'],
    ['inbox.assign','Assign conversations','Assign work to other agents'],
    ['inbox.resolve','Resolve conversations','Close and reopen conversation work'],
    ['inbox.saved_views.manage','Manage saved views','Create reusable Inbox filters'],
  ] },
  { title: 'Contacts', items: [
    ['contacts.view','View contacts','Search identity and conversation history'],
    ['contacts.edit','Edit contacts','Change identity, lifecycle, tags and owner'],
    ['contacts.merge','Merge duplicates','Permanently merge contact records'],
  ] },
  { title: 'Automations', items: [
    ['automations.view','View automations','Inspect workflows, run history and dry runs'],
    ['automations.edit','Edit automations','Create and change workflow definitions'],
    ['automations.publish','Publish automations','Enable or disable workflows'],
  ] },
  { title: 'Service levels', items: [
    ['service_levels.view','View service levels','Inspect response, recovery and routing settings'],
    ['service_levels.edit','Edit service levels','Change SLA, reassignment and routing behavior'],
  ] },
  { title: 'Reporting', items: [
    ['reports.view','View reports','See conversation and agent operations analytics'],
  ] },
  { title: 'Administration', items: [
    ['permissions.view','View permissions','Inspect role access rules'],
    ['permissions.manage','Manage permissions','Change workspace role permissions'],
  ] },
];

export default function PermissionsPage() {
  const { currentUser, showToast } = useApp();
  const isAdmin = currentUser.role === 'admin';
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Record<string, boolean>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/permissions', { cache: 'no-store' });
      const payload = await response.json() as Payload & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Unable to load permissions.');
      setRoles(payload.roles || []);
      setDrafts(Object.fromEntries((payload.roles || []).map((role) => [role.role, { ...(role.permissions || {}) }])));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load permissions.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const editableRoles = useMemo(() => roles.filter((role) => role.role === 'manager' || role.role === 'agent'), [roles]);
  const changed = useCallback((role: RoleRow) => JSON.stringify(role.permissions || {}) !== JSON.stringify(drafts[role.role] || {}), [drafts]);
  const dirtyRoles = useMemo(() => editableRoles.filter((role) => changed(role)), [editableRoles, changed]);
  const dirty = dirtyRoles.length > 0;
  useUnsavedChangesGuard(isAdmin && dirty);

  const toggle = (role: string, key: string) => {
    if (!isAdmin) return;
    setDrafts((current) => ({ ...current, [role]: { ...(current[role] || {}), [key]: !(current[role]?.[key] ?? false) } }));
  };

  const saveAll = async () => {
    if (!isAdmin || !dirtyRoles.length) return;
    setSaving(true);
    try {
      for (const role of dirtyRoles) {
        const response = await fetch('/api/permissions', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: role.role, permissions: drafts[role.role] || {} }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || `Unable to save ${role.role} permissions.`);
      }
      invalidateWorkspacePermissions();
      showToast('Workspace permissions updated.', 'success');
      await load();
    } catch (saveError) {
      showToast(saveError instanceof Error ? saveError.message : 'Unable to save permissions.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const discard = () => setDrafts(Object.fromEntries(roles.map((role) => [role.role, { ...(role.permissions || {}) }])));

  if (loading) return <LoadingBlock label="Loading permissions…" />;
  if (error) return <div className="mx-auto max-w-xl py-16 text-center"><AlertCircle className="mx-auto h-7 w-7 text-red-500" /><h1 className="mt-3 text-lg font-semibold text-zinc-950">Permissions unavailable</h1><p className="mt-1 text-sm text-zinc-500">{error}</p><button type="button" onClick={() => void load()} className="button-secondary mt-4"><RefreshCw className="h-4 w-4" /> Retry</button></div>;

  return (
    <div className="app-page">
      <header className="page-header">
        <div><p className="page-eyebrow">People & access</p><h1 className="page-title">Role permissions</h1><p className="page-description">Control operational capabilities for managers and agents without creating extra application roles.</p></div>
        <div className="page-actions"><StatusBadge tone={isAdmin ? 'success' : 'neutral'}>{isAdmin ? 'Editable' : 'Read only'}</StatusBadge></div>
      </header>

      {!isAdmin && <InlineNotice tone="warning">Only workspace administrators can change role access. You can inspect the current permission model.</InlineNotice>}

      <div className="grid gap-4 xl:grid-cols-2">
        {editableRoles.map((role) => (
          <SettingsSection
            key={role.role}
            title={role.role === 'manager' ? 'Manager' : 'Agent'}
            description={role.role === 'manager' ? 'Supervises operations, routing and reporting.' : 'Handles assigned customer work.'}
            icon={ShieldCheck}
            actions={changed(role) ? <StatusBadge tone="warning">Modified</StatusBadge> : <StatusBadge tone="neutral">Saved</StatusBadge>}
          >
            <div className="divide-y divide-zinc-100">
              {GROUPS.map((group) => (
                <div key={group.title} className="py-4 first:pt-0 last:pb-0">
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">{group.title}</div>
                  <div className="space-y-1">
                    {group.items.map(([key, title, description]) => {
                      const enabled = drafts[role.role]?.[key] === true;
                      return (
                        <button key={key} type="button" disabled={!isAdmin} onClick={() => toggle(role.role, key)} className={`flex min-h-12 w-full items-center gap-3 rounded-md px-2 py-2 text-left ${isAdmin ? 'hover:bg-zinc-50' : 'cursor-default'}`} aria-pressed={enabled}>
                          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${enabled ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-300 bg-white text-transparent'}`}><Check className="h-3.5 w-3.5" /></span>
                          <span className="min-w-0"><span className="block text-xs font-semibold text-zinc-900">{title}</span><span className="block text-[11px] leading-4 text-zinc-500">{description}</span></span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </SettingsSection>
        ))}
      </div>

      <InlineNotice tone="info"><strong>Administrator access is fixed.</strong> Administrators always retain full workspace access so a permission edit cannot lock the workspace out of its own controls.</InlineNotice>
      {isAdmin && <DirtySaveBar dirty={dirty} saving={saving} onSave={() => void saveAll()} onDiscard={discard} label="Save permissions" message={`${dirtyRoles.length} role${dirtyRoles.length === 1 ? '' : 's'} changed.`} />}
    </div>
  );
}
