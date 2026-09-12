'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarClock, Kanban, LayoutDashboard, ListChecks, MessageSquareQuote, Users } from 'lucide-react';
import { useApp } from '@/lib/store';

export default function MobileBottomNav() {
  const pathname = usePathname();
  const { currentUser } = useApp();
  const isAgent = currentUser.role === 'agent';

  const items = isAgent
    ? [
        { label: 'Today', href: '/dashboard', icon: LayoutDashboard },
        { label: 'My Work', href: '/my-work', icon: ListChecks },
        { label: 'Follow-ups', href: '/follow-ups', icon: CalendarClock },
        { label: 'Messages', href: '/templates', icon: MessageSquareQuote },
      ]
    : [
        { label: 'Today', href: '/dashboard', icon: LayoutDashboard },
        { label: 'All Leads', href: '/leads', icon: Kanban },
        { label: 'Follow-ups', href: '/follow-ups', icon: CalendarClock },
        { label: 'Team', href: '/team', icon: Users },
      ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] backdrop-blur md:hidden" aria-label="Primary navigation">
      <div className="mx-auto grid max-w-lg grid-cols-4 gap-1">
        {items.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={`flex min-h-[50px] flex-col items-center justify-center gap-1 rounded-lg px-2 text-[10px] font-semibold transition ${
                isActive ? 'bg-blue-50 text-blue-700' : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900'
              }`}
            >
              <Icon className={`h-[18px] w-[18px] ${isActive ? 'text-blue-600' : 'text-zinc-500'}`} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
