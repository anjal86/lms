'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlarmClock,
  CheckCircle2,
  Clock3,
  ListTodo,
  Loader2,
  RefreshCw,
  Route,
  Save,
  Tag,
  UserCheck,
} from 'lucide-react';
import { useApp } from '@/lib/store';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';
import { useWorkspacePermissions } from '@/lib/use-workspace-permissions';

type WorkItem = {
  id: string;
  title: string;
  due_at?: string | null;
  priority?: string | null;
  status?: string | null;
};

type ContactDecision = {
  id?: string;
  lifecycle_key?: string | null;
  tags?: unknown;
};

type Decision = {
  id: string;
  workflow_state: 'open' | 'waiting' | 'snoozed' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  needs_reply: boolean;
  snoozed_until: string | null;
  first_response_due_at: string | null;
  next_action_at: string | null;
  first_responded_at: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  assigned_to: string | null;
  assigned_profile?: { full_name?: string | null } | null;
  contact?: ContactDecision | ContactDecision[] | null;
};

type Props = {
  conversationId: string;
  tags?: unknown;
  nextActionAt?: string | null;
  lastInboundAt?: string | null;
};

type RoutingStrategy = 'workload_balanced' | 'least_open' | 'round_robin' | 'conversion_weighted';

const LIFECYCLE_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'customer', label: 'Customer' },
  { value: 'lost', label: 'Lost' },
];

