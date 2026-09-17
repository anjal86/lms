'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Clock3, Coins, RefreshCw, Search, ShieldCheck, Waypoints } from 'lucide-react';
import { useApp } from '@/lib/store';
import { EmptyBlock, LoadingBlock, SettingsSection, StatusBadge } from '@/components/settings/SettingsPrimitives';

type Run = {
  id: string;
  conversation_id?: string | null;
  provider?: string | null;
  model?: string | null;
  status: string;
  action?: string | null;
  confidence?: number | string | null;
  intent?: string | null;
  latency_ms?: number | null;
  total_tokens?: number | null;
  error_message?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
};
type Summary = {
  sampled_runs: number;
  finished_runs: number;
  success_rate: number | null;
  failed_runs: number;
  handoff_runs: number;
  median_latency_ms: number | null;
  total_tokens: number;
  estimated_cost_usd: number;
};

function percent(value: number | null) {
  return value == null ? '—' : `${(value * 100).toFixed(1)}%`;
}

function statusTone(status: string) {
  if (status === 'failed') return 'danger' as const;
  if (status === 'handoff') return 'warning' as const;
  if (status === 'scheduled' || status === 'running') return 'info' as const;
  if (status === 'completed' || status === 'success' || status === 'sent') return 'success' as const;
  return 'neutral' as const;
}

export default function AiObservabilityPage() {
  const { currentUser, showToast } = useApp();
  const canManage = currentUser.role === 'admin' || currentUser.role === 'manager';
  const [runs, setRuns] = useState<Run[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const load = useCallback(async () => {
    if (!canManage) { setLoading(false); return; }
    setLoading(true);
    try {
      const response = await fetch('/api/settings/ai-runs?limit=150', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to load AI operations.');
      setRuns(Array.isArray(payload.runs) ? payload.runs : []);
      setSummary(payload.summary || null);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to load AI operations.', 'error');
    } finally {
      setLoading(false);
    }
  }, [canManage, showToast]);

  useEffect(() => { void load(); }, [load]);

  const statuses = useMemo(() => Array.from(new Set(runs.map((run) => run.status))).sort(), [runs]);
  const visibleRuns = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return runs.filter((run) => {
      if (statusFilter !== 'all' && run.status !== statusFilter) return false;
      if (!needle) return true;
      return `${run.provider || ''} ${run.model || ''} ${run.intent || ''} ${run.action || ''} ${run.error_message || ''}`.toLowerCase().includes(needle);
    });
  }, [runs, query, statusFilter]);

  if (!canManage) {
    return <div className="mx-auto max-w-xl py-20 text-center"><ShieldCheck className="mx-auto h-7 w-7 text-zinc-400" /><h1 className="mt-3 text-lg font-semibold">Manager access required</h1><p className="mt-1 text-sm text-zinc-500">AI run telemetry is limited to workspace managers.</p></div>;
  }

  const cards = [
    { label: 'Success rate', value: percent(summary?.success_rate ?? null), icon: Activity },
    { label: 'Failed runs', value: String(summary?.failed_runs ?? 0), icon: AlertTriangle },
    { label: 'Handoffs', value: String(summary?.handoff_runs ?? 0), icon: Waypoints },
    { label: 'Median LLM latency', value: summary?.median_latency_ms == null ? '—' : `${summary.median_latency_ms} ms`, icon: Clock3 },
    { label: 'Tokens sampled', value: (summary?.total_tokens ?? 0).toLocaleString(), icon: Coins },
    { label: 'Estimated cost', value: `$${(summary?.estimated_cost_usd ?? 0).toFixed(2)}`, icon: Coins },
  ];

  return (
    <div className="app-page">
      <header className="page-header">
        <div><p className="page-eyebrow">Workspace intelligence</p><h1 className="page-title">AI Operations</h1><p className="page-description">Inspect model decisions, latency, failures, handoffs, token usage and live-run health.</p></div>
        <div className="page-actions"><button type="button" className="button-secondary" onClick={() => void load()} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button></div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {cards.map(({ label, value, icon: Icon }) => <div key={label} className="rounded-lg border border-zinc-200 bg-white p-4"><Icon className="h-4 w-4 text-zinc-400" /><div className="mt-4 text-2xl font-semibold tracking-tight text-zinc-950">{value}</div><div className="mt-1 text-[11px] font-medium text-zinc-500">{label}</div></div>)}
      </div>

      <SettingsSection
        title="Recent runs"
        description={`Latest ${summary?.sampled_runs ?? runs.length} model runs in this workspace.`}
        icon={Activity}
        actions={<div className="flex flex-wrap items-center gap-2"><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="field h-8 w-52 pl-8 text-xs" placeholder="Search runs" aria-label="Search AI runs" /></div><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="select-field h-8 w-auto text-xs" aria-label="Filter AI runs by status"><option value="all">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></div>}
      >
        {loading ? <LoadingBlock label="Loading telemetry…" /> : runs.length === 0 ? <EmptyBlock icon={Activity} title="No AI runs yet" description="Live AI decisions will appear here after agents begin handling customer conversations." /> : visibleRuns.length === 0 ? <EmptyBlock icon={Search} title="No matching runs" description="Change the search text or status filter to see more results." /> : <div className="-m-5 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="border-y border-zinc-100 bg-zinc-50 text-[10px] font-semibold uppercase tracking-wide text-zinc-400"><tr><th scope="col" className="px-4 py-2.5">Time</th><th scope="col" className="px-4 py-2.5">Provider / model</th><th scope="col" className="px-4 py-2.5">Result</th><th scope="col" className="px-4 py-2.5">Intent</th><th scope="col" className="px-4 py-2.5">Confidence</th><th scope="col" className="px-4 py-2.5">Latency</th><th scope="col" className="px-4 py-2.5">Tokens</th></tr></thead><tbody className="divide-y divide-zinc-100">{visibleRuns.map((run) => <tr key={run.id} className="align-top hover:bg-zinc-50/70"><td className="whitespace-nowrap px-4 py-3 text-zinc-500">{new Date(run.created_at).toLocaleString()}</td><td className="px-4 py-3"><div className="font-semibold text-zinc-800">{run.provider || 'Legacy provider'}</div><div className="mt-0.5 font-mono text-[10px] text-zinc-400">{run.model || '—'}</div></td><td className="px-4 py-3"><StatusBadge tone={statusTone(run.status)}>{run.status}</StatusBadge>{run.error_message && <div className="mt-1 max-w-[260px] text-[10px] leading-4 text-red-600">{run.error_message}</div>}</td><td className="px-4 py-3 text-zinc-600">{run.intent || run.action || '—'}</td><td className="px-4 py-3 text-zinc-600">{run.confidence == null ? '—' : `${(Number(run.confidence) * 100).toFixed(0)}%`}</td><td className="px-4 py-3 text-zinc-600">{run.latency_ms == null ? '—' : `${run.latency_ms} ms`}</td><td className="px-4 py-3 text-zinc-600">{run.total_tokens == null ? '—' : run.total_tokens.toLocaleString()}</td></tr>)}</tbody></table></div>}
      </SettingsSection>

      <p className="text-[11px] leading-5 text-zinc-500">Token counts are recorded when providers return usage data. Estimated cost remains zero until pricing metadata is configured.</p>
    </div>
  );
}
