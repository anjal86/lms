'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  BriefcaseBusiness,
  CalendarClock,
  CircleDollarSign,
  Inbox,
  Loader2,
  RefreshCcw,
  ShieldAlert,
  Trophy,
  UserRoundSearch,
  Zap,
} from 'lucide-react';
import { useApp } from '@/lib/store';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';
import { useWorkspacePermissions } from '@/lib/use-workspace-permissions';

type DashboardSummary = {
  overdue_followups: number;
  sla_breaches: number;
  unassigned_leads: number;
  stale_leads: number;
  payments_due: number;
  passport_risks: number;
};
type PipelineSummary = { won_count: number; won_value: number; visible_count: number; my_count: number };
type ConversationExceptions = {
  needs_reply: number;
  sla_overdue: number;
  unassigned: number;
  urgent: number;
  next_actions_due: number;
  automation_failures_24h: number;
};

const EMPTY_SUMMARY: DashboardSummary = { overdue_followups: 0, sla_breaches: 0, unassigned_leads: 0, stale_leads: 0, payments_due: 0, passport_risks: 0 };
const EMPTY_EXCEPTIONS: ConversationExceptions = { needs_reply: 0, sla_overdue: 0, unassigned: 0, urgent: 0, next_actions_due: 0, automation_failures_24h: 0 };

