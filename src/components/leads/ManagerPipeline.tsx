'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  MessageSquare,
  Phone,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useApp } from '@/lib/store';
import { usePaginatedLeads } from '@/lib/usePaginatedLeads';
import type { Lead, LeadStage } from '@/lib/types';
import { exportToCsv } from '@/lib/export-csv';
import SlaBadge from './SlaBadge';
import QuickLogModal from './QuickLogModal';
import WhatsAppModal from './WhatsAppModal';
import WinDealModal from './WinDealModal';
import LostDealModal from './LostDealModal';

type PipelineTab = 'all' | 'my' | 'overdue' | 'sla_pending' | 'won';
type OmnichannelLead = Lead & { source_channel?: string | null; source_campaign?: string | null };

const STAGE_LABELS: Record<LeadStage, string> = {
  new: 'New',
  contacted: 'Contacted',
  quote_sent: 'Quote sent',
  in_negotiation: 'Negotiation',
  won: 'Won',
  lost: 'Lost',
  junk: 'Junk',
};

const TRIP_STATUS_LABELS: Record<string, string> = {
  planning: 'Planning',
  booked: 'Booked',
  pre_departure: 'Pre-departure',
  on_trip: 'On trip',
  completed: 'Completed',
};

const CHANNEL_LABELS: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  tiktok: 'TikTok',
  email: 'Email',
  website: 'Website',
  api: 'API',
  legacy: 'Other',
};

const CHANNEL_DOTS: Record<string, string> = {
  facebook: 'bg-blue-500',
  instagram: 'bg-fuchsia-500',
  whatsapp: 'bg-emerald-500',
  tiktok: 'bg-zinc-800',
  email: 'bg-amber-500',
  website: 'bg-cyan-500',
  api: 'bg-violet-500',
  legacy: 'bg-zinc-400',
};

function pageWindow(page: number, totalPages: number) {
  const start = Math.max(1, Math.min(page - 2, Math.max(1, totalPages - 4)));
  const end = Math.min(totalPages, start + 4);
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
}

function ownerInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function ChannelBadge({ lead }: { lead: Lead }) {
  const channel = (lead as OmnichannelLead).source_channel || 'legacy';
  const label = CHANNEL_LABELS[channel] || lead.source || channel;
  const dot = CHANNEL_DOTS[channel] || CHANNEL_DOTS.legacy;
  return <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-zinc-600"><span className={`h-1.5 w-1.5 rounded-full ${dot}`} />{label}</span>;
}

