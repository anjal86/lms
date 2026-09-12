'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useApp } from '@/lib/store';
import { AgentStatus } from '@/lib/types';
import {
  Bell,
  Plus,
  FileSpreadsheet,
  ChevronDown,
  Clock,
  ShieldAlert,
  Search,
  User,
  Menu,
  X,
  Kanban,
  CalendarClock,
  Users,
  BarChart3,
  Trophy,
  MessageSquareQuote,
  MessageSquare,
  Settings,
  LogOut,
  LayoutDashboard,
  ListChecks,
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
    logout,
    updateAgentStatus,
    notifications,
    unreadCount,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    showToast,
  } = useApp();

  const isAgent = currentUser.role === 'agent';
  const canManage = currentUser.role === 'admin' || currentUser.role === 'manager';

  const mobileNavItems = isAgent
    ? [
        { label: 'Today', href: '/dashboard', icon: LayoutDashboard },
        { label: 'Inbox', href: '/inbox', icon: MessageSquare },
        { label: 'My Work', href: '/my-work', icon: ListChecks },
        { label: 'Follow-ups', href: '/my-follow-ups', icon: CalendarClock },
        { label: 'Messages', href: '/templates', icon: MessageSquareQuote },
      ]
    : [
        { label: 'Today', href: '/dashboard', icon: LayoutDashboard },
        { label: 'Inbox', href: '/inbox', icon: MessageSquare },
        { label: 'All Leads', href: '/leads', icon: Kanban },
        { label: 'Follow-ups', href: '/follow-ups', icon: CalendarClock },
        { label: 'Team', href: '/team', icon: Users },
        { label: 'Performance', href: '/analytics', icon: BarChart3 },
        { label: 'Incentives', href: '/incentives', icon: Trophy },
        { label: 'Messages', href: '/templates', icon: MessageSquareQuote },
        { label: 'Settings', href: '/settings', icon: Settings },
      ];

  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
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
        setIsCommandPaletteOpen((value) => !value);
        return;
      }
      if (isInput) return;

      if (event.key === '?' || (event.shiftKey && event.key === '/')) {
        event.preventDefault();
        setIsShortcutsOpen((value) => !value);
        return;
      }
      if (event.key.toLowerCase() === 'c' || event.key.toLowerCase() === 'n') {
        event.preventDefault();
        setIsLeadModalOpen(true);
        return;
      }

      const now = Date.now();
      if (event.key.toLowerCase() === 'g') {
        lastKey = 'g';
        lastKeyTime = now;
        return;
      }
      if (lastKey === 'g' && now - lastKeyTime < 1500) {
        const key = event.key.toLowerCase();
        if (key === 'l') router.push(isAgent ? '/my-work' : '/leads');
        else if (key === 'f') router.push(isAgent ? '/my-follow-ups' : '/follow-ups');
        else if (key === 't' && canManage) router.push('/team');
        lastKey = '';
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canManage, isAgent, router]);

  React.useEffect(() => {
    if (!isNotifOpen && !isProfileOpen) return;

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-header-dropdown]')) {
        setIsNotifOpen(false);
        setIsProfileOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsNotifOpen(false);
        setIsProfileOpen(false);
      }
    };

    document.addEventListener('mousedown', handleDocumentClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isNotifOpen, isProfileOpen]);

  const statusMap: Record<AgentStatus, { label: string; dotColor: string }> = {
    available: { label: 'Available', dotColor: 'bg-emerald-500' },
    in_call: { label: 'In a call', dotColor: 'bg-amber-500' },
    on_break: { label: 'On a break', dotColor: 'bg-blue-500' },
    offline: { label: 'Offline', dotColor: 'bg-zinc-400' },
  };

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-zinc-200/80 bg-white/95 px-3 backdrop-blur md:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" onClick={() => setIsMobileNavOpen(true)} aria-label="Open menu" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 text-zinc-700 hover:bg-zinc-50 md:hidden">
            <Menu className="h-4 w-4" />
          </button>

          <button type="button" onClick={() => setIsLeadModalOpen(true)} className="button-primary whitespace-nowrap">
            <Plus className="h-4 w-4" /> Add lead
          </button>

          {canManage && (
            <button type="button" onClick={() => setIsCsvModalOpen(true)} className="button-secondary hidden sm:inline-flex">
              <FileSpreadsheet className="h-4 w-4" /> Import
            </button>
          )}

          <button type="button" onClick={() => setIsCommandPaletteOpen(true)} aria-label="Search leads" className="ml-1 hidden min-w-0 items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-500 transition hover:border-zinc-300 hover:bg-white sm:flex md:w-64">
            <Search className="h-4 w-4 shrink-0" />
            <span className="truncate">Search leads</span>
            <kbd className="ml-auto hidden rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-zinc-400 lg:inline">⌘K</kbd>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative" data-header-dropdown="true">
            <button type="button" onClick={() => setIsNotifOpen((value) => !value)} aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`} className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />}
            </button>

            {isNotifOpen && (
              <div className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
                  <span className="text-sm font-semibold text-zinc-900">Notifications</span>
                  {unreadCount > 0 && <button onClick={markAllNotificationsAsRead} className="text-xs font-medium text-zinc-500 hover:text-zinc-900">Mark all read</button>}
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-zinc-100">
                  {notifications.length === 0 ? (
                    <div className="p-8 text-center text-sm text-zinc-500">You’re all caught up.</div>
                  ) : notifications.map((notification) => (
                    <button
                      type="button"
                      key={notification.id}
                      onClick={() => {
                        markNotificationAsRead(notification.id);
                        if (notification.link) {
                          setIsNotifOpen(false);
                          router.push(notification.link);
                        }
                      }}
                      className={`flex w-full items-start gap-3 p-4 text-left hover:bg-zinc-50 ${!notification.is_read ? 'bg-blue-50/35' : ''}`}
                    >
                      {notification.type === 'sla_breach' ? <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-500" /> : <Clock className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-zinc-900">{notification.title}</span>
                        <span className="mt-1 block text-xs leading-5 text-zinc-500">{notification.message}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="relative" data-header-dropdown="true">
            <button type="button" onClick={() => setIsProfileOpen((value) => !value)} aria-label="Open profile menu" className="flex h-10 items-center gap-2 rounded-lg border border-zinc-200 bg-white pl-1.5 pr-2.5 hover:bg-zinc-50">
              <img src={currentUser.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" />
              <span className="hidden max-w-24 truncate text-sm font-medium text-zinc-800 sm:block">{currentUser.full_name.split(' ')[0]}</span>
              <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
            </button>

            {isProfileOpen && (
              <div className="absolute right-0 mt-2 w-64 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl">
                <div className="border-b border-zinc-100 bg-zinc-50/70 p-4">
                  <div className="text-sm font-semibold text-zinc-900">{currentUser.full_name}</div>
                  <div className="mt-1 text-xs capitalize text-zinc-500">{currentUser.role}</div>
                </div>

                <div className="p-2">
                  <Link href="/profile" onClick={() => setIsProfileOpen(false)} className="flex min-h-10 items-center gap-2.5 rounded-lg px-3 text-sm text-zinc-700 hover:bg-zinc-100">
                    <User className="h-4 w-4 text-zinc-400" /> My profile
                  </Link>
                </div>

                <div className="border-t border-zinc-100 p-3">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Work status</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['available', 'in_call', 'on_break', 'offline'] as AgentStatus[]).map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => {
                          updateAgentStatus(status);
                          showToast(`Status: ${statusMap[status].label}`, 'info');
                          setIsProfileOpen(false);
                        }}
                        className={`flex min-h-9 items-center gap-2 rounded-lg px-2.5 text-left text-xs ${currentUser.status === status ? 'bg-zinc-100 font-semibold text-zinc-900' : 'text-zinc-600 hover:bg-zinc-50'}`}
                      >
                        <span className={`h-2 w-2 rounded-full ${statusMap[status].dotColor}`} />
                        {statusMap[status].label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-zinc-100 p-2">
                  <button type="button" onClick={() => { logout(); setIsProfileOpen(false); router.push('/login'); }} className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 text-sm text-red-600 hover:bg-red-50">
                    <LogOut className="h-4 w-4" /> Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {isMobileNavOpen && (
        <div className="fixed inset-0 z-50 flex bg-zinc-950/60 backdrop-blur-sm md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="fixed inset-0" onClick={() => setIsMobileNavOpen(false)} aria-label="Close menu" />
          <div className="relative z-10 flex h-full w-72 max-w-[86vw] flex-col bg-zinc-950 p-4 text-zinc-300 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-zinc-800 pb-4">
              <Link href="/dashboard" onClick={() => setIsMobileNavOpen(false)} className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-xs font-bold text-zinc-950">W</span>
                <span><span className="block text-sm font-semibold text-white">Wanderlust</span><span className="block text-[10px] text-zinc-500">Travel Workspace</span></span>
              </Link>
              <button type="button" onClick={() => setIsMobileNavOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-900 hover:text-white" aria-label="Close menu"><X className="h-5 w-5" /></button>
            </div>

            <nav className="flex-1 space-y-1">
              {mobileNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link key={item.href} href={item.href} onClick={() => setIsMobileNavOpen(false)} className={`flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm font-medium ${isActive ? 'bg-white/10 text-white' : 'text-zinc-400 hover:bg-white/[0.05] hover:text-white'}`}>
                    <Icon className={`h-4 w-4 ${isActive ? 'text-blue-400' : 'text-zinc-500'}`} /> {item.label}
                  </Link>
                );
              })}
            </nav>

            <Link href="/profile" onClick={() => setIsMobileNavOpen(false)} className="flex items-center gap-3 border-t border-zinc-800 pt-4">
              <img src={currentUser.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
              <span className="min-w-0"><span className="block truncate text-sm font-semibold text-zinc-100">{currentUser.full_name}</span><span className="block text-xs capitalize text-zinc-500">{currentUser.role}</span></span>
            </Link>
          </div>
        </div>
      )}

      <LeadModal isOpen={isLeadModalOpen} onClose={() => setIsLeadModalOpen(false)} />
      {canManage && <CsvImportModal isOpen={isCsvModalOpen} onClose={() => setIsCsvModalOpen(false)} />}
      <KeyboardShortcutsModal isOpen={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} />
      <CommandPalette isOpen={isCommandPaletteOpen} onClose={() => setIsCommandPaletteOpen(false)} onOpenNewLead={() => setIsLeadModalOpen(true)} onOpenCsv={() => canManage && setIsCsvModalOpen(true)} />
    </>
  );
}
