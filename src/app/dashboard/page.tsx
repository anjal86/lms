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

function managerLeadHref(href: string) {
  return /^\/leads\/[^/?#]+$/.test(href) ? `${href}/workspace` : href;
}

function PriorityMetric({ title, value, hint, href, icon: Icon, urgent = false }: {
  title: string;
  value: number;
  hint: string;
  href: string;
  icon: typeof AlertTriangle;
  urgent?: boolean;
}) {
  return (
    <Link href={href} className="metric group block transition-colors hover:bg-surface-hover">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`status-dot ${urgent ? 'status-dot-danger' : 'status-dot-info'}`} />
            <p className="text-xs font-semibold text-zinc-800">{title}</p>
          </div>
          <p className="mt-2 text-xs leading-5 text-zinc-500">{hint}</p>
        </div>
        <Icon className="h-4 w-4 shrink-0 text-zinc-400" />
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <span className="font-mono text-2xl font-semibold tracking-tight text-zinc-950">{value}</span>
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-400 group-hover:text-zinc-700">Open <ArrowRight className="h-3 w-3" /></span>
      </div>
    </Link>
  );
}

function SecondaryMetric({ title, value, hint, href, icon: Icon }: {
  title: string;
  value: number;
  hint: string;
  href: string;
  icon: typeof AlertTriangle;
}) {
  return (
    <Link href={href} className="group flex items-center justify-between gap-4 border-b border-line px-4 py-3 last:border-b-0 hover:bg-surface-hover">
      <div className="flex min-w-0 items-center gap-3">
        <Icon className="h-4 w-4 shrink-0 text-zinc-400" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-zinc-800">{title}</p>
          <p className="mt-0.5 truncate text-[11px] text-zinc-500">{hint}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-lg font-semibold text-zinc-900">{value}</span>
        <ArrowRight className="h-3.5 w-3.5 text-zinc-300 group-hover:text-zinc-600" />
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
        <div role="alert" className="surface-flat flex items-start justify-between gap-4 p-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-danger"><AlertTriangle className="h-4 w-4" /> Today could not be refreshed</div>
            <p className="mt-1 text-xs text-zinc-500">{error}</p>
          </div>
          <button type="button" onClick={() => void loadSummary()} className="button-secondary button-sm">Try again</button>
        </div>
      )}

      <section>
        <div className="mb-3">
          <h2 className="section-heading">Start here</h2>
          <p className="section-description">{urgentTotal} item{urgentTotal === 1 ? '' : 's'} need attention.</p>
        </div>
        <div className="grid gap-2 lg:grid-cols-3">
          <PriorityMetric title="Replies needed" value={summary.sla_breaches} hint="Travelers still waiting for first contact." href={isAgent ? '/my-work' : '/leads?tab=sla_pending'} icon={ShieldAlert} urgent={summary.sla_breaches > 0} />
          <PriorityMetric title="Follow-ups due" value={summary.overdue_followups} hint="People the team needs to contact again." href={isAgent ? '/my-follow-ups' : '/follow-ups'} icon={CalendarClock} urgent={summary.overdue_followups > 0} />
          {isAgent ? (
            <PriorityMetric title="My active leads" value={currentUser.current_load} hint="Travelers currently assigned to you." href="/my-work" icon={ListChecks} />
          ) : (
            <PriorityMetric title="Without an owner" value={summary.unassigned_leads} hint="New leads waiting for assignment." href="/leads" icon={Inbox} urgent={summary.unassigned_leads > 0} />
          )}
        </div>
      </section>

      <div className={`grid gap-4 ${isManagement ? 'xl:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.75fr)]' : ''}`}>
        <section className="surface-flat overflow-hidden">
          <div className="panel-header">
            <div>
              <h2 className="section-heading">Do next</h2>
              <p className="section-description">The most urgent work is first.</p>
            </div>
            <Link href={isAgent ? '/my-work' : '/leads'} className="button-ghost button-sm">See all</Link>
          </div>

          {loading && summary.intervention_queue.length === 0 ? (
            <div className="empty-state" role="status"><Loader2 className="h-5 w-5 animate-spin text-zinc-400" /><p className="empty-state-description mt-3">Loading today’s work…</p></div>
          ) : summary.intervention_queue.length === 0 ? (
            <div className="empty-state"><CheckCircle2 className="h-5 w-5 text-success" /><p className="empty-state-title mt-3">You’re caught up</p><p className="empty-state-description">There’s nothing urgent right now.</p></div>
          ) : (
            <div className="divide-y divide-line">
              {summary.intervention_queue.map((item, index) => (
                <Link
                  key={item.key}
                  href={isAgent ? '/my-work' : managerLeadHref(item.href)}
                  className="group flex items-center gap-3 px-4 py-3 hover:bg-surface-hover"
                >
                  <span className="w-5 shrink-0 font-mono text-[10px] font-semibold text-zinc-400">{String(index + 1).padStart(2, '0')}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-zinc-800">{cleanQueueTitle(item.title)}</p>
                    <p className="mt-0.5 truncate text-[11px] text-zinc-500">{item.detail}</p>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-zinc-300 group-hover:text-zinc-600" />
                </Link>
              ))}
            </div>
          )}
        </section>

        {isManagement && (
          <section className="surface-flat overflow-hidden">
            <div className="panel-header"><div><h2 className="section-heading">Also check</h2><p className="section-description">Important, but not first in line.</p></div></div>
            <SecondaryMetric title="No contact for 2+ days" value={summary.stale_leads} hint="Leads that may be going cold" href="/leads" icon={UserRoundSearch} />
            <SecondaryMetric title="Payments due" value={summary.payments_due} hint="Payments due now or earlier" href="/leads" icon={CircleDollarSign} />
            <SecondaryMetric title="Passport expiry" value={summary.passport_risks} hint="Passports expiring within 6 months" href="/leads" icon={AlertTriangle} />
          </section>
        )}
      </div>
    </div>
  );
}
