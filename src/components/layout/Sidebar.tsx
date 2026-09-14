'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useApp } from '@/lib/store';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';
import { canAccessSettings } from '@/lib/permissions';
import {
  LayoutDashboard,
  Kanban,
  CalendarClock,
  BarChart3,
  Trophy,
  Users,
  MessageSquareQuote,
  MessageSquare,
  Settings,
  History,
  LogOut,
  UserCog,
  ListChecks,
  PlugZap,
  Building2,
  ListPlus,
  Zap,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

type NavTone = 'blue' | 'cyan' | 'amber' | 'emerald' | 'violet' | 'rose';

type NavItem = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  tone: NavTone;
};

const ACTIVE_TONES: Record<NavTone, string> = {
  blue: 'bg-blue-500/15 text-blue-50 ring-1 ring-inset ring-blue-400/20',
  cyan: 'bg-cyan-500/15 text-cyan-50 ring-1 ring-inset ring-cyan-400/20',
  amber: 'bg-amber-500/15 text-amber-50 ring-1 ring-inset ring-amber-400/20',
  emerald: 'bg-emerald-500/15 text-emerald-50 ring-1 ring-inset ring-emerald-400/20',
  violet: 'bg-violet-500/15 text-violet-50 ring-1 ring-inset ring-violet-400/20',
  rose: 'bg-rose-500/15 text-rose-50 ring-1 ring-inset ring-rose-400/20',
};

const ICON_TONES: Record<NavTone, string> = {
  blue: 'text-blue-400',
  cyan: 'text-cyan-400',
  amber: 'text-amber-400',
  emerald: 'text-emerald-400',
  violet: 'text-violet-400',
  rose: 'text-rose-400',
};

