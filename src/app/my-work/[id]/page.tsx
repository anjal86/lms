'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  CalendarClock,
  ChevronRight,
  FileText,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  UserRound,
  Users,
} from 'lucide-react';
import { useApp } from '@/lib/store';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';
import GenericLeadWorkspace from '@/components/leads/GenericLeadWorkspace';
import QuickLogModal from '@/components/leads/QuickLogModal';
import WhatsAppModal from '@/components/leads/WhatsAppModal';

function formatDate(value?: string | null) {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function stageLabel(stage: string) {
  const labels: Record<string, string> = {
    new: 'New',
    contacted: 'Contacted',
    quote_sent: 'Quote sent',
    in_negotiation: 'Discussing',
    won: 'Booked',
    lost: 'Closed',
    junk: 'Closed',
  };
  return labels[stage] || stage.replaceAll('_', ' ');
}

export default function MyWorkLeadPage() {
  const params = useParams();
  const leadId = params.id as string;
  const { allLeads, activities } = useApp();
  const { config, isLoading: workspaceLoading } = useWorkspace();
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [isWhatsAppOpen, setIsWhatsAppOpen] = useState(false);

  const lead = allLeads.find((item) => item.id === leadId);
  const recentActivity = useMemo(
    () => activities
      .filter((item) => item.lead_id === leadId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 6),
    [activities, leadId]
  );

  if (!workspaceLoading && config.workspace.business_type !== 'travel') {
    return <GenericLeadWorkspace />;
  }

  if (!lead) {
    return (
      <div className="workspace-page">
        <div className="panel p-8 text-center">
          <h1 className="text-lg font-semibold text-zinc-950">Lead not found</h1>
          <p className="mt-2 text-sm text-zinc-500">This lead may no longer be assigned to you.</p>
          <Link href="/my-work" className="button-primary mt-5">Back to My Work</Link>
        </div>
      </div>
    );
  }

  const nextStep = !lead.first_contacted_at
    ? 'Contact this traveler first.'
    : lead.next_follow_up_at
      ? `Follow up ${formatDate(lead.next_follow_up_at)}.`
      : 'Keep the conversation moving and set the next follow-up.';

  return (
    <div className="workspace-page max-w-5xl">
      <div className="flex items-center justify-between gap-3">
        <Link href="/my-work" className="inline-flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-zinc-900">
          <ArrowLeft className="h-4 w-4" /> My Work
        </Link>
        <Link href={`/leads/${lead.id}`} className="text-xs font-medium text-zinc-500 hover:text-zinc-900">
          Trip & payment details
        </Link>
      </div>

      <section className="panel overflow-hidden">
        <div className="border-b border-zinc-100 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-zinc-400">{lead.lead_code}</span>
                <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-semibold capitalize text-zinc-700">
                  {stageLabel(lead.stage)}
                </span>
                {lead.is_first_response_breached && (
                  <span className="rounded-full border border-red-100 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">Reply needed</span>
                )}
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">{lead.customer_name}</h1>
              <p className="mt-1 text-sm text-zinc-500">{lead.destination}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {lead.customer_phone && (
                <a href={`tel:${lead.customer_phone}`} className="button-secondary">
                  <Phone className="h-4 w-4" /> Call
                </a>
              )}
              <button type="button" onClick={() => setIsWhatsAppOpen(true)} className="button-secondary">
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </button>
              <button type="button" onClick={() => setIsLogOpen(true)} className="button-primary">
                Log contact
              </button>
            </div>
          </div>
        </div>

        <div className="bg-blue-50/60 px-5 py-4 sm:px-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">Next step</div>
          <div className="mt-1 text-sm font-semibold text-zinc-950">{nextStep}</div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <section className="panel p-5">
            <h2 className="text-sm font-semibold text-zinc-950">Traveler</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="flex items-start gap-3">
                <Phone className="mt-0.5 h-4 w-4 text-zinc-400" />
                <div><div className="text-xs text-zinc-400">Phone</div><div className="mt-0.5 text-sm font-medium text-zinc-900">{lead.customer_phone || 'Not added'}</div></div>
              </div>
              <div className="flex items-start gap-3">
                <Mail className="mt-0.5 h-4 w-4 text-zinc-400" />
                <div className="min-w-0"><div className="text-xs text-zinc-400">Email</div><div className="mt-0.5 truncate text-sm font-medium text-zinc-900">{lead.customer_email || 'Not added'}</div></div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-4 w-4 text-zinc-400" />
                <div><div className="text-xs text-zinc-400">Destination</div><div className="mt-0.5 text-sm font-medium text-zinc-900">{lead.destination}</div></div>
              </div>
              <div className="flex items-start gap-3">
                <CalendarClock className="mt-0.5 h-4 w-4 text-zinc-400" />
                <div><div className="text-xs text-zinc-400">Travel date</div><div className="mt-0.5 text-sm font-medium text-zinc-900">{lead.travel_dates || 'Flexible'}</div></div>
              </div>
              <div className="flex items-start gap-3">
                <Users className="mt-0.5 h-4 w-4 text-zinc-400" />
                <div><div className="text-xs text-zinc-400">Travelers</div><div className="mt-0.5 text-sm font-medium text-zinc-900">{lead.pax_adults} adult{lead.pax_adults === 1 ? '' : 's'}{lead.pax_children ? `, ${lead.pax_children} child${lead.pax_children === 1 ? '' : 'ren'}` : ''}</div></div>
              </div>
              <div className="flex items-start gap-3">
                <UserRound className="mt-0.5 h-4 w-4 text-zinc-400" />
                <div><div className="text-xs text-zinc-400">Budget</div><div className="mt-0.5 text-sm font-medium text-zinc-900">{lead.budget_range || 'Not discussed yet'}</div></div>
              </div>
            </div>

            {lead.special_notes && (
              <div className="mt-5 rounded-xl bg-zinc-50 p-4">
                <div className="text-xs font-semibold text-zinc-500">Notes from the inquiry</div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-700">{lead.special_notes}</p>
              </div>
            )}
          </section>

          <section className="panel overflow-hidden">
            <div className="border-b border-zinc-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-zinc-950">Recent activity</h2>
              <p className="mt-1 text-xs text-zinc-500">Calls, messages, notes and updates.</p>
            </div>
            {recentActivity.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-zinc-500">No activity yet. Contact the traveler to get started.</div>
            ) : (
              <div className="divide-y divide-zinc-100">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-zinc-900">{activity.title}</div>
                        {activity.notes && <div className="mt-1 text-xs leading-5 text-zinc-500">{activity.notes}</div>}
                      </div>
                      <div className="shrink-0 text-[11px] text-zinc-400">{formatDate(activity.created_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="panel p-5">
            <h2 className="text-sm font-semibold text-zinc-950">Quick actions</h2>
            <div className="mt-3 space-y-2">
              <button type="button" onClick={() => setIsLogOpen(true)} className="button-primary w-full justify-between">
                Log contact <ChevronRight className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setIsWhatsAppOpen(true)} className="button-secondary w-full justify-between">
                Send WhatsApp <ChevronRight className="h-4 w-4" />
              </button>
              <Link href={`/leads/${lead.id}`} className="button-secondary w-full justify-between">
                <span className="inline-flex items-center gap-2"><FileText className="h-4 w-4" /> More details</span>
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </section>

          <section className="panel p-5">
            <h2 className="text-sm font-semibold text-zinc-950">Next follow-up</h2>
            <p className="mt-2 text-sm font-medium text-zinc-900">{formatDate(lead.next_follow_up_at)}</p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">When you log a call or message, you can set the next follow-up there.</p>
          </section>
        </aside>
      </div>

      <QuickLogModal lead={lead} isOpen={isLogOpen} onClose={() => setIsLogOpen(false)} />
      <WhatsAppModal lead={lead} isOpen={isWhatsAppOpen} onClose={() => setIsWhatsAppOpen(false)} />
    </div>
  );
}
