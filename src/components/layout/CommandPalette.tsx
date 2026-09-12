'use client';

import React, { useState, useEffect, useRef } from 'react';
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
  RotateCcw,
} from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenNewLead?: () => void;
  onOpenCsv?: () => void;
}

export default function CommandPalette({
  isOpen,
  onClose,
  onOpenNewLead,
  onOpenCsv,
}: CommandPaletteProps) {
  const router = useRouter();
  const { allLeads, allProfiles, exportCrmBackup, resetToFactoryDefaults, currentUser } = useApp();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const canManageStorage = currentUser.role === 'admin';
  const isAgent = currentUser.role === 'agent';

  // Global shortcut listener: ⌘K or Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        }
      } else if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const q = query.trim().toLowerCase();

  // Navigation Items
  const navItems = [
    { label: 'Leads Pipeline', hint: 'View active pipeline & kanban', path: '/leads', icon: ArrowRight },
    { label: 'Follow-Up Agenda', hint: 'Today & overdue client callbacks', path: '/follow-ups', icon: CalendarClock },
    { label: 'Executive Analytics', hint: 'Conversion rates & Pareto lost debrief', path: '/analytics', icon: TrendingUp },
    { label: 'Incentives & Commissions', hint: 'Leaderboard, tiers, and payouts', path: '/incentives', icon: Award },
    { label: 'Consultants & Roster', hint: 'Capacity, workloads, and dossiers', path: '/team', icon: Users },
    { label: 'My Profile & Workload', hint: 'Personal tags & auto-assignment settings', path: '/profile', icon: User },
    ...(!isAgent ? [
      { label: 'SLA & Webhook Settings', hint: 'FRT thresholds and routing engine', path: '/settings', icon: Settings },
    ] : []),
    { label: 'WhatsApp Proposal Templates', hint: 'Pre-written templates for 1-click wa.me', path: '/templates', icon: MessageSquareQuote },
    ...(!isAgent ? [
      { label: 'Data & Backup Center', hint: 'Export JSON snapshots, restore, or reset demo data', path: '/settings?tab=storage', icon: Database },
    ] : []),
  ].filter((item) => !q || item.label.toLowerCase().includes(q) || item.hint.toLowerCase().includes(q));

  // Matching Leads (max 6)
  const matchingLeads = allLeads
    .filter((l) => {
      if (!q) return false;
      return (
        l.customer_name.toLowerCase().includes(q) ||
        l.lead_code.toLowerCase().includes(q) ||
        l.destination.toLowerCase().includes(q) ||
        l.customer_phone.includes(q)
      );
    })
    .slice(0, 6);

  // Matching Team Members (max 4)
  const matchingAgents = allProfiles
    .filter((p) => {
      if (!q) return false;
      return (
        p.full_name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        p.destination_tags.some((t) => t.toLowerCase().includes(q))
      );
    })
    .slice(0, 4);

  // Quick Action Items
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
      label: 'Export Pipeline Leads (CSV)',
      hint: 'Download all leads as CSV spreadsheet',
      action: () => {
        onClose();
        exportToCsv(
          `wanderlust_leads_${new Date().toISOString().slice(0, 10)}`,
          allLeads,
          [
            { header: 'Lead Code', accessor: (l) => l.lead_code },
            { header: 'Traveler Name', accessor: (l) => l.customer_name },
            { header: 'Phone', accessor: (l) => l.customer_phone },
            { header: 'Email', accessor: (l) => l.customer_email || '' },
            { header: 'Destination', accessor: (l) => l.destination },
            { header: 'Stage', accessor: (l) => l.stage },
            { header: 'Budget Range', accessor: (l) => l.budget_range || '' },
            { header: 'Package Sale Price', accessor: (l) => l.package_sale_price || 0 },
            { header: 'Vendor Net Cost', accessor: (l) => l.vendor_net_cost || 0 },
            { header: 'Gross Profit', accessor: (l) => l.gross_profit || 0 },
            { header: 'Source', accessor: (l) => l.source },
            { header: 'Created At', accessor: (l) => l.created_at },
          ]
        );
      },
      icon: Download,
    },
    // Admin-only: CRM Backup & Reset
    ...(canManageStorage ? [
      {
        label: 'Download Full CRM Backup (JSON)',
        hint: 'Export complete client data snapshot',
        action: () => {
          onClose();
          exportCrmBackup();
        },
        icon: Database,
      },
      {
        label: 'Reset CRM to Factory Demo Data',
        hint: 'Revert all leads and settings to seed dataset',
        action: () => {
          onClose();
          if (
            typeof window !== 'undefined' &&
            window.confirm('Are you sure you want to reset all CRM data to factory defaults?')
          ) {
            resetToFactoryDefaults();
          }
        },
        icon: RotateCcw,
      },
    ] : []),
  ].filter((item) => !q || item.label.toLowerCase().includes(q) || (item.hint && item.hint.toLowerCase().includes(q)));

  const totalItemsCount =
    navItems.length + matchingLeads.length + matchingAgents.length + actionItems.length;

  const handleSelectNav = (path: string) => {
    onClose();
    router.push(path);
  };

  const handleSelectLead = (id: string) => {
    onClose();
    router.push(`/leads/${id}`);
  };

  const handleSelectAgent = (id: string) => {
    onClose();
    router.push(`/team/${id}`);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search pipeline and actions"
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-zinc-950/40 backdrop-blur-2xs p-4 animate-in fade-in duration-100"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-white rounded-lg border border-zinc-200 shadow-2xl overflow-hidden flex flex-col max-h-[70vh] animate-in zoom-in-95 duration-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="h-11 px-3.5 border-b border-zinc-200 flex items-center gap-2.5 bg-zinc-50/50">
          <Search className="w-4 h-4 text-zinc-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search leads, consultants, pages, or actions..."
            aria-label="Search leads, consultants, pages, or actions"
            className="flex-1 bg-transparent text-xs text-zinc-900 placeholder-zinc-400 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search query"
              className="text-zinc-400 hover:text-zinc-600 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-white border border-zinc-200 rounded text-zinc-500 shadow-2xs">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="p-2 overflow-y-auto space-y-3 text-xs">
          {/* Quick Actions (if query matches or empty) */}
          {actionItems.length > 0 && (
            <div>
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-tight text-zinc-400">
                Actions
              </div>
              <div className="space-y-0.5">
                {actionItems.map((act) => (
                  <button
                    key={act.label}
                    onClick={act.action}
                    className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-zinc-100 flex items-center justify-between text-zinc-800 transition group"
                  >
                    <div className="flex items-center gap-2">
                      <act.icon className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-900" />
                      <span className="font-medium text-zinc-900">{act.label}</span>
                    </div>
                    <span className="text-[11px] text-zinc-400">{act.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Matching Leads */}
          {matchingLeads.length > 0 && (
            <div>
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-tight text-zinc-400 flex items-center justify-between">
                <span>Matching Leads</span>
                <span className="font-mono text-[10px] text-zinc-400">{matchingLeads.length} found</span>
              </div>
              <div className="space-y-0.5">
                {matchingLeads.map((lead) => (
                  <button
                    key={lead.id}
                    onClick={() => handleSelectLead(lead.id)}
                    className="w-full text-left px-2.5 py-2 rounded-md hover:bg-zinc-100 flex items-center justify-between transition group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-[11px] text-zinc-400 group-hover:text-zinc-600">
                        {lead.lead_code}
                      </span>
                      <span className="font-medium text-zinc-900 truncate">
                        {lead.customer_name}
                      </span>
                      <span className="text-[11px] text-zinc-500 flex items-center gap-0.5 font-mono">
                        <MapPin className="w-2.5 h-2.5 text-zinc-400" /> {lead.destination}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="font-mono text-[10px] uppercase px-1.5 py-0.2 rounded bg-zinc-100 text-zinc-700 border border-zinc-200">
                        {lead.stage.replace('_', ' ')}
                      </span>
                      <span className="font-mono text-[11px] font-medium text-zinc-800">
                        {lead.budget_range || '$2k'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Matching Consultants */}
          {matchingAgents.length > 0 && (
            <div>
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-tight text-zinc-400">
                Consultants
              </div>
              <div className="space-y-0.5">
                {matchingAgents.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => handleSelectAgent(agent.id)}
                    className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-zinc-100 flex items-center justify-between transition group"
                  >
                    <div className="flex items-center gap-2">
                      <img
                        src={agent.avatar_url}
                        alt={agent.full_name}
                        className="w-5 h-5 rounded-full object-cover border border-zinc-200"
                      />
                      <span className="font-medium text-zinc-900">{agent.full_name}</span>
                      <span className="text-[10px] font-mono text-zinc-400">
                        ({agent.destination_tags.slice(0, 2).join(', ')})
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-zinc-500">
                      {agent.current_load}/{agent.max_capacity} load
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Navigation Pages */}
          {navItems.length > 0 && (
            <div>
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-tight text-zinc-400">
                Navigation
              </div>
              <div className="space-y-0.5">
                {navItems.map((item) => (
                  <button
                    key={item.path}
                    onClick={() => handleSelectNav(item.path)}
                    className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-zinc-100 flex items-center justify-between text-zinc-800 transition group"
                  >
                    <div className="flex items-center gap-2">
                      <item.icon className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-800" />
                      <span className="font-medium text-zinc-900">{item.label}</span>
                    </div>
                    <span className="text-[11px] text-zinc-400 group-hover:text-zinc-500">
                      {item.hint}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {totalItemsCount === 0 && (
            <div className="py-8 text-center text-xs text-zinc-400 font-mono">
              No results matching "{query}"
            </div>
          )}
        </div>

        {/* Command Palette Footer */}
        <div className="h-8 px-3 border-t border-zinc-100 bg-zinc-50 flex items-center justify-between text-[11px] text-zinc-400 font-mono">
          <div className="flex items-center gap-3">
            <span>Click or press ESC to close</span>
          </div>
          <span>Travel LMS Command Palette</span>
        </div>
      </div>
    </div>
  );
}
