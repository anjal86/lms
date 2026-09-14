'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, CheckCircle2, Clock3, Loader2, RefreshCw, SkipForward, XCircle, Zap } from 'lucide-react';
import { useWorkspacePermissions } from '@/lib/use-workspace-permissions';

type Run = {
  id: string;
  workflow_id: string;
  conversation_id: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';
  result: Record<string, unknown> | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  workflow: { name?: string } | { name?: string }[] | null;
  conversation: { customer_name?: string; provider?: string; workflow_state?: string } | { customer_name?: string; provider?: string; workflow_state?: string }[] | null;
};

function one<T>(value: T | T[] | null): T | null { return Array.isArray(value) ? value[0] || null : value; }
function duration(run: Run) {
  if (!run.started_at || !run.completed_at) return '—';
  const ms = new Date(run.completed_at).getTime() - new Date(run.started_at).getTime();
  return ms < 1000 ? `${Math.max(0, ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

const STATUS = {
  succeeded: { icon: CheckCircle2, className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  failed: { icon: XCircle, className: 'bg-rose-50 text-rose-700 border-rose-200' },
  skipped: { icon: SkipForward, className: 'bg-zinc-50 text-zinc-600 border-zinc-200' },
  running: { icon: Loader2, className: 'bg-blue-50 text-blue-700 border-blue-200' },
  pending: { icon: Clock3, className: 'bg-amber-50 text-amber-700 border-amber-200' },
} as const;

export default function AutomationRunsPage() {
  const { can, loading: permissionLoading } = useWorkspacePermissions();
  const [runs, setRuns] = useState<Run[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ limit: '100' });
      if (status) query.set('status', status);
      const response = await fetch(`/api/automations/runs?${query.toString()}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to load automation history.');
      setRuns(payload.runs || []);
    } finally { setLoading(false); }
  }, [status]);

  useEffect(() => {
    if (permissionLoading || !can('automations.view')) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [can, load, permissionLoading]);

  const stats = useMemo(() => ({
    failed: runs.filter((run) => run.status === 'failed').length,
    succeeded: runs.filter((run) => run.status === 'succeeded').length,
    skipped: runs.filter((run) => run.status === 'skipped').length,
  }), [runs]);

  if (!permissionLoading && !can('automations.view')) return <div className="mx-auto max-w-xl px-6 py-20 text-center"><AlertCircle className="mx-auto h-7 w-7 text-zinc-400" /><h1 className="mt-3 text-lg font-semibold">Automation access required</h1></div>;

  return <div className="app-page max-w-6xl">
    <header className="page-header"><div><p className="page-eyebrow">Automations</p><h1 className="page-title">Run history</h1><p className="page-description">See what matched, what executed and where workflows failed.</p></div><div className="page-actions"><Link href="/settings/automations" className="button-secondary"><ArrowLeft className="h-4 w-4" /> Workflows</Link><button type="button" onClick={() => void load()} className="button-secondary" disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button></div></header>

    <div className="grid gap-3 sm:grid-cols-3"><div className="surface-flat p-4"><div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Succeeded</div><div className="mt-1 font-mono text-2xl font-semibold text-emerald-700">{stats.succeeded}</div></div><div className="surface-flat p-4"><div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Failed</div><div className="mt-1 font-mono text-2xl font-semibold text-rose-700">{stats.failed}</div></div><div className="surface-flat p-4"><div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Skipped</div><div className="mt-1 font-mono text-2xl font-semibold text-zinc-700">{stats.skipped}</div></div></div>

    <div className="surface-flat overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3"><div className="flex items-center gap-2 text-sm font-semibold"><Zap className="h-4 w-4" /> Execution log</div><select value={status} onChange={(e) => setStatus(e.target.value)} className="select-field h-9 text-xs"><option value="">All statuses</option><option value="succeeded">Succeeded</option><option value="failed">Failed</option><option value="skipped">Skipped</option><option value="running">Running</option><option value="pending">Pending</option></select></div>
      {loading ? <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading history…</div> : runs.length === 0 ? <div className="py-16 text-center text-sm text-zinc-500">No automation runs in this view.</div> : <div className="divide-y divide-zinc-100">{runs.map((run) => { const workflow = one(run.workflow); const conversation = one(run.conversation); const meta = STATUS[run.status]; const Icon = meta.icon; return <div key={run.id} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_120px_100px]"><div className="min-w-0"><div className="truncate text-sm font-semibold text-zinc-900">{workflow?.name || 'Workflow'}</div><div className="mt-1 truncate text-[11px] text-zinc-500">{conversation?.customer_name || 'Conversation'} · {conversation?.provider || 'channel'}</div></div><div className="min-w-0 text-xs text-zinc-600">{run.error ? <span className="font-medium text-rose-700">{run.error}</span> : run.status === 'skipped' ? 'Conditions did not match.' : run.status === 'succeeded' ? 'All configured steps completed.' : 'Execution is in progress.'}</div><div><span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-semibold capitalize ${meta.className}`}><Icon className={`h-3 w-3 ${run.status === 'running' ? 'animate-spin' : ''}`} /> {run.status}</span></div><div className="font-mono text-xs text-zinc-500">{duration(run)}</div></div>; })}</div>}
    </div>
  </div>;
}
