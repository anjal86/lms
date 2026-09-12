'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  Check,
  Download,
  Filter,
  MessageSquare,
  Phone,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { useApp } from '@/lib/store';
import type { FollowUpChannel, Lead } from '@/lib/types';
import QuickLogModal from '@/components/leads/QuickLogModal';
import WhatsAppModal from '@/components/leads/WhatsAppModal';
import ScheduleFollowUpModal from '@/components/followups/ScheduleFollowUpModal';

type FollowUpView = 'overdue' | 'today' | 'upcoming' | 'done';

const CHANNEL_LABELS: Record<FollowUpChannel, string> = {
  call: 'Call',
  whatsapp: 'WhatsApp',
  email: 'Email',
  meeting: 'Meeting',
};

function sameLocalDay(value: string, now: number) {
  const date = new Date(value);
  const today = new Date(now);
  return date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();
}

function dueLabel(value: string, now: number) {
  const due = new Date(value).getTime();
  const diffMinutes = Math.round((due - now) / 60_000);
  if (diffMinutes < 0) {
    const overdue = Math.abs(diffMinutes);
    return overdue >= 60 ? `${Math.round(overdue / 60)}h overdue` : `${overdue}m overdue`;
  }
  if (diffMinutes < 60) return `in ${diffMinutes}m`;
  if (diffMinutes < 1_440) return `in ${Math.round(diffMinutes / 60)}h`;
  return new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function FollowUpsPage() {
  const {
    followUps,
    allLeads,
    allProfiles,
    currentUser,
    completeFollowUp,
    exportFollowUpsIcal,
  } = useApp();

  const [view, setView] = useState<FollowUpView>('today');
  const [query, setQuery] = useState('');
  const [owner, setOwner] = useState('ALL');
  const [channel, setChannel] = useState<'all' | FollowUpChannel>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [activeLogLead, setActiveLogLead] = useState<Lead | null>(null);
  const [activeWaLead, setActiveWaLead] = useState<Lead | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    document.title = 'Follow-ups — Wanderlust CRM';
    const update = () => setNow(Date.now());
    const initial = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 60_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);

  const visibleTasks = useMemo(() => {
    if (currentUser.role === 'admin' || currentUser.role === 'manager') return followUps;
    return followUps.filter((item) => item.assigned_to === currentUser.id || item.agent_id === currentUser.id);
  }, [currentUser.id, currentUser.role, followUps]);

  const counts = useMemo(() => {
    if (now === null) return { overdue: 0, today: 0, upcoming: 0, done: 0 };
    return visibleTasks.reduce((result, item) => {
      if (item.status === 'completed') {
        result.done += 1;
        return result;
      }
      const due = new Date(item.scheduled_at).getTime();
      if (due < now) result.overdue += 1;
      else if (sameLocalDay(item.scheduled_at, now)) result.today += 1;
      else result.upcoming += 1;
      return result;
    }, { overdue: 0, today: 0, upcoming: 0, done: 0 });
  }, [now, visibleTasks]);

  const filtered = useMemo(() => {
    if (now === null) return [];
    const term = query.trim().toLowerCase();
    return visibleTasks
      .filter((item) => {
        const lead = allLeads.find((candidate) => candidate.id === item.lead_id);
        const due = new Date(item.scheduled_at).getTime();
        const isDone = item.status === 'completed';
        if (view === 'done' && !isDone) return false;
        if (view !== 'done' && isDone) return false;
        if (view === 'overdue' && due >= now) return false;
        if (view === 'today' && (due < now || !sameLocalDay(item.scheduled_at, now))) return false;
        if (view === 'upcoming' && (due < now || sameLocalDay(item.scheduled_at, now))) return false;
        if (owner !== 'ALL' && (item.assigned_to || item.agent_id) !== owner) return false;
        if (channel !== 'all' && item.channel !== channel) return false;
        if (term) {
          const haystack = `${item.title} ${item.notes || ''} ${lead?.customer_name || ''} ${lead?.customer_phone || ''} ${lead?.destination || ''}`.toLowerCase();
          if (!haystack.includes(term)) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  }, [allLeads, channel, now, owner, query, view, visibleTasks]);

  const activeFilterCount = Number(owner !== 'ALL') + Number(channel !== 'all');
  const managersCanFilterOwner = currentUser.role === 'admin' || currentUser.role === 'manager';

  return (
    <div className="app-page">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Work</p>
          <h1 className="page-title">Follow-ups</h1>
          <p className="page-description">See who needs a response, finish the contact, and move on.</p>
        </div>
        <div className="page-actions">
          <button type="button" onClick={() => exportFollowUpsIcal(filtered)} className="button-secondary" disabled={filtered.length === 0}>
            <Download className="h-4 w-4" /> Calendar
          </button>
          <button type="button" onClick={() => setScheduleOpen(true)} className="button-primary">
            <Plus className="h-4 w-4" /> Add follow-up
          </button>
        </div>
      </header>

      <section className="metric-grid" aria-label="Follow-up summary">
        <button type="button" onClick={() => setView('overdue')} className={`metric text-left ${view === 'overdue' ? 'border-zinc-400' : ''}`}>
          <div className="metric-label">Overdue</div>
          <div className="metric-value">{counts.overdue}</div>
          <div className="metric-hint">Already past due</div>
        </button>
        <button type="button" onClick={() => setView('today')} className={`metric text-left ${view === 'today' ? 'border-zinc-400' : ''}`}>
          <div className="metric-label">Today</div>
          <div className="metric-value">{counts.today}</div>
          <div className="metric-hint">Still due today</div>
        </button>
        <button type="button" onClick={() => setView('upcoming')} className={`metric text-left ${view === 'upcoming' ? 'border-zinc-400' : ''}`}>
          <div className="metric-label">Upcoming</div>
          <div className="metric-value">{counts.upcoming}</div>
          <div className="metric-hint">Scheduled later</div>
        </button>
        <button type="button" onClick={() => setView('done')} className={`metric text-left ${view === 'done' ? 'border-zinc-400' : ''}`}>
          <div className="metric-label">Done</div>
          <div className="metric-value">{counts.done}</div>
          <div className="metric-hint">Completed follow-ups</div>
        </button>
      </section>

      <section className="surface-flat overflow-visible">
        <div className="flex flex-col gap-2 border-b border-line p-3 sm:flex-row sm:items-center sm:p-4">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="field pl-9"
              placeholder="Search traveler, phone, destination or task"
              aria-label="Search follow-ups"
            />
          </div>
          <div className="relative">
            <button type="button" onClick={() => setFiltersOpen((open) => !open)} className="button-secondary w-full sm:w-auto" aria-expanded={filtersOpen}>
              <Filter className="h-4 w-4" /> Filters
              {activeFilterCount > 0 && <span className="font-mono text-[10px] text-zinc-500">{activeFilterCount}</span>}
            </button>
            {filtersOpen && (
              <div className="absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-app border border-line bg-surface p-4 shadow-panel">
                <div className="mb-3 flex items-center justify-between">
                  <div><div className="section-heading">Filter follow-ups</div><div className="section-description">Keep only what you need to see.</div></div>
                  <button type="button" onClick={() => setFiltersOpen(false)} className="button-ghost button-sm" aria-label="Close filters"><X className="h-4 w-4" /></button>
                </div>
                <div className="space-y-3">
                  {managersCanFilterOwner && (
                    <label className="block text-xs font-semibold text-zinc-700">
                      Owner
                      <select value={owner} onChange={(event) => setOwner(event.target.value)} className="select-field mt-1.5">
                        <option value="ALL">All owners</option>
                        {allProfiles.filter((profile) => profile.is_active).map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name}</option>)}
                      </select>
                    </label>
                  )}
                  <label className="block text-xs font-semibold text-zinc-700">
                    Contact type
                    <select value={channel} onChange={(event) => setChannel(event.target.value as 'all' | FollowUpChannel)} className="select-field mt-1.5">
                      <option value="all">All types</option>
                      <option value="call">Call</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="email">Email</option>
                      <option value="meeting">Meeting</option>
                    </select>
                  </label>
                  <button type="button" onClick={() => { setOwner('ALL'); setChannel('all'); }} className="button-secondary w-full" disabled={activeFilterCount === 0}>Clear filters</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {now === null ? (
          <div className="space-y-2 p-4" role="status" aria-label="Loading follow-ups">
            {Array.from({ length: 7 }).map((_, index) => <div key={index} className="h-14 animate-pulse rounded-md bg-zinc-100" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <CalendarClock className="h-5 w-5 text-zinc-300" />
            <h2 className="empty-state-title mt-3">Nothing here</h2>
            <p className="empty-state-description">There are no follow-ups matching this view and filter combination.</p>
            <button type="button" className="button-secondary mt-4" onClick={() => { setQuery(''); setOwner('ALL'); setChannel('all'); setView('today'); }}>Reset view</button>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {filtered.map((item) => {
              const lead = allLeads.find((candidate) => candidate.id === item.lead_id);
              const assigned = allProfiles.find((profile) => profile.id === (item.assigned_to || item.agent_id));
              const overdue = item.status !== 'completed' && new Date(item.scheduled_at).getTime() < now;
              return (
                <article key={item.id} className="grid gap-3 p-4 hover:bg-surface-hover md:grid-cols-[minmax(0,1fr)_9rem_10rem_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`status-dot ${item.status === 'completed' ? 'status-dot-success' : overdue ? 'status-dot-danger' : 'status-dot-info'}`} />
                      <h2 className="truncate text-xs font-semibold text-zinc-900">{lead?.customer_name || item.title}</h2>
                      <span className="text-[10px] font-medium text-zinc-400">{CHANNEL_LABELS[item.channel]}</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-zinc-500">{item.title}{lead?.destination ? ` · ${lead.destination}` : ''}</p>
                    {item.notes && <p className="mt-1 line-clamp-1 text-[11px] text-zinc-400">{item.notes}</p>}
                  </div>

                  <div>
                    <div className={`font-mono text-[11px] font-semibold ${overdue ? 'text-danger' : 'text-zinc-700'}`}>{item.status === 'completed' ? 'Done' : dueLabel(item.scheduled_at, now)}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-zinc-400">{new Date(item.scheduled_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                  </div>

                  <div className="text-xs text-zinc-600">{assigned?.full_name || 'Unassigned'}</div>

                  <div className="flex flex-wrap gap-1.5 md:justify-end">
                    {lead && item.status !== 'completed' && (
                      <>
                        <button type="button" onClick={() => setActiveLogLead(lead)} className="button-secondary button-sm"><Phone className="h-3.5 w-3.5" /> Call</button>
                        <button type="button" onClick={() => setActiveWaLead(lead)} className="button-secondary button-sm"><MessageSquare className="h-3.5 w-3.5" /> Message</button>
                      </>
                    )}
                    {lead && <Link href={`/leads/${lead.id}/workspace`} className="button-ghost button-sm">Open lead</Link>}
                    {item.status !== 'completed' && (
                      <button type="button" onClick={() => completeFollowUp(item.id)} className="button-primary button-sm"><Check className="h-3.5 w-3.5" /> Done</button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {scheduleOpen && <ScheduleFollowUpModal isOpen onClose={() => setScheduleOpen(false)} />}
      {activeLogLead && <QuickLogModal lead={activeLogLead} isOpen onClose={() => setActiveLogLead(null)} />}
      {activeWaLead && <WhatsAppModal lead={activeWaLead} isOpen onClose={() => setActiveWaLead(null)} />}
    </div>
  );
}
