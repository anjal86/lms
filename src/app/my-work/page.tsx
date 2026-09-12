'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  MessageCircle,
  Phone,
  Search,
  UserRound,
} from 'lucide-react';
import { useApp } from '@/lib/store';
import type { Lead } from '@/lib/types';

type WorkState = 'reply' | 'follow_up' | 'active';

function getWorkState(lead: Lead, hasPendingFollowUp: boolean): WorkState {
  if (!lead.first_contacted_at || lead.is_first_response_breached) return 'reply';
  if (hasPendingFollowUp || lead.next_follow_up_at) return 'follow_up';
  return 'active';
}

function stateCopy(state: WorkState) {
  if (state === 'reply') return { label: 'Reply needed', className: 'bg-red-50 text-red-700 border-red-100' };
  if (state === 'follow_up') return { label: 'Follow up', className: 'bg-amber-50 text-amber-700 border-amber-100' };
  return { label: 'In progress', className: 'bg-blue-50 text-blue-700 border-blue-100' };
}

function formatNextDate(value?: string | null) {
  if (!value) return 'No follow-up set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Follow-up set';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function MyWorkPage() {
  const { leads, followUps, currentUser } = useApp();
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);

  const myLeads = useMemo(() => {
    const pendingLeadIds = new Set(
      followUps
        .filter((item) => item.assigned_to === currentUser.id && (item.status === 'pending' || item.status === 'missed'))
        .map((item) => item.lead_id)
    );

    return leads
      .filter((lead) => lead.assigned_to === currentUser.id && !['won', 'lost', 'junk'].includes(lead.stage))
      .map((lead) => ({ lead, state: getWorkState(lead, pendingLeadIds.has(lead.id)) }))
      .sort((a, b) => {
        const order: Record<WorkState, number> = { reply: 0, follow_up: 1, active: 2 };
        if (order[a.state] !== order[b.state]) return order[a.state] - order[b.state];
        return b.lead.created_at.localeCompare(a.lead.created_at);
      });
  }, [currentUser.id, followUps, leads]);

  const replyCount = myLeads.filter((item) => item.state === 'reply').length;
  const followUpCount = myLeads.filter((item) => item.state === 'follow_up').length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return myLeads.filter(({ lead, state }) => {
      if (!showAll && state === 'active') return false;
      if (!q) return true;
      return [lead.customer_name, lead.destination, lead.customer_phone, lead.lead_code]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [myLeads, query, showAll]);

  return (
    <div className="workspace-page">
      <div className="workspace-header">
        <div>
          <p className="workspace-eyebrow">My Work</p>
          <h1 className="workspace-title">What should I do next?</h1>
          <p className="workspace-description">Only your active leads, ordered by what needs attention first.</p>
        </div>
        <Link href="/dashboard" className="button-secondary">Today</Link>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <button type="button" onClick={() => setShowAll(false)} className="panel p-4 text-left transition hover:border-zinc-300">
          <div className="text-xs font-medium text-zinc-500">Needs a reply</div>
          <div className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950">{replyCount}</div>
          <div className="mt-1 text-xs text-zinc-500">Start here</div>
        </button>
        <button type="button" onClick={() => setShowAll(false)} className="panel p-4 text-left transition hover:border-zinc-300">
          <div className="text-xs font-medium text-zinc-500">Follow-ups</div>
          <div className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950">{followUpCount}</div>
          <div className="mt-1 text-xs text-zinc-500">People to contact again</div>
        </button>
        <button type="button" onClick={() => setShowAll(true)} className="panel p-4 text-left transition hover:border-zinc-300">
          <div className="text-xs font-medium text-zinc-500">All my active leads</div>
          <div className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950">{myLeads.length}</div>
          <div className="mt-1 text-xs text-zinc-500">Everything assigned to you</div>
        </button>
      </section>

      <section className="panel overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-zinc-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-950">{showAll ? 'All my leads' : 'Needs action'}</h2>
            <p className="mt-1 text-xs text-zinc-500">Open a lead, contact the traveler, then continue to the next one.</p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search my leads" className="field pl-9" />
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-5 w-5" /></span>
            <h3 className="mt-3 text-sm font-semibold text-zinc-900">You’re caught up</h3>
            <p className="mt-1 text-xs text-zinc-500">There are no leads needing action in this view.</p>
            {!showAll && myLeads.length > 0 && <button type="button" onClick={() => setShowAll(true)} className="button-secondary mt-4">Show all my leads</button>}
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {visible.map(({ lead, state }) => {
              const stateInfo = stateCopy(state);
              const whatsappPhone = (lead.customer_phone || '').replace(/[^0-9]/g, '');
              return (
                <div key={lead.id} className="flex flex-col gap-4 px-4 py-4 transition hover:bg-zinc-50/60 lg:flex-row lg:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600"><UserRound className="h-4 w-4" /></span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/my-work/${lead.id}`} className="truncate text-sm font-semibold text-zinc-950 hover:text-blue-600">{lead.customer_name}</Link>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${stateInfo.className}`}>{stateInfo.label}</span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">{lead.destination} · {lead.customer_phone}</p>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
                        <span className="inline-flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" /> {formatNextDate(lead.next_follow_up_at)}</span>
                        <span className="capitalize">Status: {lead.stage.replaceAll('_', ' ')}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pl-13 lg:pl-0">
                    {lead.customer_phone && <a href={`tel:${lead.customer_phone}`} className="button-secondary px-3" aria-label={`Call ${lead.customer_name}`}><Phone className="h-4 w-4" /> <span className="hidden sm:inline">Call</span></a>}
                    {whatsappPhone && (
                      <a href={`https://wa.me/${whatsappPhone}`} target="_blank" rel="noreferrer" className="button-secondary px-3" aria-label={`Message ${lead.customer_name} on WhatsApp`}>
                        <MessageCircle className="h-4 w-4" /> <span className="hidden sm:inline">WhatsApp</span>
                      </a>
                    )}
                    <Link href={`/my-work/${lead.id}`} className="button-primary px-3">Open <ArrowRight className="h-4 w-4" /></Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
