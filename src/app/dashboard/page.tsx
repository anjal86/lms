'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowUpRight,
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
type DashboardSnapshot = {
  summary: DashboardSummary;
  pipeline: PipelineSummary;
  exceptions: ConversationExceptions;
  fetchedAt: number;
};

const EMPTY_SUMMARY: DashboardSummary = { overdue_followups: 0, sla_breaches: 0, unassigned_leads: 0, stale_leads: 0, payments_due: 0, passport_risks: 0 };
const EMPTY_PIPELINE: PipelineSummary = { won_count: 0, won_value: 0, visible_count: 0, my_count: 0 };
const EMPTY_EXCEPTIONS: ConversationExceptions = { totalOpen: 0, needs_reply: 0, sla_overdue: 0, unassigned: 0, urgent: 0, next_actions_due: 0, automation_failures_24h: 0 } as ConversationExceptions;
const DASHBOARD_RUNTIME_CACHE = new Map<string, DashboardSnapshot>();

function SummaryStat({ label, value, hint, href }: { label: string; value: number | string; hint: string; href?: string }) {
  const body = (
    <div className="min-w-0 px-4 py-3.5 sm:px-5">
      <div className="text-[12px] font-medium text-zinc-500">{label}</div>
      <div className="mt-1 text-[22px] font-semibold tracking-[-0.04em] text-zinc-950 tabular-nums">{value}</div>
      <div className="mt-0.5 truncate text-[11px] text-zinc-400">{hint}</div>
    </div>
  );
  return href ? <Link href={href} className="block transition hover:bg-zinc-50">{body}</Link> : body;
}