function Metric({ title, value, hint, href, icon: Icon, danger = false }: { title: string; value: number | string; hint: string; href: string; icon: typeof AlertTriangle; danger?: boolean }) {
  return <Link href={href} className={`group rounded-xl border p-4 transition hover:-translate-y-0.5 hover:shadow-sm ${danger ? 'border-rose-100 bg-rose-50/50' : 'border-zinc-200 bg-white'}`}>
    <div className="flex items-start justify-between gap-4">
      <div><div className="text-xs font-semibold text-zinc-800">{title}</div><div className="mt-1 text-[11px] leading-5 text-zinc-500">{hint}</div></div>
      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${danger ? 'bg-rose-100 text-rose-700' : 'bg-zinc-100 text-zinc-600'}`}><Icon className="h-4 w-4" /></span>
    </div>
    <div className={`mt-4 font-mono text-3xl font-semibold ${danger ? 'text-rose-700' : 'text-zinc-950'}`}>{value}</div>
  </Link>;
}

export default function DashboardPage() {
  const { currentUser } = useApp();
  const { config, term, moduleEnabled } = useWorkspace();
  const { can } = useWorkspacePermissions();
  const isAgent = currentUser.role === 'agent';
  const [summary, setSummary] = useState<DashboardSummary>(EMPTY_SUMMARY);
  const [pipeline, setPipeline] = useState<PipelineSummary>({ won_count: 0, won_value: 0, visible_count: 0, my_count: 0 });
  const [exceptions, setExceptions] = useState<ConversationExceptions>(EMPTY_EXCEPTIONS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const leadPlural = term('lead_plural', 'Opportunities');
  const contactPlural = term('contact_plural', 'Contacts');
  const dealPlural = term('deal_plural', 'Deals');
  const inboxEnabled = moduleEnabled('inbox', true) && can('inbox.view');
  const hasPayments = moduleEnabled('payments', false);
  const formatWorkspaceCurrency = useCallback((amount: number) => {
    try {
      return new Intl.NumberFormat(config.workspace.locale || 'en-NP', {
        style: 'currency',
        currency: config.workspace.currency || 'NPR',
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `${config.workspace.currency || 'NPR'} ${amount.toLocaleString()}`;
    }
  }, [config.workspace.currency, config.workspace.locale]);

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
      });
      setPipeline({
        won_count: Number(rawPipeline.won_count || 0),
        won_value: Number(rawPipeline.won_value || 0),
        visible_count: Number(rawPipeline.visible_count || 0),
        my_count: Number(rawPipeline.my_count || 0),
      });
      setExceptions({ ...EMPTY_EXCEPTIONS, ...(exceptionPayload.exceptions || {}) });
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

  const dueActions = summary.overdue_followups + (inboxEnabled ? exceptions.next_actions_due : 0);
  const primaryAttention = (inboxEnabled ? exceptions.needs_reply + exceptions.sla_overdue : summary.sla_breaches) + dueActions;

  return <div className="app-page">
    <header className="page-header">
      <div>
        <p className="page-eyebrow">Today · {config.workspace.name}</p>
        <h1 className="page-title">{isAgent ? `Hi ${currentUser.full_name.split(' ')[0]}, here’s what needs attention` : 'What needs attention today'}</h1>
        <p className="page-description">A short command center. Reply in Inbox, execute scheduled actions in Due Work, and progress commercial work in Opportunities.</p>
      </div>
      <div className="page-actions">
        <button type="button" onClick={() => void loadSummary()} disabled={loading} className="button-secondary px-3" aria-label="Refresh Today">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}</button>
      </div>
    </header>

    {error && <div role="alert" className="surface-flat border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-700">{error}</div>}

    <section>
      <div className="mb-3"><h2 className="section-heading">Start here</h2><p className="section-description">{primaryAttention} item{primaryAttention === 1 ? '' : 's'} require near-term attention.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {inboxEnabled ? <Metric title="Needs reply" value={exceptions.needs_reply} hint={`${contactPlural} waiting on your team.`} href="/inbox?view=needs_reply" icon={Inbox} danger={exceptions.needs_reply > 0} /> : <Metric title="Replies needed" value={summary.sla_breaches} hint={`${contactPlural} still waiting for first contact.`} href={isAgent ? '/my-work' : '/leads'} icon={ShieldAlert} danger={summary.sla_breaches > 0} />}
        <Metric title="Due actions" value={dueActions} hint="Scheduled follow-ups and conversation actions." href={isAgent ? '/work?owner=me' : '/work'} icon={CalendarClock} danger={dueActions > 0} />
        <Metric title={isAgent ? `My ${leadPlural}` : `Active ${leadPlural}`} value={isAgent ? pipeline.my_count : pipeline.visible_count} hint="Commercial work currently in progress." href={isAgent ? '/my-work' : '/leads'} icon={BriefcaseBusiness} />
        {inboxEnabled
          ? <Metric title={isAgent ? 'Urgent conversations' : 'Unassigned conversations'} value={isAgent ? exceptions.urgent : exceptions.unassigned} hint={isAgent ? 'Highest-priority customer conversations.' : 'Open conversations without an owner.'} href={isAgent ? '/inbox?view=high_priority' : '/inbox?view=unassigned'} icon={isAgent ? AlertTriangle : UserRoundSearch} danger={(isAgent ? exceptions.urgent : exceptions.unassigned) > 0} />
          : <Metric title={isAgent ? 'My active work' : 'Unassigned opportunities'} value={isAgent ? pipeline.my_count : summary.unassigned_leads} hint="Ownership that needs attention." href={isAgent ? '/my-work' : '/leads'} icon={UserRoundSearch} />}
      </div>
    </section>

    {!isAgent && <section className="surface-flat overflow-hidden">
      <div className="panel-header"><div><h2 className="section-heading">Manager exceptions</h2><p className="section-description">Only conditions that may require intervention.</p></div><Link href="/reports" className="button-ghost button-sm">Reports</Link></div>
      <div className="grid divide-y divide-zinc-100 md:grid-cols-2 md:divide-x md:divide-y-0">
        <Link href="/leads" className="flex items-center justify-between p-4 hover:bg-zinc-50"><div className="flex items-center gap-3"><UserRoundSearch className="h-4 w-4 text-violet-600" /><div><div className="text-xs font-semibold text-zinc-800">Stale opportunities</div><div className="text-[11px] text-zinc-500">No contact for 2+ days</div></div></div><span className="font-mono text-lg font-semibold">{summary.stale_leads}</span></Link>
        {can('automations.view') ? <Link href="/settings/automations" className="flex items-center justify-between p-4 hover:bg-zinc-50"><div className="flex items-center gap-3"><Zap className="h-4 w-4 text-amber-600" /><div><div className="text-xs font-semibold text-zinc-800">Automation failures</div><div className="text-[11px] text-zinc-500">Failed runs in the last 24 hours</div></div></div><span className="font-mono text-lg font-semibold">{exceptions.automation_failures_24h}</span></Link> : <div className="flex items-center justify-between p-4"><div className="flex items-center gap-3"><Trophy className="h-4 w-4 text-emerald-600" /><div><div className="text-xs font-semibold text-zinc-800">Won {dealPlural.toLowerCase()}</div><div className="text-[11px] text-zinc-500">Completed outcomes</div></div></div><span className="font-mono text-lg font-semibold">{pipeline.won_count}</span></div>}
      </div>
      <div className="grid border-t border-zinc-100 md:grid-cols-2 md:divide-x md:divide-zinc-100">
        <div className="flex items-center justify-between p-4"><div className="flex items-center gap-3"><Trophy className="h-4 w-4 text-emerald-600" /><div><div className="text-xs font-semibold text-zinc-800">Won {dealPlural.toLowerCase()}</div><div className="text-[11px] text-zinc-500">Current reporting period</div></div></div><span className="font-mono text-lg font-semibold">{pipeline.won_count}</span></div>
        {hasPayments ? <Link href="/leads" className="flex items-center justify-between p-4 hover:bg-zinc-50"><div className="flex items-center gap-3"><CircleDollarSign className="h-4 w-4 text-emerald-600" /><div><div className="text-xs font-semibold text-zinc-800">Payments due</div><div className="text-[11px] text-zinc-500">Outstanding milestones</div></div></div><span className="font-mono text-lg font-semibold">{summary.payments_due}</span></Link> : <div className="flex items-center justify-between p-4"><div><div className="text-xs font-semibold text-zinc-800">Won value</div><div className="text-[11px] text-zinc-500">Current reporting period</div></div><span className="font-mono text-sm font-semibold">{formatWorkspaceCurrency(pipeline.won_value)}</span></div>}
      </div>
    </section>}
  </div>;
}
