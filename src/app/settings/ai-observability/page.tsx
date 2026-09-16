'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, AlertTriangle, ArrowLeft, Clock3, Coins, Loader2, ShieldCheck, Waypoints } from 'lucide-react';
import { useApp } from '@/lib/store';

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

export default function AiObservabilityPage() {
  const { currentUser, showToast } = useApp();
  const canManage = currentUser.role === 'admin' || currentUser.role === 'manager';
  const [runs, setRuns] = useState<Run[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (!canManage) {
    return <div className="mx-auto max-w-xl px-6 py-20 text-center"><ShieldCheck className="mx-auto h-7 w-7 text-zinc-400" /><h1 className="mt-3 text-lg font-semibold">Manager access required</h1><p className="mt-1 text-sm text-zinc-500">AI run telemetry is limited to workspace managers.</p></div>;
  }

  const cards = [
    { label: 'Success rate', value: percent(summary?.success_rate ?? null), icon: Activity },
    { label: 'Failed runs', value: String(summary?.failed_runs ?? 0), icon: AlertTriangle },
    { label: 'Handoffs', value: String(summary?.handoff_runs ?? 0), icon: Waypoints },
    { label: 'Median LLM latency', value: summary?.median_latency_ms == null ? '—' : `${summary.median_latency_ms} ms`, icon: Clock3 },
    { label: 'Tokens sampled', value: (summary?.total_tokens ?? 0).toLocaleString(), icon: Coins },
  ];

  return <div className="app-page max-w-7xl space-y-5">
    <header className="page-header"><div><p className="page-eyebrow">Workspace intelligence</p><h1 className="page-title">AI Operations</h1><p className="page-description">Inspect model decisions, latency, failures, handoffs, token usage and retrieved knowledge for live customer conversations.</p></div><div className="page-actions"><Link href="/settings/workspace" className="button-secondary"><ArrowLeft className="h-4 w-4" /> Settings</Link><button type="button" className="button-secondary" onClick={() => void load()} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />} Refresh</button></div></header>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{cards.map(({ label, value, icon: Icon }) => <div key={label} className="surface-flat p-4"><Icon className="h-4 w-4 text-zinc-400" /><div className="mt-4 text-2xl font-semibold tracking-tight text-zinc-950">{value}</div><div className="mt-1 text-[11px] font-medium text-zinc-500">{label}</div></div>)}</div>

    <section className="surface-flat overflow-hidden">
      <div className="panel-header"><div><h2 className="section-heading">Recent runs</h2><p className="section-description">Latest {summary?.sampled_runs ?? runs.length} model runs in this workspace.</p></div></div>
      {loading ? <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading telemetry…</div> : runs.length === 0 ? <div className="py-16 text-center text-sm text-zinc-500">No AI runs recorded yet.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="border-y border-zinc-100 bg-zinc-50 text-[10px] font-semibold uppercase tracking-wide text-zinc-400"><tr><th className="px-4 py-2.5">Time</th><th className="px-4 py-2.5">Provider / model</th><th className="px-4 py-2.5">Result</th><th className="px-4 py-2.5">Intent</th><th className="px-4 py-2.5">Confidence</th><th className="px-4 py-2.5">Latency</th><th className="px-4 py-2.5">Tokens</th></tr></thead><tbody className="divide-y divide-zinc-100">{runs.map((run) => <tr key={run.id} className="align-top"><td className="px-4 py-3 text-zinc-500">{new Date(run.created_at).toLocaleString()}</td><td className="px-4 py-3"><div className="font-semibold text-zinc-800">{run.provider || 'Legacy provider'}</div><div className="mt-0.5 font-mono text-[10px] text-zinc-400">{run.model || '—'}</div></td><td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${run.status === 'failed' ? 'bg-red-50 text-red-700' : run.status === 'handoff' ? 'bg-amber-50 text-amber-700' : run.status === 'scheduled' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}`}>{run.status}</span>{run.error_message && <div className="mt-1 max-w-[260px] text-[10px] leading-4 text-red-600">{run.error_message}</div>}</td><td className="px-4 py-3 text-zinc-600">{run.intent || run.action || '—'}</td><td className="px-4 py-3 text-zinc-600">{run.confidence == null ? '—' : `${(Number(run.confidence) * 100).toFixed(0)}%`}</td><td className="px-4 py-3 text-zinc-600">{run.latency_ms == null ? '—' : `${run.latency_ms} ms`}</td><td className="px-4 py-3 text-zinc-600">{run.total_tokens == null ? '—' : run.total_tokens.toLocaleString()}</td></tr>)}</tbody></table></div>}
    </section>
    <p className="text-[11px] leading-5 text-zinc-500">Cost remains zero unless model pricing metadata is configured later. Token counts are recorded when the provider returns usage data; compatible gateways may omit them.</p>
  </div>;
}
