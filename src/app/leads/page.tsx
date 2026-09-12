'use client';

import React, { useState, useCallback, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '@/lib/store';
import { Lead, LeadStage } from '@/lib/types';
import { useDialog } from '@/lib/useDialog';
import KanbanBoard from '@/components/leads/KanbanBoard';
import SlaBadge from '@/components/leads/SlaBadge';
import QuickLogModal from '@/components/leads/QuickLogModal';
import WhatsAppModal from '@/components/leads/WhatsAppModal';
import WinDealModal from '@/components/leads/WinDealModal';
import LostDealModal from '@/components/leads/LostDealModal';
import LeadsLoading from './loading';
import {
  Kanban,
  Table as TableIcon,
  Search,
  Phone,
  MessageSquare,
  MapPin,
  ExternalLink,
  ChevronRight,
  X,
  Download,
} from 'lucide-react';
import { exportToCsv } from '@/lib/export-csv';

function LeadsContent() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    document.title = 'Pipeline · Leads — Wanderlust CRM';
  }, []);
  const {
    leads,
    allProfiles,
    currentUser,
    updateLeadStage,
    assignLead,
    formatCurrency,
    bulkAssignLeads,
    bulkUpdateLeadStage,
  } = useApp();

  // ── URL-synced filter state ──────────────────────────────────────────────
  const viewMode           = (params.get('view') as 'table' | 'kanban') || 'table';
  const selectedTab        = (params.get('tab')  as 'all' | 'my' | 'overdue' | 'sla_pending' | 'won') || 'all';
  const searchQuery        = params.get('q') || '';
  const selectedDestination = params.get('dest') || 'ALL';
  const selectedTripStatus  = params.get('trip')  || 'ALL';

  const pushParam = useCallback((key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (!value || value === 'ALL' || value === 'all' || value === 'table') {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    router.replace(`/leads?${next.toString()}`, { scroll: false });
  }, [params, router]);

  const setViewMode            = (v: 'table' | 'kanban') => pushParam('view', v);
  const setSelectedTab         = (v: string)              => pushParam('tab',  v);
  const setSearchQuery         = (v: string)              => pushParam('q',    v);
  const setSelectedDestination = (v: string)              => pushParam('dest', v);
  const setSelectedTripStatus  = (v: string)              => pushParam('trip', v);
  // ────────────────────────────────────────────────────────────────────────

  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);

  const [activeLogLead, setActiveLogLead] = useState<Lead | null>(null);
  const [activeWaLead, setActiveWaLead] = useState<Lead | null>(null);
  const [activeWinLead, setActiveWinLead] = useState<Lead | null>(null);
  const [activeLostLead, setActiveLostLead] = useState<Lead | null>(null);
  const [selectedLeadForDrawer, setSelectedLeadForDrawer] = useState<Lead | null>(null);

  // Top Metrics
  const totalLeadsCount = leads.length;
  const pendingSlaCount = leads.filter((l) => !l.first_contacted_at && l.stage === 'new').length;
  const overdueFollowUpCount = leads.filter((l) => {
    if (!l.next_follow_up_at) return false;
    return new Date(l.next_follow_up_at).getTime() < Date.now() && l.stage !== 'won' && l.stage !== 'lost';
  }).length;
  const wonLeadsCount = leads.filter((l) => l.stage === 'won').length;
  const wonValueSum = leads
    .filter((l) => l.stage === 'won')
    .reduce((sum, l) => sum + (l.won_deal_value || 0), 0);

  const destinations = Array.from(new Set(leads.map((l) => l.destination))).filter(Boolean);

  const filteredLeads = leads.filter((lead) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const match =
        lead.customer_name.toLowerCase().includes(q) ||
        lead.lead_code.toLowerCase().includes(q) ||
        lead.destination.toLowerCase().includes(q) ||
        lead.customer_phone.includes(q);
      if (!match) return false;
    }

    if (selectedDestination !== 'ALL' && lead.destination !== selectedDestination) return false;
    if (selectedTripStatus !== 'ALL' && (lead.trip_status || 'planning') !== selectedTripStatus) return false;

    if (selectedTab === 'my') return lead.assigned_to === currentUser.id;
    if (selectedTab === 'overdue') {
      if (!lead.next_follow_up_at) return false;
      return new Date(lead.next_follow_up_at).getTime() < Date.now() && lead.stage !== 'won' && lead.stage !== 'lost';
    }
    if (selectedTab === 'sla_pending') return !lead.first_contacted_at;
    return true;
  });

  useDialog({
    isOpen: !!selectedLeadForDrawer,
    onClose: () => setSelectedLeadForDrawer(null),
  });

  const handleResetFilters = () => {
    router.replace('/leads', { scroll: false });
  };

  const allFilteredSelected =
    filteredLeads.length > 0 && filteredLeads.every((l) => selectedLeadIds.includes(l.id));

  const handleToggleSelect = (leadId: string) => {
    setSelectedLeadIds((prev) =>
      prev.includes(leadId) ? prev.filter((id) => id !== leadId) : [...prev, leadId]
    );
  };

  const handleToggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedLeadIds([]);
    } else {
      setSelectedLeadIds(filteredLeads.map((l) => l.id));
    }
  };

  const handleExportCsv = (customList?: Lead[]) => {
    const list = customList || filteredLeads;
    exportToCsv(
      `leads_export_${new Date().toISOString().slice(0, 10)}`,
      list,
      [
        { header: 'Lead Code', accessor: (l) => l.lead_code },
        { header: 'Traveler Name', accessor: (l) => l.customer_name },
        { header: 'Phone', accessor: (l) => l.customer_phone },
        { header: 'Email', accessor: (l) => l.customer_email || '' },
        { header: 'Destination', accessor: (l) => l.destination },
        { header: 'Travel Dates', accessor: (l) => l.travel_dates || '' },
        { header: 'Pax Adults', accessor: (l) => l.pax_adults },
        { header: 'Pax Children', accessor: (l) => l.pax_children },
        { header: 'Holiday Style', accessor: (l) => l.travel_type },
        { header: 'Budget', accessor: (l) => l.budget_range || '' },
        { header: 'Stage', accessor: (l) => l.stage },
        { header: 'Priority', accessor: (l) => l.priority },
        { header: 'Source', accessor: (l) => l.source },
        {
          header: 'Assigned Consultant',
          accessor: (l) => {
            const ag = allProfiles.find((p) => p.id === l.assigned_to);
            return ag ? ag.full_name : 'Unassigned';
          },
        },
        { header: 'Trip Status', accessor: (l) => l.trip_status || 'planning' },
        {
          header: 'Total Paid',
          accessor: (l) => {
            const paid = (l.payment_records || []).reduce((s, r) => s + r.amount, 0);
            return paid > 0 ? `${paid}` : '0';
          },
        },
        { header: 'Created At', accessor: (l) => l.created_at },
      ]
    );
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* Metric Bar (Linear / Attio style) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-white p-3 rounded-lg border border-zinc-200 shadow-2xs">
        <div className="px-2">
          <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-tight">Active Pipeline</div>
          <div suppressHydrationWarning className="text-lg font-mono font-medium text-zinc-900 mt-0.5">{totalLeadsCount} inquiries</div>
        </div>
        <div className="px-2 border-l border-zinc-100">
          <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-tight">FRT Due (&lt;30m)</div>
          <div suppressHydrationWarning className="text-lg font-mono font-medium text-amber-700 mt-0.5">{pendingSlaCount} pending</div>
        </div>
        <div className="px-2 border-l border-zinc-100">
          <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-tight">Overdue Calls</div>
          <div suppressHydrationWarning className="text-lg font-mono font-medium text-red-700 mt-0.5">{overdueFollowUpCount} overdue</div>
        </div>
        <div className="px-2 border-l border-zinc-100">
          <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-tight">Converted Deals</div>
          <div suppressHydrationWarning className="text-lg font-mono font-medium text-emerald-700 mt-0.5">
            {formatCurrency(wonValueSum)} <span className="text-xs text-zinc-400 font-sans">({wonLeadsCount})</span>
          </div>
        </div>
      </div>

      {/* Filter and Control Header */}
      <div className="bg-white rounded-lg border border-zinc-200 shadow-2xs p-2.5 flex flex-col md:flex-row md:items-center justify-between gap-2.5">
        {/* Tab Filters */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 text-xs">
          {[
            { id: 'all', label: 'All Leads', count: totalLeadsCount },
            { id: 'my', label: 'My Leads', count: leads.filter((l) => l.assigned_to === currentUser.id).length },
            { id: 'overdue', label: 'Overdue', count: overdueFollowUpCount, alert: overdueFollowUpCount > 0 },
            { id: 'sla_pending', label: 'Pending SLA', count: pendingSlaCount },
            { id: 'won', label: 'Won', count: wonLeadsCount },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedTab(tab.id as any)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${
                selectedTab === tab.id
                  ? 'bg-zinc-900 text-zinc-50 shadow-2xs'
                  : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
              }`}
            >
              <span>{tab.label}</span>
              <span
                suppressHydrationWarning
                className={`font-mono text-[10px] px-1 py-0.2 rounded ${
                  selectedTab === tab.id ? 'bg-zinc-800 text-zinc-200' : 'bg-zinc-100 text-zinc-500'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search, Destination, View Switcher */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-56">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter leads..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-8 pr-2.5 py-1 border border-zinc-200 rounded-md bg-zinc-50/50 focus:bg-white focus:outline-none"
            />
          </div>

          <select
            value={selectedDestination}
            onChange={(e) => setSelectedDestination(e.target.value)}
            aria-label="Filter by destination"
            className="text-xs px-2 py-1 border border-zinc-200 rounded-md bg-white text-zinc-700"
          >
            <option value="ALL">Destinations</option>
            {destinations.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          <select
            value={selectedTripStatus}
            onChange={(e) => setSelectedTripStatus(e.target.value)}
            aria-label="Filter by trip lifecycle status"
            className="text-xs px-2 py-1 border border-zinc-200 rounded-md bg-white text-zinc-700 capitalize"
          >
            <option value="ALL">All Trip Statuses</option>
            <option value="planning">Planning</option>
            <option value="booked">Booked</option>
            <option value="pre_departure">Pre-Departure</option>
            <option value="on_trip">On-Trip (Live ✈️)</option>
            <option value="completed">Completed</option>
          </select>

          {/* Export CSV */}
          <button
            onClick={() => handleExportCsv()}
            title="Export filtered leads to CSV"
            aria-label="Export leads to CSV"
            className="flex items-center gap-1 px-2.5 py-1 border border-zinc-200 rounded-md text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition"
          >
            <Download className="w-3.5 h-3.5 text-zinc-500" />
            <span>Export</span>
          </button>

          {/* Table vs Kanban */}
          <div className="flex bg-zinc-100 p-0.5 rounded-md border border-zinc-200">
            <button
              onClick={() => setViewMode('table')}
              className={`p-1 rounded text-xs transition ${
                viewMode === 'table' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-500 hover:text-zinc-900'
              }`}
              title="Table View"
            >
              <TableIcon className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`p-1 rounded text-xs transition ${
                viewMode === 'kanban' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-500 hover:text-zinc-900'
              }`}
              title="Kanban Board"
            >
              <Kanban className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {viewMode === 'kanban' ? (
        <KanbanBoard filteredLeads={filteredLeads} />
      ) : (
        /* High-Density Linear-Style Data Grid */
        <div className="bg-white rounded-lg border border-zinc-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-zinc-50/70 border-b border-zinc-200 text-zinc-500 uppercase tracking-tight text-[10px] font-medium">
                  <th className="py-2 px-3 w-8 text-center">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={handleToggleSelectAll}
                      aria-label="Select all leads"
                      className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-950"
                    />
                  </th>
                  <th className="py-2 px-3 font-mono">Code</th>
                  <th className="py-2 px-3">Lead / Traveler</th>
                  <th className="py-2 px-3">Destination</th>
                  <th className="py-2 px-3">Pax & Budget</th>
                  <th className="py-2 px-3">Stage</th>
                  <th className="py-2 px-3">Trip Status</th>
                  <th className="py-2 px-3">Payment</th>
                  <th className="py-2 px-3">SLA / Follow-up</th>
                  <th className="py-2 px-3">Owner</th>
                  <th className="py-2 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 font-sans">
                {filteredLeads.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-zinc-400">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <Search className="w-5 h-5 text-zinc-300 stroke-[1.5]" />
                        <div className="text-xs font-semibold text-zinc-700">No matching inquiries found</div>
                        <p className="text-[11px] text-zinc-400 max-w-xs">
                          No leads match your current search, tab, or destination filters.
                        </p>
                        <button
                          type="button"
                          onClick={handleResetFilters}
                          className="mt-1 px-3 py-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-medium text-xs transition shadow-2xs"
                        >
                          Clear all filters & search
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredLeads.map((lead) => {
                    const agent = allProfiles.find((p) => p.id === lead.assigned_to);

                    return (
                      <tr
                        key={lead.id}
                        onClick={() => setSelectedLeadForDrawer(lead)}
                        className={`hover:bg-zinc-50/80 transition cursor-pointer group ${
                          selectedLeadIds.includes(lead.id) ? 'bg-blue-50/30' : ''
                        }`}
                      >
                        {/* Selection Checkbox */}
                        <td className="py-2 px-3 w-8 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedLeadIds.includes(lead.id)}
                            onChange={() => handleToggleSelect(lead.id)}
                            aria-label={`Select lead ${lead.lead_code}`}
                            className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-950 cursor-pointer"
                          />
                        </td>

                        {/* Lead Code */}
                        <td className="py-2 px-3 font-mono text-[11px] text-zinc-500">
                          {lead.lead_code}
                        </td>

                        {/* Customer */}
                        <td className="py-2 px-3">
                          <div className="font-medium text-zinc-900 leading-tight">
                            {lead.customer_name}
                          </div>
                          <div className="text-[10px] text-zinc-500 font-mono">
                            {lead.customer_phone}
                          </div>
                        </td>

                        {/* Destination */}
                        <td className="py-2 px-3 text-zinc-800">
                          <div className="font-medium flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-zinc-400" />
                            <span>{lead.destination}</span>
                          </div>
                          <div className="text-[10px] text-zinc-500 truncate max-w-[120px]">
                            {lead.travel_dates || `${lead.duration_days}d`}
                          </div>
                        </td>

                        {/* Pax & Budget */}
                        <td className="py-2 px-3 font-mono text-[11px] text-zinc-600">
                          <div>{lead.pax_adults}A {lead.pax_children ? `+${lead.pax_children}C` : ''}</div>
                          <div className="text-zinc-900 font-medium">{lead.budget_range || '$2k'}</div>
                        </td>

                        {/* Stage */}
                        <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                          <select
                            value={lead.stage}
                            aria-label={`Update stage for lead ${lead.lead_code}`}
                            onChange={(e) => {
                              const nextStage = e.target.value as LeadStage;
                              if (nextStage === 'won') {
                                setActiveWinLead(lead);
                              } else if (nextStage === 'lost') {
                                setActiveLostLead(lead);
                              } else {
                                updateLeadStage(lead.id, nextStage);
                              }
                            }}
                            className="text-[11px] bg-zinc-50 border border-zinc-200 rounded px-1.5 py-0.5 text-zinc-700 font-medium"
                          >
                            <option value="new">New</option>
                            <option value="contacted">Contacted</option>
                            <option value="quote_sent">Quote Sent</option>
                            <option value="in_negotiation">Negotiation</option>
                            <option value="won">Won (Closed)</option>
                            <option value="lost">Lost</option>
                          </select>
                        </td>

                        {/* Trip Status */}
                        <td className="py-2 px-3 whitespace-nowrap">
                          {(() => {
                            const status = lead.trip_status || 'planning';
                            if (status === 'on_trip') {
                              return (
                                <div className="flex items-center gap-1.5 text-[11px] text-zinc-900 font-medium">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
                                  <span>On-Trip ✈️</span>
                                </div>
                              );
                            }
                            if (status === 'pre_departure') {
                              return (
                                <div className="flex items-center gap-1.5 text-[11px] text-zinc-800">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                                  <span>Pre-Departure</span>
                                </div>
                              );
                            }
                            if (status === 'booked') {
                              return (
                                <div className="flex items-center gap-1.5 text-[11px] text-zinc-800">
                                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                                  <span>Booked</span>
                                </div>
                              );
                            }
                            if (status === 'completed') {
                              return (
                                <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 shrink-0" />
                                  <span>Completed</span>
                                </div>
                              );
                            }
                            return (
                              <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 font-mono">
                                <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 shrink-0" />
                                <span>Planning</span>
                              </div>
                            );
                          })()}
                        </td>

                        {/* Payment */}
                        <td className="py-2 px-3 whitespace-nowrap font-mono text-[11px]">
                          {(() => {
                            const totalPaid = (lead.payment_records || []).reduce((s, r) => s + r.amount, 0);
                            const pkgTotal = lead.package_sale_price || lead.won_deal_value || 0;

                            if (pkgTotal > 0 && totalPaid >= pkgTotal) {
                              return (
                                <div className="flex items-center gap-1.5 text-zinc-900 font-medium">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                  <span>Paid in Full</span>
                                </div>
                              );
                            }
                            if (totalPaid > 0) {
                              return (
                                <div>
                                  <span className="text-zinc-900 font-medium">{formatCurrency(totalPaid)}</span>
                                  {pkgTotal > 0 && (
                                    <span className="text-zinc-400 text-[10px]"> / {formatCurrency(pkgTotal)}</span>
                                  )}
                                </div>
                              );
                            }
                            return <span className="text-zinc-400">Unpaid</span>;
                          })()}
                        </td>

                        {/* SLA status */}
                        <td className="py-2 px-3">
                          <SlaBadge lead={lead} />
                        </td>

                        {/* Owner */}
                        <td className="py-2 px-3">
                          {agent ? (
                            <div className="flex items-center gap-1.5">
                              <img
                                src={agent.avatar_url}
                                alt={agent.full_name}
                                className="w-4 h-4 rounded-full object-cover"
                              />
                              <span className="text-[11px] text-zinc-700">
                                {agent.full_name.split(' ')[0]}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[11px] text-red-600 font-mono">Unassigned</span>
                          )}
                        </td>

                        {/* Quick Actions */}
                        <td className="py-2 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => setActiveWaLead(lead)}
                              aria-label={`Send WhatsApp proposal to ${lead.customer_name}`}
                              title="1-Click WhatsApp"
                              className="p-1.5 rounded text-zinc-400 hover:text-emerald-700 hover:bg-emerald-50 transition min-h-[30px] min-w-[30px] inline-flex items-center justify-center"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => setActiveLogLead(lead)}
                              aria-label={`Log call or follow-up with ${lead.customer_name}`}
                              title="Log Call / Follow-up"
                              className="p-1.5 rounded text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 transition min-h-[30px] min-w-[30px] inline-flex items-center justify-center"
                            >
                              <Phone className="w-3.5 h-3.5" />
                            </button>

                            <Link
                              href={`/leads/${lead.id}`}
                              aria-label={`Open full dossier for ${lead.customer_name}`}
                              title="Open Full Page"
                              className="p-1.5 rounded text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 transition min-h-[30px] min-w-[30px] inline-flex items-center justify-center"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Slide-over Inspection Flyout Drawer (Attio / Linear pattern) */}
      {selectedLeadForDrawer && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Inspection drawer for lead ${selectedLeadForDrawer.lead_code}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedLeadForDrawer(null);
            }
          }}
          className="fixed inset-0 z-40 flex justify-end bg-zinc-950/20 backdrop-blur-2xs animate-in fade-in duration-100"
        >
          <div className="w-full max-w-md bg-white border-l border-zinc-200 shadow-2xl h-full flex flex-col animate-in slide-in-from-right duration-150">
            {/* Drawer Header */}
            <div className="h-12 px-4 border-b border-zinc-200 flex items-center justify-between bg-zinc-50/50">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-semibold text-zinc-400">
                  {selectedLeadForDrawer.lead_code}
                </span>
                <SlaBadge lead={selectedLeadForDrawer} />
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/leads/${selectedLeadForDrawer.id}`}
                  className="text-xs text-zinc-500 hover:text-zinc-900 flex items-center gap-1"
                >
                  Full page <ExternalLink className="w-3 h-3" />
                </Link>
                <button
                  type="button"
                  onClick={() => setSelectedLeadForDrawer(null)}
                  aria-label="Close lead drawer"
                  className="p-1 text-zinc-400 hover:text-zinc-700 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Drawer Body */}
            <div className="p-4 flex-1 overflow-y-auto space-y-4 text-xs">
              <div>
                <h2 className="text-base font-semibold text-zinc-900">
                  {selectedLeadForDrawer.customer_name}
                </h2>
                <div className="text-zinc-500 font-mono text-xs mt-0.5">
                  {selectedLeadForDrawer.customer_phone} • {selectedLeadForDrawer.customer_email || 'No email'}
                </div>
              </div>

              {/* Action shortcuts */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setActiveWaLead(selectedLeadForDrawer)}
                  className="flex items-center justify-center gap-1.5 py-1.5 rounded-md border border-zinc-200 hover:bg-zinc-50 font-medium text-zinc-800"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-600" /> WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => setActiveLogLead(selectedLeadForDrawer)}
                  className="flex items-center justify-center gap-1.5 py-1.5 rounded-md bg-zinc-900 text-zinc-50 hover:bg-zinc-800 font-medium"
                >
                  <Phone className="w-3.5 h-3.5" /> Log Call
                </button>
              </div>

              {/* Stage update */}
              <div className="pt-2 border-t border-zinc-100 flex items-center justify-between gap-2">
                <span className="text-[11px] text-zinc-500 font-medium">Pipeline Stage</span>
                <select
                  value={selectedLeadForDrawer.stage}
                  aria-label="Update lead pipeline stage"
                  onChange={(e) => {
                    const nextStage = e.target.value as LeadStage;
                    if (nextStage === 'won') {
                      setActiveWinLead(selectedLeadForDrawer);
                    } else if (nextStage === 'lost') {
                      setActiveLostLead(selectedLeadForDrawer);
                    } else {
                      updateLeadStage(selectedLeadForDrawer.id, nextStage);
                      setSelectedLeadForDrawer({ ...selectedLeadForDrawer, stage: nextStage });
                    }
                  }}
                  className="text-xs bg-zinc-50 border border-zinc-200 rounded px-2 py-1 text-zinc-800 font-medium"
                >
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="quote_sent">Quote Sent</option>
                  <option value="in_negotiation">Negotiation</option>
                  <option value="won">Won (Closed)</option>
                  <option value="lost">Lost</option>
                </select>
              </div>

              {/* Trip dossier fields */}
              <div className="space-y-2 pt-2 border-t border-zinc-100">
                <div className="text-[10px] uppercase font-semibold text-zinc-400">Trip Dossier</div>
                <div className="grid grid-cols-2 gap-2 bg-zinc-50 p-2.5 rounded border border-zinc-200">
                  <div>
                    <span className="text-zinc-400 text-[10px] block">Destination</span>
                    <span className="font-semibold text-zinc-800">{selectedLeadForDrawer.destination}</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 text-[10px] block">Budget</span>
                    <span className="font-mono font-medium text-zinc-900">{selectedLeadForDrawer.budget_range || 'Flexible'}</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 text-[10px] block">Dates</span>
                    <span className="text-zinc-700">{selectedLeadForDrawer.travel_dates || 'Flexible'}</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 text-[10px] block">Travelers</span>
                    <span className="text-zinc-700">{selectedLeadForDrawer.pax_adults} Adults {selectedLeadForDrawer.pax_children ? `+ ${selectedLeadForDrawer.pax_children} Ch` : ''}</span>
                  </div>
                </div>
              </div>

              {selectedLeadForDrawer.special_notes && (
                <div className="pt-2 border-t border-zinc-100">
                  <div className="text-[10px] uppercase font-semibold text-zinc-400 mb-1">Customer Notes</div>
                  <div className="p-2.5 rounded bg-amber-50/50 border border-amber-200/60 text-zinc-700 text-xs italic">
                    "{selectedLeadForDrawer.special_notes}"
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating Bulk Operations Dock (Linear/Attio-Grade) */}
      {selectedLeadIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-zinc-950 text-white rounded-lg shadow-2xl px-4 py-2.5 flex items-center gap-3 border border-zinc-800 animate-in fade-in slide-in-from-bottom-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="font-semibold font-mono text-zinc-100">{selectedLeadIds.length} Selected</span>
          </div>

          <div className="h-4 w-px bg-zinc-800" />

          {/* Bulk Reassign */}
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-400 text-[11px]">Assign:</span>
            <select
              defaultValue=""
              aria-label="Bulk assign selected leads"
              onChange={(e) => {
                if (e.target.value) {
                  bulkAssignLeads(selectedLeadIds, e.target.value);
                  setSelectedLeadIds([]);
                }
              }}
              className="bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs rounded px-2 py-1 focus:outline-none"
            >
              <option value="" disabled>Choose Consultant...</option>
              {allProfiles.filter((p) => p.role === 'agent').map((ag) => (
                <option key={ag.id} value={ag.id}>
                  {ag.full_name}
                </option>
              ))}
            </select>
          </div>

          {/* Bulk Stage Change */}
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-400 text-[11px]">Stage:</span>
            <select
              defaultValue=""
              aria-label="Bulk change stage of selected leads"
              onChange={(e) => {
                if (e.target.value) {
                  bulkUpdateLeadStage(selectedLeadIds, e.target.value as LeadStage);
                  setSelectedLeadIds([]);
                }
              }}
              className="bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs rounded px-2 py-1 focus:outline-none"
            >
              <option value="" disabled>Move to...</option>
              <option value="new">New</option>
              <option value="contacted">Contacted</option>
              <option value="quote_sent">Quote Sent</option>
              <option value="in_negotiation">Negotiation</option>
              <option value="lost">Lost</option>
            </select>
          </div>

          <div className="h-4 w-px bg-zinc-800" />

          {/* Bulk Export Selected */}
          <button
            onClick={() => {
              const selectedList = leads.filter((l) => selectedLeadIds.includes(l.id));
              handleExportCsv(selectedList);
            }}
            className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium transition flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          {/* Deselect All */}
          <button
            onClick={() => setSelectedLeadIds([])}
            className="text-zinc-400 hover:text-white transition p-1"
            aria-label="Clear selection"
            title="Clear selection"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Modals */}
      {activeLogLead && (
        <QuickLogModal
          lead={activeLogLead}
          isOpen={!!activeLogLead}
          onClose={() => setActiveLogLead(null)}
        />
      )}

      {activeWaLead && (
        <WhatsAppModal
          lead={activeWaLead}
          isOpen={!!activeWaLead}
          onClose={() => setActiveWaLead(null)}
        />
      )}

      {activeWinLead && (
        <WinDealModal
          lead={activeWinLead}
          isOpen={!!activeWinLead}
          onClose={() => setActiveWinLead(null)}
        />
      )}

      {activeLostLead && (
        <LostDealModal
          lead={activeLostLead}
          isOpen={!!activeLostLead}
          onClose={() => setActiveLostLead(null)}
        />
      )}
    </div>
  );
}

export default function LeadsPage() {
  return (
    <Suspense fallback={<LeadsLoading />}>
      <LeadsContent />
    </Suspense>
  );
}
