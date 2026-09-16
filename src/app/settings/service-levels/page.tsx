'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Clock3, Loader2, Route, Save, ShieldAlert, TimerReset, UsersRound } from 'lucide-react';
import { useApp } from '@/lib/store';
import { useWorkspacePermissions } from '@/lib/use-workspace-permissions';

type Settings = {
  first_response_minutes: number;
  warning_minutes_before: number;
  auto_reassign_on_breach: boolean;
  auto_reassign_after_minutes: number;
  auto_close_waiting_hours: number;
  next_action_reminders: boolean;
  auto_assign_new_conversations: boolean;
  online_only_routing: boolean;
  routing_strategy: 'workload_balanced' | 'least_open' | 'round_robin' | 'conversion_weighted';
};

const DEFAULTS: Settings = {
  first_response_minutes: 30,
  warning_minutes_before: 10,
  auto_reassign_on_breach: false,
  auto_reassign_after_minutes: 30,
  auto_close_waiting_hours: 0,
  next_action_reminders: true,
  auto_assign_new_conversations: false,
  online_only_routing: false,
  routing_strategy: 'workload_balanced',
};

const ROUTING_HELP: Record<Settings['routing_strategy'], string> = {
  workload_balanced: 'Balances open conversations against each agent’s capacity. Best default for shared inbox teams.',
  least_open: 'Chooses the eligible agent with the fewest open conversations. Kept for legacy workspaces.',
  round_robin: 'Rotates new conversations evenly between eligible agents.',
  conversion_weighted: 'Prefers agents with stronger historical conversion performance when capacity allows.',
};

