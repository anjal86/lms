'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useApp } from '@/lib/store';
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

function NavGroup({ label, items, pathname }: { label: string; items: NavItem[]; pathname: string }) {
  return (
    <div className="space-y-1">
      <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      {items.map((item) => {
        const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`));
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={`group flex min-h-11 items-center gap-3 rounded-xl px-3 text-[13px] font-medium transition-all ${
              isActive
                ? `${ACTIVE_TONES[item.tone]} shadow-sm`
                : 'text-slate-400 hover:bg-white/[0.055] hover:text-slate-100'
            }`}
          >
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
              isActive ? 'bg-white/[0.08]' : 'bg-white/[0.025] group-hover:bg-white/[0.05]'
            }`}>
              <Icon className={`h-4 w-4 ${isActive ? ICON_TONES[item.tone] : 'text-slate-500 group-hover:text-slate-300'}`} />
            </span>
            <span className="truncate">{item.label}</span>
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
  const canManage = canAccessSettings(currentUser.role);
  const isAgent = currentUser.role === 'agent';

  const agentItems: NavItem[] = [
    { label: 'Today', href: '/dashboard', icon: LayoutDashboard, tone: 'blue' },
    { label: 'Inbox', href: '/inbox', icon: MessageSquare, tone: 'cyan' },
    { label: 'My Work', href: '/my-work', icon: ListChecks, tone: 'cyan' },
    { label: 'Follow-ups', href: '/my-follow-ups', icon: CalendarClock, tone: 'amber' },
    { label: 'Messages', href: '/templates', icon: MessageSquareQuote, tone: 'violet' },
  ];

  const workItems: NavItem[] = [
    { label: 'Today', href: '/dashboard', icon: LayoutDashboard, tone: 'blue' },
    { label: 'Inbox', href: '/inbox', icon: MessageSquare, tone: 'blue' },
    { label: 'All Leads', href: '/leads', icon: Kanban, tone: 'cyan' },
    { label: 'Follow-ups', href: '/follow-ups', icon: CalendarClock, tone: 'amber' },
    { label: 'Team', href: '/team', icon: Users, tone: 'emerald' },
  ];

  const insightItems: NavItem[] = [
    { label: 'Performance', href: '/analytics', icon: BarChart3, tone: 'violet' },
    { label: 'Incentives', href: '/incentives', icon: Trophy, tone: 'amber' },
    { label: 'Messages', href: '/templates', icon: MessageSquareQuote, tone: 'rose' },
  ];

  const adminItems: NavItem[] = canManage
    ? [
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
    <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-800/80 bg-[linear-gradient(180deg,#081226_0%,#0b1730_48%,#10172a_100%)] text-slate-300 md:flex">
      <div className="flex h-16 items-center border-b border-white/[0.07] px-4">
        <Link href="/dashboard" className="flex items-center gap-3 rounded-lg" aria-label="Wanderlust home">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-violet-500 text-xs font-bold text-white shadow-lg shadow-blue-950/30 ring-1 ring-white/20">W</span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold tracking-[-0.01em] text-white">Wanderlust</span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-300/60">Travel Workspace</span>
          </span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 py-3">
        {isAgent ? (
          <NavGroup label="My day" items={agentItems} pathname={pathname} />
        ) : (
          <>
            <NavGroup label="Work" items={workItems} pathname={pathname} />
            <NavGroup label="Reports" items={insightItems} pathname={pathname} />
            {adminItems.length > 0 && <NavGroup label="Admin" items={adminItems} pathname={pathname} />}
          </>
        )}
      </nav>

      <div className="border-t border-white/[0.07] p-3">
        <Link href="/profile" className="group block rounded-xl border border-white/[0.08] bg-gradient-to-br from-white/[0.06] to-blue-500/[0.04] p-3 transition hover:border-blue-400/20 hover:bg-blue-500/[0.07]">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 text-[10px] font-bold text-white ring-2 ring-white/10">
              {currentUser.full_name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-slate-100">{currentUser.full_name}</div>
              <div className="mt-0.5 text-[11px] capitalize text-slate-500">{currentUser.role}</div>
            </div>
            <span className="text-[10px] font-medium text-blue-300/50 group-hover:text-blue-300">Profile</span>
          </div>

          {isAgent && (
            <>
              <div className="mt-3 flex items-center justify-between text-[10px] text-slate-500">
                <span>My active leads</span>
                <span className="font-mono text-slate-300">{currentUser.current_load}/{currentUser.max_capacity}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div className={`h-full rounded-full transition-all ${loadPercent >= 100 ? 'bg-rose-500' : loadPercent >= 80 ? 'bg-amber-400' : 'bg-gradient-to-r from-cyan-400 to-blue-500'}`} style={{ width: `${loadPercent}%` }} />
              </div>
            </>
          )}
        </Link>

        <button
          type="button"
          onClick={() => {
            logout();
            router.push('/login');
          }}
          className="mt-2 flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 text-[12px] font-medium text-slate-500 transition hover:bg-rose-500/10 hover:text-rose-300"
        >
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </button>
      </div>
    </aside>
  );
}
