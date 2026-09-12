'use client';

import { useEffect, useMemo, useState } from 'react';
import { History, LoaderCircle, ShieldCheck } from 'lucide-react';
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
  if (event.entity_type === 'agency_settings') return 'Agency configuration changed';
  if (event.entity_type === 'incentive_tier') return `Incentive tier ${event.action}`;

  const changed = Object.entries(event.changes || {})
    .filter(([key, value]) => key !== 'lead_code' && key !== 'email' && value && typeof value === 'object')
    .filter(([, value]) => {
      const item = value as { from?: unknown; to?: unknown };
      return item.from !== item.to;
    })
    .map(([key]) => key.replaceAll('_', ' '));

  const identity = String(event.changes?.lead_code || event.changes?.email || event.entity_id);
  return changed.length
    ? `${identity}: ${changed.slice(0, 4).join(', ')} changed`
    : `${identity}: ${event.action}`;
}

export default function AuditPage() {
  const { currentUser, allProfiles } = useApp();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const canView = currentUser.role === 'admin' || currentUser.role === 'manager';

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    void fetch('/api/audit?limit=150', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Unable to load audit history.');
        setEvents(payload.events || []);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Unable to load audit history.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [canView]);

  const profileNames = useMemo(
    () => new Map(allProfiles.map((profile) => [profile.id, profile.full_name])),
    [allProfiles]
  );

  if (!canView) {
    return (
      <main className="p-8">
        <div className="mx-auto max-w-xl rounded-xl border border-zinc-200 bg-white p-6 text-center">
          <ShieldCheck className="mx-auto h-6 w-6 text-zinc-400" />
          <h1 className="mt-3 text-sm font-semibold text-zinc-900">Management access required</h1>
          <p className="mt-1 text-xs text-zinc-500">The security audit log is available only to managers and administrators.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-full bg-zinc-50 p-4 md:p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Governance</p>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-zinc-950">
            <History className="h-5 w-5" /> Security Audit
          </h1>
          <p className="mt-1 text-xs text-zinc-500">Append-only history of sensitive CRM state changes.</p>
        </div>

        <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {loading ? (
            <div className="flex items-center justify-center gap-2 px-4 py-12 text-xs text-zinc-500">
              <LoaderCircle className="h-4 w-4 animate-spin" /> Loading audit history…
            </div>
          ) : error ? (
            <div className="px-4 py-12 text-center text-xs text-red-600">{error}</div>
          ) : events.length === 0 ? (
            <div className="px-4 py-12 text-center text-xs text-zinc-500">No privileged changes have been recorded yet.</div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {events.map((event) => (
                <div key={event.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[170px_1fr_170px] sm:items-center">
                  <div>
                    <p className="text-[11px] font-medium text-zinc-900">
                      {event.actor_id ? profileNames.get(event.actor_id) || 'Unknown user' : 'Server automation'}
                    </p>
                    <p className="text-[10px] uppercase text-zinc-400">{event.actor_role || 'system'}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs text-zinc-800">{eventSummary(event)}</p>
                    <p className="mt-0.5 font-mono text-[10px] uppercase text-zinc-400">
                      {event.entity_type.replaceAll('_', ' ')} · {event.action}
                    </p>
                  </div>
                  <time className="text-[10px] text-zinc-500 sm:text-right" dateTime={event.created_at}>
                    {new Date(event.created_at).toLocaleString()}
                  </time>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
