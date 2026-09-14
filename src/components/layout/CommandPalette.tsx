'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  Database,
  Download,
  FileSpreadsheet,
  Inbox,
  LayoutDashboard,
  ListFilter,
  ListChecks,
  LoaderCircle,
  MessageSquareQuote,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  User,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { useApp } from '@/lib/store';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';
import { useWorkspacePermissions } from '@/lib/use-workspace-permissions';
import { exportToCsv } from '@/lib/export-csv';

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

type PaletteItem = { label: string; hint: string; icon: typeof Search; action: () => void };

export default function CommandPalette({ isOpen, onClose, onOpenNewLead, onOpenCsv }: CommandPaletteProps) {
  const router = useRouter();
  const { allLeads, exportCrmBackup, currentUser } = useApp();
  const { config, term, moduleEnabled } = useWorkspace();
  const { can } = useWorkspacePermissions();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isAgent = currentUser.role === 'agent';
  const isTravel = config.workspace.business_type === 'travel';
  const leadsEnabled = moduleEnabled('leads', true);
  const inboxEnabled = moduleEnabled('inbox', true);
  const tasksEnabled = moduleEnabled('tasks', true);
  const leadLabel = term('lead', 'Lead');
  const leadPlural = term('lead_plural', 'Leads');
  const contactPlural = term('contact_plural', 'Contacts');

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => {
      setQuery('');
      setResults([]);
      inputRef.current?.focus();
    }, 30);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || query.trim().length < 2) {
      const timer = window.setTimeout(() => setResults([]), 0);
      return () => window.clearTimeout(timer);
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('Search failed');
        const payload = await response.json() as { results?: SearchResult[] };
        setResults(payload.results || []);
      } catch (error) {
        if (!controller.signal.aborted) console.error('Command search failed:', error);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 180);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [isOpen, query]);

  if (!isOpen) return null;

  const navigate = (path: string) => { onClose(); router.push(path); };
  const pageItems: PaletteItem[] = [
    { label: 'Today', hint: 'Urgent work and exceptions', icon: LayoutDashboard, action: () => navigate('/dashboard') },
    ...(inboxEnabled && can('inbox.view') ? [{ label: 'Inbox', hint: 'Customer conversations', icon: Inbox, action: () => navigate('/inbox') }] : []),
    ...(inboxEnabled && can('contacts.view') ? [{ label: contactPlural, hint: 'Customer identities and lifecycle', icon: Users, action: () => navigate('/contacts') }] : []),
    ...(leadsEnabled ? [{ label: isAgent ? 'My Work' : `All ${leadPlural}`, hint: 'CRM pipeline', icon: ListChecks, action: () => navigate(isAgent ? '/my-work' : '/leads') }] : []),
    ...(tasksEnabled ? [{ label: 'Follow-ups', hint: 'Due and scheduled work', icon: CalendarClock, action: () => navigate(isAgent ? '/my-follow-ups' : '/follow-ups') }] : []),
    { label: 'Messages', hint: 'Saved response templates', icon: MessageSquareQuote, action: () => navigate('/templates') },
    ...(can('reports.view') ? [{ label: 'Conversation Ops', hint: 'Response, resolution and SLA analytics', icon: BarChart3, action: () => navigate('/analytics/conversations') }] : []),
    ...(can('inbox.saved_views.manage') ? [{ label: 'Saved Inboxes', hint: 'Reusable Inbox filters', icon: ListFilter, action: () => navigate('/inbox/views') }] : []),
    ...(can('automations.view') ? [{ label: 'Automations', hint: 'Routing and workflow rules', icon: Zap, action: () => navigate('/settings/automations') }] : []),
    ...(can('permissions.view') ? [{ label: 'Permissions', hint: 'Role capability matrix', icon: ShieldCheck, action: () => navigate('/settings/permissions') }] : []),
    ...(!isAgent ? [{ label: 'Service Levels', hint: 'Conversation SLA and recovery rules', icon: Sparkles, action: () => navigate('/settings/service-levels') }] : []),
    ...(!isAgent ? [{ label: 'Settings', hint: 'Workspace configuration', icon: Settings, action: () => navigate('/settings') }] : []),
    { label: 'My Profile', hint: 'Status and account', icon: User, action: () => navigate('/profile') },
  ];

  const actions: PaletteItem[] = [
    ...(leadsEnabled ? [{ label: `Add ${leadLabel}`, hint: `Create a new ${leadLabel.toLowerCase()}`, icon: Plus, action: () => { onClose(); onOpenNewLead?.(); } }] : []),
    ...(inboxEnabled && can('inbox.view') ? [
      { label: 'Open unassigned Inbox', hint: 'Conversations without an owner', icon: Inbox, action: () => navigate('/inbox?view=unassigned') },
      { label: 'Open SLA overdue', hint: 'Customers waiting past SLA', icon: Sparkles, action: () => navigate('/inbox?view=sla_overdue') },
    ] : []),
    ...(leadsEnabled && isTravel && !isAgent ? [{ label: `Import ${leadPlural}`, hint: 'Upload a Travel CSV', icon: FileSpreadsheet, action: () => { onClose(); onOpenCsv?.(); } }] : []),
    ...(leadsEnabled && !isAgent ? [{
      label: `Export ${leadPlural}`,
      hint: 'Download visible CRM records',
      icon: Download,
      action: () => {
        onClose();
        exportToCsv(`${config.workspace.slug}_${leadPlural.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}`, allLeads, [
          { header: 'Record Code', accessor: (lead) => lead.lead_code },
          { header: 'Name', accessor: (lead) => lead.customer_name },
          { header: 'Phone', accessor: (lead) => lead.customer_phone },
          { header: 'Email', accessor: (lead) => lead.customer_email || '' },
          { header: 'Stage', accessor: (lead) => lead.stage },
          { header: 'Priority', accessor: (lead) => lead.priority },
          { header: 'Created At', accessor: (lead) => lead.created_at },
        ]);
      },
    }] : []),
    ...(currentUser.role === 'admin' ? [{ label: 'Download backup', hint: 'Export a JSON snapshot', icon: Database, action: () => { onClose(); exportCrmBackup(); } }] : []),
  ];

  const q = query.trim().toLowerCase();
  const visiblePages = pageItems.filter((item) => !q || item.label.toLowerCase().includes(q) || item.hint.toLowerCase().includes(q));
  const visibleActions = actions.filter((item) => !q || item.label.toLowerCase().includes(q) || item.hint.toLowerCase().includes(q));
  const matchingLeads = leadsEnabled ? results.filter((result) => result.kind === 'lead').slice(0, 6) : [];
  const matchingPeople = isAgent ? [] : results.filter((result) => result.kind === 'profile').slice(0, 4);

  const renderItems = (items: PaletteItem[]) => items.map((item) => <button key={item.label} type="button" onClick={item.action} className="group flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left hover:bg-zinc-100"><item.icon className="h-4 w-4 shrink-0 text-zinc-500 group-hover:text-zinc-900" /><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-zinc-900">{item.label}</div><div className="truncate text-[11px] text-zinc-400">{item.hint}</div></div><ArrowRight className="h-3.5 w-3.5 text-zinc-300" /></button>);

  return (
    <div role="dialog" aria-modal="true" aria-label="Command palette" className="fixed inset-0 z-50 flex items-start justify-center bg-zinc-950/40 p-4 pt-20 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[72vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex h-13 items-center gap-2.5 border-b border-zinc-200 bg-zinc-50/60 px-4 py-3">
          {searching ? <LoaderCircle className="h-4 w-4 animate-spin text-zinc-400" /> : <Search className="h-4 w-4 text-zinc-400" />}
          <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${leadPlural.toLowerCase()}, team, pages or actions…`} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400" />
          {query && <button type="button" onClick={() => setQuery('')} className="p-1 text-zinc-400 hover:text-zinc-700" aria-label="Clear"><X className="h-4 w-4" /></button>}
          <kbd className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] text-zinc-500">ESC</kbd>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {visibleActions.length > 0 && <section><div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Quick actions</div>{renderItems(visibleActions)}</section>}
          {matchingLeads.length > 0 && <section className="mt-2"><div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{leadPlural}</div>{matchingLeads.map((result) => <button key={result.id} type="button" onClick={() => navigate(isAgent ? `/my-work/${result.id}` : `/leads/${result.id}/workspace`)} className="flex min-h-11 w-full items-center justify-between rounded-md px-3 text-left hover:bg-zinc-100"><div className="min-w-0"><div className="truncate text-sm font-medium text-zinc-900">{result.title}</div><div className="truncate text-[11px] text-zinc-400">{result.subtitle}</div></div><ArrowRight className="h-3.5 w-3.5 text-zinc-300" /></button>)}</section>}
          {matchingPeople.length > 0 && <section className="mt-2"><div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Team</div>{matchingPeople.map((result) => <button key={result.id} type="button" onClick={() => navigate(`/team/${result.id}`)} className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left hover:bg-zinc-100"><User className="h-4 w-4 text-zinc-400" /><div className="min-w-0"><div className="truncate text-sm font-medium text-zinc-900">{result.title}</div><div className="truncate text-[11px] text-zinc-400">{result.subtitle}</div></div></button>)}</section>}
          {visiblePages.length > 0 && <section className="mt-2"><div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Pages</div>{renderItems(visiblePages)}</section>}
          {visibleActions.length + visiblePages.length + matchingLeads.length + matchingPeople.length === 0 && <div className="py-12 text-center text-sm text-zinc-500">No matching commands.</div>}
        </div>
      </div>
    </div>
  );
}
