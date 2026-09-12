'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
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

type MetricTone = 'blue' | 'cyan' | 'amber' | 'emerald' | 'violet' | 'rose';

const EMPTY_SUMMARY: DashboardSummary = {
  overdue_followups: 0,
  sla_breaches: 0,
  unassigned_leads: 0,
  stale_leads: 0,
  payments_due: 0,
  passport_risks: 0,
  intervention_queue: [],
};

const METRIC_TONE: Record<MetricTone, { card: string; icon: string; value: string; dot: string; link: string }> = {
  blue: {
    card: 'border-blue-100 bg-gradient-to-br from-white via-white to-blue-50/80',
    icon: 'bg-blue-100 text-blue-700',
    value: 'text-blue-700',
    dot: 'bg-blue-500',
    link: 'group-hover:text-blue-700',
  },
  cyan: {
    card: 'border-cyan-100 bg-gradient-to-br from-white via-white to-cyan-50/80',
    icon: 'bg-cyan-100 text-cyan-700',
    value: 'text-cyan-700',
    dot: 'bg-cyan-500',
    link: 'group-hover:text-cyan-700',
  },
  amber: {
    card: 'border-amber-100 bg-gradient-to-br from-white via-white to-amber-50/90',
    icon: 'bg-amber-100 text-amber-700',
    value: 'text-amber-700',
    dot: 'bg-amber-500',
    link: 'group-hover:text-amber-700',
  },
  emerald: {
    card: 'border-emerald-100 bg-gradient-to-br from-white via-white to-emerald-50/80',
    icon: 'bg-emerald-100 text-emerald-700',
    value: 'text-emerald-700',
    dot: 'bg-emerald-500',
    link: 'group-hover:text-emerald-700',
  },
  violet: {
    card: 'border-violet-100 bg-gradient-to-br from-white via-white to-violet-50/80',
    icon: 'bg-violet-100 text-violet-700',
    value: 'text-violet-700',
    dot: 'bg-violet-500',
    link: 'group-hover:text-violet-700',
  },
  rose: {
    card: 'border-rose-100 bg-gradient-to-br from-white via-white to-rose-50/80',
    icon: 'bg-rose-100 text-rose-700',
    value: 'text-rose-700',
    dot: 'bg-rose-500',
    link: 'group-hover:text-rose-700',
  },
};

function cleanQueueTitle(title: string) {
  return title
    .replace(' missed first-response SLA', ' needs a reply')
    .replace(' is unassigned', ' needs an owner')
    .replace(' has had no contact for 48+ hours', ' needs a follow-up');
}

