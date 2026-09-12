'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CircleDollarSign,
  Inbox,
  Loader2,
  RefreshCcw,
  ShieldAlert,
  UserRoundSearch,
} from 'lucide-react';

type QueueItem = {
  key: string;
  title: string;
  detail: string;
  href: string;
};

type DashboardSummary = {
  overdue_followups: number;
  sla_breaches: number;
  unassigned_leads: number;
  stale_leads: number;
  payments_due: number;
  passport_risks: number;
  intervention_queue: QueueItem[];
};

const EMPTY_SUMMARY: DashboardSummary = {
  overdue_followups: 0,
  sla_breaches: 0,
  unassigned_leads: 0,
  stale_leads: 0,
  payments_due: 0,
  passport_risks: 0,
  intervention_queue: [],
};

function MetricCard({
  title,
  value,
  hint,
  href,
  icon: Icon,
}: {
  title: string;
  value: number;
  hint: string;
  href: string;
  icon: typeof AlertTriangle;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-zinc-200 bg-white p-4 transition hover:border-zinc-300 hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{title}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">{value}</p>
          <p className="mt-1 text-xs text-zinc-500">{hint}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-zinc-600">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-1 text-[11px] font-medium text-zinc-500 group-hover:text-zinc-900">
        Review <ArrowRight className="h-3 w-3" />
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary>(EMPTY_SUMMARY);
  const [isManagement, setIsManagement] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/dashboard/summary', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to load Action Center.');
      const raw = payload.summary || {};
      setSummary({
        overdue_followups: Number(raw.overdue_followups || 0),
        sla_breaches: Number(raw.sla_breaches || 0),
        unassigned_leads: Number(raw.unassigned_leads || 0),
        stale_leads: Number(raw.stale_leads || 0),
        payments_due: Number(raw.payments_due || 0),
        passport_risks: Number(raw.passport_risks || 0),
        intervention_queue: Array.isArray(raw.intervention_queue) ? raw.intervention_queue : [],
      });
      setIsManagement(Boolean(payload.isManagement));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load Action Center.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = 'Action Center — Wanderlust CRM';
    void loadSummary();
    const handleMutation = () => void loadSummary();
    window.addEventListener('crm:data-mutated', handleMutation);
    return () => window.removeEventListener('crm:data-mutated', handleMutation);
  }, [loadSummary]);

  return (
    <main className="min-h-full bg-zinc-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Action Center</p>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">What needs attention now</h1>
            <p className="mt-1 text-xs text-zinc-500">
              {isManagement ? 'Agency-wide operational exceptions' : 'Your assigned work and shared unassigned leads'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadSummary()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 self-start rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 sm:self-auto"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
            Refresh
          </button>
        </div>

        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</div>}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <MetricCard title="Overdue follow-ups" value={summary.overdue_followups} hint="Callbacks requiring action" href="/follow-ups" icon={CalendarClock} />
          <MetricCard title="SLA breaches" value={summary.sla_breaches} hint="First responses already late" href="/leads" icon={ShieldAlert} />
          <MetricCard title="Unassigned leads" value={summary.unassigned_leads} hint="Waiting for an owner" href="/leads" icon={Inbox} />
          <MetricCard title="Stale leads" value={summary.stale_leads} hint="No contact for 48+ hours" href="/leads" icon={UserRoundSearch} />
          <MetricCard title="Payments due" value={summary.payments_due} hint="Pending milestones at or past due" href="/leads" icon={CircleDollarSign} />
          <MetricCard title="Passport risks" value={summary.passport_risks} hint="Expiry inside the next 6 months" href="/leads" icon={AlertTriangle} />
        </section>

        <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-950">Intervention queue</h2>
              <p className="text-[11px] text-zinc-500">SLA breaches first, then unassigned and stale opportunities.</p>
            </div>
            <Link href="/leads" className="text-[11px] font-medium text-zinc-500 hover:text-zinc-900">
              Open pipeline →
            </Link>
          </div>

          {loading && summary.intervention_queue.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-zinc-500"><Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" />Loading operational exceptions…</div>
          ) : summary.intervention_queue.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-zinc-500">No urgent intervention items right now.</div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {summary.intervention_queue.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  className="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-zinc-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-zinc-900">{item.title}</p>
                    <p className="mt-0.5 truncate text-[11px] text-zinc-500">{item.detail}</p>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 flex-none text-zinc-400" />
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