export default function ManagerPipeline() {
  const router = useRouter();
  const params = useSearchParams();
  const {
    allProfiles,
    currentUser,
    assignLead,
    updateLeadStage,
    bulkAssignLeads,
    bulkUpdateLeadStage,
    formatCurrency,
  } = useApp();

  const tab = (params.get('tab') as PipelineTab) || 'all';
  const page = Math.max(1, Number(params.get('page') || '1') || 1);
  const q = params.get('q') || '';
  const destination = params.get('dest') || 'ALL';
  const tripStatus = params.get('trip') || 'ALL';
  const channel = params.get('channel') || 'ALL';
  const pageSize = 40;

  const {
    leads,
    total,
    totalPages,
    summary,
    isLoading,
    error,
    refresh,
  } = usePaginatedLeads({ page, pageSize, tab, q, dest: destination, trip: tripStatus, channel });

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState(q);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeLogLead, setActiveLogLead] = useState<Lead | null>(null);
  const [activeWaLead, setActiveWaLead] = useState<Lead | null>(null);
  const [activeWinLead, setActiveWinLead] = useState<Lead | null>(null);
  const [activeLostLead, setActiveLostLead] = useState<Lead | null>(null);

  const agents = useMemo(
    () => allProfiles.filter((profile) => profile.role === 'agent' && profile.is_active),
    [allProfiles]
  );

  const destinations = summary.destinations || [];
  const allVisibleSelected = leads.length > 0 && leads.every((lead) => selectedIds.includes(lead.id));
  const activeFilterCount = Number(destination !== 'ALL') + Number(tripStatus !== 'ALL') + Number(channel !== 'ALL');
  const pages = pageWindow(page, totalPages);
  const firstItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(total, page * pageSize);

  const updateParams = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    Object.entries(changes).forEach(([key, value]) => {
      if (!value || value === 'ALL' || (key === 'page' && value === '1') || (key === 'tab' && value === 'all')) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    });
    if (!Object.prototype.hasOwnProperty.call(changes, 'page')) next.delete('page');
    router.replace(`/leads${next.toString() ? `?${next.toString()}` : ''}`, { scroll: false });
    setSelectedIds([]);
  };

  useEffect(() => {
    setSearchDraft(q);
  }, [q]);

  useEffect(() => {
    const normalized = searchDraft.trim();
    if (normalized === q) return;
    const timer = window.setTimeout(() => updateParams({ q: normalized || null }), 300);
    return () => window.clearTimeout(timer);
    // updateParams intentionally derives from the latest URL params for this debounce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft, q]);

  const setTab = (nextTab: PipelineTab) => updateParams({ tab: nextTab, page: null });

  const changeStage = (lead: Lead, stage: LeadStage) => {
    if (stage === 'won') {
      setActiveWinLead(lead);
      return;
    }
    if (stage === 'lost') {
      setActiveLostLead(lead);
      return;
    }
    updateLeadStage(lead.id, stage);
  };

  const exportPage = () => {
    exportToCsv(`pipeline_page_${page}_${new Date().toISOString().slice(0, 10)}`, leads, [
      { header: 'Lead Code', accessor: (lead) => lead.lead_code },
      { header: 'Traveler', accessor: (lead) => lead.customer_name },
      { header: 'Phone', accessor: (lead) => lead.customer_phone },
      { header: 'Email', accessor: (lead) => lead.customer_email || '' },
      { header: 'Destination', accessor: (lead) => lead.destination },
      { header: 'Channel', accessor: (lead) => (lead as OmnichannelLead).source_channel || lead.source || '' },
      { header: 'Campaign', accessor: (lead) => (lead as OmnichannelLead).source_campaign || '' },
      { header: 'Travel Dates', accessor: (lead) => lead.travel_dates || '' },
      { header: 'Stage', accessor: (lead) => STAGE_LABELS[lead.stage] },
      { header: 'Trip Status', accessor: (lead) => TRIP_STATUS_LABELS[lead.trip_status || 'planning'] || 'Planning' },
      { header: 'Owner', accessor: (lead) => allProfiles.find((profile) => profile.id === lead.assigned_to)?.full_name || 'Unassigned' },
      { header: 'Package Value', accessor: (lead) => lead.package_sale_price || lead.won_deal_value || 0 },
      { header: 'Next Follow-up', accessor: (lead) => lead.next_follow_up_at || '' },
      { header: 'Created', accessor: (lead) => lead.created_at },
    ]);
  };

  const tabs: Array<{ id: PipelineTab; label: string; count: number }> = [
    { id: 'all', label: 'All leads', count: summary.visible_count },
    { id: 'my', label: 'My leads', count: summary.my_count },
    { id: 'sla_pending', label: 'Needs reply', count: summary.pending_sla_count },
    { id: 'overdue', label: 'Overdue', count: summary.overdue_count },
    { id: 'won', label: 'Won', count: summary.won_count },
  ];

  return (
    <div className="app-page">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Sales workspace</p>
          <h1 className="page-title">Leads pipeline</h1>
          <p className="page-description">One operational view for every inquiry, owner, next action and outcome.</p>
        </div>
        <div className="page-actions">
          {(currentUser.role === 'admin' || currentUser.role === 'manager') && <Link href="/connections" className="button-secondary button-sm">Connections</Link>}
          <button type="button" onClick={refresh} className="button-secondary button-sm" aria-label="Refresh leads"><RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Refresh</button>
          <button type="button" onClick={exportPage} className="button-secondary button-sm" disabled={leads.length === 0}><Download className="h-3.5 w-3.5" /> Export</button>
        </div>
      </header>

      <section className="surface-flat overflow-visible">
        <div className="grid border-b border-zinc-200 bg-zinc-50/45 sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-zinc-200">
          <div className="px-4 py-3"><div className="text-[11px] font-medium text-zinc-500">Open leads</div><div className="mt-0.5 text-lg font-semibold tracking-tight text-zinc-950 tabular-nums">{summary.visible_count}</div></div>
          <div className="border-t border-zinc-200 px-4 py-3 sm:border-l sm:border-t-0 lg:border-l-0"><div className="text-[11px] font-medium text-zinc-500">Needs reply</div><div className={`mt-0.5 text-lg font-semibold tracking-tight tabular-nums ${summary.pending_sla_count > 0 ? 'text-blue-700' : 'text-zinc-950'}`}>{summary.pending_sla_count}</div></div>
          <div className="border-t border-zinc-200 px-4 py-3 lg:border-t-0"><div className="text-[11px] font-medium text-zinc-500">Overdue</div><div className={`mt-0.5 text-lg font-semibold tracking-tight tabular-nums ${summary.overdue_count > 0 ? 'text-rose-600' : 'text-zinc-950'}`}>{summary.overdue_count}</div></div>
          <div className="border-t border-zinc-200 px-4 py-3 sm:border-l lg:border-l-0 lg:border-t-0"><div className="text-[11px] font-medium text-zinc-500">Won value</div><div className="mt-0.5 truncate text-lg font-semibold tracking-tight text-zinc-950 tabular-nums">{formatCurrency(summary.won_value)}</div></div>
        </div>

        <div className="flex flex-col border-b border-zinc-200 xl:flex-row xl:items-center xl:justify-between">
          <nav className="flex gap-1 overflow-x-auto px-3 pt-2 sm:px-4" aria-label="Lead views">
            {tabs.map((item) => {
              const active = tab === item.id;
              return (
                <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`min-h-9 whitespace-nowrap border-b-2 px-2.5 text-xs font-medium transition ${active ? 'border-blue-600 text-blue-700' : 'border-transparent text-zinc-500 hover:text-zinc-950'}`}>
                  {item.label}<span className={`ml-1.5 text-[10px] tabular-nums ${active ? 'text-blue-500' : 'text-zinc-400'}`}>{item.count}</span>
                </button>
              );
            })}
          </nav>

          <div className="flex min-w-0 flex-col gap-2 border-t border-zinc-200 p-3 sm:flex-row xl:w-[46rem] xl:border-l xl:border-t-0 xl:p-2.5">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input type="search" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Search name, phone, email, code or destination" aria-label="Search leads" className="field pl-9" />
            </div>
            <div className="relative">
              <button type="button" onClick={() => setFiltersOpen((open) => !open)} className={`button-secondary w-full sm:w-auto ${activeFilterCount > 0 ? 'border-blue-200 bg-blue-50 text-blue-700' : ''}`} aria-expanded={filtersOpen}>
                <Filter className="h-4 w-4" /> Filter {activeFilterCount > 0 && <span className="rounded-full bg-blue-100 px-1.5 text-[10px] text-blue-700">{activeFilterCount}</span>}
              </button>
              {filtersOpen && (
                <div className="absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-zinc-200 bg-white p-4 shadow-xl">
                  <div className="mb-3 flex items-center justify-between">
                    <div><div className="section-heading">Filter leads</div><div className="section-description">Narrow the working set without leaving the pipeline.</div></div>
                    <button type="button" onClick={() => setFiltersOpen(false)} className="button-ghost button-sm" aria-label="Close filters"><X className="h-4 w-4" /></button>
                  </div>
                  <div className="space-y-3">
                    <label className="block text-xs font-medium text-zinc-700">Channel
                      <select value={channel} onChange={(event) => updateParams({ channel: event.target.value, page: null })} className="select-field mt-1.5">
                        <option value="ALL">All channels</option><option value="facebook">Facebook</option><option value="instagram">Instagram</option><option value="whatsapp">WhatsApp</option><option value="tiktok">TikTok</option><option value="email">Email</option><option value="website">Website</option><option value="api">API / automation</option><option value="legacy">Other / older leads</option>
                      </select>
                    </label>
                    <label className="block text-xs font-medium text-zinc-700">Destination
                      <select value={destination} onChange={(event) => updateParams({ dest: event.target.value, page: null })} className="select-field mt-1.5"><option value="ALL">All destinations</option>{destinations.map((item) => <option key={item} value={item}>{item}</option>)}</select>
                    </label>
                    <label className="block text-xs font-medium text-zinc-700">Trip status
                      <select value={tripStatus} onChange={(event) => updateParams({ trip: event.target.value, page: null })} className="select-field mt-1.5"><option value="ALL">All trip statuses</option><option value="planning">Planning</option><option value="booked">Booked</option><option value="pre_departure">Pre-departure</option><option value="on_trip">On trip</option><option value="completed">Completed</option></select>
                    </label>
                    <button type="button" className="button-secondary w-full" onClick={() => updateParams({ channel: null, dest: null, trip: null, page: null })} disabled={activeFilterCount === 0}>Clear filters</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {activeFilterCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-200 bg-zinc-50/50 px-3 py-2 sm:px-4">
            <SlidersHorizontal className="mr-1 h-3.5 w-3.5 text-zinc-400" />
            {channel !== 'ALL' && <button type="button" onClick={() => updateParams({ channel: null })} className="button-ghost button-sm">{CHANNEL_LABELS[channel] || channel}<X className="h-3 w-3" /></button>}
            {destination !== 'ALL' && <button type="button" onClick={() => updateParams({ dest: null })} className="button-ghost button-sm">{destination}<X className="h-3 w-3" /></button>}
            {tripStatus !== 'ALL' && <button type="button" onClick={() => updateParams({ trip: null })} className="button-ghost button-sm">{TRIP_STATUS_LABELS[tripStatus] || tripStatus}<X className="h-3 w-3" /></button>}
          </div>
        )}

        {error ? (
          <div className="empty-state" role="alert"><AlertCircle className="h-5 w-5 text-red-600" /><h2 className="empty-state-title mt-3">Leads could not be loaded</h2><p className="empty-state-description">{error} Check the database connection, then try again.</p><button type="button" onClick={refresh} className="button-primary mt-4">Try again</button></div>
        ) : isLoading && leads.length === 0 ? (
          <div className="space-y-2 p-4" role="status" aria-label="Loading leads">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-11 animate-pulse rounded-md bg-zinc-100" />)}</div>
        ) : leads.length === 0 ? (
          <div className="empty-state"><Search className="h-5 w-5 text-zinc-300" /><h2 className="empty-state-title mt-3">No leads in this view</h2><p className="empty-state-description">Try another view or clear the current search and filters.</p><button type="button" className="button-secondary mt-4" onClick={() => router.replace('/leads')}>Show all leads</button></div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table>
                <thead><tr><th className="w-10 text-center"><input type="checkbox" checked={allVisibleSelected} onChange={() => setSelectedIds(allVisibleSelected ? [] : leads.map((lead) => lead.id))} aria-label="Select all leads on this page" /></th><th>Traveler</th><th>Destination</th><th>Stage</th><th>Next action</th><th>Owner</th><th className="text-right">Value</th><th className="w-24 text-right">Actions</th></tr></thead>
                <tbody>
                  {leads.map((lead) => {
                    const owner = allProfiles.find((profile) => profile.id === lead.assigned_to);
                    const value = lead.package_sale_price || lead.won_deal_value || 0;
                    return (
                      <tr key={lead.id} className={selectedIds.includes(lead.id) ? 'bg-blue-50/50' : undefined}>
                        <td className="text-center"><input type="checkbox" checked={selectedIds.includes(lead.id)} onChange={() => setSelectedIds((ids) => ids.includes(lead.id) ? ids.filter((id) => id !== lead.id) : [...ids, lead.id])} aria-label={`Select ${lead.customer_name}`} /></td>
                        <td>
                          <Link href={`/leads/${lead.id}/workspace`} className="group block min-w-[12rem]">
                            <div className="flex items-center gap-2"><div className="font-semibold text-zinc-950 group-hover:text-blue-700">{lead.customer_name}</div><ChannelBadge lead={lead} /></div>
                            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500"><span className="font-mono">{lead.lead_code}</span><span>{lead.customer_phone}</span></div>
                            {(lead as OmnichannelLead).source_campaign && <div className="mt-1 max-w-[16rem] truncate text-[10px] text-zinc-400">{(lead as OmnichannelLead).source_campaign}</div>}
                          </Link>
                        </td>
                        <td><div className="font-medium text-zinc-800">{lead.destination}</div><div className="mt-0.5 text-[11px] text-zinc-500">{lead.travel_dates || `${lead.duration_days} days`}</div></td>
                        <td><select value={lead.stage} aria-label={`Update stage for ${lead.customer_name}`} onChange={(event) => changeStage(lead, event.target.value as LeadStage)} className="field-sm rounded-md border border-zinc-300 bg-white px-2 text-xs font-medium text-zinc-700">{Object.entries(STAGE_LABELS).map(([valueKey, stageLabel]) => <option key={valueKey} value={valueKey}>{stageLabel}</option>)}</select></td>
                        <td><SlaBadge lead={lead} />{lead.next_follow_up_at && <div className="mt-1 text-[10px] text-zinc-500">{new Date(lead.next_follow_up_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>}</td>
                        <td>
                          <label className="sr-only" htmlFor={`owner-${lead.id}`}>Owner for {lead.customer_name}</label>
                          <div className="flex min-w-[10rem] items-center gap-2"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[9px] font-semibold text-zinc-600">{owner ? ownerInitials(owner.full_name) : '—'}</span><select id={`owner-${lead.id}`} value={lead.assigned_to || ''} onChange={(event) => event.target.value && assignLead(lead.id, event.target.value)} className="min-w-0 flex-1 bg-transparent text-xs font-medium text-zinc-700 outline-none"><option value="" disabled>Unassigned</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.full_name}</option>)}</select></div>
                        </td>
                        <td className="text-right font-medium text-zinc-800 tabular-nums">{value > 0 ? formatCurrency(value) : '—'}</td>
                        <td><div className="flex justify-end gap-1"><button type="button" onClick={() => setActiveWaLead(lead)} className="button-ghost button-sm px-2" aria-label={`WhatsApp ${lead.customer_name}`}><MessageSquare className="h-3.5 w-3.5" /></button><button type="button" onClick={() => setActiveLogLead(lead)} className="button-ghost button-sm px-2" aria-label={`Log contact with ${lead.customer_name}`}><Phone className="h-3.5 w-3.5" /></button></div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-zinc-100 md:hidden">
              {leads.map((lead) => {
                const owner = allProfiles.find((profile) => profile.id === lead.assigned_to);
                return (
                  <article key={lead.id} className="p-4">
                    <div className="flex items-start justify-between gap-3"><Link href={`/leads/${lead.id}/workspace`} className="min-w-0 flex-1"><div className="flex items-center gap-2"><div className="truncate text-sm font-semibold text-zinc-950">{lead.customer_name}</div><ChannelBadge lead={lead} /></div><div className="mt-1 text-[11px] text-zinc-500"><span className="font-mono">{lead.lead_code}</span> · {lead.customer_phone}</div></Link><input type="checkbox" checked={selectedIds.includes(lead.id)} onChange={() => setSelectedIds((ids) => ids.includes(lead.id) ? ids.filter((id) => id !== lead.id) : [...ids, lead.id])} aria-label={`Select ${lead.customer_name}`} /></div>
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                      <div><div className="text-[11px] font-medium text-zinc-400">Destination</div><div className="mt-0.5 font-medium text-zinc-800">{lead.destination}</div></div>
                      <div><div className="text-[11px] font-medium text-zinc-400">Owner</div><div className="mt-0.5 font-medium text-zinc-800">{owner?.full_name || 'Unassigned'}</div></div>
                      <div><div className="text-[11px] font-medium text-zinc-400">Stage</div><div className="mt-0.5 text-zinc-700">{STAGE_LABELS[lead.stage]}</div></div>
                      <div><div className="text-[11px] font-medium text-zinc-400">Next action</div><div className="mt-0.5"><SlaBadge lead={lead} /></div></div>
                    </div>
                    <div className="mt-3 flex gap-2 border-t border-zinc-200 pt-3"><button type="button" onClick={() => setActiveLogLead(lead)} className="button-secondary flex-1"><Phone className="h-4 w-4" /> Log contact</button><button type="button" onClick={() => setActiveWaLead(lead)} className="button-secondary flex-1"><MessageSquare className="h-4 w-4" /> WhatsApp</button></div>
                  </article>
                );
              })}
            </div>
          </>
        )}

        <footer className="flex flex-col gap-3 border-t border-zinc-200 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <div className="text-xs text-zinc-500">{total > 0 ? <>Showing <span className="font-medium text-zinc-700 tabular-nums">{firstItem}–{lastItem}</span> of <span className="font-medium text-zinc-700 tabular-nums">{total}</span></> : 'No results'}</div>
          <div className="flex items-center gap-1">
            <button type="button" className="button-secondary button-sm px-2" disabled={page <= 1 || isLoading} onClick={() => updateParams({ page: String(page - 1) })} aria-label="Previous page"><ChevronLeft className="h-3.5 w-3.5" /></button>
            {pages.map((pageNumber) => <button key={pageNumber} type="button" onClick={() => updateParams({ page: String(pageNumber) })} className={`button-sm min-w-9 rounded-md border text-xs font-medium ${pageNumber === page ? 'border-blue-600 bg-blue-600 text-white' : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'}`} aria-current={pageNumber === page ? 'page' : undefined}>{pageNumber}</button>)}
            <button type="button" className="button-secondary button-sm px-2" disabled={page >= totalPages || isLoading} onClick={() => updateParams({ page: String(page + 1) })} aria-label="Next page"><ChevronRight className="h-3.5 w-3.5" /></button>
          </div>
        </footer>
      </section>

      {selectedIds.length > 0 && (
        <div className="fixed bottom-5 left-1/2 z-40 w-[min(44rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-blue-200 bg-white p-2.5 shadow-2xl">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center"><div className="shrink-0 px-2 text-xs font-semibold text-blue-700 tabular-nums">{selectedIds.length} selected</div><div className="flex flex-1 flex-col gap-2 sm:flex-row">
            <select defaultValue="" aria-label="Assign selected leads" className="min-h-9 flex-1 rounded-md border border-zinc-300 bg-white px-2 text-xs text-zinc-700" onChange={(event) => { if (!event.target.value) return; bulkAssignLeads(selectedIds, event.target.value); setSelectedIds([]); }}><option value="" disabled>Assign to…</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.full_name}</option>)}</select>
            <select defaultValue="" aria-label="Change stage for selected leads" className="min-h-9 flex-1 rounded-md border border-zinc-300 bg-white px-2 text-xs text-zinc-700" onChange={(event) => { if (!event.target.value) return; bulkUpdateLeadStage(selectedIds, event.target.value as LeadStage); setSelectedIds([]); }}><option value="" disabled>Move stage…</option><option value="new">New</option><option value="contacted">Contacted</option><option value="quote_sent">Quote sent</option><option value="in_negotiation">Negotiation</option><option value="lost">Lost</option></select>
          </div><button type="button" onClick={() => setSelectedIds([])} className="button-ghost button-sm" aria-label="Clear selection"><X className="h-4 w-4" /></button></div>
        </div>
      )}

      {activeLogLead && <QuickLogModal lead={activeLogLead} isOpen onClose={() => setActiveLogLead(null)} />}
      {activeWaLead && <WhatsAppModal lead={activeWaLead} isOpen onClose={() => setActiveWaLead(null)} />}
      {activeWinLead && <WinDealModal lead={activeWinLead} isOpen onClose={() => setActiveWinLead(null)} />}
      {activeLostLead && <LostDealModal lead={activeLostLead} isOpen onClose={() => setActiveLostLead(null)} />}

      {currentUser.role === 'agent' && <div className="hidden" aria-hidden="true">Agents are redirected to My Work.</div>}
    </div>
  );
}
