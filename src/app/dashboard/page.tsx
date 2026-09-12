'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CircleDollarSign,
  Inbox,
  ListChecks,
  Loader2,
  RefreshCcw,
  ShieldAlert,
  UserRoundSearch,
} from 'lucide-react';
import { useApp } from '@/lib/store';

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

function cleanQueueTitle(title: string) {
  return title
    .replace(' missed first-response SLA', ' needs a reply')
    .replace(' is unassigned', ' needs an owner')
    .replace(' has had no contact for 48+ hours', ' needs a follow-up');
}

function PriorityMetric({ title, value, hint, href, icon: Icon, tone }: {
  title: string;
  value: number;
  hint: string;
  href: string;
  icon: typeof AlertTriangle;
  tone: 'red' | 'amber' | 'blue';
}) {
  const toneClasses = {
    red: 'bg-red-50 text-red-700 border-red-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
  }[tone];

  return (
    <Link href={href} className="group panel flex min-h-36 flex-col justify-between p-5 transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-zinc-900">{title}</p>
          <p className="mt-1 text-sm leading-5 text-zinc-500">{hint}</p>
        </div>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl border ${toneClasses}`}><Icon className="h-4 w-4" /></span>
      </div>
      <div className="mt-5 flex items-end justify-between gap-3">
        <span className="text-4xl font-semibold tracking-[-0.04em] text-zinc-950">{value}</span>
        <span className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-zinc-400 transition group-hover:text-zinc-800">Open <ArrowRight className="h-3.5 w-3.5" /></span>
      </div>
    </Link>
  );
}

function SecondaryMetric({ title, value, hint, href, icon: Icon }: { title: string; value: number; hint: string; href: string; icon: typeof AlertTriangle }) {
  return (
    <Link href={href} className="group flex items-center justify-between gap-4 border-b border-zinc-100 px-5 py-4 last:border-b-0 hover:bg-zinc-50/70">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600"><Icon className="h-4 w-4" /></span>
        <div className="min-w-0"><p className="text-sm font-semibold text-zinc-900">{title}</p><p className="mt-0.5 truncate text-xs text-zinc-500">{hint}</p></div>
      </div>
      <div className="flex items-center gap-3"><span className="text-2xl font-semibold tracking-tight text-zinc-950">{value}</span><ArrowRight className="h-3.5 w-3.5 text-zinc-300 transition group-hover:text-zinc-700" /></div>
    </Link>
  );
}

export default function DashboardPage() {
  const { currentUser } = useApp();
  const isAgent = currentUser.role === 'agent';
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
      if (!response.ok) throw new Error(payload.error || 'Could not load today’s work.');
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
      setError(loadError instanceof Error ? loadError.message : 'Could not load today’s work.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = 'Today — Wanderlust';
    void loadSummary();
    const handleMutation = () => void loadSummary();
    window.addEventListener('crm:data-mutated', handleMutation);
    return () => window.removeEventListener('crm:data-mutated', handleMutation);
  }, [loadSummary]);

  const urgentTotal = summary.sla_breaches + summary.overdue_followups + (isAgent ? 0 : summary.unassigned_leads);

  return (
    <div className="workspace-page">
      <div className="workspace-header">
        <div>
          <p className="workspace-eyebrow">Today</p>
          <h1 className="workspace-title">{isAgent ? `Hi ${currentUser.full_name.split(' ')[0]}, here’s what needs attention` : 'What needs attention today'}</h1>
          <p className="workspace-description">{isAgent ? 'Start with replies and follow-ups. Everything else can wait.' : 'The most important items for the team, in one place.'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={isAgent ? '/my-work' : '/leads'} className="button-primary">{isAgent ? 'Open My Work' : 'Open all leads'}</Link>
          <button type="button" onClick={() => void loadSummary()} disabled={loading} className="button-secondary px-3" aria-label="Refresh">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}</button>
        </div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <section>
        <div className="mb-3"><h2 className="text-sm font-semibold text-zinc-950">Start here</h2><p className="mt-0.5 text-xs text-zinc-500">{urgentTotal} item{urgentTotal === 1 ? '' : 's'} need attention</p></div>
        <div className="grid gap-3 lg:grid-cols-3">
          <PriorityMetric title="Replies needed" value={summary.sla_breaches} hint="Travelers who have waited too long" href={isAgent ? '/my-work' : '/leads?tab=sla_pending'} icon={ShieldAlert} tone="red" />
          <PriorityMetric title="Follow-ups due" value={summary.overdue_followups} hint="People you need to contact again" href={isAgent ? '/my-follow-ups' : '/follow-ups'} icon={CalendarClock} tone="amber" />
          {isAgent ? (
            <PriorityMetric title="My active leads" value={currentUser.current_load} hint="All leads currently assigned to you" href="/my-work" icon={ListChecks} tone="blue" />
          ) : (
            <PriorityMetric title="Leads without an owner" value={summary.unassigned_leads} hint="New leads waiting for someone to take them" href="/leads" icon={Inbox} tone="blue" />
          )}
        </div>
      </section>

      <div className={`grid gap-4 ${isManagement ? 'xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.75fr)]' : ''}`}>
        <section className="panel overflow-hidden">
          <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-5 py-4">
            <div><h2 className="text-sm font-semibold text-zinc-950">What to do next</h2><p className="mt-1 text-xs text-zinc-500">Work from top to bottom. The most urgent items are first.</p></div>
            <Link href={isAgent ? '/my-work' : '/leads'} className="text-xs font-semibold text-blue-600 hover:text-blue-700">See all</Link>
          </div>

          {loading && summary.intervention_queue.length === 0 ? (
            <div className="px-5 py-14 text-center text-sm text-zinc-500"><Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin text-zinc-400" />Loading…</div>
          ) : summary.intervention_queue.length === 0 ? (
            <div className="px-5 py-14 text-center"><div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">✓</div><p className="mt-3 text-sm font-semibold text-zinc-900">You’re caught up</p><p className="mt-1 text-xs text-zinc-500">There’s nothing urgent right now.</p></div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {summary.intervention_queue.map((item, index) => (
                <Link key={item.key} href={isAgent ? '/my-work' : item.href} className="group flex items-center gap-4 px-5 py-4 transition hover:bg-zinc-50/70">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-semibold text-zinc-500">{index + 1}</span>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-zinc-900">{cleanQueueTitle(item.title)}</p><p className="mt-0.5 truncate text-xs text-zinc-500">{item.detail}</p></div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-700" />
                </Link>
              ))}
            </div>
          )}
        </section>

        {isManagement && (
          <section className="panel overflow-hidden">
            <div className="border-b border-zinc-100 px-5 py-4"><h2 className="text-sm font-semibold text-zinc-950">Also check</h2><p className="mt-1 text-xs text-zinc-500">Important items that may need attention soon.</p></div>
            <SecondaryMetric title="No contact for 2+ days" value={summary.stale_leads} hint="Leads that may be going cold" href="/leads" icon={UserRoundSearch} />
            <SecondaryMetric title="Payments due" value={summary.payments_due} hint="Payments due now or earlier" href="/leads" icon={CircleDollarSign} />
            <SecondaryMetric title="Passport expiry" value={summary.passport_risks} hint="Passports expiring within 6 months" href="/leads" icon={AlertTriangle} />
          </section>
        )}
      </div>
    </div>
  );
}
