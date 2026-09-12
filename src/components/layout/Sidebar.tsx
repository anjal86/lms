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
  Settings,
  History,
  LogOut,
  UserCog,
} from 'lucide-react';

type NavItem = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
};

function NavGroup({
  label,
  items,
  pathname,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
}) {
  return (
    <div className="space-y-1">
      <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
        {label}
      </div>
      {items.map((item) => {
        const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`));
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={`group flex min-h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition ${
              isActive
                ? 'bg-white/10 text-white shadow-inner shadow-white/[0.03]'
                : 'text-zinc-400 hover:bg-white/[0.055] hover:text-zinc-100'
            }`}
          >
            <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-blue-400' : 'text-zinc-500 group-hover:text-zinc-300'}`} />
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

  const workItems: NavItem[] = [
    { label: 'Action Center', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Pipeline', href: '/leads', icon: Kanban },
    { label: 'Follow-ups', href: '/follow-ups', icon: CalendarClock },
    { label: 'Team', href: '/team', icon: Users },
  ];

  const insightItems: NavItem[] = [
    { label: 'Performance', href: '/analytics', icon: BarChart3 },
    { label: 'Incentives', href: '/incentives', icon: Trophy },
    { label: 'Templates', href: '/templates', icon: MessageSquareQuote },
  ];

  const adminItems: NavItem[] = canManage
    ? [
        { label: 'User Management', href: '/team/users', icon: UserCog },
        { label: 'Security Audit', href: '/audit', icon: History },
        { label: 'Settings', href: '/settings', icon: Settings },
      ]
    : [];

  const loadPercent = currentUser.max_capacity > 0
    ? Math.min(100, Math.round((currentUser.current_load / currentUser.max_capacity) * 100))
    : 0;

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-zinc-900 bg-zinc-950 text-zinc-300 md:flex">
      <div className="flex h-16 items-center border-b border-white/[0.06] px-4">
        <Link href="/dashboard" className="flex items-center gap-3 rounded-lg" aria-label="Wanderlust CRM home">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-xs font-bold text-zinc-950 shadow-sm">W</span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold tracking-[-0.01em] text-white">Wanderlust</span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">Travel CRM</span>
          </span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 py-3">
        <NavGroup label="Work" items={workItems} pathname={pathname} />
        <NavGroup label="Insights" items={insightItems} pathname={pathname} />
        {adminItems.length > 0 && <NavGroup label="Admin" items={adminItems} pathname={pathname} />}
      </nav>

      <div className="border-t border-white/[0.06] p-3">
        <Link
          href="/profile"
          className="group block rounded-xl border border-white/[0.07] bg-white/[0.035] p-3 transition hover:border-white/[0.12] hover:bg-white/[0.055]"
        >
          <div className="flex items-center gap-2.5">
            <img
              src={currentUser.avatar_url}
              alt=""
              className="h-8 w-8 rounded-full object-cover ring-1 ring-white/10"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-zinc-100">{currentUser.full_name}</div>
              <div className="mt-0.5 text-[11px] capitalize text-zinc-500">{currentUser.role}</div>
            </div>
            <span className="text-[10px] font-medium text-zinc-600 group-hover:text-zinc-400">Edit</span>
          </div>

          <div className="mt-3 flex items-center justify-between text-[10px] text-zinc-500">
            <span>Lead capacity</span>
            <span className="font-mono text-zinc-400">{currentUser.current_load}/{currentUser.max_capacity}</span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-zinc-800">
            <div
              className={`h-full rounded-full transition-all ${loadPercent >= 100 ? 'bg-red-500' : loadPercent >= 80 ? 'bg-amber-400' : 'bg-blue-500'}`}
              style={{ width: `${loadPercent}%` }}
            />
          </div>
        </Link>

        <button
          type="button"
          onClick={() => {
            logout();
            router.push('/login');
          }}
          className="mt-2 flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 text-[12px] font-medium text-zinc-500 transition hover:bg-red-500/10 hover:text-red-300"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
