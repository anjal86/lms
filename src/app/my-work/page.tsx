'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarClock, MessageCircle, Search, UserRound } from 'lucide-react';
import { useApp } from '@/lib/store';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';
import { buildQualificationSummary, getCanonicalNextAction } from '@/lib/opportunity-workspace';
import type { LeadStage } from '@/lib/types';

const ACTIVE_STAGES: LeadStage[] = ['new', 'contacted', 'quote_sent', 'in_negotiation'];
const STAGE_LABELS: Record<LeadStage, string> = {
  new: 'New',
  contacted: 'Contacted',
  quote_sent: 'Proposal sent',
  in_negotiation: 'Negotiation',
  won: 'Won',
  lost: 'Lost',
  junk: 'Junk',
};

function displayValue(value: unknown) {
  if (value == null || value === '') return '';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function formatNextDate(value?: string | null) {
  if (!value) return 'No due date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Scheduled';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function MyWorkPage() {
  const { leads, followUps, currentUser } = useApp();
  const { config, term } = useWorkspace();
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState<'all' | LeadStage>('all');

  const leadPlural = term('lead_plural', 'Opportunities');
  const primaryField = useMemo(
    () => config.fields
      .filter((field) => field.entity_type === 'lead' && field.is_active)
      .sort((a, b) => a.sort_order - b.sort_order)[0],
    [config.fields]
  );

  const myOpportunities = useMemo(() => leads
    .filter((lead) => lead.assigned_to === currentUser.id && ACTIVE_STAGES.includes(lead.stage))
    .map((lead) => ({
      lead,
      qualification: buildQualificationSummary(lead, config.workspace.business_type),
      nextAction: getCanonicalNextAction(lead, followUps),
    }))
    .sort((left, right) => {
      const leftDue = left.nextAction.scheduledAt ? new Date(left.nextAction.scheduledAt).getTime() : Number.POSITIVE_INFINITY;
      const rightDue = right.nextAction.scheduledAt ? new Date(right.nextAction.scheduledAt).getTime() : Number.POSITIVE_INFINITY;
      if (leftDue !== rightDue) return leftDue - rightDue;
      return right.lead.updated_at.localeCompare(left.lead.updated_at);
    }), [config.workspace.business_type, currentUser.id, followUps, leads]);

  const stageCounts = useMemo(() => myOpportunities.reduce((result, item) => {
    result[item.lead.stage] = (result[item.lead.stage] || 0) + 1;
    return result;
  }, {} as Partial<Record<LeadStage, number>>), [myOpportunities]);

  const visible = useMemo(() => {
    const searchTerm = query.trim().toLowerCase();
    return myOpportunities.filter(({ lead }) => {
      if (stage !== 'all' && lead.stage !== stage) return false;
      if (!searchTerm) return true;
      const customValues = Object.values(lead.custom_data || {});
      return [lead.customer_name, lead.customer_phone, lead.customer_email, lead.lead_code, ...customValues]
        .filter(Boolean)
        .some((value) => displayValue(value).toLowerCase().includes(searchTerm));
    });
  }, [myOpportunities, query, stage]);

  return (
    <div className="workspace-page">
      <div className="workspace-header">
        <div>
          <p className="workspace-eyebrow">Opportunities</p>
          <h1 className="workspace-title">My {leadPlural}</h1>
          <p className="workspace-description">Commercial work you own. Scheduled actions live in Due Work; customer replies live in Inbox.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/work?owner=me" className="button-secondary">Due Work</Link>
          <Link href="/inbox?view=mine" className="button-secondary">Inbox</Link>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <button type="button" onClick={() => setStage('all')} className={`panel p-4 text-left transition hover:border-zinc-300 ${stage === 'all' ? 'border-zinc-400' : ''}`}>
          <div className="text-xs font-medium text-zinc-500">Active</div>
          <div className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950">{myOpportunities.length}</div>
          <div className="mt-1 text-xs text-zinc-500">Everything assigned to you</div>
        </button>
        {(['new', 'contacted', 'quote_sent'] as LeadStage[]).map((key) => (
          <button key={key} type="button" onClick={() => setStage(key)} className={`panel p-4 text-left transition hover:border-zinc-300 ${stage === key ? 'border-zinc-400' : ''}`}>
            <div className="text-xs font-medium text-zinc-500">{STAGE_LABELS[key]}</div>
            <div className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950">{stageCounts[key] || 0}</div>
            <div className="mt-1 text-xs text-zinc-500">{key === 'new' ? 'Needs qualification' : key === 'contacted' ? 'In discovery' : 'Commercial follow-through'}</div>
          </button>
        ))}
      </section>

      <section className="panel overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-zinc-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-950">{stage === 'all' ? `Active ${leadPlural.toLowerCase()}` : STAGE_LABELS[stage]}</h2>
            <p className="mt-1 text-xs text-zinc-500">Open an opportunity to progress qualification, commercial work and handoff.</p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search my ${leadPlural.toLowerCase()}`} className="field pl-9" />
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <UserRound className="mx-auto h-6 w-6 text-zinc-300" />
            <h3 className="mt-3 text-sm font-semibold text-zinc-900">No opportunities in this view</h3>
            <p className="mt-1 text-xs text-zinc-500">Try another stage or clear the search.</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {visible.map(({ lead, qualification, nextAction }) => {
              const businessSummary = config.workspace.business_type === 'travel'
                ? lead.destination
                : primaryField ? displayValue(lead.custom_data?.[primaryField.field_key]) : '';
              return (
                <div key={lead.id} className="grid gap-3 px-4 py-4 transition hover:bg-zinc-50/60 lg:grid-cols-[minmax(0,1.3fr)_8rem_8rem_minmax(12rem,0.8fr)_auto] lg:items-center">
                  <div className="min-w-0">
                    <Link href={`/my-work/${lead.id}`} className="truncate text-sm font-semibold text-zinc-950 hover:text-blue-600">{lead.customer_name}</Link>
                    <p className="mt-1 truncate text-xs text-zinc-500">{[businessSummary, lead.customer_phone].filter(Boolean).join(' · ')}</p>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Stage</div>
                    <div className="mt-1 text-xs font-semibold text-zinc-800">{STAGE_LABELS[lead.stage]}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Qualified</div>
                    <div className="mt-1 font-mono text-xs font-semibold text-zinc-800">{qualification.percent}%</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Next action</div>
                    <div className="mt-1 truncate text-xs font-semibold text-zinc-800">{nextAction.title}</div>
                    <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-zinc-500"><CalendarClock className="h-3 w-3" /> {formatNextDate(nextAction.scheduledAt)}</div>
                  </div>
                  <div className="flex items-center gap-2 lg:justify-end">
                    <Link href={`/inbox/lead/${lead.id}`} className="button-secondary px-3"><MessageCircle className="h-4 w-4" /> Message</Link>
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
