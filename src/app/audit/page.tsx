'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, History, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { useApp } from '@/lib/store';
import { EmptyBlock, InlineNotice, LoadingBlock, SettingsSection, StatusBadge } from '@/components/settings/SettingsPrimitives';

type AuditEvent = {
  id: string;
  actor_id?: string | null;
  actor_role?: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  changes: Record<string, unknown>;
  created_at: string;
};

function eventSummary(event: AuditEvent) {
  if (event.entity_type === 'agency_settings') return 'Workspace settings changed';
  if (event.entity_type === 'incentive_tier') return `Incentive tier ${event.action}`;

  const changed = Object.entries(event.changes || {})
    .filter(([key, value]) => key !== 'lead_code' && key !== 'email' && value && typeof value === 'object')
    .filter(([, value]) => {
      const item = value as { from?: unknown; to?: unknown };
      return item.from !== item.to;
    })
    .map(([key]) => key.replaceAll('_', ' '));

  const identity = String(event.changes?.lead_code || event.changes?.email || event.entity_id);
  return changed.length ? `${identity}: ${changed.slice(0, 4).join(', ')} changed` : `${identity}: ${event.action}`;
}

export default function AuditPage() {
  const { currentUser, allProfiles } = useApp();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [query, setQuery] = useState('');
  const canView = currentUser.role === 'admin' || currentUser.role === 'manager';

  const loadAudit = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/audit?limit=150', { cache: 'no-store', signal });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to load audit history.');
      setEvents(Array.isArray(payload.events) ? payload.events : []);
      setMigrationRequired(Boolean(payload.migrationRequired));
    } catch (loadError) {
      if (signal?.aborted) return;
      setError(loadError instanceof Error ? loadError.message : 'Unable to load audit history.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = 'Audit — Wanderlust CRM';
    if (!canView) return;
    const controller = new AbortController();
    const initial = window.setTimeout(() => void loadAudit(controller.signal), 0);
    return () => {
      window.clearTimeout(initial);
      controller.abort();
    };
  }, [canView, loadAudit]);

  const profileNames = useMemo(() => new Map(allProfiles.map((profile) => [profile.id, profile.full_name])), [allProfiles]);
  const visibleEvents = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return events;
    return events.filter((event) => {
      const actor = event.actor_id ? profileNames.get(event.actor_id) || 'Unknown user' : 'Server automation';
      return `${actor} ${event.actor_role || ''} ${event.entity_type} ${event.action} ${eventSummary(event)}`.toLowerCase().includes(needle);
    });
  }, [events, profileNames, query]);

  if (!canView) {
    return <EmptyBlock icon={ShieldCheck} title="Management access required" description="Only managers and administrators can view sensitive change history." />;
  }

  return (
    <div className="app-page">
      <header className="page-header">
        <div><p className="page-eyebrow">Governance</p><h1 className="page-title">Audit history</h1><p className="page-description">A read-only history of sensitive workspace changes and automated administrative actions.</p></div>
        <div className="page-actions"><StatusBadge tone="neutral">Read only</StatusBadge><button type="button" onClick={() => void loadAudit()} className="button-secondary" disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button></div>
      </header>

      {migrationRequired && <InlineNotice tone="warning"><strong>Audit history is not enabled in this database yet.</strong> Apply the pending database migrations, then refresh this page.</InlineNotice>}

      <SettingsSection title="Recorded changes" description={`${events.length} recent event${events.length === 1 ? '' : 's'} loaded.`} icon={History} actions={<div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="field h-8 w-56 pl-8 text-xs" placeholder="Search audit history" aria-label="Search audit history" /></div>}>
        {loading ? <LoadingBlock label="Loading audit history…" /> : error ? <div className="py-10 text-center"><AlertTriangle className="mx-auto h-5 w-5 text-red-500" /><h2 className="mt-3 text-sm font-semibold text-zinc-900">Audit history could not be loaded</h2><p className="mt-1 text-xs text-zinc-500">{error}</p><button type="button" className="button-secondary mt-4" onClick={() => void loadAudit()}>Try again</button></div> : events.length === 0 ? <EmptyBlock icon={History} title="No recorded changes" description="Sensitive changes will appear here once auditing is active." /> : visibleEvents.length === 0 ? <EmptyBlock icon={Search} title="No matching events" description="Try a different user, action, entity, or search term." /> : <div className="-m-5 divide-y divide-zinc-100">{visibleEvents.map((event) => <div key={event.id} className="grid gap-2 px-5 py-3.5 hover:bg-zinc-50/70 sm:grid-cols-[11rem_minmax(0,1fr)_11rem] sm:items-center"><div><p className="text-xs font-semibold text-zinc-800">{event.actor_id ? profileNames.get(event.actor_id) || 'Unknown user' : 'Server automation'}</p><div className="mt-1"><StatusBadge tone="neutral">{event.actor_role || 'system'}</StatusBadge></div></div><div className="min-w-0"><p className="truncate text-xs text-zinc-700">{eventSummary(event)}</p><p className="mt-0.5 font-mono text-[10px] uppercase tracking-tight text-zinc-400">{event.entity_type.replaceAll('_', ' ')} · {event.action}</p></div><time className="font-mono text-[10px] text-zinc-500 sm:text-right" dateTime={event.created_at}>{new Date(event.created_at).toLocaleString()}</time></div>)}</div>}
      </SettingsSection>
    </div>
  );
}
