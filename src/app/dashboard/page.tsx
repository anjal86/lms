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
  Sparkles,
  Trophy,
  UserRoundSearch,
  Zap,
} from 'lucide-react';
import { useApp } from '@/lib/store';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';
import { useWorkspacePermissions } from '@/lib/use-workspace-permissions';

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
type ConversationExceptions = {
  needs_reply: number;
  sla_overdue: number;
  unassigned: number;
  urgent: number;
  next_actions_due: number;
  automation_failures_24h: number;
};

const EMPTY_SUMMARY: DashboardSummary = { overdue_followups: 0, sla_breaches: 0, unassigned_leads: 0, stale_leads: 0, payments_due: 0, passport_risks: 0, intervention_queue: [] };
const EMPTY_EXCEPTIONS: ConversationExceptions = { needs_reply: 0, sla_overdue: 0, unassigned: 0, urgent: 0, next_actions_due: 0, automation_failures_24h: 0 };

function managerLeadHref(href: string) {
  return /^\/leads\/[^/?#]+$/.test(href) ? `${href}/workspace` : href;
}

function Metric({ title, value, hint, href, icon: Icon, danger = false }: { title: string; value: number | string; hint: string; href: string; icon: typeof AlertTriangle; danger?: boolean }) {
  return <Link href={href} className={`group rounded-xl border p-4 transition hover:-translate-y-0.5 hover:shadow-sm ${danger ? 'border-rose-100 bg-rose-50/50' : 'border-zinc-200 bg-white'}`}><div className="flex items-start justify-between gap-4"><div><div className="text-xs font-semibold text-zinc-800">{title}</div><div className="mt-1 text-[11px] leading-5 text-zinc-500">{hint}</div></div><span className={`flex h-8 w-8 items-center justify-center rounded-lg ${danger ? 'bg-rose-100 text-rose-700' : 'bg-zinc-100 text-zinc-600'}`}><Icon className="h-4 w-4" /></span></div><div className={`mt-4 font-mono text-3xl font-semibold ${danger ? 'text-rose-700' : 'text-zinc-950'}`}>{value}</div></Link>;
}

export default function DashboardPage() {
  const { currentUser, formatCurrency } = useApp();
  const { config, term, moduleEnabled } = useWorkspace();
  const { can } = useWorkspacePermissions();
  const isAgent = currentUser.role === 'agent';
  const [summary, setSummary] = useState<DashboardSummary>(EMPTY_SUMMARY);
  const [pipeline, setPipeline] = useState<PipelineSummary>({ won_count: 0, won_value: 0, visible_count: 0 });
  const [exceptions, setExceptions] = useState<ConversationExceptions>(EMPTY_EXCEPTIONS);
  const [isManagement, setIsManagement] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const leadPlural = term('lead_plural', 'Leads');
  const contactPlural = term('contact_plural', 'Contacts');
  const dealPlural = term('deal_plural', 'Deals');
  const hasTravelOps = config.workspace.business_type === 'travel';
  const hasPayments = moduleEnabled('payments', false);
  const inboxEnabled = moduleEnabled('inbox', true) && can('inbox.view');

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryResponse, exceptionResponse] = await Promise.all([
        fetch('/api/dashboard/summary', { cache: 'no-store' }),
        fetch('/api/dashboard/conversation-exceptions', { cache: 'no-store' }),
      ]);
      const payload = await summaryResponse.json().catch(() => ({}));
      if (!summaryResponse.ok) throw new Error(payload.error || 'Could not load today’s work.');
      const exceptionPayload = exceptionResponse.ok ? await exceptionResponse.json().catch(() => ({})) : {};
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
      setPipeline({ won_count: Number(rawPipeline.won_count || 0), won_value: Number(rawPipeline.won_value || 0), visible_count: Number(rawPipeline.visible_count || 0) });
      setExceptions({ ...EMPTY_EXCEPTIONS, ...(exceptionPayload.exceptions || {}) });
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
    return () => { window.clearTimeout(initial); window.removeEventListener('crm:data-mutated', handleMutation); };
  }, [config.workspace.name, loadSummary]);

  const urgentTotal = inboxEnabled
    ? exceptions.sla_overdue + exceptions.needs_reply + exceptions.next_actions_due + (isAgent ? 0 : exceptions.unassigned)
    : summary.sla_breaches + summary.overdue_followups + (isAgent ? 0 : summary.unassigned_leads);

  return <div className="app-page">
    <header className="page-header"><div><p className="page-eyebrow">Today · {config.workspace.name}</p><h1 className="page-title">{isAgent ? `Hi ${currentUser.full_name.split(' ')[0]}, here’s what needs attention` : 'What needs attention today'}</h1><p className="page-description">Start with customer replies, due actions and ownership exceptions. Everything else comes second.</p></div><div className="page-actions"><Link href={inboxEnabled ? '/inbox' : isAgent ? '/my-work' : '/leads'} className="button-primary">{inboxEnabled ? 'Open Inbox' : isAgent ? 'Open my work' : `Open ${leadPlural.toLowerCase()}`}</Link><button type="button" onClick={() => void loadSummary()} disabled={loading} className="button-secondary px-3" aria-label="Refresh Today">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}</button></div></header>

    {error && <div role="alert" className="surface-flat border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-700">{error}</div>}

    <section><div className="mb-3"><h2 className="section-heading">Start here</h2><p className="section-description">{urgentTotal} operational item{urgentTotal === 1 ? '' : 's'} need attention.</p></div>
      {inboxEnabled ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric title="Needs reply" value={exceptions.needs_reply} hint={`${contactPlural} waiting on your team.`} href="/inbox?view=needs_reply" icon={Inbox} danger={exceptions.needs_reply > 0} />
        <Metric title="SLA overdue" value={exceptions.sla_overdue} hint="First-response target has been missed." href="/inbox?view=sla_overdue" icon={ShieldAlert} danger={exceptions.sla_overdue > 0} />
        <Metric title="Next actions due" value={exceptions.next_actions_due} hint="Scheduled conversation actions are due now." href="/inbox?view=mine" icon={CalendarClock} danger={exceptions.next_actions_due > 0} />
        {isAgent ? <Metric title="Urgent conversations" value={exceptions.urgent} hint="Highest-priority work in your accessible queue." href="/inbox?view=high_priority" icon={AlertTriangle} danger={exceptions.urgent > 0} /> : <Metric title="Unassigned" value={exceptions.unassigned} hint="Open conversations without an owner." href="/inbox?view=unassigned" icon={UserRoundSearch} danger={exceptions.unassigned > 0} />}
      </div> : <div className="grid gap-3 lg:grid-cols-3"><Metric title="Replies needed" value={summary.sla_breaches} hint={`${contactPlural} still waiting for first contact.`} href={isAgent ? '/my-work' : '/leads?tab=sla_pending'} icon={ShieldAlert} danger={summary.sla_breaches > 0} /><Metric title="Follow-ups due" value={summary.overdue_followups} hint={`${contactPlural} the team needs to contact again.`} href={isAgent ? '/my-follow-ups' : '/follow-ups'} icon={CalendarClock} danger={summary.overdue_followups > 0} /><Metric title={isAgent ? `My active ${leadPlural.toLowerCase()}` : 'Without an owner'} value={isAgent ? currentUser.current_load : summary.unassigned_leads} hint={isAgent ? 'Everything currently assigned to you.' : `${leadPlural} waiting for assignment.`} href={isAgent ? '/my-work' : '/leads'} icon={isAgent ? ListChecks : Inbox} /></div>}
    </section>

    <div className={`grid gap-4 ${isManagement ? 'xl:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.75fr)]' : ''}`}>
      <section className="surface-flat overflow-hidden"><div className="panel-header"><div><h2 className="section-heading">Do next</h2><p className="section-description">CRM exceptions that still need human follow-through.</p></div><Link href={isAgent ? '/my-work' : '/leads'} className="button-ghost button-sm">See pipeline</Link></div>{loading && summary.intervention_queue.length === 0 ? <div className="empty-state"><Loader2 className="h-5 w-5 animate-spin text-blue-500" /><p className="empty-state-description mt-3">Loading today’s work…</p></div> : summary.intervention_queue.length === 0 ? <div className="empty-state"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-5 w-5" /></span><p className="empty-state-title mt-3">Pipeline exceptions are clear</p><p className="empty-state-description">Use Inbox for current customer work.</p></div> : <div className="divide-y divide-line">{summary.intervention_queue.map((item, index) => <Link key={item.key} href={isAgent ? '/my-work' : managerLeadHref(item.href)} className="group flex items-center gap-3 px-4 py-3 hover:bg-zinc-50"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-100 font-mono text-[10px] font-bold text-zinc-600">{String(index + 1).padStart(2, '0')}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-zinc-800">{item.title.replace(' missed first-response SLA', ' needs a reply').replace(' is unassigned', ' needs an owner').replace(' has had no contact for 48+ hours', ' needs a follow-up')}</p><p className="mt-0.5 truncate text-[11px] text-zinc-500">{item.detail}</p></div><ArrowRight className="h-3.5 w-3.5 text-zinc-300 group-hover:text-zinc-700" /></Link>)}</div>}</section>

      {isManagement && <section className="surface-flat overflow-hidden"><div className="panel-header"><div><h2 className="section-heading">Manager exceptions</h2><p className="section-description">Signals that may require intervention.</p></div></div><div className="divide-y divide-zinc-100">
        {inboxEnabled && <Link href="/inbox?view=high_priority" className="flex items-center justify-between p-4 hover:bg-zinc-50"><div className="flex items-center gap-3"><AlertTriangle className="h-4 w-4 text-rose-600" /><div><div className="text-xs font-semibold text-zinc-800">Urgent conversations</div><div className="text-[11px] text-zinc-500">Priority marked urgent</div></div></div><span className="font-mono text-lg font-semibold">{exceptions.urgent}</span></Link>}
        {can('automations.view') && <Link href="/settings/automations" className="flex items-center justify-between p-4 hover:bg-zinc-50"><div className="flex items-center gap-3"><Zap className="h-4 w-4 text-amber-600" /><div><div className="text-xs font-semibold text-zinc-800">Automation failures</div><div className="text-[11px] text-zinc-500">Failed runs in the last 24 hours</div></div></div><span className="font-mono text-lg font-semibold">{exceptions.automation_failures_24h}</span></Link>}
        <Link href="/leads" className="flex items-center justify-between p-4 hover:bg-zinc-50"><div className="flex items-center gap-3"><UserRoundSearch className="h-4 w-4 text-violet-600" /><div><div className="text-xs font-semibold text-zinc-800">No contact for 2+ days</div><div className="text-[11px] text-zinc-500">{leadPlural} that may be going cold</div></div></div><span className="font-mono text-lg font-semibold">{summary.stale_leads}</span></Link>
        <Link href="/leads" className="flex items-center justify-between p-4 hover:bg-zinc-50"><div className="flex items-center gap-3"><Trophy className="h-4 w-4 text-emerald-600" /><div><div className="text-xs font-semibold text-zinc-800">Won {dealPlural.toLowerCase()}</div><div className="text-[11px] text-zinc-500">Completed outcomes</div></div></div><span className="font-mono text-lg font-semibold">{pipeline.won_count}</span></Link>
        {hasPayments && <Link href="/leads" className="flex items-center justify-between p-4 hover:bg-zinc-50"><div className="flex items-center gap-3"><CircleDollarSign className="h-4 w-4 text-emerald-600" /><div><div className="text-xs font-semibold text-zinc-800">Payments due</div><div className="text-[11px] text-zinc-500">Outstanding milestones</div></div></div><span className="font-mono text-lg font-semibold">{summary.payments_due}</span></Link>}
        {hasTravelOps && <Link href="/leads" className="flex items-center justify-between p-4 hover:bg-zinc-50"><div className="flex items-center gap-3"><Sparkles className="h-4 w-4 text-cyan-600" /><div><div className="text-xs font-semibold text-zinc-800">Passport expiry</div><div className="text-[11px] text-zinc-500">Within 6 months</div></div></div><span className="font-mono text-lg font-semibold">{summary.passport_risks}</span></Link>}
      </div>{pipeline.won_value > 0 && <div className="border-t border-zinc-100 px-4 py-3 text-xs text-zinc-500">Won value: <span className="font-mono font-semibold text-zinc-800">{formatCurrency(pipeline.won_value)}</span></div>}</section>}
    </div>
  </div>;
}
