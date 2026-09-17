'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useApp } from '@/lib/store';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';
import { useWorkspacePermissions } from '@/lib/use-workspace-permissions';
import {
  BarChart3,
  Bell,
  Bot,
  CalendarClock,
  Clock,
  FileSpreadsheet,
  Kanban,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  Users,
  X,
  Zap,
} from 'lucide-react';
import LeadModal from '../leads/LeadModal';
import CsvImportModal from '../leads/CsvImportModal';
import CommandPalette from './CommandPalette';
import KeyboardShortcutsModal from './KeyboardShortcutsModal';

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const {
    currentUser,
    notifications,
    unreadCount,
    markNotificationAsRead,
    markAllNotificationsAsRead,
  } = useApp();
  const { config, term, moduleEnabled } = useWorkspace();
  const { can } = useWorkspacePermissions();

  const isAgent = currentUser.role === 'agent';
  const canManage = currentUser.role === 'admin' || currentUser.role === 'manager';
  const isTravel = config.workspace.business_type === 'travel';
  const inboxEnabled = moduleEnabled('inbox', true);
  const leadsEnabled = moduleEnabled('leads', true);
  const tasksEnabled = moduleEnabled('tasks', true);
  const leadLabel = term('lead', 'Opportunity');
  const leadPlural = term('lead_plural', 'Opportunities');
  const contactPlural = term('contact_plural', 'Contacts');
  const workspaceName = config.workspace.name || 'Workspace';
  const workspaceLabel = term('workspace_label', 'Business Workspace');
  const workspaceInitial = workspaceName.trim().charAt(0).toUpperCase() || 'W';

  const mobileNavItems = [
    { label: 'Today', href: '/dashboard', icon: LayoutDashboard },
    ...(inboxEnabled && can('inbox.view') ? [{ label: 'Inbox', href: '/inbox', icon: MessageSquare }] : []),
    ...(leadsEnabled ? [{ label: leadPlural, href: isAgent ? '/my-work' : '/leads', icon: Kanban }] : []),
    ...(tasksEnabled ? [{ label: 'Due Work', href: '/work', icon: CalendarClock }] : []),
    ...(inboxEnabled && can('contacts.view') ? [{ label: contactPlural, href: '/contacts', icon: Users }] : []),
    ...(!isAgent ? [{ label: 'AI', href: '/ai', icon: Bot }] : []),
    ...(!isAgent && can('automations.view') ? [{ label: 'Automations', href: '/automations', icon: Zap }] : []),
    ...(!isAgent && can('reports.view') ? [{ label: 'Reports', href: '/reports', icon: BarChart3 }] : []),
    ...(!isAgent ? [{ label: 'Admin', href: '/admin', icon: ShieldCheck }] : []),
    { label: 'Account', href: '/account/profile', icon: UserRound },
  ];

  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  React.useEffect(() => {
    let lastKey = '';
    let lastKeyTime = 0;
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput = activeEl && (
        activeEl.tagName === 'INPUT'
        || activeEl.tagName === 'TEXTAREA'
        || activeEl.tagName === 'SELECT'
        || (activeEl as HTMLElement).isContentEditable
      );
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsCommandPaletteOpen((v) => !v);
        return;
      }
      if (isInput) return;
      if (event.key === '?' || (event.shiftKey && event.key === '/')) {
        event.preventDefault();
        setIsShortcutsOpen((v) => !v);
        return;
      }
      if (leadsEnabled && (event.key.toLowerCase() === 'c' || event.key.toLowerCase() === 'n')) {
        event.preventDefault();
        setIsLeadModalOpen(true);
        return;
      }
      const now = Date.now();
      if (event.key.toLowerCase() === 'g') { lastKey = 'g'; lastKeyTime = now; return; }
      if (lastKey === 'g' && now - lastKeyTime < 1500) {
        const key = event.key.toLowerCase();
        if (key === 'l' && leadsEnabled) router.push(isAgent ? '/my-work' : '/leads');
        else if (key === 'f' && tasksEnabled) router.push('/work');
        else if (key === 't' && canManage) router.push('/admin/people');
        lastKey = '';
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canManage, isAgent, leadsEnabled, router, tasksEnabled]);

  React.useEffect(() => {
    if (!isNotifOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-notif-dropdown]')) setIsNotifOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsNotifOpen(false); };
    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onMouseDown); window.removeEventListener('keydown', onKey); };
  }, [isNotifOpen]);

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-200 bg-white/95 px-3 backdrop-blur md:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <button type="button" onClick={() => setIsMobileNavOpen(true)} aria-label="Open menu" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950 md:hidden"><Menu className="h-4 w-4" /></button>
          <button type="button" onClick={() => setIsCommandPaletteOpen(true)} aria-label="Search workspace" className="flex h-9 items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 text-[13px] text-zinc-500 transition hover:border-zinc-300 hover:bg-white sm:w-64 md:w-80"><Search className="h-3.5 w-3.5 shrink-0" /><span className="hidden truncate sm:inline">Search workspace</span><kbd className="ml-auto hidden rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-zinc-400 lg:inline">⌘K</kbd></button>
        </div>

        <div className="flex items-center gap-1.5">
          {leadsEnabled && canManage && isTravel && <button type="button" onClick={() => setIsCsvModalOpen(true)} className="button-secondary button-sm hidden sm:inline-flex" title="Import CSV"><FileSpreadsheet className="h-3.5 w-3.5" /> Import</button>}
          {leadsEnabled && <button type="button" onClick={() => setIsLeadModalOpen(true)} className="button-primary button-sm"><Plus className="h-3.5 w-3.5" /><span className="hidden sm:inline">New {leadLabel}</span><span className="sm:hidden">New</span></button>}
          <div className="relative" data-notif-dropdown="true">
            <button type="button" onClick={() => setIsNotifOpen((v) => !v)} aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`} className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950"><Bell className="h-4 w-4" />{unreadCount > 0 && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-blue-600 ring-2 ring-white" />}</button>
            {isNotifOpen && <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(23rem,calc(100vw-1rem))] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl animate-in fade-in-0 zoom-in-95 duration-100"><div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3"><span className="text-[13px] font-semibold text-zinc-950">Notifications</span>{unreadCount > 0 && <button type="button" onClick={markAllNotificationsAsRead} className="text-[12px] font-medium text-blue-600 hover:text-blue-700">Mark all read</button>}</div><div className="max-h-80 divide-y divide-zinc-100 overflow-y-auto">{notifications.length === 0 ? <div className="p-8 text-center text-[13px] text-zinc-500">All caught up.</div> : notifications.map((n) => <button type="button" key={n.id} onClick={() => { markNotificationAsRead(n.id); if (n.link) { setIsNotifOpen(false); router.push(n.link); } }} className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-zinc-50 ${!n.is_read ? 'bg-blue-50/35' : ''}`}>{n.type === 'sla_breach' ? <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" /> : <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />}<span className="min-w-0"><span className="block truncate text-[13px] font-medium text-zinc-900">{n.title}</span><span className="mt-0.5 block text-[12px] leading-5 text-zinc-500">{n.message}</span></span></button>)}</div></div>}
          </div>
        </div>
      </header>

      {isMobileNavOpen && <div className="fixed inset-0 z-50 flex bg-zinc-950/25 backdrop-blur-[2px] md:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu"><button type="button" className="fixed inset-0" onClick={() => setIsMobileNavOpen(false)} aria-label="Close menu" /><div className="relative z-10 flex h-full w-72 max-w-[88vw] flex-col border-r border-zinc-200 bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-zinc-200 px-3 py-3"><Link href="/dashboard" onClick={() => setIsMobileNavOpen(false)} className="flex min-w-0 items-center gap-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-[11px] font-semibold text-white">{workspaceInitial}</span><span className="min-w-0"><span className="block truncate text-[13px] font-semibold text-zinc-950">{workspaceName}</span><span className="block truncate text-[11px] text-zinc-500">{workspaceLabel}</span></span></Link><button type="button" onClick={() => setIsMobileNavOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950" aria-label="Close menu"><X className="h-4 w-4" /></button></div><nav className="flex-1 space-y-1 overflow-y-auto p-2.5">{mobileNavItems.map((item) => { const Icon = item.icon; const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`); return <Link key={item.href} href={item.href} onClick={() => setIsMobileNavOpen(false)} className={`flex h-10 items-center gap-2.5 rounded-lg px-3 text-[13px] font-medium transition ${isActive ? 'bg-blue-50 text-blue-700' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950'}`}><Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-blue-600' : 'text-zinc-400'}`} />{item.label}</Link>; })}</nav></div></div>}

      {leadsEnabled && <LeadModal isOpen={isLeadModalOpen} onClose={() => setIsLeadModalOpen(false)} />}
      {leadsEnabled && canManage && isTravel && <CsvImportModal isOpen={isCsvModalOpen} onClose={() => setIsCsvModalOpen(false)} />}
      <KeyboardShortcutsModal isOpen={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} />
      <CommandPalette isOpen={isCommandPaletteOpen} onClose={() => setIsCommandPaletteOpen(false)} onOpenNewLead={leadsEnabled ? () => setIsLeadModalOpen(true) : undefined} onOpenCsv={leadsEnabled && canManage && isTravel ? () => setIsCsvModalOpen(true) : undefined} />
    </>
  );
}
