'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, Check, Loader2, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import { useApp } from '@/lib/store';

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
    ['automations.view','View automations','Inspect workflows and dry runs'],
    ['automations.edit','Edit automations','Create and change workflow definitions'],
    ['automations.publish','Publish automations','Enable or disable workflows'],
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
  const [savingRole, setSavingRole] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/permissions', { cache: 'no-store' });
      const payload = await response.json() as Payload & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Unable to load permissions.');
      setRoles(payload.roles || []);
      setDrafts(Object.fromEntries((payload.roles || []).map((role) => [role.role, { ...(role.permissions || {}) }])));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load permissions.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const editableRoles = useMemo(() => roles.filter((role) => role.role === 'manager' || role.role === 'agent'), [roles]);
  const changed = (role: RoleRow) => JSON.stringify(role.permissions || {}) !== JSON.stringify(drafts[role.role] || {});

  const toggle = (role: string, key: string) => {
    if (!isAdmin) return;
    setDrafts((current) => ({ ...current, [role]: { ...(current[role] || {}), [key]: !(current[role]?.[key] ?? false) } }));
  };

  const save = async (role: RoleRow) => {
    setSavingRole(role.role);
    try {
      const response = await fetch('/api/permissions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: role.role, permissions: drafts[role.role] || {} }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to save permissions.');
      showToast(`${role.role === 'manager' ? 'Manager' : 'Agent'} permissions updated.`, 'success');
      await load();
    } catch (saveError) {
      showToast(saveError instanceof Error ? saveError.message : 'Unable to save permissions.', 'error');
    } finally { setSavingRole(null); }
  };

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center gap-2 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading permissions…</div>;
  if (error) return <div className="mx-auto max-w-xl px-5 py-16 text-center"><AlertCircle className="mx-auto h-7 w-7 text-red-500" /><h1 className="mt-3 text-lg font-semibold text-zinc-950">Permissions unavailable</h1><p className="mt-1 text-sm text-zinc-500">{error}</p><button type="button" onClick={() => void load()} className="button-secondary mt-4"><RefreshCw className="h-4 w-4" /> Retry</button></div>;

  return <main className="min-h-full bg-zinc-50 px-4 py-5 sm:px-6 lg:px-8"><div className="mx-auto max-w-6xl space-y-5">
    <header className="flex flex-col gap-3 border-b border-zinc-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div><Link href="/settings" className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-900"><ArrowLeft className="h-3.5 w-3.5" /> Settings</Link><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-zinc-700" /><h1 className="text-2xl font-bold tracking-tight text-zinc-950">Role permissions</h1></div><p className="mt-1 text-sm text-zinc-500">Control operational access without creating more application roles.</p></div>
      {!isAdmin && <div className="border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">Read only · only workspace administrators can change access.</div>}
    </header>

    <div className="grid gap-4 xl:grid-cols-2">
      {editableRoles.map((role) => <section key={role.role} className="border border-zinc-200 bg-white">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3"><div><h2 className="text-sm font-bold capitalize text-zinc-950">{role.role}</h2><p className="text-xs text-zinc-500">{role.role === 'manager' ? 'Supervises operations, routing and reporting.' : 'Handles assigned customer work.'}</p></div>{isAdmin && <button type="button" disabled={!changed(role) || savingRole === role.role} onClick={() => void save(role)} className="button-primary button-sm">{savingRole === role.role ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save</button>}</div>
        <div className="divide-y divide-zinc-100">{GROUPS.map((group) => <div key={group.title} className="p-4"><div className="mb-2 text-[10px] font-bold uppercase tracking-[0.13em] text-zinc-400">{group.title}</div><div className="space-y-1">{group.items.map(([key,title,description]) => {
          const enabled = drafts[role.role]?.[key] === true;
          return <button key={key} type="button" disabled={!isAdmin} onClick={() => toggle(role.role,key)} className={`flex min-h-12 w-full items-center gap-3 rounded-md px-2 py-2 text-left ${isAdmin ? 'hover:bg-zinc-50' : 'cursor-default'}`} aria-pressed={enabled}><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${enabled ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-300 bg-white text-transparent'}`}><Check className="h-3.5 w-3.5" /></span><span className="min-w-0"><span className="block text-xs font-semibold text-zinc-900">{title}</span><span className="block text-[11px] leading-4 text-zinc-500">{description}</span></span></button>;
        })}</div></div>)}</div>
      </section>)}
    </div>

    <div className="border border-zinc-200 bg-white px-4 py-3 text-xs leading-5 text-zinc-500"><strong className="text-zinc-800">Administrator access is fixed.</strong> Administrators always retain full workspace access so a permission edit cannot lock the workspace out of its own controls.</div>
  </div></main>;
}