export default function DashboardPage() {
  const { currentUser } = useApp();
  const { config, term, moduleEnabled } = useWorkspace();
  const { can } = useWorkspacePermissions();
  const isAgent = currentUser.role === 'agent';
  const runtimeCacheKey = `${currentUser.id}::${config.workspace.id}`;
  const initialSnapshot = DASHBOARD_RUNTIME_CACHE.get(runtimeCacheKey);
  const [summary, setSummary] = useState<DashboardSummary>(() => initialSnapshot?.summary || EMPTY_SUMMARY);
  const [pipeline, setPipeline] = useState<PipelineSummary>(() => initialSnapshot?.pipeline || EMPTY_PIPELINE);
  const [exceptions, setExceptions] = useState<ConversationExceptions>(() => initialSnapshot?.exceptions || EMPTY_EXCEPTIONS);
  const [loading, setLoading] = useState(() => !initialSnapshot);
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

  const loadSummary = useCallback(async (options?: { force?: boolean; quiet?: boolean }) => {
    const quiet = options?.quiet === true;
    const force = options?.force === true;
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const suffix = force ? '?refresh=1' : '';
      const [summaryResponse, exceptionResponse] = await Promise.all([
        fetch(`/api/dashboard/summary${suffix}`, { cache: 'no-store' }),
        fetch(`/api/dashboard/conversation-exceptions${suffix}`, { cache: 'no-store' }),
      ]);
      const payload = await summaryResponse.json().catch(() => ({}));
      if (!summaryResponse.ok) throw new Error(payload.error || 'Could not load today’s work.');
      const exceptionPayload = exceptionResponse.ok ? await exceptionResponse.json().catch(() => ({})) : {};
      const raw = payload.summary || {};
      const rawPipeline = payload.pipelineSummary || {};
      const nextSummary: DashboardSummary = {
        overdue_followups: Number(raw.overdue_followups || 0),
        sla_breaches: Number(raw.sla_breaches || 0),
        unassigned_leads: Number(raw.unassigned_leads || 0),
        stale_leads: Number(raw.stale_leads || 0),
        payments_due: Number(raw.payments_due || 0),
        passport_risks: Number(raw.passport_risks || 0),
      };
      const nextPipeline: PipelineSummary = {
        won_count: Number(rawPipeline.won_count || 0),
        won_value: Number(rawPipeline.won_value || 0),
        visible_count: Number(rawPipeline.visible_count || 0),
        my_count: Number(rawPipeline.my_count || 0),
      };
      const nextExceptions: ConversationExceptions = { ...EMPTY_EXCEPTIONS, ...(exceptionPayload.exceptions || {}) };
      setSummary(nextSummary);
      setPipeline(nextPipeline);
      setExceptions(nextExceptions);
      DASHBOARD_RUNTIME_CACHE.set(runtimeCacheKey, {
        summary: nextSummary,
        pipeline: nextPipeline,
        exceptions: nextExceptions,
        fetchedAt: Date.now(),
      });
    } catch (loadError) {
      if (!quiet || !DASHBOARD_RUNTIME_CACHE.has(runtimeCacheKey)) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load today’s work.');
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [runtimeCacheKey]);

  useEffect(() => {
    document.title = `Today — ${config.workspace.name}`;
    const hasSnapshot = DASHBOARD_RUNTIME_CACHE.has(runtimeCacheKey);
    const initial = window.setTimeout(() => void loadSummary({ quiet: hasSnapshot }), 0);
    const handleMutation = () => void loadSummary({ force: true, quiet: true });
    window.addEventListener('crm:data-mutated', handleMutation);
    return () => {
      window.clearTimeout(initial);
      window.removeEventListener('crm:data-mutated', handleMutation);
    };
  }, [config.workspace.name, loadSummary, runtimeCacheKey]);

  const dueActions = summary.overdue_followups + (inboxEnabled ? exceptions.next_actions_due : 0);
  const replyCount = inboxEnabled ? exceptions.needs_reply : summary.sla_breaches;
  const replyHref = inboxEnabled ? '/inbox?view=needs_reply' : (isAgent ? '/my-work' : '/leads');
  const workHref = isAgent ? '/work?owner=me' : '/work';

  return <div className="app-page">
    <header className="page-header">
      <div>
        <p className="page-eyebrow">{config.workspace.name}</p>
        <h1 className="page-title">{isAgent ? `Good to see you, ${currentUser.full_name.split(' ')[0]}` : 'Today'}</h1>
        <p className="page-description">Start with customer replies and due work. Everything else can wait.</p>
      </div>
      <div className="page-actions">
        <button type="button" onClick={() => void loadSummary({ force: true })} disabled={loading} className="button-secondary button-sm" aria-label="Refresh Today">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />} Refresh
        </button>
      </div>
    </header>

    {error && <div role="alert" className="surface-flat border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-700">{error}</div>}

    <section className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
      <Link href={replyHref} className={`group relative overflow-hidden rounded-xl border p-5 transition sm:p-6 ${replyCount > 0 ? 'border-blue-200 bg-blue-50/55 hover:border-blue-300' : 'border-zinc-200 bg-white hover:bg-zinc-50'}`}>
        <div className="flex items-start justify-between gap-5">
          <div className="min-w-0">
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${replyCount > 0 ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-500'}`}>
              {inboxEnabled ? <Inbox className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
            </div>
            <h2 className="mt-5 text-[15px] font-semibold text-zinc-950">Customer replies</h2>
            <p className="mt-1 max-w-lg text-[12px] leading-5 text-zinc-500">{replyCount > 0 ? `${replyCount} ${contactPlural.toLowerCase()} are waiting for your team.` : 'Nothing is waiting for a reply right now.'}</p>
          </div>
          <div className="text-right">
            <div className={`text-5xl font-semibold tracking-[-0.06em] tabular-nums ${replyCount > 0 ? 'text-blue-700' : 'text-zinc-950'}`}>{replyCount}</div>
            {inboxEnabled && exceptions.sla_overdue > 0 && <div className="mt-2 text-[11px] font-medium text-rose-600">{exceptions.sla_overdue} SLA overdue</div>}
          </div>
        </div>
        <div className="mt-6 flex items-center gap-1.5 text-[12px] font-medium text-blue-700">Open reply queue <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></div>
      </Link>

      <Link href={workHref} className={`group rounded-xl border p-5 transition sm:p-6 ${dueActions > 0 ? 'border-amber-200 bg-amber-50/45 hover:border-amber-300' : 'border-zinc-200 bg-white hover:bg-zinc-50'}`}>
        <div className="flex items-start justify-between gap-4">
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${dueActions > 0 ? 'bg-amber-100 text-amber-700' : 'bg-zinc-100 text-zinc-500'}`}><CalendarClock className="h-4 w-4" /></div>
          <div className="text-4xl font-semibold tracking-[-0.05em] text-zinc-950 tabular-nums">{dueActions}</div>
        </div>
        <h2 className="mt-5 text-[15px] font-semibold text-zinc-950">Due work</h2>
        <p className="mt-1 text-[12px] leading-5 text-zinc-500">Scheduled follow-ups and conversation actions that are due now.</p>
        <div className="mt-5 flex items-center gap-1.5 text-[12px] font-medium text-zinc-700">Open work queue <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></div>
      </Link>
    </section>

    <section className="surface-flat overflow-hidden">
      <div className="grid divide-y divide-zinc-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
        <SummaryStat label={isAgent ? `My ${leadPlural}` : `Active ${leadPlural}`} value={isAgent ? pipeline.my_count : pipeline.visible_count} hint="Commercial work in progress" href={isAgent ? '/my-work' : '/leads'} />
        <SummaryStat label={isAgent ? 'Urgent conversations' : 'Unassigned conversations'} value={inboxEnabled ? (isAgent ? exceptions.urgent : exceptions.unassigned) : summary.unassigned_leads} hint={inboxEnabled ? 'Ownership or priority needs review' : 'Opportunities without an owner'} href={inboxEnabled ? (isAgent ? '/inbox?view=high_priority' : '/inbox?view=unassigned') : (isAgent ? '/my-work' : '/leads')} />
        <SummaryStat label={`Won ${dealPlural.toLowerCase()}`} value={pipeline.won_count} hint="Current reporting period" href="/reports" />
        <SummaryStat label="Won value" value={formatWorkspaceCurrency(pipeline.won_value)} hint="Current reporting period" href="/reports" />
      </div>
    </section>

    {!isAgent && <section className="surface-flat overflow-hidden">
      <div className="panel-header">
        <div><h2 className="section-heading">Manager exceptions</h2><p className="section-description">Conditions that may need intervention, not another dashboard to monitor.</p></div>
        <Link href="/reports" className="button-ghost button-sm">Open reports</Link>
      </div>
      <div className="divide-y divide-zinc-100">
        <Link href="/leads" className="flex items-center justify-between gap-4 px-4 py-3.5 transition hover:bg-zinc-50 sm:px-5">
          <div className="flex min-w-0 items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600"><UserRoundSearch className="h-4 w-4" /></span><div><div className="text-[13px] font-medium text-zinc-900">Stale {leadPlural.toLowerCase()}</div><div className="mt-0.5 text-[11px] text-zinc-500">No customer contact for 2+ days</div></div></div><span className="text-lg font-semibold tabular-nums text-zinc-950">{summary.stale_leads}</span>
        </Link>
        {can('automations.view') && <Link href="/settings/automations" className="flex items-center justify-between gap-4 px-4 py-3.5 transition hover:bg-zinc-50 sm:px-5"><div className="flex min-w-0 items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600"><Zap className="h-4 w-4" /></span><div><div className="text-[13px] font-medium text-zinc-900">Automation failures</div><div className="mt-0.5 text-[11px] text-zinc-500">Failed runs in the last 24 hours</div></div></div><span className="text-lg font-semibold tabular-nums text-zinc-950">{exceptions.automation_failures_24h}</span></Link>}
        {hasPayments && <Link href="/leads" className="flex items-center justify-between gap-4 px-4 py-3.5 transition hover:bg-zinc-50 sm:px-5"><div className="flex min-w-0 items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600"><CircleDollarSign className="h-4 w-4" /></span><div><div className="text-[13px] font-medium text-zinc-900">Payments due</div><div className="mt-0.5 text-[11px] text-zinc-500">Outstanding payment milestones</div></div></div><span className="text-lg font-semibold tabular-nums text-zinc-950">{summary.payments_due}</span></Link>}
        {!inboxEnabled && summary.sla_breaches > 0 && <Link href="/leads" className="flex items-center justify-between gap-4 px-4 py-3.5 transition hover:bg-zinc-50 sm:px-5"><div className="flex min-w-0 items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600"><AlertTriangle className="h-4 w-4" /></span><div><div className="text-[13px] font-medium text-zinc-900">First-response breaches</div><div className="mt-0.5 text-[11px] text-zinc-500">New inquiries waiting beyond SLA</div></div></div><span className="text-lg font-semibold tabular-nums text-zinc-950">{summary.sla_breaches}</span></Link>}
      </div>
    </section>}
  </div>;
}
