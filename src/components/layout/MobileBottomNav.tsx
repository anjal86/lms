'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarClock, Kanban, LayoutDashboard, ListChecks, MessageSquareQuote, Users } from 'lucide-react';
import { useApp } from '@/lib/store';

type Tone = 'blue' | 'cyan' | 'amber' | 'emerald' | 'violet';

const ACTIVE_TONE: Record<Tone, string> = {
  blue: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-100',
  cyan: 'bg-cyan-50 text-cyan-700 ring-1 ring-inset ring-cyan-100',
  amber: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-100',
  emerald: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100',
  violet: 'bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-100',
};

const ICON_TONE: Record<Tone, string> = {
  blue: 'text-blue-600',
  cyan: 'text-cyan-600',
  amber: 'text-amber-600',
  emerald: 'text-emerald-600',
  violet: 'text-violet-600',
};

export default function MobileBottomNav() {
  const pathname = usePathname();
  const { currentUser } = useApp();
  const isAgent = currentUser.role === 'agent';

  const items = isAgent
    ? [
        { label: 'Today', href: '/dashboard', icon: LayoutDashboard, tone: 'blue' as const },
        { label: 'My Work', href: '/my-work', icon: ListChecks, tone: 'cyan' as const },
        { label: 'Follow-ups', href: '/my-follow-ups', icon: CalendarClock, tone: 'amber' as const },
        { label: 'Messages', href: '/templates', icon: MessageSquareQuote, tone: 'violet' as const },
      ]
    : [
        { label: 'Today', href: '/dashboard', icon: LayoutDashboard, tone: 'blue' as const },
        { label: 'All Leads', href: '/leads', icon: Kanban, tone: 'cyan' as const },
        { label: 'Follow-ups', href: '/follow-ups', icon: CalendarClock, tone: 'amber' as const },
        { label: 'Team', href: '/team', icon: Users, tone: 'emerald' as const },
      ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-blue-100/80 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_30px_rgba(37,99,235,0.08)] backdrop-blur md:hidden" aria-label="Primary navigation">
      <div className="mx-auto grid max-w-lg grid-cols-4 gap-1">
        {items.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={`flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl px-2 text-[10px] font-semibold transition-all ${
                isActive ? ACTIVE_TONE[item.tone] : 'text-zinc-500 hover:bg-blue-50/50 hover:text-zinc-900'
              }`}
            >
              <Icon className={`h-[18px] w-[18px] ${isActive ? ICON_TONE[item.tone] : 'text-zinc-500'}`} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
