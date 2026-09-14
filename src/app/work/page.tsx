'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, Check, Inbox, Loader2, RefreshCw, Search } from 'lucide-react';
import { useApp } from '@/lib/store';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';
import { useWorkspacePermissions } from '@/lib/use-workspace-permissions';

type ConversationAction = {
  id: string;
  customer_name: string | null;
  provider: string;
  assigned_to: string | null;
  next_action_at: string | null;
  priority: string;
  workflow_state: string;
};

type ViewKey = 'overdue' | 'today' | 'upcoming';

type WorkItem = {
  id: string;
  source: 'follow_up' | 'conversation';
  title: string;
  detail: string;
  dueAt: string;
  ownerId: string | null;
  href: string;
  priority: number;
  completed: boolean;
  followUpId?: string;
  conversationId?: string;
};

function sameDay(value: string, now: Date) {
  const date = new Date(value);
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function dueLabel(value: string, now: number) {
  const diff = Math.round((new Date(value).getTime() - now) / 60000);
  if (diff < 0) return Math.abs(diff) < 60 ? `${Math.abs(diff)}m overdue` : `${Math.round(Math.abs(diff) / 60)}h overdue`;
  if (diff < 60) return `in ${diff}m`;
  if (diff < 1440) return `in ${Math.round(diff / 60)}h`;
  return new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function DueWorkPage() {
  const { currentUser, followUps, allLeads, completeFollowUp, showToast } = useApp();
  const { config, term } = useWorkspace();
  const { can } = useWorkspacePermissions();
  const [conversations, setConversations] = useState<ConversationAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<ViewKey>('today');
  const [now, setNow] = useState(() => Date.now());
  const leadLabel = term('lead', 'Lead');
  const isManagement = currentUser.role === 'admin' || currentUser.role === 'manager';

  const load = useCallback(async () => {
    if (!can('inbox.view')) { setLoading(false); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({ filter: isManagement ? 'all' : 'mine', sort: 'newest', limit: '1000' });
      const response = await fetch(`/api/conversations?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to load conversation actions.');
      setConversations((payload.conversations || []).filter((row: ConversationAction) => row.next_action_at && row.workflow_state !== 'closed'));
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to load conversation actions.', 'error');
    } finally {
      setLoading(false);
    }
  }, [can, isManagement, showToast]);

  useEffect(() => {
    document.title = `Due Work — ${config.workspace.name}`;
    const initial = window.setTimeout(() => void load(), 0);
    const clock = window.setInterval(() => setNow(Date.now()), 60000);
    return () => { window.clearTimeout(initial); window.clearInterval(clock); };
  }, [config.workspace.name, load]);

  const items = useMemo<WorkItem[]>(() => {
    const followUpItems: WorkItem[] = followUps
      .filter((item) => item.status !== 'completed' && (isManagement || item.assigned_to === currentUser.id || item.agent_id === currentUser.id))
      .map((item) => {
        const lead = allLeads.find((row) => row.id === item.lead_id);
        return {
          id: `followup:${item.id}`,
          source: 'follow_up',
          title: item.title || `Follow up with ${lead?.customer_name || leadLabel}`,
          detail: `${lead?.customer_name || leadLabel}${item.channel ? ` · ${item.channel}` : ''}${item.notes ? ` · ${item.notes}` : ''}`,
          dueAt: item.scheduled_at,
          ownerId: item.assigned_to || item.agent_id || null,
          href: isManagement ? `/leads/${item.lead_id}/workspace` : `/my-work/${item.lead_id}`,
          priority: 1,
          completed: false,
          followUpId: item.id,
        };
      });

    const conversationItems: WorkItem[] = conversations
      .filter((row) => Boolean(row.next_action_at))
      .map((row) => ({
        id: `conversation:${row.id}`,
        source: 'conversation',
        title: `Next action · ${row.customer_name || 'Customer'}`,
        detail: `${row.provider} conversation · ${row.priority} priority`,
        dueAt: row.next_action_at as string,
        ownerId: row.assigned_to,
        href: `/inbox?conversationId=${row.id}`,
        priority: row.priority === 'urgent' ? 0 : row.priority === 'high' ? 0.5 : 1,
        completed: false,
        conversationId: row.id,
      }));

    return [...followUpItems, ...conversationItems].sort((a, b) => a.priority - b.priority || new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  }, [allLeads, conversations, currentUser.id, followUps, isManagement, leadLabel]);

  const filtered = useMemo(() => {
    const current = new Date(now);
    const term = query.trim().toLowerCase();
    return items.filter((item) => {
      const due = new Date(item.dueAt).getTime();
      if (view === 'overdue' && due >= now) return false;
      if (view === 'today' && (due < now || !sameDay(item.dueAt, current))) return false;
      if (view === 'upcoming' && (due < now || sameDay(item.dueAt, current))) return false;
      return !term || `${item.title} ${item.detail}`.toLowerCase().includes(term);
    });
  }, [items, now, query, view]);

  const counts = useMemo(() => {
    const current = new Date(now);
    return items.reduce((acc, item) => {
      const due = new Date(item.dueAt).getTime();
      if (due < now) acc.overdue += 1;
      else if (sameDay(item.dueAt, current)) acc.today += 1;
      else acc.upcoming += 1;
      return acc;
    }, { overdue: 0, today: 0, upcoming: 0 });
  }, [items, now]);

  const complete = async (item: WorkItem) => {
    if (item.source === 'follow_up' && item.followUpId) {
      completeFollowUp(item.followUpId);
      showToast('Follow-up completed.', 'success');
      return;
    }
    if (item.conversationId) {
      const response = await fetch(`/api/conversations/${item.conversationId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ next_action_at: null }) });
      if (!response.ok) { showToast('Unable to complete conversation action.', 'error'); return; }
      setConversations((rows) => rows.filter((row) => row.id !== item.conversationId));
      showToast('Conversation action completed.', 'success');
    }
  };

  return <div className="app-page">
    <header className="page-header"><div><p className="page-eyebrow">Work</p><h1 className="page-title">Due Work</h1><p className="page-description">CRM follow-ups and conversation next actions in one prioritized queue.</p></div><div className="page-actions"><Link href="/follow-ups" className="button-secondary"><CalendarClock className="h-4 w-4" /> Manage follow-ups</Link><button type="button" onClick={() => void load()} disabled={loading} className="button-secondary px-3"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button></div></header>

    <section className="grid gap-3 sm:grid-cols-3">{(['overdue','today','upcoming'] as ViewKey[]).map((key) => <button key={key} type="button" onClick={() => setView(key)} className={`metric text-left ${view === key ? 'border-zinc-400' : ''}`}><div className="metric-label">{key[0].toUpperCase() + key.slice(1)}</div><div className="metric-value">{counts[key]}</div><div className="metric-hint">{key === 'overdue' ? 'Past due now' : key === 'today' ? 'Still due today' : 'Scheduled later'}</div></button>)}</section>

    <section className="surface-flat overflow-hidden"><div className="border-b border-zinc-200 p-3"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search due work" className="field pl-9" /></div></div>
      {loading && items.length === 0 ? <div className="flex min-h-44 items-center justify-center gap-2 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading due work…</div> : filtered.length === 0 ? <div className="py-16 text-center"><Check className="mx-auto h-6 w-6 text-emerald-600" /><div className="mt-2 text-sm font-semibold">This queue is clear</div><p className="mt-1 text-xs text-zinc-500">No {view} work matches your filters.</p></div> : <div className="divide-y divide-zinc-100">{filtered.map((item) => <div key={item.id} className="flex items-center gap-3 px-4 py-3"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${item.source === 'conversation' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>{item.source === 'conversation' ? <Inbox className="h-4 w-4" /> : <CalendarClock className="h-4 w-4" />}</span><Link href={item.href} className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-zinc-900">{item.title}</div><div className="mt-0.5 truncate text-[11px] text-zinc-500">{item.detail}</div></Link><div className={`shrink-0 font-mono text-[11px] font-semibold ${new Date(item.dueAt).getTime() < now ? 'text-rose-600' : 'text-zinc-500'}`}>{dueLabel(item.dueAt, now)}</div><button type="button" onClick={() => void complete(item)} className="button-secondary button-sm" title="Mark done"><Check className="h-3.5 w-3.5" /></button></div>)}</div>}
    </section>
  </div>;
}
