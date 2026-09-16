'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CalendarClock, Check, Download, Inbox, Loader2, Plus, RefreshCw, Search } from 'lucide-react';
import { useApp } from '@/lib/store';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';
import ScheduleFollowUpModal from '@/components/followups/ScheduleFollowUpModal';

type ViewKey = 'overdue' | 'today' | 'upcoming';
type SourceFilter = 'all' | 'follow_up' | 'conversation';
type StatusFilter = 'open' | 'done';

type ApiWorkItem = {
  id: string;
  workspace_id: string;
  contact_id: string | null;
  lead_id: string | null;
  conversation_id: string | null;
  owner_id: string | null;
  type: 'call' | 'message' | 'email' | 'meeting' | 'document' | 'review' | 'payment' | 'proposal' | 'custom';
  title: string;
  description: string | null;
  due_at: string | null;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'open' | 'completed' | 'cancelled';
  source: string;
  completed_at: string | null;
  metadata: Record<string, unknown> | null;
};

type DisplayWorkItem = ApiWorkItem & {
  detail: string;
  href: string;
  surface: 'follow_up' | 'conversation';
};

const WORK_RUNTIME_CACHE = new Map<string, ApiWorkItem[]>();

function sameDay(value: string, now: Date) {
  const date = new Date(value);
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function dueLabel(value: string | null, now: number, completed: boolean) {
  if (completed) return 'Completed';
  if (!value) return 'No due date';
  const diff = Math.round((new Date(value).getTime() - now) / 60000);
  if (diff < 0) return Math.abs(diff) < 60 ? `${Math.abs(diff)}m overdue` : `${Math.round(Math.abs(diff) / 60)}h overdue`;
  if (diff < 60) return `in ${diff}m`;
  if (diff < 1440) return `in ${Math.round(diff / 60)}h`;
  return new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function sourceFromParam(value: string | null): SourceFilter {
  return value === 'follow_up' || value === 'conversation' ? value : 'all';
}

function escapeIcs(value: string) {
  return value.replaceAll('\\', '\\\\').replaceAll(';', '\\;').replaceAll(',', '\\,').replaceAll('\n', '\\n');
}

function toIcsDate(value: string) {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export default function DueWorkPage() {
  const params = useSearchParams();
  const { currentUser, allLeads, allProfiles, showToast } = useApp();
  const { config, term } = useWorkspace();
  const leadLabel = term('lead', 'Opportunity');
  const isManagement = currentUser.role === 'admin' || currentUser.role === 'manager';
  const runtimeCacheKey = `${currentUser.id}::${config.workspace.id}::${isManagement ? 'all' : 'me'}`;
  const initialItems = WORK_RUNTIME_CACHE.get(runtimeCacheKey);
  const [items, setItems] = useState<ApiWorkItem[]>(() => initialItems || []);
  const [loading, setLoading] = useState(() => !initialItems);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<ViewKey>('today');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>(() => sourceFromParam(params.get('type')));
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => params.get('status') === 'done' ? 'done' : 'open');
  const [ownerFilter, setOwnerFilter] = useState(() => params.get('owner') === 'me' ? 'me' : 'all');
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async (options?: { force?: boolean; quiet?: boolean }) => {
    const force = options?.force === true;
    const quiet = options?.quiet === true;
    const cached = WORK_RUNTIME_CACHE.get(runtimeCacheKey);
    if (cached) {
      setItems(cached);
      setLoading(false);
    } else if (!quiet) {
      setLoading(true);
    }
    try {
      const requestParams = new URLSearchParams({ status: 'all', owner: isManagement ? 'all' : 'me', limit: '500' });
      if (force) requestParams.set('refresh', '1');
      const response = await fetch(`/api/work-items?${requestParams.toString()}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to load due work.');
      const nextItems = Array.isArray(payload.items) ? payload.items as ApiWorkItem[] : [];
      setItems(nextItems);
      WORK_RUNTIME_CACHE.set(runtimeCacheKey, nextItems);
    } catch (error) {
      if (!quiet || !cached) showToast(error instanceof Error ? error.message : 'Unable to load due work.', 'error');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [isManagement, runtimeCacheKey, showToast]);

  useEffect(() => {
    document.title = `Due Work — ${config.workspace.name}`;
    const hasSnapshot = WORK_RUNTIME_CACHE.has(runtimeCacheKey);
    const initial = window.setTimeout(() => void load({ quiet: hasSnapshot }), 0);
    const clock = window.setInterval(() => setNow(Date.now()), 60000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(clock);
    };
  }, [config.workspace.name, load, runtimeCacheKey]);

  const displayItems = useMemo<DisplayWorkItem[]>(() => items.map((item) => {
    const lead = item.lead_id ? allLeads.find((row) => row.id === item.lead_id) : null;
    const surface: DisplayWorkItem['surface'] = item.conversation_id || item.source.startsWith('conversation') ? 'conversation' : 'follow_up';
    const metadata = item.metadata || {};
    const channel = typeof metadata.channel === 'string' ? metadata.channel : item.type;
    const target = lead?.customer_name || (surface === 'conversation' ? 'Customer conversation' : leadLabel);
    const detail = [target, channel, item.description].filter(Boolean).join(' · ');
    const href = item.conversation_id
      ? `/inbox?conversationId=${item.conversation_id}`
      : item.lead_id
        ? `/leads/${item.lead_id}/workspace`
        : item.contact_id
          ? `/contacts?contactId=${item.contact_id}`
          : '/work';
    return { ...item, detail, href, surface };
  }).sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    const priority = { urgent: 0, high: 1, normal: 2, low: 3 } as const;
    return priority[a.priority] - priority[b.priority]
      || (a.due_at ? new Date(a.due_at).getTime() : Number.MAX_SAFE_INTEGER)
      - (b.due_at ? new Date(b.due_at).getTime() : Number.MAX_SAFE_INTEGER);
  }), [allLeads, items, leadLabel]);

  const ownerMatches = useCallback((item: ApiWorkItem) => {
    if (!isManagement) return item.owner_id === currentUser.id || item.owner_id === null;
    if (ownerFilter === 'all') return true;
    if (ownerFilter === 'me') return item.owner_id === currentUser.id;
    return item.owner_id === ownerFilter;
  }, [currentUser.id, isManagement, ownerFilter]);

  const sourceMatches = useCallback((item: DisplayWorkItem) => sourceFilter === 'all' || item.surface === sourceFilter, [sourceFilter]);

  const openItems = useMemo(() => displayItems.filter((item) => item.status === 'open' && ownerMatches(item) && sourceMatches(item)), [displayItems, ownerMatches, sourceMatches]);

  const counts = useMemo(() => {
    const current = new Date(now);
    return openItems.reduce((acc, item) => {
      if (!item.due_at) {
        acc.upcoming += 1;
        return acc;
      }
      const due = new Date(item.due_at).getTime();
      if (due < now) acc.overdue += 1;
      else if (sameDay(item.due_at, current)) acc.today += 1;
      else acc.upcoming += 1;
      return acc;
    }, { overdue: 0, today: 0, upcoming: 0 });
  }, [now, openItems]);

  const filtered = useMemo(() => {
    const current = new Date(now);
    const searchTerm = query.trim().toLowerCase();
    return displayItems.filter((item) => {
      if (!ownerMatches(item) || !sourceMatches(item)) return false;
      if (statusFilter === 'done') {
        if (item.status !== 'completed') return false;
      } else {
        if (item.status !== 'open') return false;
        if (view === 'overdue' && (!item.due_at || new Date(item.due_at).getTime() >= now)) return false;
        if (view === 'today' && (!item.due_at || new Date(item.due_at).getTime() < now || !sameDay(item.due_at, current))) return false;
        if (view === 'upcoming' && item.due_at && (new Date(item.due_at).getTime() < now || sameDay(item.due_at, current))) return false;
      }
      return !searchTerm || `${item.title} ${item.detail} ${item.type}`.toLowerCase().includes(searchTerm);
    });
  }, [displayItems, now, ownerMatches, query, sourceMatches, statusFilter, view]);

  const complete = async (item: DisplayWorkItem) => {
    const response = await fetch(`/api/work-items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      showToast(payload.error || 'Unable to complete action.', 'error');
      return;
    }
    setItems((rows) => {
      const next = rows.map((row) => row.id === item.id ? payload.item as ApiWorkItem : row);
      WORK_RUNTIME_CACHE.set(runtimeCacheKey, next);
      return next;
    });
    showToast('Action completed.', 'success');
  };

  const exportCalendar = () => {
    const rows = filtered.filter((item) => item.status === 'open' && item.due_at);
    if (!rows.length) return;
    const events = rows.map((item) => [
      'BEGIN:VEVENT',
      `UID:${item.id}@crm`,
      `DTSTAMP:${toIcsDate(new Date().toISOString())}`,
      `DTSTART:${toIcsDate(item.due_at as string)}`,
      `SUMMARY:${escapeIcs(item.title)}`,
      `DESCRIPTION:${escapeIcs(item.detail)}`,
      'END:VEVENT',
    ].join('\r\n')).join('\r\n');
    const body = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//CRM//Due Work//EN\r\n${events}\r\nEND:VCALENDAR\r\n`;
    const url = URL.createObjectURL(new Blob([body], { type: 'text/calendar;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'due-work.ics';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const ownerOptions = allProfiles.filter((profile) => profile.is_active);

  return <div className="app-page">
    <header className="page-header">
      <div>
        <p className="page-eyebrow">Work</p>
        <h1 className="page-title">Due Work</h1>
        <p className="page-description">One canonical queue for every customer action that needs attention.</p>
      </div>
      <div className="page-actions">
        <button type="button" onClick={exportCalendar} disabled={!filtered.some((item) => item.status === 'open' && item.due_at)} className="button-secondary">
          <Download className="h-4 w-4" /> Calendar
        </button>
        <button type="button" onClick={() => setScheduleOpen(true)} className="button-primary">
          <Plus className="h-4 w-4" /> Add action
        </button>
        <button type="button" onClick={() => void load({ force: true })} disabled={loading} className="button-secondary px-3" aria-label="Refresh due work">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </header>

    <section className="grid gap-3 sm:grid-cols-3">
      {(['overdue', 'today', 'upcoming'] as ViewKey[]).map((key) => (
        <button key={key} type="button" onClick={() => { setStatusFilter('open'); setView(key); }} className={`metric text-left ${statusFilter === 'open' && view === key ? 'border-zinc-400' : ''}`}>
          <div className="metric-label">{key[0].toUpperCase() + key.slice(1)}</div>
          <div className="metric-value">{counts[key]}</div>
          <div className="metric-hint">{key === 'overdue' ? 'Past due now' : key === 'today' ? 'Still due today' : 'Scheduled later'}</div>
        </button>
      ))}
    </section>

    <section className="surface-flat overflow-visible">
      <div className="grid gap-2 border-b border-zinc-200 p-3 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
        <div className="relative min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customer or action" className="field pl-9" />
        </div>
        <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as SourceFilter)} className="select-field text-xs" aria-label="Action source">
          <option value="all">All actions</option>
          <option value="follow_up">Opportunity work</option>
          <option value="conversation">Conversation work</option>
        </select>
        {isManagement && <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)} className="select-field text-xs" aria-label="Owner">
          <option value="all">All owners</option>
          <option value="me">Assigned to me</option>
          {ownerOptions.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name}</option>)}
        </select>}
        <div className="flex rounded-lg border border-zinc-200 bg-zinc-50 p-1">
          <button type="button" onClick={() => setStatusFilter('open')} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${statusFilter === 'open' ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500'}`}>Open</button>
          <button type="button" onClick={() => setStatusFilter('done')} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${statusFilter === 'done' ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500'}`}>Done</button>
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div className="flex min-h-44 items-center justify-center gap-2 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading due work…</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <Check className="mx-auto h-6 w-6 text-emerald-600" />
          <div className="mt-2 text-sm font-semibold">This queue is clear</div>
          <p className="mt-1 text-xs text-zinc-500">No {statusFilter === 'done' ? 'completed' : view} work matches the current filters.</p>
        </div>
      ) : (
        <div className="divide-y divide-zinc-100">
          {filtered.map((item) => (
            <div key={item.id} className="flex items-center gap-3 px-4 py-3">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${item.surface === 'conversation' ? 'bg-cyan-50 text-cyan-700' : 'bg-amber-50 text-amber-700'}`}>
                {item.surface === 'conversation' ? <Inbox className="h-4 w-4" /> : <CalendarClock className="h-4 w-4" />}
              </span>
              <Link href={item.href} className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-zinc-900">{item.title}</div>
                <div className="mt-0.5 truncate text-[11px] text-zinc-500">{item.detail}</div>
              </Link>
              <div className={`shrink-0 font-mono text-[11px] font-semibold ${item.status === 'open' && item.due_at && new Date(item.due_at).getTime() < now ? 'text-rose-600' : 'text-zinc-500'}`}>
                {dueLabel(item.due_at, now, item.status === 'completed')}
              </div>
              {item.status === 'open' && <button type="button" onClick={() => void complete(item)} className="button-secondary button-sm" title="Mark done"><Check className="h-3.5 w-3.5" /></button>}
            </div>
          ))}
        </div>
      )}
    </section>

    {scheduleOpen && <ScheduleFollowUpModal isOpen onClose={() => { setScheduleOpen(false); window.setTimeout(() => void load({ force: true, quiet: true }), 150); }} />}
  </div>;
}