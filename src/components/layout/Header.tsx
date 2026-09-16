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
  CalendarClock,
  Clock,
  FileSpreadsheet,
  Kanban,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Plus,
  Search,
  Settings,
  ShieldAlert,
  Users,
  X,
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
    ...(!isAgent ? [{ label: 'Team', href: '/team', icon: Users }] : []),
    ...(!isAgent && can('reports.view') ? [{ label: 'Reports', href: '/reports', icon: BarChart3 }] : []),
    ...(!isAgent ? [{ label: 'Settings', href: '/settings/workspace', icon: Settings }] : []),
  ];

  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  // Global keyboard shortcuts
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
        else if (key === 't' && canManage) router.push('/team');
        lastKey = '';
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canManage, isAgent, leadsEnabled, router, tasksEnabled]);

  // Close notifications on outside click / Escape
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
      {/* ── Slim top bar ── */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-200 bg-white px-3 md:px-4">
        {/* Left: mobile toggle + search */}
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setIsMobileNavOpen(true)}
            aria-label="Open menu"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 md:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>

          {/* Search */}
          <button
            type="button"
            onClick={() => setIsCommandPaletteOpen(true)}
            aria-label="Search workspace"
            className="flex h-8 items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 text-[13px] text-zinc-500 transition hover:border-zinc-300 hover:bg-white sm:w-56 md:w-72"
          >
            <Search className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden truncate sm:inline">
              {leadsEnabled ? `Search ${leadPlural.toLowerCase()}…` : 'Search…'}
            </span>
            <kbd className="ml-auto hidden rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-zinc-400 lg:inline">⌘K</kbd>
          </button>
        </div>

        {/* Right: actions + bell */}
        <div className="flex items-center gap-1.5">
          {/* CSV import (travel + manage) */}
          {leadsEnabled && canManage && isTravel && (
            <button
              type="button"
              onClick={() => setIsCsvModalOpen(true)}
              className="button-secondary button-sm hidden sm:inline-flex"
              title="Import CSV"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Import
            </button>
          )}

          {/* Primary add action */}
          {leadsEnabled && (
            <button
              type="button"
              onClick={() => setIsLeadModalOpen(true)}
              className="button-primary button-sm"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Add {leadLabel}</span>
              <span className="sm:hidden">Add</span>
            </button>
          )}

          {/* Notifications */}
          <div className="relative" data-notif-dropdown="true">
            <button
              type="button"
              onClick={() => setIsNotifOpen((v) => !v)}
              aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
              className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-red-500 ring-2 ring-white" />
              )}
            </button>

            {isNotifOpen && (
              <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-[min(22rem,calc(100vw-1rem))] overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg animate-in fade-in-0 zoom-in-95 duration-100">
                <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2.5">
                  <span className="text-[13px] font-semibold text-zinc-900">Notifications</span>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={markAllNotificationsAsRead}
                      className="text-[12px] font-medium text-zinc-500 hover:text-zinc-900"
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-80 divide-y divide-zinc-100 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-8 text-center text-[13px] text-zinc-500">All caught up.</div>
                  ) : notifications.map((n) => (
                    <button
                      type="button"
                      key={n.id}
                      onClick={() => {
                        markNotificationAsRead(n.id);
                        if (n.link) { setIsNotifOpen(false); router.push(n.link); }
                      }}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-zinc-50 ${!n.is_read ? 'bg-zinc-50/60' : ''}`}
                    >
                      {n.type === 'sla_breach'
                        ? <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                        : <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />}
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium text-zinc-900">{n.title}</span>
                        <span className="mt-0.5 block text-[12px] leading-5 text-zinc-500">{n.message}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Mobile Nav Drawer ── */}
      {isMobileNavOpen && (
        <div
          className="fixed inset-0 z-50 flex bg-zinc-950/50 backdrop-blur-sm md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          <button
            type="button"
            className="fixed inset-0"
            onClick={() => setIsMobileNavOpen(false)}
            aria-label="Close menu"
          />
          <div className="relative z-10 flex h-full w-64 max-w-[85vw] flex-col border-r border-zinc-800 bg-zinc-950 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-3">
              <Link
                href="/dashboard"
                onClick={() => setIsMobileNavOpen(false)}
                className="flex min-w-0 items-center gap-2.5"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white text-[11px] font-bold text-zinc-950">
                  {workspaceInitial}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-white">{workspaceName}</span>
                  <span className="block truncate text-[10px] text-zinc-500">{workspaceLabel}</span>
                </span>
              </Link>
              <button
                type="button"
                onClick={() => setIsMobileNavOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-900 hover:text-white"
                aria-label="Close menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Nav items */}
            <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
              {mobileNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileNavOpen(false)}
                    className={`flex h-10 items-center gap-2.5 rounded-md px-3 text-[13px] font-medium ${isActive ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'}`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* ── Portals / Modals ── */}
      {leadsEnabled && <LeadModal isOpen={isLeadModalOpen} onClose={() => setIsLeadModalOpen(false)} />}
      {leadsEnabled && canManage && isTravel && <CsvImportModal isOpen={isCsvModalOpen} onClose={() => setIsCsvModalOpen(false)} />}
      <KeyboardShortcutsModal isOpen={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} />
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onOpenNewLead={leadsEnabled ? () => setIsLeadModalOpen(true) : undefined}
        onOpenCsv={leadsEnabled && canManage && isTravel ? () => setIsCsvModalOpen(true) : undefined}
      />
    </>
  );
}
