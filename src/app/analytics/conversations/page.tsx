'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Clock3, Loader2, RefreshCw, RotateCcw, ShieldAlert, TimerReset, Users } from 'lucide-react';

type AnalyticsPayload = {
  range: { days: number; start: string; end: string };
  metrics: {
    sessions: number;
    resolved: number;
    resolution_rate: number;
    average_first_response_seconds: number | null;
    median_first_response_seconds: number | null;
    average_resolution_seconds: number | null;
    median_resolution_seconds: number | null;
    reopened_conversations: number;
    reopen_rate: number;
    sla_breaches: number;
    sla_breach_rate: number;
  };
  by_provider: Array<{ provider: string; count: number }>;
  resolutions: Array<{ reason: string; count: number }>;
  agents: Array<{
    id: string;
    name: string;
    sessions: number;
    resolved: number;
    resolution_rate: number;
    average_first_response_seconds: number | null;
    average_resolution_seconds: number | null;
    active_workload: number;
  }>;
};

function duration(seconds: number | null) {
  if (seconds == null) return '—';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round((seconds / 3600) * 10) / 10;
  return `${hours}h`;
}

function label(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

export default function ConversationAnalyticsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/analytics/conversations?days=${days}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to load report.');
      setData(payload as AnalyticsPayload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load report.');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { void load(); }, [load]);

  const maxProvider = Math.max(1, ...(data?.by_provider.map((row) => row.count) || [1]));
  const maxResolution = Math.max(1, ...(data?.resolutions.map((row) => row.count) || [1]));

  return (
    <main className="min-h-full bg-zinc-50 px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-col gap-3 border-b border-zinc-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/analytics" className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-900">
              <ArrowLeft className="h-3.5 w-3.5" /> Performance
            </Link>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-950">Conversation operations</h1>
            <p className="mt-1 text-sm text-zinc-500">Response speed, resolution quality, workload and channel performance from real conversation sessions.</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="conversation-range">Report range</label>
            <select id="conversation-range" value={days} onChange={(event) => setDays(Number(event.target.value))} className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200">
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
              <option value={180}>180 days</option>
            </select>
            <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 disabled:opacity-50">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
            </button>
          </div>
        </header>

        {error ? <div role="alert" className="border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div> : null}

        <section className="grid gap-px overflow-hidden border border-zinc-200 bg-zinc-200 sm:grid-cols-2 lg:grid-cols-4" aria-label="Conversation performance summary">
          {[
            { label: 'Sessions', value: data?.metrics.sessions ?? '—', detail: `${data?.metrics.resolution_rate ?? 0}% resolved`, icon: Users },
            { label: 'Median first response', value: duration(data?.metrics.median_first_response_seconds ?? null), detail: `Avg ${duration(data?.metrics.average_first_response_seconds ?? null)}`, icon: Clock3 },
            { label: 'Median resolution', value: duration(data?.metrics.median_resolution_seconds ?? null), detail: `Avg ${duration(data?.metrics.average_resolution_seconds ?? null)}`, icon: TimerReset },
            { label: 'SLA breach rate', value: data ? `${data.metrics.sla_breach_rate}%` : '—', detail: `${data?.metrics.sla_breaches ?? 0} breached`, icon: ShieldAlert },
          ].map((metric) => (
            <div key={metric.label} className="bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold uppercase tracking-wide text-zinc-500">{metric.label}</span>
                <metric.icon className="h-4 w-4 text-zinc-400" />
              </div>
              <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-zinc-950">{metric.value}</div>
              <div className="mt-1 text-xs text-zinc-500">{metric.detail}</div>
            </div>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="border border-zinc-200 bg-white">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <div><h2 className="text-sm font-bold text-zinc-900">Channel volume</h2><p className="text-xs text-zinc-500">Sessions opened by source</p></div>
            </div>
            <div className="space-y-3 p-4">
              {(data?.by_provider || []).length ? data?.by_provider.map((row) => (
                <div key={row.provider}>
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-xs"><span className="font-semibold text-zinc-700">{label(row.provider)}</span><span className="font-mono text-zinc-500">{row.count}</span></div>
                  <div className="h-1.5 bg-zinc-100"><div className="h-full bg-zinc-800" style={{ width: `${Math.max(3, (row.count / maxProvider) * 100)}%` }} /></div>
                </div>
              )) : <p className="py-8 text-center text-sm text-zinc-400">No session data in this range.</p>}
            </div>
          </div>

          <div className="border border-zinc-200 bg-white">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <div><h2 className="text-sm font-bold text-zinc-900">Resolution reasons</h2><p className="text-xs text-zinc-500">Why conversations were closed</p></div>
              <div className="flex items-center gap-1 text-xs font-semibold text-zinc-500"><RotateCcw className="h-3.5 w-3.5" /> {data?.metrics.reopen_rate ?? 0}% reopened</div>
            </div>
            <div className="space-y-3 p-4">
              {(data?.resolutions || []).length ? data?.resolutions.map((row) => (
                <div key={row.reason}>
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-xs"><span className="font-semibold text-zinc-700">{label(row.reason)}</span><span className="font-mono text-zinc-500">{row.count}</span></div>
                  <div className="h-1.5 bg-zinc-100"><div className="h-full bg-zinc-700" style={{ width: `${Math.max(3, (row.count / maxResolution) * 100)}%` }} /></div>
                </div>
              )) : <p className="py-8 text-center text-sm text-zinc-400">No resolved sessions in this range.</p>}
            </div>
          </div>
        </section>

        <section className="overflow-hidden border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-4 py-3"><h2 className="text-sm font-bold text-zinc-900">Agent operations</h2><p className="text-xs text-zinc-500">Volume, response speed, resolution and current workload</p></div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zinc-50 text-[11px] font-bold uppercase tracking-wide text-zinc-500"><tr><th className="px-4 py-2.5">Agent</th><th className="px-4 py-2.5 text-right">Sessions</th><th className="px-4 py-2.5 text-right">Resolution</th><th className="px-4 py-2.5 text-right">First response</th><th className="px-4 py-2.5 text-right">Resolution time</th><th className="px-4 py-2.5 text-right">Active</th></tr></thead>
              <tbody className="divide-y divide-zinc-100">
                {(data?.agents || []).map((agent) => <tr key={agent.id} className="hover:bg-zinc-50"><td className="px-4 py-3 font-semibold text-zinc-900">{agent.name}</td><td className="px-4 py-3 text-right font-mono text-zinc-700">{agent.sessions}</td><td className="px-4 py-3 text-right font-mono text-zinc-700">{agent.resolution_rate}%</td><td className="px-4 py-3 text-right font-mono text-zinc-700">{duration(agent.average_first_response_seconds)}</td><td className="px-4 py-3 text-right font-mono text-zinc-700">{duration(agent.average_resolution_seconds)}</td><td className="px-4 py-3 text-right font-mono font-bold text-zinc-900">{agent.active_workload}</td></tr>)}
                {!loading && !(data?.agents || []).length ? <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-zinc-400">No assigned conversation sessions in this range.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
