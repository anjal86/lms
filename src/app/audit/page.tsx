'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, History, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { useApp } from '@/lib/store';

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
  if (event.entity_type === 'agency_settings') return 'Agency settings changed';
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

  const profileNames = useMemo(
    () => new Map(allProfiles.map((profile) => [profile.id, profile.full_name])),
    [allProfiles]
  );

  if (!canView) {
    return (
      <div className="empty-state surface-flat">
        <ShieldCheck className="h-5 w-5 text-zinc-300" />
        <h1 className="empty-state-title mt-3">Management access required</h1>
        <p className="empty-state-description">Only managers and administrators can view sensitive change history.</p>
      </div>
    );
  }

  return (
    <div className="app-page">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Governance</p>
          <h1 className="page-title">Audit history</h1>
          <p className="page-description">A read-only history of sensitive changes to leads, users, settings, and incentives.</p>
        </div>
        <div className="page-actions">
          <button type="button" onClick={() => void loadAudit()} className="button-secondary" disabled={loading}>
            {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
          </button>
        </div>
      </header>

      {migrationRequired && (
        <div className="surface-flat flex items-start gap-3 p-4" role="status">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div>
            <div className="text-xs font-semibold text-zinc-800">Audit history is not enabled in this database yet</div>
            <p className="mt-1 text-xs leading-5 text-zinc-500">Apply the pending database migrations, then refresh this page. The CRM can continue running in the meantime.</p>
          </div>
        </div>
      )}

      <section className="surface-flat overflow-hidden">
        {loading ? (
          <div className="empty-state" role="status">
            <LoaderCircle className="h-5 w-5 animate-spin text-zinc-400" />
            <p className="empty-state-description mt-3">Loading audit history…</p>
          </div>
        ) : error ? (
          <div className="empty-state" role="alert">
            <AlertTriangle className="h-5 w-5 text-danger" />
            <h2 className="empty-state-title mt-3">Audit history could not be loaded</h2>
            <p className="empty-state-description">{error}</p>
            <button type="button" className="button-primary mt-4" onClick={() => void loadAudit()}>Try again</button>
          </div>
        ) : events.length === 0 ? (
          <div className="empty-state">
            <History className="h-5 w-5 text-zinc-300" />
            <h2 className="empty-state-title mt-3">No recorded changes</h2>
            <p className="empty-state-description">Sensitive changes will appear here once auditing is active.</p>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {events.map((event) => (
              <div key={event.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[11rem_minmax(0,1fr)_11rem] sm:items-center">
                <div>
                  <p className="text-xs font-semibold text-zinc-800">{event.actor_id ? profileNames.get(event.actor_id) || 'Unknown user' : 'Server automation'}</p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-wide text-zinc-400">{event.actor_role || 'system'}</p>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs text-zinc-700">{eventSummary(event)}</p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-tight text-zinc-400">{event.entity_type.replaceAll('_', ' ')} · {event.action}</p>
                </div>
                <time className="font-mono text-[10px] text-zinc-500 sm:text-right" dateTime={event.created_at}>{new Date(event.created_at).toLocaleString()}</time>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
