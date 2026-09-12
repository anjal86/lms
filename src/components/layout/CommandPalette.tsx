'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/store';
import { exportToCsv } from '@/lib/export-csv';
import {
  Search,
  ArrowRight,
  User,
  Users,
  CalendarClock,
  TrendingUp,
  Award,
  Settings,
  MessageSquareQuote,
  Plus,
  FileSpreadsheet,
  MapPin,
  X,
  Download,
  Database,
  LoaderCircle,
} from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenNewLead?: () => void;
  onOpenCsv?: () => void;
}

type SearchResult = {
  kind: 'lead' | 'profile';
  id: string;
  title: string;
  subtitle: string;
  meta: Record<string, unknown>;
};

export default function CommandPalette({
  isOpen,
  onClose,
  onOpenNewLead,
  onOpenCsv,
}: CommandPaletteProps) {
  const router = useRouter();
  const { allLeads, exportCrmBackup, currentUser } = useApp();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const canManageStorage = currentUser.role === 'admin';
  const isAgent = currentUser.role === 'agent';

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (isOpen) onClose();
      } else if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSearchResults([]);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!isOpen || trimmed.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('Search request failed');
        const payload = (await response.json()) as { results?: SearchResult[] };
        setSearchResults(payload.results || []);
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('Command palette search failed:', error);
          setSearchResults([]);
        }
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [isOpen, query]);

  if (!isOpen) return null;

  const q = query.trim().toLowerCase();
  const navItems = [
    { label: 'Action Center', hint: 'Operational exceptions that need attention', path: '/dashboard', icon: ArrowRight },
    { label: 'Leads Pipeline', hint: 'View active pipeline & kanban', path: '/leads', icon: ArrowRight },
    { label: 'Follow-Up Agenda', hint: 'Today & overdue client callbacks', path: '/follow-ups', icon: CalendarClock },
    { label: 'Executive Analytics', hint: 'Conversion rates & performance', path: '/analytics', icon: TrendingUp },
    { label: 'Incentives & Commissions', hint: 'Leaderboard, tiers, and payouts', path: '/incentives', icon: Award },
    { label: 'Consultants & Roster', hint: 'Capacity, workloads, and dossiers', path: '/team', icon: Users },
    { label: 'My Profile & Workload', hint: 'Personal tags & auto-assignment settings', path: '/profile', icon: User },
    ...(!isAgent ? [{ label: 'SLA & Webhook Settings', hint: 'FRT thresholds and routing engine', path: '/settings', icon: Settings }] : []),
    { label: 'WhatsApp Proposal Templates', hint: 'Reusable client-message templates', path: '/templates', icon: MessageSquareQuote },
    ...(!isAgent ? [{ label: 'Data Export Center', hint: 'Export controlled CRM snapshots', path: '/settings?tab=storage', icon: Database }] : []),
  ].filter((item) => !q || item.label.toLowerCase().includes(q) || item.hint.toLowerCase().includes(q));

  const matchingLeads = searchResults.filter((result) => result.kind === 'lead').slice(0, 6);
  const matchingAgents = searchResults.filter((result) => result.kind === 'profile').slice(0, 4);

  const actionItems = [
    {
      label: 'Create New Lead',
      hint: 'Manual intake form',
      action: () => {
        onClose();
        onOpenNewLead?.();
      },
      icon: Plus,
    },
    {
      label: 'Import CSV Leads',
      hint: 'Bulk upload leads',
      action: () => {
        onClose();
        onOpenCsv?.();
      },
      icon: FileSpreadsheet,
    },
    {
      label: 'Export Visible Pipeline (CSV)',
      hint: 'Download your RLS-visible lead set',
      action: () => {
        onClose();
        exportToCsv(
          `wanderlust_leads_${new Date().toISOString().slice(0, 10)}`,
          allLeads,
          [
            { header: 'Lead Code', accessor: (lead) => lead.lead_code },
            { header: 'Traveler Name', accessor: (lead) => lead.customer_name },
            { header: 'Phone', accessor: (lead) => lead.customer_phone },
            { header: 'Email', accessor: (lead) => lead.customer_email || '' },
            { header: 'Destination', accessor: (lead) => lead.destination },
            { header: 'Stage', accessor: (lead) => lead.stage },
            { header: 'Budget Range', accessor: (lead) => lead.budget_range || '' },
            { header: 'Package Sale Price', accessor: (lead) => lead.package_sale_price || 0 },
            { header: 'Vendor Net Cost', accessor: (lead) => lead.vendor_net_cost || 0 },
            { header: 'Gross Profit', accessor: (lead) => lead.gross_profit || 0 },
            { header: 'Source', accessor: (lead) => lead.source },
            { header: 'Created At', accessor: (lead) => lead.created_at },
          ]
        );
      },
      icon: Download,
    },
    ...(canManageStorage
      ? [{
          label: 'Download CRM Snapshot (JSON)',
          hint: 'Admin-only export; restore remains server-controlled',
          action: () => {
            onClose();
            exportCrmBackup();
          },
          icon: Database,
        }]
      : []),
  ].filter((item) => !q || item.label.toLowerCase().includes(q) || item.hint.toLowerCase().includes(q));

  const totalItemsCount = navItems.length + matchingLeads.length + matchingAgents.length + actionItems.length;

  const navigate = (path: string) => {
    onClose();
    router.push(path);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search pipeline and actions"
      className="fixed inset-0 z-50 flex items-start justify-center bg-zinc-950/40 p-4 pt-20 backdrop-blur-2xs animate-in fade-in duration-100"
      onClick={onClose}
    >
      <div
        className="flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-2xl animate-in zoom-in-95 duration-100"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex h-11 items-center gap-2.5 border-b border-zinc-200 bg-zinc-50/50 px-3.5">
          {isSearching ? <LoaderCircle className="h-4 w-4 animate-spin text-zinc-400" /> : <Search className="h-4 w-4 text-zinc-400" />}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search leads, consultants, pages, or actions..."
            aria-label="Search leads, consultants, pages, or actions"
            className="flex-1 bg-transparent text-xs text-zinc-900 placeholder-zinc-400 focus:outline-none"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear search query" className="p-0.5 text-zinc-400 hover:text-zinc-600">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <kbd className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 shadow-2xs">ESC</kbd>
        </div>

        <div className="space-y-3 overflow-y-auto p-2 text-xs">
          {actionItems.length > 0 && (
            <section>
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-tight text-zinc-400">Actions</div>
              <div className="space-y-0.5">
                {actionItems.map((item) => (
                  <button key={item.label} onClick={item.action} className="group flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-zinc-800 transition hover:bg-zinc-100">
                    <div className="flex items-center gap-2">
                      <item.icon className="h-3.5 w-3.5 text-zinc-500 group-hover:text-zinc-900" />
                      <span className="font-medium text-zinc-900">{item.label}</span>
                    </div>
                    <span className="text-[11px] text-zinc-400">{item.hint}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {matchingLeads.length > 0 && (
            <section>
              <div className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold uppercase tracking-tight text-zinc-400">
                <span>Matching Leads</span>
                <span className="font-mono">{matchingLeads.length} found</span>
              </div>
              <div className="space-y-0.5">
                {matchingLeads.map((lead) => (
                  <button key={lead.id} onClick={() => navigate(`/leads/${lead.id}`)} className="group flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left transition hover:bg-zinc-100">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-zinc-900">{lead.title}</span>
                        {lead.meta.possible_duplicate === true && <span className="rounded bg-amber-50 px-1 py-0.5 text-[9px] font-medium text-amber-700">Possible duplicate</span>}
                      </div>
                      <span className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-zinc-500">
                        <MapPin className="h-2.5 w-2.5" /> {lead.subtitle}
                      </span>
                    </div>
                    <span className="ml-3 flex-none rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] uppercase text-zinc-600">
                      {String(lead.meta.stage || 'lead').replace('_', ' ')}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {matchingAgents.length > 0 && (
            <section>
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-tight text-zinc-400">Consultants</div>
              <div className="space-y-0.5">
                {matchingAgents.map((agent) => (
                  <button key={agent.id} onClick={() => navigate(`/team/${agent.id}`)} className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left transition hover:bg-zinc-100">
                    <div className="flex min-w-0 items-center gap-2">
                      <User className="h-3.5 w-3.5 flex-none text-zinc-400" />
                      <div className="min-w-0">
                        <span className="block truncate font-medium text-zinc-900">{agent.title}</span>
                        <span className="block truncate text-[10px] text-zinc-400">{agent.subtitle}</span>
                      </div>
                    </div>
                    <span className="ml-3 flex-none font-mono text-[10px] text-zinc-500">
                      {Number(agent.meta.current_load || 0)}/{Number(agent.meta.max_capacity || 0)} load
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {navItems.length > 0 && (
            <section>
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-tight text-zinc-400">Navigation</div>
              <div className="space-y-0.5">
                {navItems.map((item) => (
                  <button key={item.path} onClick={() => navigate(item.path)} className="group flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-zinc-800 transition hover:bg-zinc-100">
                    <div className="flex items-center gap-2">
                      <item.icon className="h-3.5 w-3.5 text-zinc-400 group-hover:text-zinc-800" />
                      <span className="font-medium text-zinc-900">{item.label}</span>
                    </div>
                    <span className="text-[11px] text-zinc-400">{item.hint}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {q.length >= 2 && !isSearching && matchingLeads.length === 0 && matchingAgents.length === 0 && actionItems.length === 0 && navItems.length === 0 && (
            <div className="py-8 text-center font-mono text-xs text-zinc-400">No results matching “{query}”</div>
          )}
          {totalItemsCount === 0 && q.length < 2 && (
            <div className="py-8 text-center text-xs text-zinc-400">Type at least 2 characters to search CRM records.</div>
          )}
        </div>

        <div className="flex h-8 items-center justify-between border-t border-zinc-100 bg-zinc-50 px-3 font-mono text-[11px] text-zinc-400">
          <span>CRM records are searched server-side with your access rules.</span>
          <span>ESC to close</span>
        </div>
      </div>
    </div>
  );
}
