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
  Trophy,
  UserRoundSearch,
} from 'lucide-react';
import { useApp } from '@/lib/store';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';

type QueueItem = { key: string; title: string; detail: string; href: string };
type DashboardSummary = {
  overdue_followups: number;
  sla_breaches: number;
  unassigned_leads: number;
  stale_leads: number;
  payments_due: number;
  passport_risks: number;
  intervention_queue: QueueItem[];
};
type PipelineSummary = { won_count: number; won_value: number; visible_count: number };

const EMPTY_SUMMARY: DashboardSummary = {
  overdue_followups: 0,
  sla_breaches: 0,
  unassigned_leads: 0,
  stale_leads: 0,
  payments_due: 0,
  passport_risks: 0,
  intervention_queue: [],
};

function managerLeadHref(href: string) {
  return /^\/leads\/[^/?#]+$/.test(href) ? `${href}/workspace` : href;
}

function Metric({ title, value, hint, href, icon: Icon, danger = false }: {
  title: string;
  value: number | string;
  hint: string;
  href: string;
  icon: typeof AlertTriangle;
  danger?: boolean;
}) {
  return (
    <Link href={href} className={`group rounded-xl border p-4 transition hover:-translate-y-0.5 hover:shadow-sm ${danger ? 'border-rose-100 bg-rose-50/50' : 'border-zinc-200 bg-white'}`}>
      <div className="flex items-start justify-between gap-4">
        <div><div className="text-xs font-semibold text-zinc-800">{title}</div><div className="mt-1 text-[11px] leading-5 text-zinc-500">{hint}</div></div>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${danger ? 'bg-rose-100 text-rose-700' : 'bg-zinc-100 text-zinc-600'}`}><Icon className="h-4 w-4" /></span>
      </div>
      <div className={`mt-4 font-mono text-3xl font-semibold ${danger ? 'text-rose-700' : 'text-zinc-950'}`}>{value}</div>
    </Link>
  );
}

export default function DashboardPage() {
  const { currentUser, formatCurrency } = useApp();
  const { config, term, moduleEnabled } = useWorkspace();
  const isAgent = currentUser.role === 'agent';
  const [summary, setSummary] = useState<DashboardSummary>(EMPTY_SUMMARY);
  const [pipeline, setPipeline] = useState<PipelineSummary>({ won_count: 0, won_value: 0, visible_count: 0 });
  const [isManagement, setIsManagement] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const leadPlural = term('lead_plural', 'Leads');
  const contactPlural = term('contact_plural', 'Contacts');
  const dealPlural = term('deal_plural', 'Deals');
  const hasTravelOps = config.workspace.business_type === 'travel';
  const hasPayments = moduleEnabled('payments', false);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/dashboard/summary', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Could not load today’s work.');
      const raw = payload.summary || {};
      const rawPipeline = payload.pipelineSummary || {};
      setSummary({
        overdue_followups: Number(raw.overdue_followups || 0),
        sla_breaches: Number(raw.sla_breaches || 0),
        unassigned_leads: Number(raw.unassigned_leads || 0),
        stale_leads: Number(raw.stale_leads || 0),
        payments_due: Number(raw.payments_due || 0),
        passport_risks: Number(raw.passport_risks || 0),
        intervention_queue: Array.isArray(raw.intervention_queue) ? raw.intervention_queue : [],
      });
      setPipeline({
        won_count: Number(rawPipeline.won_count || 0),
        won_value: Number(rawPipeline.won_value || 0),
        visible_count: Number(rawPipeline.visible_count || 0),
      });
      setIsManagement(Boolean(payload.isManagement));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load today’s work.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = `Today — ${config.workspace.name}`;
    const initial = window.setTimeout(() => void loadSummary(), 0);
    const handleMutation = () => void loadSummary();
    window.addEventListener('crm:data-mutated', handleMutation);
    return () => {
      window.clearTimeout(initial);
      window.removeEventListener('crm:data-mutated', handleMutation);
    };
  }, [config.workspace.name, loadSummary]);

  const urgentTotal = summary.sla_breaches + summary.overdue_followups + (isAgent ? 0 : summary.unassigned_leads);

  return (
    <div className="app-page">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Today · {config.workspace.name}</p>
          <h1 className="page-title">{isAgent ? `Hi ${currentUser.full_name.split(' ')[0]}, here’s what needs attention` : 'What needs attention today'}</h1>
          <p className="page-description">Work is prioritized around replies, follow-ups and ownership—not an industry-specific checklist.</p>
        </div>
        <div className="page-actions">
          <Link href={isAgent ? '/my-work' : '/leads'} className="button-primary">{isAgent ? 'Open my work' : `Open ${leadPlural.toLowerCase()}`}</Link>
          <button type="button" onClick={() => void loadSummary()} disabled={loading} className="button-secondary px-3" aria-label="Refresh Today">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}</button>
        </div>
      </header>

      {error && <div role="alert" className="surface-flat border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-700">{error}</div>}

      <section>
        <div className="mb-3"><h2 className="section-heading">Start here</h2><p className="section-description">{urgentTotal} item{urgentTotal === 1 ? '' : 's'} need attention.</p></div>
        <div className="grid gap-3 lg:grid-cols-3">
          <Metric title="Replies needed" value={summary.sla_breaches} hint={`${contactPlural} still waiting for first contact.`} href={isAgent ? '/my-work' : '/leads?tab=sla_pending'} icon={ShieldAlert} danger={summary.sla_breaches > 0} />
          <Metric title="Follow-ups due" value={summary.overdue_followups} hint={`${contactPlural} the team needs to contact again.`} href={isAgent ? '/my-follow-ups' : '/follow-ups'} icon={CalendarClock} danger={summary.overdue_followups > 0} />
          {isAgent
            ? <Metric title={`My active ${leadPlural.toLowerCase()}`} value={currentUser.current_load} hint="Everything currently assigned to you." href="/my-work" icon={ListChecks} />
            : <Metric title="Without an owner" value={summary.unassigned_leads} hint={`${leadPlural} waiting for assignment.`} href="/leads" icon={Inbox} danger={summary.unassigned_leads > 0} />}
        </div>
      </section>

      <div className={`grid gap-4 ${isManagement ? 'xl:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.75fr)]' : ''}`}>
        <section className="surface-flat overflow-hidden">
          <div className="panel-header"><div><h2 className="section-heading">Do next</h2><p className="section-description">The most urgent work is first.</p></div><Link href={isAgent ? '/my-work' : '/leads'} className="button-ghost button-sm">See all</Link></div>
          {loading && summary.intervention_queue.length === 0 ? (
            <div className="empty-state"><Loader2 className="h-5 w-5 animate-spin text-blue-500" /><p className="empty-state-description mt-3">Loading today’s work…</p></div>
          ) : summary.intervention_queue.length === 0 ? (
            <div className="empty-state"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-5 w-5" /></span><p className="empty-state-title mt-3">You’re caught up</p><p className="empty-state-description">There’s nothing urgent right now.</p></div>
          ) : (
            <div className="divide-y divide-line">
              {summary.intervention_queue.map((item, index) => (
                <Link key={item.key} href={isAgent ? '/my-work' : managerLeadHref(item.href)} className="group flex items-center gap-3 px-4 py-3 hover:bg-zinc-50">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-100 font-mono text-[10px] font-bold text-zinc-600">{String(index + 1).padStart(2, '0')}</span>
                  <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-zinc-800">{item.title.replace(' missed first-response SLA', ' needs a reply').replace(' is unassigned', ' needs an owner').replace(' has had no contact for 48+ hours', ' needs a follow-up')}</p><p className="mt-0.5 truncate text-[11px] text-zinc-500">{item.detail}</p></div>
                  <ArrowRight className="h-3.5 w-3.5 text-zinc-300 group-hover:text-zinc-700" />
                </Link>
              ))}
            </div>
          )}
        </section>

        {isManagement && (
          <section className="surface-flat overflow-hidden">
            <div className="panel-header"><div><h2 className="section-heading">Business pulse</h2><p className="section-description">Useful secondary signals.</p></div></div>
            <div className="divide-y divide-zinc-100">
              <Link href="/leads" className="flex items-center justify-between p-4 hover:bg-zinc-50"><div className="flex items-center gap-3"><UserRoundSearch className="h-4 w-4 text-violet-600" /><div><div className="text-xs font-semibold text-zinc-800">No contact for 2+ days</div><div className="text-[11px] text-zinc-500">{leadPlural} that may be going cold</div></div></div><span className="font-mono text-lg font-semibold">{summary.stale_leads}</span></Link>
              <Link href="/leads" className="flex items-center justify-between p-4 hover:bg-zinc-50"><div className="flex items-center gap-3"><Trophy className="h-4 w-4 text-emerald-600" /><div><div className="text-xs font-semibold text-zinc-800">Won {dealPlural.toLowerCase()}</div><div className="text-[11px] text-zinc-500">Completed outcomes in the current pipeline</div></div></div><span className="font-mono text-lg font-semibold">{pipeline.won_count}</span></Link>
              {hasPayments && <Link href="/leads" className="flex items-center justify-between p-4 hover:bg-zinc-50"><div className="flex items-center gap-3"><CircleDollarSign className="h-4 w-4 text-emerald-600" /><div><div className="text-xs font-semibold text-zinc-800">Payments due</div><div className="text-[11px] text-zinc-500">Outstanding payment milestones</div></div></div><span className="font-mono text-lg font-semibold">{summary.payments_due}</span></Link>}
              {hasTravelOps && <Link href="/leads" className="flex items-center justify-between p-4 hover:bg-zinc-50"><div className="flex items-center gap-3"><AlertTriangle className="h-4 w-4 text-amber-600" /><div><div className="text-xs font-semibold text-zinc-800">Passport expiry</div><div className="text-[11px] text-zinc-500">Passports expiring within 6 months</div></div></div><span className="font-mono text-lg font-semibold">{summary.passport_risks}</span></Link>}
            </div>
            {pipeline.won_value > 0 && <div className="border-t border-zinc-100 px-4 py-3 text-xs text-zinc-500">Won value: <span className="font-mono font-semibold text-zinc-800">{formatCurrency(pipeline.won_value)}</span></div>}
          </section>
        )}
      </div>
    </div>
  );
}