function managerLeadHref(href: string) {
  return /^\/leads\/[^/?#]+$/.test(href) ? `${href}/workspace` : href;
}

function PriorityMetric({ title, value, hint, href, icon: Icon, tone }: {
  title: string;
  value: number;
  hint: string;
  href: string;
  icon: typeof AlertTriangle;
  tone: MetricTone;
}) {
  const styles = METRIC_TONE[tone];
  return (
    <Link href={href} className={`group block rounded-xl border p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${styles.card}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${styles.dot}`} />
            <p className="text-xs font-semibold text-zinc-800">{title}</p>
          </div>
          <p className="mt-2 text-xs leading-5 text-zinc-500">{hint}</p>
        </div>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${styles.icon}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <span className={`font-mono text-3xl font-semibold tracking-tight ${styles.value}`}>{value}</span>
        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-400 transition ${styles.link}`}>Open <ArrowRight className="h-3 w-3" /></span>
      </div>
    </Link>
  );
}

function SecondaryMetric({ title, value, hint, href, icon: Icon, tone }: {
  title: string;
  value: number;
  hint: string;
  href: string;
  icon: typeof AlertTriangle;
  tone: MetricTone;
}) {
  const styles = METRIC_TONE[tone];
  return (
    <Link href={href} className="group flex items-center justify-between gap-4 border-b border-line px-4 py-3 last:border-b-0 hover:bg-blue-50/40">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${styles.icon}`}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-zinc-800">{title}</p>
          <p className="mt-0.5 truncate text-[11px] text-zinc-500">{hint}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`font-mono text-lg font-semibold ${styles.value}`}>{value}</span>
        <ArrowRight className={`h-3.5 w-3.5 text-zinc-300 transition ${styles.link}`} />
      </div>
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
    const initial = window.setTimeout(() => void loadSummary(), 0);
    const handleMutation = () => void loadSummary();
    window.addEventListener('crm:data-mutated', handleMutation);
    return () => {
      window.clearTimeout(initial);
      window.removeEventListener('crm:data-mutated', handleMutation);
    };
  }, [loadSummary]);

  const urgentTotal = summary.sla_breaches + summary.overdue_followups + (isAgent ? 0 : summary.unassigned_leads);

  return (
    <div className="app-page">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Today</p>
          <h1 className="page-title">{isAgent ? `Hi ${currentUser.full_name.split(' ')[0]}, here’s what needs attention` : 'What needs attention today'}</h1>
          <p className="page-description">{isAgent ? 'Start with replies and follow-ups. Everything else can wait.' : 'The most important team work, ordered by urgency.'}</p>
        </div>
        <div className="page-actions">
          <Link href={isAgent ? '/my-work' : '/leads'} className="button-primary">{isAgent ? 'Open my work' : 'Open leads'}</Link>
          <button type="button" onClick={() => void loadSummary()} disabled={loading} className="button-secondary px-3" aria-label="Refresh Today">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {error && (
        <div role="alert" className="surface-flat flex items-start justify-between gap-4 border-rose-200 bg-rose-50/70 p-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-rose-700"><AlertTriangle className="h-4 w-4" /> Today could not be refreshed</div>
            <p className="mt-1 text-xs text-rose-600/80">{error}</p>
          </div>
          <button type="button" onClick={() => void loadSummary()} className="button-secondary button-sm">Try again</button>
        </div>
      )}

      <section>
        <div className="mb-3">
          <h2 className="section-heading">Start here</h2>
          <p className="section-description">{urgentTotal} item{urgentTotal === 1 ? '' : 's'} need attention.</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <PriorityMetric title="Replies needed" value={summary.sla_breaches} hint="Travelers still waiting for first contact." href={isAgent ? '/my-work' : '/leads?tab=sla_pending'} icon={ShieldAlert} tone={summary.sla_breaches > 0 ? 'rose' : 'blue'} />
          <PriorityMetric title="Follow-ups due" value={summary.overdue_followups} hint="People the team needs to contact again." href={isAgent ? '/my-follow-ups' : '/follow-ups'} icon={CalendarClock} tone={summary.overdue_followups > 0 ? 'amber' : 'violet'} />
          {isAgent ? (
            <PriorityMetric title="My active leads" value={currentUser.current_load} hint="Travelers currently assigned to you." href="/my-work" icon={ListChecks} tone="cyan" />
          ) : (
            <PriorityMetric title="Without an owner" value={summary.unassigned_leads} hint="New leads waiting for assignment." href="/leads" icon={Inbox} tone={summary.unassigned_leads > 0 ? 'cyan' : 'emerald'} />
          )}
        </div>
      </section>

      <div className={`grid gap-4 ${isManagement ? 'xl:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.75fr)]' : ''}`}>
        <section className="surface-flat overflow-hidden border-blue-100 bg-white/95 shadow-sm">
          <div className="panel-header bg-gradient-to-r from-blue-50/70 via-white to-violet-50/50">
            <div>
              <h2 className="section-heading">Do next</h2>
              <p className="section-description">The most urgent work is first.</p>
            </div>
            <Link href={isAgent ? '/my-work' : '/leads'} className="button-ghost button-sm text-blue-700 hover:bg-blue-100/60">See all</Link>
          </div>

          {loading && summary.intervention_queue.length === 0 ? (
            <div className="empty-state" role="status"><Loader2 className="h-5 w-5 animate-spin text-blue-500" /><p className="empty-state-description mt-3">Loading today’s work…</p></div>
          ) : summary.intervention_queue.length === 0 ? (
            <div className="empty-state"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-5 w-5" /></span><p className="empty-state-title mt-3">You’re caught up</p><p className="empty-state-description">There’s nothing urgent right now.</p></div>
          ) : (
            <div className="divide-y divide-line">
              {summary.intervention_queue.map((item, index) => (
                <Link
                  key={item.key}
                  href={isAgent ? '/my-work' : managerLeadHref(item.href)}
                  className="group flex items-center gap-3 px-4 py-3 transition hover:bg-blue-50/45"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 font-mono text-[10px] font-bold text-blue-600">{String(index + 1).padStart(2, '0')}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-zinc-800">{cleanQueueTitle(item.title)}</p>
                    <p className="mt-0.5 truncate text-[11px] text-zinc-500">{item.detail}</p>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-blue-300 transition group-hover:text-blue-600" />
                </Link>
              ))}
            </div>
          )}
        </section>

        {isManagement && (
          <section className="surface-flat overflow-hidden border-violet-100 bg-white/95 shadow-sm">
            <div className="panel-header bg-gradient-to-r from-violet-50/60 to-white"><div><h2 className="section-heading">Also check</h2><p className="section-description">Important, but not first in line.</p></div></div>
            <SecondaryMetric title="No contact for 2+ days" value={summary.stale_leads} hint="Leads that may be going cold" href="/leads" icon={UserRoundSearch} tone="violet" />
            <SecondaryMetric title="Payments due" value={summary.payments_due} hint="Payments due now or earlier" href="/leads" icon={CircleDollarSign} tone="emerald" />
            <SecondaryMetric title="Passport expiry" value={summary.passport_risks} hint="Passports expiring within 6 months" href="/leads" icon={AlertTriangle} tone="amber" />
          </section>
        )}
      </div>
    </div>
  );
}
