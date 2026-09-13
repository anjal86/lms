'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/store';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';
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
  MessageSquare,
  Plus,
  FileSpreadsheet,
  X,
  Download,
  Database,
  LoaderCircle,
  ListChecks,
  LayoutDashboard,
  PlugZap,
  Zap,
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

export default function CommandPalette({ isOpen, onClose, onOpenNewLead, onOpenCsv }: CommandPaletteProps) {
  const router = useRouter();
  const { allLeads, exportCrmBackup, currentUser } = useApp();
  const { config, term, moduleEnabled } = useWorkspace();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isAgent = currentUser.role === 'agent';
  const canManageStorage = currentUser.role === 'admin';
  const canManage = currentUser.role === 'admin' || currentUser.role === 'manager';
  const isTravel = config.workspace.business_type === 'travel';
  const leadsEnabled = moduleEnabled('leads', true);
  const inboxEnabled = moduleEnabled('inbox', true);
  const tasksEnabled = moduleEnabled('tasks', true);
  const leadLabel = term('lead', 'Lead');
  const leadPlural = term('lead_plural', 'Leads');
  const contactLabel = term('contact', 'Contact');
  const contactPlural = term('contact_plural', 'Contacts');

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
    if (!isOpen) return;
    const resetTimer = window.setTimeout(() => {
      setQuery('');
      setSearchResults([]);
      setIsSearching(false);
    }, 0);
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => {
      window.clearTimeout(resetTimer);
      window.clearTimeout(focusTimer);
    };
  }, [isOpen]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!isOpen || trimmed.length < 2) {
      const resetTimer = window.setTimeout(() => {
        setSearchResults([]);
        setIsSearching(false);
      }, 0);
      return () => window.clearTimeout(resetTimer);
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('Search request failed');
        const payload = (await response.json()) as { results?: SearchResult[] };
        setSearchResults(payload.results || []);
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('Search failed:', error);
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

  const agentNavItems = [
    { label: 'Today', hint: 'See what needs attention', path: '/dashboard', icon: LayoutDashboard },
    ...(inboxEnabled ? [
      { label: 'Inbox', hint: 'Omnichannel customer conversations and work queues', path: '/inbox', icon: MessageSquare },
      { label: contactPlural, hint: 'Customer identity, channels and lifecycle', path: '/contacts', icon: Users },
    ] : []),
    ...(leadsEnabled ? [{ label: 'My Work', hint: `Your active ${leadPlural.toLowerCase()}`, path: '/my-work', icon: ListChecks }] : []),
    ...(tasksEnabled ? [{ label: 'Follow-ups', hint: `${contactLabel}s to contact again`, path: '/my-follow-ups', icon: CalendarClock }] : []),
    { label: 'Messages', hint: 'Saved message templates', path: '/templates', icon: MessageSquareQuote },
    { label: 'My Profile', hint: 'Your profile and work status', path: '/profile', icon: User },
  ];

  const managementNavItems = [
    { label: 'Today', hint: 'See what needs attention', path: '/dashboard', icon: LayoutDashboard },
    ...(inboxEnabled ? [
      { label: 'Inbox', hint: 'Omnichannel customer conversations and work queues', path: '/inbox', icon: MessageSquare },
      { label: contactPlural, hint: 'Customer identity, channels and lifecycle', path: '/contacts', icon: Users },
      { label: 'Automations', hint: 'Routing and multi-step Inbox workflows', path: '/settings/automations', icon: Zap },
    ] : []),
    ...(leadsEnabled ? [{ label: `All ${leadPlural}`, hint: `View every ${leadLabel.toLowerCase()} in one configured pipeline`, path: '/leads', icon: ArrowRight }] : []),
    { label: 'Connections', hint: 'Connect Facebook, Instagram, WhatsApp, TikTok, email and forms', path: '/connections', icon: PlugZap },
    ...(tasksEnabled ? [{ label: 'Follow-ups', hint: 'Upcoming and overdue follow-ups', path: '/follow-ups', icon: CalendarClock }] : []),
    { label: 'Team', hint: 'People, assignments and workloads', path: '/team', icon: Users },
    { label: 'Performance', hint: 'Team results and trends', path: '/analytics', icon: TrendingUp },
    { label: 'Incentives', hint: 'Targets, tiers and payouts', path: '/incentives', icon: Award },
    { label: 'Messages', hint: 'Saved message templates', path: '/templates', icon: MessageSquareQuote },
    { label: 'My Profile', hint: 'Your profile and work status', path: '/profile', icon: User },
    { label: 'Business Setup', hint: 'Fields, pipeline, modules and terminology', path: '/settings/business', icon: Settings },
    { label: 'Settings', hint: 'Routing, timing and workspace settings', path: '/settings', icon: Settings },
  ];

  const navItems = (isAgent ? agentNavItems : managementNavItems).filter((item) => !q || item.label.toLowerCase().includes(q) || item.hint.toLowerCase().includes(q));
  const matchingLeads = leadsEnabled ? searchResults.filter((result) => result.kind === 'lead').slice(0, 6) : [];
  const matchingAgents = isAgent ? [] : searchResults.filter((result) => result.kind === 'profile').slice(0, 4);

  const basicActions = leadsEnabled
    ? [{ label: `Add ${leadLabel}`, hint: `Create a new ${leadLabel.toLowerCase()}`, action: () => { onClose(); onOpenNewLead?.(); }, icon: Plus }]
    : [];
  const managementActions = [
    ...(inboxEnabled ? [
      { label: 'Open unassigned Inbox', hint: 'Work conversations that still need an owner', action: () => { onClose(); router.push('/inbox?view=unassigned'); }, icon: MessageSquare },
      { label: 'Open SLA overdue', hint: 'See conversations that missed first response SLA', action: () => { onClose(); router.push('/inbox?view=sla_overdue'); }, icon: Zap },
    ] : []),
    { label: 'Connect a lead source', hint: 'Open omnichannel connections', action: () => { onClose(); router.push('/connections'); }, icon: PlugZap },
    ...(leadsEnabled && isTravel ? [{ label: `Import ${leadPlural}`, hint: 'Upload a Travel CSV file', action: () => { onClose(); onOpenCsv?.(); }, icon: FileSpreadsheet }] : []),
    ...(leadsEnabled ? [{
      label: `Export ${leadPlural}`,
      hint: 'Download CRM records as CSV',
      action: () => {
        onClose();
        const dynamicColumns = config.fields
          .filter((field) => field.entity_type === 'lead' && field.is_active)
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((field) => ({
            header: field.label,
            accessor: (lead: (typeof allLeads)[number]) => {
              const value = lead.custom_data?.[field.field_key];
              if (Array.isArray(value)) return value.join(' | ');
              if (typeof value === 'boolean') return value ? 'Yes' : 'No';
              return value == null ? '' : String(value);
            },
          }));
        exportToCsv(`${config.workspace.slug}_${leadPlural.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}`, allLeads, [
          { header: 'Record Code', accessor: (lead) => lead.lead_code },
          { header: contactLabel, accessor: (lead) => lead.customer_name },
          { header: 'Phone', accessor: (lead) => lead.customer_phone },
          { header: 'Email', accessor: (lead) => lead.customer_email || '' },
          { header: 'City', accessor: (lead) => lead.customer_city || '' },
          { header: 'Country', accessor: (lead) => lead.customer_country || '' },
          ...dynamicColumns,
          { header: 'Stage', accessor: (lead) => lead.stage },
          { header: 'Priority', accessor: (lead) => lead.priority },
          { header: 'Source', accessor: (lead) => lead.source },
          { header: 'Created At', accessor: (lead) => lead.created_at },
        ]);
      },
      icon: Download,
    }] : []),
  ];
  const adminActions = canManageStorage ? [{ label: 'Download backup', hint: 'Download a JSON snapshot', action: () => { onClose(); exportCrmBackup(); }, icon: Database }] : [];
  const actionItems = [...basicActions, ...(canManage ? managementActions : []), ...adminActions].filter((item) => !q || item.label.toLowerCase().includes(q) || item.hint.toLowerCase().includes(q));
  const totalItemsCount = navItems.length + matchingLeads.length + matchingAgents.length + actionItems.length;

  const navigate = (path: string) => { onClose(); router.push(path); };
  const leadPath = (leadId: string) => isAgent ? `/my-work/${leadId}` : `/leads/${leadId}/workspace`;

  return (
    <div role="dialog" aria-modal="true" aria-label={`Search ${leadPlural.toLowerCase()} and pages`} className="fixed inset-0 z-50 flex items-start justify-center bg-zinc-950/40 p-4 pt-20 backdrop-blur-2xs animate-in fade-in duration-100" onClick={onClose}>
      <div className="flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-2xl animate-in zoom-in-95 duration-100" onClick={(event) => event.stopPropagation()}>
        <div className="flex h-12 items-center gap-2.5 border-b border-zinc-200 bg-zinc-50/50 px-4">
          {isSearching ? <LoaderCircle className="h-4 w-4 animate-spin text-zinc-400" /> : <Search className="h-4 w-4 text-zinc-400" />}
          <input ref={inputRef} type="text" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isAgent ? `Search my ${leadPlural.toLowerCase()} or pages…` : `Search ${leadPlural.toLowerCase()}, team or pages…`} aria-label={`Search ${leadPlural.toLowerCase()} and pages`} className="flex-1 bg-transparent text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none" />
          {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="p-1 text-zinc-400 hover:text-zinc-600"><X className="h-4 w-4" /></button>}
          <kbd className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">ESC</kbd>
        </div>

        <div className="space-y-3 overflow-y-auto p-2 text-xs">
          {actionItems.length > 0 && <section><div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Quick actions</div><div className="space-y-0.5">{actionItems.map((item) => <button key={item.label} onClick={item.action} className="group flex min-h-10 w-full items-center justify-between rounded-md px-3 text-left text-zinc-800 transition hover:bg-zinc-100"><div className="flex items-center gap-2.5"><item.icon className="h-4 w-4 text-zinc-500 group-hover:text-zinc-900" /><span className="font-medium text-zinc-900">{item.label}</span></div><span className="hidden text-[11px] text-zinc-400 sm:block">{item.hint}</span></button>)}</div></section>}

          {matchingLeads.length > 0 && <section><div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{leadPlural}</div><div className="space-y-0.5">{matchingLeads.map((lead) => <button key={lead.id} onClick={() => navigate(leadPath(lead.id))} className="group flex min-h-12 w-full items-center justify-between rounded-md px-3 text-left transition hover:bg-zinc-100"><div className="min-w-0"><div className="flex items-center gap-2"><span className="truncate text-sm font-medium text-zinc-900">{lead.title}</span>{!isAgent && lead.meta.possible_duplicate === true && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-700">Possible duplicate</span>}</div><span className="mt-0.5 block truncate text-[11px] text-zinc-500">{lead.subtitle}</span></div>{!isAgent && <span className="ml-3 flex-none rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] capitalize text-zinc-600">{String(lead.meta.stage || leadLabel).replaceAll('_', ' ')}</span>}</button>)}</div></section>}

          {matchingAgents.length > 0 && <section><div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Team</div><div className="space-y-0.5">{matchingAgents.map((agent) => <button key={agent.id} onClick={() => navigate(`/team/${agent.id}`)} className="flex min-h-11 w-full items-center justify-between rounded-md px-3 text-left transition hover:bg-zinc-100"><div className="flex min-w-0 items-center gap-2.5"><User className="h-4 w-4 flex-none text-zinc-400" /><div className="min-w-0"><span className="block truncate font-medium text-zinc-900">{agent.title}</span><span className="block truncate text-[10px] text-zinc-400">{agent.subtitle}</span></div></div></button>)}</div></section>}

          {navItems.length > 0 && <section><div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Pages</div><div className="space-y-0.5">{navItems.map((item) => <button key={item.path} onClick={() => navigate(item.path)} className="group flex min-h-10 w-full items-center justify-between rounded-md px-3 text-left text-zinc-800 transition hover:bg-zinc-100"><div className="flex items-center gap-2.5"><item.icon className="h-4 w-4 text-zinc-400 group-hover:text-zinc-800" /><span className="font-medium text-zinc-900">{item.label}</span></div><span className="hidden text-[11px] text-zinc-400 sm:block">{item.hint}</span></button>)}</div></section>}

          {q.length >= 2 && !isSearching && matchingLeads.length === 0 && matchingAgents.length === 0 && actionItems.length === 0 && navItems.length === 0 && <div className="py-8 text-center text-sm text-zinc-400">No results for “{query}”</div>}
          {totalItemsCount === 0 && q.length < 2 && <div className="py-8 text-center text-sm text-zinc-400">Type at least 2 characters to search.</div>}
        </div>

        <div className="flex min-h-9 items-center justify-between border-t border-zinc-100 bg-zinc-50 px-3 text-[11px] text-zinc-400"><span>{isAgent ? 'Search only shows work you can access.' : 'Search respects your access.'}</span><span>ESC to close</span></div>
      </div>
    </div>
  );
}
