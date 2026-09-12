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
  Settings,
  HelpCircle,
  LogOut,
  LayoutList,
} from 'lucide-react';
import LeadModal from '../leads/LeadModal';
import CsvImportModal from '../leads/CsvImportModal';
import TeamMemberDrawer from '../team/TeamMemberDrawer';
import CommandPalette from './CommandPalette';
import KeyboardShortcutsModal from './KeyboardShortcutsModal';

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const {
    currentUser,
    allProfiles,
    logout,
    updateAgentStatus,
    notifications,
    unreadCount,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    leads,
    followUps,
    showToast,
  } = useApp();

  const overdueCount = followUps.filter((fu) => {
    const isPast = new Date(fu.scheduled_at).getTime() < Date.now();
    return fu.status === 'pending' || (fu.status === 'missed' && isPast);
  }).length;

  const breachedSlaCount = leads.filter((l) => l.is_first_response_breached).length;

  const navItems = [
    {
      label: 'Pipeline',
      href: '/leads',
      icon: Kanban,
      badge: leads.length,
      alert: breachedSlaCount > 0 ? `${breachedSlaCount} breached` : null,
    },
    {
      label: 'Follow-ups',
      href: '/follow-ups',
      icon: CalendarClock,
      badge: followUps.filter((f) => f.status === 'pending').length,
      alert: overdueCount > 0 ? `${overdueCount} overdue` : null,
    },
    {
      label: 'Team Directory',
      href: '/team',
      icon: Users,
      badge: null,
      alert: null,
    },
    {
      label: 'Performance',
      href: '/analytics',
      icon: BarChart3,
      badge: null,
      alert: null,
    },
    {
      label: 'Incentives',
      href: '/incentives',
      icon: Trophy,
      badge: null,
      alert: null,
    },
    {
      label: 'Templates',
      href: '/templates',
      icon: MessageSquareQuote,
      badge: null,
      alert: null,
    },
    {
      label: 'SLA Rules',
      href: '/settings',
      icon: Settings,
      badge: null,
      alert: null,
    },
  ].filter((item) => item.href !== '/settings' || currentUser.role !== 'agent');

  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [isMyProfileDrawerOpen, setIsMyProfileDrawerOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  // Global shortcuts: ⌘K, ?, C/N, and G-navigation
  React.useEffect(() => {
    let lastKey = '';
    let lastKeyTime = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'SELECT' ||
          (activeEl as HTMLElement).isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
        return;
      }

      if (isInput) return;

      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setIsShortcutsOpen((prev) => !prev);
        return;
      }

      if (e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setIsLeadModalOpen(true);
        return;
      }

      const now = Date.now();
      if (e.key.toLowerCase() === 'g') {
        lastKey = 'g';
        lastKeyTime = now;
        return;
      }

      if (lastKey === 'g' && now - lastKeyTime < 1500) {
        const k = e.key.toLowerCase();
        if (k === 'l') router.push('/leads');
        else if (k === 'f') router.push('/follow-ups');
        else if (k === 't') router.push('/team');
        else if (k === 'p') router.push('/analytics');
        else if (k === 'i') router.push('/incentives');
        else if (k === 's') router.push('/settings');
        lastKey = '';
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [router]);

  // Close header dropdowns on outside click or Escape key
  React.useEffect(() => {
    if (!isNotifOpen && !isRoleDropdownOpen && !isStatusDropdownOpen) return;

    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-header-dropdown]')) {
        setIsNotifOpen(false);
        setIsRoleDropdownOpen(false);
        setIsStatusDropdownOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsNotifOpen(false);
        setIsRoleDropdownOpen(false);
        setIsStatusDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleDocumentClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isNotifOpen, isRoleDropdownOpen, isStatusDropdownOpen]);

  const statusMap: Record<AgentStatus, { label: string; dotColor: string }> = {
    available: { label: 'Available', dotColor: 'bg-emerald-500' },
    in_call: { label: 'In Call', dotColor: 'bg-amber-500' },
    on_break: { label: 'On Break', dotColor: 'bg-blue-500' },
    offline: { label: 'Offline', dotColor: 'bg-zinc-400' },
  };

  const status = statusMap[currentUser.status] || statusMap.available;

  return (
    <>
      <header className="h-12 bg-white border-b border-zinc-200/80 px-4 flex items-center justify-between sticky top-0 z-30">
        {/* Left: Quick Actions & Search trigger */}
        <div className="flex items-center gap-2">
          {/* Mobile Menu Hamburger */}
          <button
            type="button"
            onClick={() => setIsMobileNavOpen(true)}
            aria-label="Open mobile navigation menu"
            className="md:hidden p-1.5 rounded-md border border-zinc-200 text-zinc-700 hover:bg-zinc-100 transition inline-flex items-center justify-center min-h-[36px] min-w-[36px]"
          >
            <Menu className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setIsLeadModalOpen(true)}
            aria-label="Create new lead"
            className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-50 rounded-md text-xs font-medium shadow-2xs transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Lead</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCsvModalOpen(true)}
            aria-label="Import leads from CSV"
            className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-700 rounded-md text-xs font-medium transition"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-zinc-400" />
            <span>Import</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCommandPaletteOpen(true)}
            aria-label="Search pipeline"
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-zinc-100/60 hover:bg-zinc-100 border border-zinc-200/60 rounded-md text-xs text-zinc-400 ml-2 transition cursor-pointer"
          >
            <Search className="w-3 h-3 text-zinc-400" />
            <span>Search pipeline...</span>
            <kbd className="ml-4 px-1 py-0.2 text-[10px] font-mono bg-white border border-zinc-200 rounded text-zinc-500 shadow-2xs">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Right: Availability Toggle, Notifications, Role Switcher */}
        <div className="flex items-center gap-2">
          {/* Availability Switch */}
          <div className="relative" data-header-dropdown="true">
            <button
              type="button"
              onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
              aria-label="Select availability status"
              className="flex items-center gap-2 px-2 py-1 rounded-md border border-zinc-200 hover:bg-zinc-50 text-xs text-zinc-700 font-medium transition"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${status.dotColor}`} />
              <span>{status.label}</span>
              <ChevronDown className="w-3 h-3 text-zinc-400" />
            </button>

            {isStatusDropdownOpen && (
              <div className="absolute right-0 mt-1 w-44 bg-white rounded-md shadow-lg border border-zinc-200 py-1 z-50 text-xs animate-in fade-in zoom-in-95">
                {(['available', 'in_call', 'on_break', 'offline'] as AgentStatus[]).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => {
                      updateAgentStatus(st);
                      showToast(`Status updated to ${statusMap[st].label}`, 'info');
                      setIsStatusDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-zinc-50 transition ${
                      currentUser.status === st ? 'font-medium text-zinc-950 bg-zinc-50' : 'text-zinc-600'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${statusMap[st].dotColor}`} />
                    <span>{statusMap[st].label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Keyboard Shortcuts (?) Help Button */}
          <button
            type="button"
            onClick={() => setIsShortcutsOpen(true)}
            aria-label="Keyboard shortcuts (?)"
            title="Keyboard shortcuts (?)"
            className="hidden sm:flex items-center justify-center p-1.5 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-md transition"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>

          {/* Notifications Bell */}
          <div className="relative" data-header-dropdown="true">
            <button
              type="button"
              onClick={() => setIsNotifOpen(!isNotifOpen)}
              aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
              className="relative p-1.5 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-md transition"
              title="Notifications"
            >
              <Bell className="w-3.5 h-3.5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-red-600 rounded-full" />
              )}
            </button>

            {isNotifOpen && (
              <div className="absolute right-0 mt-1.5 w-80 bg-white rounded-lg shadow-xl border border-zinc-200 overflow-hidden z-50 animate-in fade-in zoom-in-95">
                <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 bg-zinc-50/80">
                  <span className="font-semibold text-xs text-zinc-800">Notifications</span>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllNotificationsAsRead}
                      className="text-[11px] text-zinc-500 hover:text-zinc-900"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="max-h-72 overflow-y-auto divide-y divide-zinc-100">
                  {notifications.length === 0 ? (
                    <div className="p-4 text-center text-xs text-zinc-400">
                      No new notifications
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        onClick={() => {
                          markNotificationAsRead(n.id);
                          if (n.link) {
                            setIsNotifOpen(false);
                            router.push(n.link);
                          }
                        }}
                        className={`p-2.5 text-xs transition cursor-pointer hover:bg-zinc-50 ${
                          !n.is_read ? 'bg-zinc-50/70' : ''
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {n.type === 'sla_breach' ? (
                            <ShieldAlert className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                          ) : (
                            <Clock className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-zinc-800 text-[11px] truncate">
                              {n.title}
                            </div>
                            <p className="text-zinc-500 text-[11px] mt-0.5 line-clamp-2">
                              {n.message}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="h-4 w-px bg-zinc-200 mx-0.5" />

          {/* Profile Menu */}
          <div className="relative" data-header-dropdown="true">
            {/* Trigger pill */}
            <button
              type="button"
              onClick={() => setIsRoleDropdownOpen(!isRoleDropdownOpen)}
              aria-label="Open profile menu"
              className="flex items-center gap-1.5 pl-1 pr-2 py-0.5 hover:bg-zinc-50 rounded-md border border-zinc-200 transition"
            >
              <img
                src={currentUser.avatar_url}
                alt={currentUser.full_name}
                className="w-6 h-6 rounded-full object-cover"
              />
              <span suppressHydrationWarning className="text-xs font-medium text-zinc-800 truncate max-w-[72px] hidden sm:block">
                {currentUser.full_name.split(' ')[0]}
              </span>
              <ChevronDown className="w-3 h-3 text-zinc-400" />
            </button>

            {isRoleDropdownOpen && (
              <div className="absolute right-0 mt-1.5 w-48 bg-white rounded-lg shadow-xl border border-zinc-200 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100">

                {/* Identity card */}
                <div className="flex items-center gap-2.5 px-3 py-2.5 bg-zinc-50 border-b border-zinc-100">
                  <img
                    src={currentUser.avatar_url}
                    alt={currentUser.full_name}
                    className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <div suppressHydrationWarning className="text-xs font-semibold text-zinc-900 leading-tight truncate">
                      {currentUser.full_name}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span suppressHydrationWarning className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        currentUser.role === 'admin' ? 'bg-red-500' :
                        currentUser.role === 'manager' ? 'bg-blue-500' : 'bg-emerald-500'
                      }`} />
                      <span suppressHydrationWarning className="text-[10px] text-zinc-500 capitalize">{currentUser.role}</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="p-1">
                  <Link
                    href="/profile"
                    onClick={() => setIsRoleDropdownOpen(false)}
                    className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md text-xs text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 transition"
                  >
                    <User className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                    <span>Profile</span>
                  </Link>

                  <button
                    type="button"
                    onClick={() => {
                      setIsMyProfileDrawerOpen(true);
                      setIsRoleDropdownOpen(false);
                    }}
                    className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md text-xs text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 transition cursor-pointer"
                  >
                    <LayoutList className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                    <span>Quick View</span>
                  </button>

                  <div className="my-1 border-t border-zinc-100" />

                  <button
                    type="button"
                    onClick={() => {
                      logout();
                      setIsRoleDropdownOpen(false);
                      router.push('/login');
                    }}
                    aria-label="Sign out"
                    className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md text-xs text-red-600 hover:bg-red-50 transition cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      {isMobileNavOpen && (
        <div 
          className="fixed inset-0 z-50 bg-zinc-950/60 backdrop-blur-xs flex md:hidden animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Navigation"
        >
          <div 
            className="fixed inset-0"
            onClick={() => setIsMobileNavOpen(false)}
            aria-hidden="true"
          />
          <div className="relative w-72 max-w-[85vw] bg-zinc-950 text-zinc-300 h-full shadow-2xl flex flex-col justify-between p-4 border-r border-zinc-800 z-10 animate-in slide-in-from-left duration-200">
            <div>
              {/* Brand & Close Button */}
              <div className="flex items-center justify-between pb-4 border-b border-zinc-800 mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded bg-zinc-100 text-zinc-950 flex items-center justify-center font-bold text-xs">
                    W
                  </div>
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-zinc-100 tracking-tight">
                    <span>Wanderlust</span>
                    <span className="text-[10px] text-zinc-500 font-mono">CRM</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileNavOpen(false)}
                  aria-label="Close navigation menu"
                  className="p-2 text-zinc-400 hover:text-zinc-100 rounded-md hover:bg-zinc-900 transition min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Navigation Links */}
              <nav className="space-y-1">
                <div className="px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                  Navigation
                </div>
                {navItems.map((item) => {
                  const isActive = pathname === item.href || (item.href === '/leads' && pathname === '/');
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setIsMobileNavOpen(false)}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-md text-sm font-medium min-h-[44px] transition ${
                        isActive
                          ? 'bg-zinc-900 text-zinc-100 border border-zinc-800 shadow-xs'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={`w-4 h-4 ${isActive ? 'text-zinc-100' : 'text-zinc-400'}`} />
                        <span>{item.label}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {item.alert && (
                          <span suppressHydrationWarning className="text-[10px] px-1.5 py-0.5 rounded font-mono font-medium bg-red-950/80 text-red-400 border border-red-900/50">
                            {item.alert}
                          </span>
                        )}
                        {item.badge !== null && !item.alert && (
                          <span suppressHydrationWarning className="text-xs font-mono text-zinc-500">
                            {item.badge}
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* Bottom: Profile & Switcher */}
            <div className="pt-3 border-t border-zinc-800 space-y-2">
              <Link
                href="/profile"
                onClick={() => setIsMobileNavOpen(false)}
                className="flex items-center justify-between p-2.5 rounded-md bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800 text-xs min-h-[44px] transition"
              >
                <div className="flex items-center gap-2.5">
                  <img
                    src={currentUser.avatar_url}
                    alt={currentUser.full_name}
                    className="w-6 h-6 rounded-full object-cover"
                  />
                  <div>
                    <div suppressHydrationWarning className="font-medium text-zinc-200">{currentUser.full_name}</div>
                    <div suppressHydrationWarning className="text-[10px] text-zinc-500 font-mono uppercase">{currentUser.role}</div>
                  </div>
                </div>
                <span className="text-[10px] font-mono text-zinc-400">Profile →</span>
              </Link>
            </div>
          </div>
        </div>
      )}

      <LeadModal isOpen={isLeadModalOpen} onClose={() => setIsLeadModalOpen(false)} />
      <CsvImportModal isOpen={isCsvModalOpen} onClose={() => setIsCsvModalOpen(false)} />
      <KeyboardShortcutsModal isOpen={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} />
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onOpenNewLead={() => setIsLeadModalOpen(true)}
        onOpenCsv={() => setIsCsvModalOpen(true)}
      />

      {isMyProfileDrawerOpen && (
        <TeamMemberDrawer
          member={currentUser}
          isOpen={isMyProfileDrawerOpen}
          onClose={() => setIsMyProfileDrawerOpen(false)}
        />
      )}
    </>
  );
}
