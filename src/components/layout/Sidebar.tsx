'use client';

import React from 'react';
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
  Lock,
  LogOut,
} from 'lucide-react';

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { leads, followUps, currentUser, logout } = useApp();
  const canViewSettings = canAccessSettings(currentUser.role);

  const overdueCount = followUps.filter((fu) => {
    const isPast = new Date(fu.scheduled_at).getTime() < Date.now();
    return (fu.status === 'pending' || fu.status === 'missed') && isPast;
  }).length;

  const breachedSlaCount = leads.filter((l) => l.is_first_response_breached).length;
  const actionCount = overdueCount + breachedSlaCount;

  const navItems = [
    {
      label: 'Action Center',
      href: '/dashboard',
      icon: LayoutDashboard,
      badge: actionCount || null,
      alert: actionCount > 0 ? `${actionCount} urgent` : null,
    },
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
    ...(canViewSettings
      ? [
          {
            label: 'Security Audit',
            href: '/audit',
            icon: History,
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
        ]
      : []),
  ];

  return (
    <aside className="hidden md:flex w-56 bg-zinc-950 text-zinc-400 flex-col justify-between flex-shrink-0 border-r border-zinc-800/80">
      <div>
        <div className="h-12 px-4 flex items-center gap-2.5 border-b border-zinc-800/80">
          <div className="w-6 h-6 rounded bg-zinc-100 text-zinc-950 flex items-center justify-center font-bold text-xs">
            W
          </div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-100 tracking-tight">
            <span>Wanderlust</span>
            <span className="text-[10px] text-zinc-500 font-mono">CRM</span>
          </div>
        </div>

        <nav className="p-2 space-y-0.5">
          <div className="px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Workspace
          </div>
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href === '/dashboard' && pathname === '/');
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition ${
                  isActive
                    ? 'bg-zinc-900 text-zinc-100 border border-zinc-800 shadow-2xs'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-zinc-100' : 'text-zinc-400'}`} />
                  <span>{item.label}</span>
                </div>

                <div className="flex items-center gap-1">
                  {item.alert && (
                    <span suppressHydrationWarning className="text-[10px] px-1 py-0.2 rounded font-mono font-medium bg-red-950/80 text-red-400 border border-red-900/50">
                      {item.alert}
                    </span>
                  )}
                  {item.badge !== null && !item.alert && (
                    <span suppressHydrationWarning className="text-[11px] font-mono text-zinc-500">
                      {item.badge}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-3 border-t border-zinc-800/80 space-y-2">
        <Link
          href="/profile"
          className="block p-2.5 rounded-md bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 hover:border-zinc-700 text-xs transition group"
        >
          <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1.5">
            <span className="font-medium group-hover:text-zinc-200 transition">My Profile</span>
            <span suppressHydrationWarning className="font-mono text-zinc-300">
              {currentUser.current_load}/{currentUser.max_capacity} leads
            </span>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-1 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                currentUser.current_load >= currentUser.max_capacity ? 'bg-red-500' : 'bg-zinc-400'
              }`}
              style={{
                width: `${Math.min(100, (currentUser.current_load / currentUser.max_capacity) * 100)}%`,
              }}
            />
          </div>
          <div className="mt-2 text-[10px] text-zinc-500 group-hover:text-zinc-400 truncate flex items-center justify-between">
            <span className="truncate">{currentUser.destination_tags.slice(0, 2).join(', ')}</span>
            <span className="text-[9px] font-mono text-zinc-500 uppercase">Edit →</span>
          </div>
        </Link>

        {!canViewSettings && (
          <div className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-zinc-600 font-mono">
            <Lock className="w-3 h-3 text-zinc-600" />
            <span>Settings — Admin/Manager Only</span>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            logout();
            router.push('/login');
          }}
          aria-label="Log out of Wanderlust CRM"
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] text-zinc-500 hover:text-red-400 hover:bg-zinc-900/80 transition cursor-pointer"
        >
          <LogOut className="w-3 h-3" />
          <span>Log Out</span>
        </button>
      </div>
    </aside>
  );
}