export default function ServiceLevelsPage() {
  const { showToast } = useApp();
  const { can, loading: permissionLoading } = useWorkspacePermissions();
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [workspace, setWorkspace] = useState<{ name: string; timezone: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/settings/service-levels', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to load service levels.');
      setSettings({ ...DEFAULTS, ...(payload.settings || {}) });
      setWorkspace(payload.workspace || null);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to load service levels.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (permissionLoading || !can('service_levels.view')) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [can, load, permissionLoading]);

  const update = <K extends keyof Settings,>(key: K, value: Settings[K]) => setSettings((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/settings/service-levels', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to save service levels.');
      setSettings({ ...DEFAULTS, ...(payload.settings || settings) });
      showToast('Service levels updated.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to save service levels.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!permissionLoading && !can('service_levels.view')) {
    return <div className="mx-auto max-w-xl px-6 py-20 text-center"><ShieldAlert className="mx-auto h-7 w-7 text-zinc-400" /><h1 className="mt-3 text-lg font-semibold">Service-level access required</h1><p className="mt-1 text-sm text-zinc-500">Your workspace role does not allow viewing conversation SLA settings.</p></div>;
  }

  return (
    <div className="app-page max-w-5xl">
      <header className="page-header">
        <div><p className="page-eyebrow">Operations</p><h1 className="page-title">Service levels</h1><p className="page-description">Set response targets, recovery rules and how shared Inbox work is distributed.</p></div>
        <div className="page-actions"><Link href="/team" className="button-secondary"><UsersRound className="h-4 w-4" /> Team workload</Link><Link href="/settings" className="button-secondary"><ArrowLeft className="h-4 w-4" /> Settings</Link><button type="button" onClick={() => void save()} disabled={saving || loading || !can('service_levels.edit')} className="button-primary">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save</button></div>
      </header>

      {workspace && <div className="surface-flat px-4 py-3 text-xs text-zinc-600"><span className="font-semibold text-zinc-900">{workspace.name}</span> · SLA clocks use workspace timezone <span className="font-mono">{workspace.timezone || 'UTC'}</span>.</div>}

      {loading ? <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading service levels…</div> : <div className="grid gap-4 lg:grid-cols-2">
        <section className="surface-flat p-5"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><Clock3 className="h-4 w-4" /></span><div><h2 className="section-heading">First response</h2><p className="section-description">When a new inbound conversation becomes urgent.</p></div></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-xs font-semibold text-zinc-700">Response target (minutes)<input type="number" min={1} max={1440} value={settings.first_response_minutes} onChange={(e) => update('first_response_minutes', Number(e.target.value))} className="field mt-1.5" /></label><label className="text-xs font-semibold text-zinc-700">Warn before breach (minutes)<input type="number" min={0} max={1440} value={settings.warning_minutes_before} onChange={(e) => update('warning_minutes_before', Number(e.target.value))} className="field mt-1.5" /></label></div></section>

        <section className="surface-flat p-5"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-50 text-rose-700"><TimerReset className="h-4 w-4" /></span><div><h2 className="section-heading">Recovery</h2><p className="section-description">What happens when response work is missed.</p></div></div><div className="mt-5 space-y-4"><label className="flex items-center justify-between gap-4 text-sm font-medium text-zinc-800"><span><span className="block">Reassign after breach</span><span className="text-xs font-normal text-zinc-500">Move overdue work to another eligible agent.</span></span><input type="checkbox" checked={settings.auto_reassign_on_breach} onChange={(e) => update('auto_reassign_on_breach', e.target.checked)} /></label><label className="block text-xs font-semibold text-zinc-700">Reassign after (minutes)<input type="number" min={0} max={10080} disabled={!settings.auto_reassign_on_breach} value={settings.auto_reassign_after_minutes} onChange={(e) => update('auto_reassign_after_minutes', Number(e.target.value))} className="field mt-1.5 disabled:bg-zinc-50" /></label></div></section>

        <section className="surface-flat p-5"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-700"><ShieldAlert className="h-4 w-4" /></span><div><h2 className="section-heading">Conversation lifecycle</h2><p className="section-description">Keep queues clean without losing customer history.</p></div></div><div className="mt-5 space-y-4"><label className="block text-xs font-semibold text-zinc-700">Auto-close waiting conversations after hours <span className="font-normal text-zinc-400">(0 = off)</span><input type="number" min={0} max={720} value={settings.auto_close_waiting_hours} onChange={(e) => update('auto_close_waiting_hours', Number(e.target.value))} className="field mt-1.5" /></label><label className="flex items-center justify-between gap-4 text-sm font-medium text-zinc-800"><span><span className="block">Next-action reminders</span><span className="text-xs font-normal text-zinc-500">Notify owners when a scheduled conversation action becomes due.</span></span><input type="checkbox" checked={settings.next_action_reminders} onChange={(e) => update('next_action_reminders', e.target.checked)} /></label></div></section>

        <section className="surface-flat p-5"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-700"><Route className="h-4 w-4" /></span><div><h2 className="section-heading">Routing</h2><p className="section-description">Choose when new conversations are assigned and how the owner is selected.</p></div></div><div className="mt-5 space-y-4"><label className="flex items-center justify-between gap-4 text-sm font-medium text-zinc-800"><span><span className="block">Auto-assign new live conversations</span><span className="text-xs font-normal text-zinc-500">Route new inbound chats immediately. Historical sync and backfill messages are never auto-assigned.</span></span><input type="checkbox" checked={settings.auto_assign_new_conversations} onChange={(e) => update('auto_assign_new_conversations', e.target.checked)} /></label><label className="block text-xs font-semibold text-zinc-700">Routing strategy<select value={settings.routing_strategy} onChange={(e) => update('routing_strategy', e.target.value as Settings['routing_strategy'])} className="select-field mt-1.5 w-full"><option value="workload_balanced">Balanced workload — recommended</option><option value="round_robin">Round robin</option><option value="conversion_weighted">Conversion weighted</option><option value="least_open">Least open — legacy</option></select></label><div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs leading-5 text-zinc-600">{ROUTING_HELP[settings.routing_strategy]}</div><label className="flex items-center justify-between gap-4 text-sm font-medium text-zinc-800"><span><span className="block">Available agents only</span><span className="text-xs font-normal text-zinc-500">Skip agents whose work status is not available.</span></span><input type="checkbox" checked={settings.online_only_routing} onChange={(e) => update('online_only_routing', e.target.checked)} /></label></div></section>
      </div>}

      {!can('service_levels.edit') && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">You have read-only access to service-level configuration.</div>}
    </div>
  );
}
