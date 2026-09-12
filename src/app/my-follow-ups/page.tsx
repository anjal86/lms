'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, Check, CheckCircle2, MessageCircle, Phone, UserRound } from 'lucide-react';
import { useApp } from '@/lib/store';

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function MyFollowUpsPage() {
  const { followUps, allLeads, currentUser, completeFollowUp } = useApp();
  const [showDone, setShowDone] = useState(false);

  const myFollowUps = useMemo(
    () => followUps
      .filter((item) => item.assigned_to === currentUser.id)
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)),
    [currentUser.id, followUps]
  );

  const openItems = myFollowUps.filter((item) => item.status === 'pending' || item.status === 'missed');
  const doneItems = myFollowUps.filter((item) => item.status === 'completed');
  const visible = showDone ? doneItems : openItems;

  return (
    <div className="workspace-page max-w-5xl">
      <div className="workspace-header">
        <div>
          <p className="workspace-eyebrow">Follow-ups</p>
          <h1 className="workspace-title">People to contact again</h1>
          <p className="workspace-description">Work through this list, mark each one done, and keep moving.</p>
        </div>
        <Link href="/my-work" className="button-secondary">My Work</Link>
      </div>

      <section className="panel overflow-hidden">
        <div className="flex items-center gap-2 border-b border-zinc-100 p-3">
          <button
            type="button"
            onClick={() => setShowDone(false)}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${!showDone ? 'bg-zinc-950 text-white' : 'text-zinc-600 hover:bg-zinc-100'}`}
          >
            Open <span className="ml-1 text-xs opacity-70">{openItems.length}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowDone(true)}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${showDone ? 'bg-zinc-950 text-white' : 'text-zinc-600 hover:bg-zinc-100'}`}
          >
            Done <span className="ml-1 text-xs opacity-70">{doneItems.length}</span>
          </button>
        </div>

        {visible.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <h2 className="mt-3 text-sm font-semibold text-zinc-900">{showDone ? 'Nothing completed yet' : 'No open follow-ups'}</h2>
            <p className="mt-1 text-xs text-zinc-500">{showDone ? 'Completed follow-ups will appear here.' : 'You’re caught up for now.'}</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {visible.map((followUp) => {
              const lead = allLeads.find((item) => item.id === followUp.lead_id);
              if (!lead) return null;
              const whatsappPhone = (lead.customer_phone || '').replace(/[^0-9]/g, '');
              return (
                <div key={followUp.id} className="flex flex-col gap-4 px-4 py-4 hover:bg-zinc-50/60 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600">
                      <UserRound className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <Link href={`/my-work/${lead.id}`} className="text-sm font-semibold text-zinc-950 hover:text-blue-600">{lead.customer_name}</Link>
                      <p className="mt-1 text-xs text-zinc-500">{lead.destination} · {followUp.title}</p>
                      <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600">
                        <CalendarClock className="h-3.5 w-3.5 text-zinc-400" /> {formatDate(followUp.scheduled_at)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pl-13 sm:pl-0">
                    {lead.customer_phone && (
                      <a href={`tel:${lead.customer_phone}`} className="button-secondary px-3"><Phone className="h-4 w-4" /> Call</a>
                    )}
                    {whatsappPhone && (
                      <a href={`https://wa.me/${whatsappPhone}`} target="_blank" rel="noreferrer" className="button-secondary px-3">
                        <MessageCircle className="h-4 w-4" /> WhatsApp
                      </a>
                    )}
                    <Link href={`/my-work/${lead.id}`} className="button-secondary px-3">Open lead</Link>
                    {!showDone && (
                      <button
                        type="button"
                        onClick={() => completeFollowUp(followUp.id, 'Completed from My Follow-ups')}
                        className="button-primary px-3"
                      >
                        <Check className="h-4 w-4" /> Done
                      </button>
                    )}
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