function NavGroup({
  label,
  items,
  pathname,
  isCollapsed,
  onHoverItem,
  onLeaveItem,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
  isCollapsed: boolean;
  onHoverItem: (label: string, e: React.MouseEvent<HTMLElement>) => void;
  onLeaveItem: () => void;
}) {
  return (
    <div className="space-y-1">
      {!isCollapsed ? (
        <div className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
          {label}
        </div>
      ) : (
        <div className="my-2.5 mx-1.5 h-px bg-white/[0.08]" role="separator" />
      )}
      {items.map((item) => {
        const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`));
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            title={isCollapsed ? item.label : undefined}
            aria-label={item.label}
            onMouseEnter={(e) => onHoverItem(item.label, e)}
            onMouseLeave={onLeaveItem}
            className={`group flex items-center transition-all ${
              isCollapsed
                ? 'h-10 w-10 mx-auto justify-center rounded-xl'
                : 'min-h-11 gap-3 rounded-xl px-3 text-[13px] font-semibold'
            } ${
              isActive
                ? `${ACTIVE_TONES[item.tone]} shadow-sm`
                : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-100'
            }`}
          >
            <span
              className={`flex shrink-0 items-center justify-center rounded-lg ${
                isCollapsed ? 'h-8 w-8' : 'h-7 w-7'
              } ${
                isActive ? 'bg-white/[0.08]' : 'bg-white/[0.025] group-hover:bg-white/[0.05]'
              }`}
            >
              <Icon
                className={`h-4 w-4 ${
                  isActive ? ICON_TONES[item.tone] : 'text-slate-400 group-hover:text-slate-200'
                }`}
              />
            </span>
            {!isCollapsed && <span className="truncate">{item.label}</span>}
          </Link>
        );
      })}
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, logout } = useApp();
  const { config, term, moduleEnabled } = useWorkspace();
  const canManage = canAccessSettings(currentUser.role);
  const isAgent = currentUser.role === 'agent';
  const leadPlural = term('lead_plural', 'Leads');
  const contactPlural = term('contact_plural', 'Contacts');
  const workspaceName = config.workspace.name || 'Workspace';
  const workspaceLabel = term('workspace_label', 'Business Workspace');
  const workspaceInitial = workspaceName.trim().charAt(0).toUpperCase() || 'W';
  const inboxEnabled = moduleEnabled('inbox', true);
  const leadsEnabled = moduleEnabled('leads', true);
  const tasksEnabled = moduleEnabled('tasks', true);

  // Collapsible state: defaults to collapsed (true) as requested
  const [isCollapsed, setIsCollapsed] = useState<boolean>(true);
  const [hoveredItem, setHoveredItem] = useState<{ label: string; top: number } | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('travel_lms_sidebar_collapsed');
      if (stored !== null) {
        setIsCollapsed(stored === 'true');
      }
    } catch {
      // ignore localStorage error in private browsing
    }
  }, []);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('travel_lms_sidebar_collapsed', String(next));
      } catch {
        // ignore
      }
      return next;
    });
    setHoveredItem(null);
  };

  const handleHoverItem = (label: string, e: React.MouseEvent<HTMLElement>) => {
    if (!isCollapsed) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setHoveredItem({
      label,
      top: rect.top + rect.height / 2,
    });
  };

  const handleLeaveItem = () => {
    setHoveredItem(null);
  };

  const agentItems: NavItem[] = [
    { label: 'Today', href: '/dashboard', icon: LayoutDashboard, tone: 'blue' },
    ...(inboxEnabled ? [
      { label: 'Inbox', href: '/inbox', icon: MessageSquare, tone: 'cyan' as const },
      { label: contactPlural, href: '/contacts', icon: Users, tone: 'emerald' as const },
    ] : []),
    ...(leadsEnabled ? [
      { label: 'My Work', href: '/my-work', icon: ListChecks, tone: 'cyan' as const },
    ] : []),
    ...(tasksEnabled ? [
      { label: 'Follow-ups', href: '/my-follow-ups', icon: CalendarClock, tone: 'amber' as const },
    ] : []),
    { label: 'Messages', href: '/templates', icon: MessageSquareQuote, tone: 'violet' },
  ];

  const workItems: NavItem[] = [
    { label: 'Today', href: '/dashboard', icon: LayoutDashboard, tone: 'blue' },
    ...(inboxEnabled ? [
      { label: 'Inbox', href: '/inbox', icon: MessageSquare, tone: 'blue' as const },
      { label: contactPlural, href: '/contacts', icon: Users, tone: 'emerald' as const },
    ] : []),
    ...(leadsEnabled ? [
      { label: `All ${leadPlural}`, href: '/leads', icon: Kanban, tone: 'cyan' as const },
    ] : []),
    ...(tasksEnabled ? [
      { label: 'Follow-ups', href: '/follow-ups', icon: CalendarClock, tone: 'amber' as const },
    ] : []),
    { label: 'Team', href: '/team', icon: UserCog, tone: 'emerald' },
  ];

  const insightItems: NavItem[] = [
    { label: 'Performance', href: '/analytics', icon: BarChart3, tone: 'violet' },
    { label: 'Incentives', href: '/incentives', icon: Trophy, tone: 'amber' },
    { label: 'Messages', href: '/templates', icon: MessageSquareQuote, tone: 'rose' },
  ];

  const adminItems: NavItem[] = canManage
    ? [
        ...(inboxEnabled ? [{ label: 'Automations', href: '/settings/automations', icon: Zap, tone: 'violet' as const }] : []),
        { label: 'Business Setup', href: '/settings/business', icon: Building2, tone: 'blue' },
        { label: 'Custom Fields', href: '/settings/business/fields', icon: ListPlus, tone: 'cyan' },
        { label: 'Connections', href: '/connections', icon: PlugZap, tone: 'cyan' },
        { label: 'Users', href: '/team/users', icon: UserCog, tone: 'emerald' },
        { label: 'Activity Log', href: '/audit', icon: History, tone: 'violet' },
        { label: 'Settings', href: '/settings', icon: Settings, tone: 'blue' },
      ]
    : [];

  const loadPercent = currentUser.max_capacity > 0
    ? Math.min(100, Math.round((currentUser.current_load / currentUser.max_capacity) * 100))
    : 0;

  return (
    <>
      <aside
        className={`hidden shrink-0 flex-col border-r border-slate-800/80 bg-[linear-gradient(180deg,#081226_0%,#0b1730_48%,#10172a_100%)] text-slate-300 transition-[width] duration-200 ease-in-out md:flex ${
          isCollapsed ? 'w-16' : 'w-60'
        }`}
      >
        <div
          className={`flex h-16 items-center border-b border-white/[0.07] ${
            isCollapsed ? 'justify-center px-2' : 'justify-between px-4'
          }`}
        >
          <Link
            href="/dashboard"
            className="flex min-w-0 items-center gap-3 rounded-lg"
            aria-label={`${workspaceName} home`}
            title={isCollapsed ? `${workspaceName} (Home)` : undefined}
            onMouseEnter={(e) => handleHoverItem(`${workspaceName} (Home)`, e)}
            onMouseLeave={handleLeaveItem}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-violet-500 text-xs font-bold text-white shadow-lg shadow-blue-950/30 ring-1 ring-white/20">
              {workspaceInitial}
            </span>
            {!isCollapsed && (
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold tracking-[-0.01em] text-white">
                  {workspaceName}
                </span>
                <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-300/60">
                  {workspaceLabel}
                </span>
              </span>
            )}
          </Link>
          {!isCollapsed && (
            <button
              type="button"
              onClick={toggleCollapse}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
        </div>

        {isCollapsed && (
          <div className="pt-2 pb-0.5 flex justify-center">
            <button
              type="button"
              onClick={toggleCollapse}
              aria-label="Expand sidebar"
              title="Expand sidebar"
              onMouseEnter={(e) => handleHoverItem('Expand sidebar', e)}
              onMouseLeave={handleLeaveItem}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        <nav className={`flex-1 overflow-y-auto py-2 ${isCollapsed ? 'px-2' : 'px-2.5'}`}>
          {isAgent ? (
            <NavGroup
              label="My day"
              items={agentItems}
              pathname={pathname}
              isCollapsed={isCollapsed}
              onHoverItem={handleHoverItem}
              onLeaveItem={handleLeaveItem}
            />
          ) : (
            <>
              <NavGroup
                label="Work"
                items={workItems}
                pathname={pathname}
                isCollapsed={isCollapsed}
                onHoverItem={handleHoverItem}
                onLeaveItem={handleLeaveItem}
              />
              <NavGroup
                label="Reports"
                items={insightItems}
                pathname={pathname}
                isCollapsed={isCollapsed}
                onHoverItem={handleHoverItem}
                onLeaveItem={handleLeaveItem}
              />
              {adminItems.length > 0 && (
                <NavGroup
                  label="Admin"
                  items={adminItems}
                  pathname={pathname}
                  isCollapsed={isCollapsed}
                  onHoverItem={handleHoverItem}
                  onLeaveItem={handleLeaveItem}
                />
              )}
            </>
          )}
        </nav>

        <div className={`border-t border-white/[0.07] ${isCollapsed ? 'p-2' : 'p-3'}`}>
          <Link
            href="/profile"
            aria-label="User profile"
            title={isCollapsed ? `${currentUser.full_name} (${currentUser.role})` : undefined}
            onMouseEnter={(e) => handleHoverItem(`${currentUser.full_name} · ${currentUser.role}`, e)}
            onMouseLeave={handleLeaveItem}
            className={`group block transition hover:border-blue-400/20 hover:bg-blue-500/[0.07] ${
              isCollapsed
                ? 'flex h-10 w-10 mx-auto items-center justify-center rounded-xl bg-white/[0.04]'
                : 'rounded-xl border border-white/[0.08] bg-gradient-to-br from-white/[0.06] to-blue-500/[0.04] p-3'
            }`}
          >
            {isCollapsed ? (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 text-[10px] font-bold text-white ring-2 ring-white/10">
                {currentUser.full_name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')}
              </span>
            ) : (
              <>
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 text-[10px] font-bold text-white ring-2 ring-white/10">
                    {currentUser.full_name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-slate-100">{currentUser.full_name}</div>
                    <div className="mt-0.5 text-[11px] capitalize text-slate-400 font-medium">{currentUser.role}</div>
                  </div>
                  <span className="text-[10px] font-semibold text-blue-300/50 group-hover:text-blue-300">Profile</span>
                </div>

                {isAgent && (
                  <>
                    <div className="mt-3 flex items-center justify-between text-[10px] text-slate-400">
                      <span>My active {leadPlural.toLowerCase()}</span>
                      <span className="font-mono font-bold text-slate-300">{currentUser.current_load}/{currentUser.max_capacity}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className={`h-full rounded-full transition-all ${
                          loadPercent >= 100
                            ? 'bg-rose-500'
                            : loadPercent >= 80
                            ? 'bg-amber-400'
                            : 'bg-gradient-to-r from-cyan-400 to-blue-500'
                        }`}
                        style={{ width: `${loadPercent}%` }}
                      />
                    </div>
                  </>
                )}
              </>
            )}
          </Link>

          <button
            type="button"
            onClick={() => {
              logout();
              router.push('/login');
            }}
            aria-label="Sign out"
            title={isCollapsed ? 'Sign out' : undefined}
            onMouseEnter={(e) => handleHoverItem('Sign out', e)}
            onMouseLeave={handleLeaveItem}
            className={`mt-2 flex items-center transition hover:bg-rose-500/15 hover:text-rose-300 text-slate-400 ${
              isCollapsed
                ? 'h-10 w-10 mx-auto justify-center rounded-xl'
                : 'min-h-10 w-full gap-2.5 rounded-lg px-3 text-[12px] font-semibold'
            }`}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!isCollapsed && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      {/* Floating tooltip displayed on hover in collapsed mode */}
      {isCollapsed && hoveredItem && (
        <div
          style={{ top: `${hoveredItem.top}px` }}
          className="fixed left-16 z-[9999] -translate-y-1/2 ml-2 pointer-events-none rounded-md border border-slate-700/80 bg-slate-950 px-2.5 py-1 text-xs font-bold text-white shadow-2xl ring-1 ring-white/10 whitespace-nowrap animate-in fade-in zoom-in-95 duration-100"
        >
          {hoveredItem.label}
        </div>
      )}
    </>
  );
}