function dateLabel(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function toLocalInput(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localInputToIso(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function contactOf(decision: Decision | null) {
  if (!decision?.contact) return null;
  return Array.isArray(decision.contact) ? decision.contact[0] || null : decision.contact;
}

function lifecycleLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function quickDate(hoursFromNow: number) {
  return toLocalInput(new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString());
}

function tomorrowMorning() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return toLocalInput(date.toISOString());
}

function decisionStatus(decision: Decision | null) {
  if (!decision) return { label: 'Loading', tone: 'bg-zinc-100 text-zinc-600' };
  if (decision.workflow_state === 'closed') return { label: 'Resolved', tone: 'bg-emerald-50 text-emerald-700' };
  if (decision.workflow_state === 'snoozed') return { label: 'Snoozed', tone: 'bg-violet-50 text-violet-700' };
  if (decision.workflow_state === 'waiting') return { label: 'Waiting on customer', tone: 'bg-amber-50 text-amber-700' };
  if (decision.needs_reply) return { label: 'Needs reply', tone: 'bg-blue-50 text-blue-700' };
  return { label: 'Open', tone: 'bg-zinc-100 text-zinc-700' };
}

function slaStatus(decision: Decision | null) {
  if (!decision || decision.workflow_state === 'closed') return null;
  if (decision.first_responded_at || !decision.first_response_due_at) return null;
  const ms = new Date(decision.first_response_due_at).getTime() - Date.now();
  const minutes = Math.max(1, Math.floor(Math.abs(ms) / 60_000));
  const readable = minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h`;
  return ms < 0
    ? { text: `${readable} overdue`, danger: true }
    : { text: `${readable} left`, danger: false };
}

export default function InboxContextExtras({ conversationId, tags, nextActionAt, lastInboundAt }: Props) {
  const { currentUser, showToast } = useApp();
  const { config } = useWorkspace();
  const { can } = useWorkspacePermissions();
  const [items, setItems] = useState<WorkItem[]>([]);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [loadingDecision, setLoadingDecision] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [nextActionDraft, setNextActionDraft] = useState(() => toLocalInput(nextActionAt));
  const [snoozeDraft, setSnoozeDraft] = useState(() => quickDate(24));
  const [routingStrategy, setRoutingStrategy] = useState<RoutingStrategy>('workload_balanced');

  const fetchedContact = contactOf(decision);
  const normalizedTags = useMemo(() => {
    const source = Array.isArray(fetchedContact?.tags) ? fetchedContact?.tags : tags;
    return Array.isArray(source) ? source.map(String).filter(Boolean).slice(0, 8) : [];
  }, [fetchedContact?.tags, tags]);

  const lifecycleValue = fetchedContact?.lifecycle_key || 'new';
  const lifecycleOptions = useMemo(() => {
    if (LIFECYCLE_OPTIONS.some((item) => item.value === lifecycleValue)) return LIFECYCLE_OPTIONS;
    return [{ value: lifecycleValue, label: lifecycleLabel(lifecycleValue) }, ...LIFECYCLE_OPTIONS];
  }, [lifecycleValue]);

  const loadWork = useCallback(async () => {
    try {
      const query = new URLSearchParams({ conversationId, status: 'open', owner: 'all', limit: '5', refresh: '1' });
      const response = await fetch(`/api/work-items?${query.toString()}`, { cache: 'no-store' });
      if (!response.ok) return;
      const payload = await response.json();
      setItems((payload.items || []) as WorkItem[]);
    } catch { /* context enhancement only */ }
  }, [conversationId]);

  const loadDecision = useCallback(async () => {
    setLoadingDecision(true);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/decision`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to load conversation decisions.');
      const next = payload.decision as Decision;
      setDecision(next);
      setNextActionDraft(toLocalInput(next.next_action_at));
      if (next.snoozed_until) setSnoozeDraft(toLocalInput(next.snoozed_until));
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to load conversation decisions.', 'error');
    } finally {
      setLoadingDecision(false);
    }
  }, [conversationId, showToast]);

  useEffect(() => {
    setNextActionDraft(toLocalInput(nextActionAt));
    setSnoozeDraft(quickDate(24));
    const timer = window.setTimeout(() => void Promise.all([loadWork(), loadDecision()]), 0);
    return () => window.clearTimeout(timer);
  }, [conversationId, loadDecision, loadWork, nextActionAt]);

  const mutateCore = async (patch: Record<string, unknown>, success: string, actionKey: string) => {
    setBusyAction(actionKey);
    try {
      const response = await fetch(`/api/conversations/${conversationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to update conversation.');
      showToast(success, 'success');
      await loadDecision();
      window.dispatchEvent(new CustomEvent('crm:data-mutated'));
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to update conversation.', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const saveNextAction = async (value = nextActionDraft) => {
    const nextIso = localInputToIso(value);
    if (value && !nextIso) {
      showToast('Choose a valid next-action date and time.', 'error');
      return;
    }
    setBusyAction('next-action');
    try {
      const response = await fetch(`/api/conversations/${conversationId}/decision`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ next_action_at: nextIso }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to update next action.');
      setDecision(payload.decision as Decision);
      setNextActionDraft(toLocalInput(payload.decision?.next_action_at));
      showToast(nextIso ? 'Next action scheduled.' : 'Next action cleared.', 'success');
      window.dispatchEvent(new CustomEvent('crm:data-mutated'));
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to update next action.', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const createFollowUp = async () => {
    const dueAt = localInputToIso(nextActionDraft);
    if (!dueAt) {
      showToast('Schedule a next action before creating the follow-up task.', 'error');
      return;
    }
    setBusyAction('task');
    try {
      const response = await fetch('/api/work-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          ownerId: decision?.assigned_to || currentUser.id,
          type: 'message',
          title: 'Follow up with customer',
          dueAt,
          priority: decision?.priority === 'urgent' ? 'urgent' : decision?.priority === 'high' ? 'high' : 'normal',
          metadata: { source: 'inbox_next_action' },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to create follow-up task.');
      showToast('Follow-up added to the work queue.', 'success');
      await loadWork();
      window.dispatchEvent(new CustomEvent('crm:data-mutated'));
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to create follow-up task.', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const snooze = async (value: string) => {
    const until = localInputToIso(value);
    if (!until || new Date(until).getTime() <= Date.now()) {
      showToast('Choose a future snooze time.', 'error');
      return;
    }
    await mutateCore({ workflow_state: 'snoozed', snoozed_until: until }, `Snoozed until ${dateLabel(until)}.`, 'snooze');
  };

  const status = decisionStatus(decision);
  const sla = slaStatus(decision);
  const canRoute = (currentUser.role === 'admin' || currentUser.role === 'manager') && can('inbox.assign');

  return <div className="space-y-5 border-t border-zinc-100 pt-4">
    <section>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold text-zinc-700">Decision</div>
        <button type="button" onClick={() => void loadDecision()} disabled={loadingDecision} className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800" aria-label="Refresh decision state">
          <RefreshCw className={`h-3.5 w-3.5 ${loadingDecision ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className={`rounded-md px-2 py-1 text-[10px] font-semibold ${status.tone}`}>{status.label}</span>
        {sla && <span className={`rounded-md px-2 py-1 text-[10px] font-semibold ${sla.danger ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{sla.text}</span>}
        {decision?.assigned_profile?.full_name && <span className="rounded-md bg-zinc-100 px-2 py-1 text-[10px] font-medium text-zinc-600">{decision.assigned_profile.full_name}</span>}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" disabled={Boolean(busyAction) || decision?.workflow_state === 'waiting'} onClick={() => void mutateCore({ workflow_state: 'waiting' }, 'Conversation is waiting on the customer.', 'waiting')} className="button-secondary button-sm justify-center">Waiting</button>
        <button type="button" disabled={Boolean(busyAction) || decision?.workflow_state === 'open'} onClick={() => void mutateCore({ workflow_state: 'open' }, 'Conversation reopened.', 'open')} className="button-secondary button-sm justify-center">Reopen</button>
      </div>

      <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50/60 p-3">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-700"><AlarmClock className="h-3.5 w-3.5" /> Snooze until</div>
        <div className="mt-2 flex gap-2"><input type="datetime-local" value={snoozeDraft} onChange={(event) => setSnoozeDraft(event.target.value)} className="field h-9 min-w-0 flex-1 text-xs" /><button type="button" disabled={Boolean(busyAction)} onClick={() => void snooze(snoozeDraft)} className="button-secondary button-sm">Snooze</button></div>
        <div className="mt-2 flex flex-wrap gap-1.5"><button type="button" onClick={() => { const value = quickDate(1); setSnoozeDraft(value); void snooze(value); }} className="button-ghost button-sm">1 hour</button><button type="button" onClick={() => { const value = tomorrowMorning(); setSnoozeDraft(value); void snooze(value); }} className="button-ghost button-sm">Tomorrow 9:00</button></div>
      </div>
    </section>

    <section className="border-t border-zinc-100 pt-4">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-700"><Clock3 className="h-3.5 w-3.5" /> Next action</div>
      <p className="mt-1 text-[10px] leading-4 text-zinc-500">Every active commercial conversation should have a clear next step.</p>
      <div className="mt-2 flex gap-2"><input type="datetime-local" value={nextActionDraft} onChange={(event) => setNextActionDraft(event.target.value)} className="field h-9 min-w-0 flex-1 text-xs" /><button type="button" disabled={busyAction === 'next-action'} onClick={() => void saveNextAction()} className="button-primary button-sm">{busyAction === 'next-action' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save</button></div>
      <div className="mt-2 flex flex-wrap gap-1.5"><button type="button" onClick={() => setNextActionDraft(quickDate(3))} className="button-ghost button-sm">+3h</button><button type="button" onClick={() => setNextActionDraft(tomorrowMorning())} className="button-ghost button-sm">Tomorrow</button>{decision?.next_action_at && <button type="button" onClick={() => { setNextActionDraft(''); void saveNextAction(''); }} className="button-ghost button-sm text-rose-600">Clear</button>}<button type="button" disabled={!nextActionDraft || busyAction === 'task'} onClick={() => void createFollowUp()} className="button-secondary button-sm"><ListTodo className="h-3.5 w-3.5" /> Add to My Work</button></div>
    </section>

    <section className="border-t border-zinc-100 pt-4">
      <label className="block text-[11px] font-semibold text-zinc-700">Lifecycle
        <select value={lifecycleValue} disabled={Boolean(busyAction)} onChange={(event) => void mutateCore({ lifecycle_key: event.target.value }, `Lifecycle changed to ${lifecycleLabel(event.target.value)}.`, 'lifecycle')} className="select-field mt-2 h-9 w-full text-xs">
          {lifecycleOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
    </section>

    {canRoute && <section className="border-t border-zinc-100 pt-4">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-700"><Route className="h-3.5 w-3.5" /> Auto-route</div>
      <p className="mt-1 text-[10px] leading-4 text-zinc-500">Use availability and capacity instead of manually choosing the next owner.</p>
      <div className="mt-2 flex gap-2"><select value={routingStrategy} onChange={(event) => setRoutingStrategy(event.target.value as RoutingStrategy)} className="select-field h-9 min-w-0 flex-1 text-xs"><option value="workload_balanced">Balanced workload</option><option value="least_open">Least open</option><option value="round_robin">Round robin</option><option value="conversion_weighted">Conversion weighted</option></select><button type="button" disabled={busyAction === 'route'} onClick={() => void mutateCore({ assign_strategy: routingStrategy }, 'Conversation routed to an eligible agent.', 'route')} className="button-secondary button-sm"><UserCheck className="h-3.5 w-3.5" /> Route</button></div>
    </section>}

    <section className="border-t border-zinc-100 pt-4">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-700"><Clock3 className="h-3.5 w-3.5" /> Activity</div>
      <dl className="mt-2 space-y-2 text-xs">
        <div className="flex items-center justify-between gap-3"><dt className="text-zinc-500">Last inbound</dt><dd className="font-medium text-zinc-800">{dateLabel(decision?.last_inbound_at || lastInboundAt)}</dd></div>
        <div className="flex items-center justify-between gap-3"><dt className="text-zinc-500">Next action</dt><dd className="font-medium text-zinc-800">{dateLabel(decision?.next_action_at || nextActionAt)}</dd></div>
        {decision?.snoozed_until && <div className="flex items-center justify-between gap-3"><dt className="text-zinc-500">Snoozed until</dt><dd className="font-medium text-zinc-800">{dateLabel(decision.snoozed_until)}</dd></div>}
      </dl>
    </section>

    {normalizedTags.length > 0 && <section>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-700"><Tag className="h-3.5 w-3.5" /> Tags</div>
      <div className="mt-2 flex flex-wrap gap-1.5">{normalizedTags.map((tag) => <span key={tag} className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-semibold text-zinc-600">{tag}</span>)}</div>
    </section>}

    <section>
      <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-700"><ListTodo className="h-3.5 w-3.5" /> Open work</div><span className="font-mono text-[10px] text-zinc-400">{items.length}</span></div>
      <div className="mt-2 space-y-1.5">{items.slice(0, 3).map((item) => <div key={item.id} className="rounded-lg border border-zinc-100 bg-zinc-50/70 px-2.5 py-2"><div className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-zinc-400" /><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold text-zinc-800">{item.title}</div>{item.due_at && <div className="mt-0.5 text-[10px] text-zinc-400">Due {dateLabel(item.due_at)}</div>}</div></div></div>)}{items.length === 0 && <div className="text-xs text-zinc-400">No open work for this conversation.</div>}</div>
    </section>

    <div className="rounded-lg bg-zinc-50 px-3 py-2 text-[10px] leading-4 text-zinc-500">Times are shown in your browser timezone. Workspace operations use <span className="font-medium text-zinc-700">{config.workspace.timezone || 'UTC'}</span>.</div>
  </div>;
}
