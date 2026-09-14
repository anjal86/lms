'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarClock, Inbox, Kanban, LayoutDashboard, Users } from 'lucide-react';
import { useApp } from '@/lib/store';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';
import { useWorkspacePermissions } from '@/lib/use-workspace-permissions';

type Tone = 'blue' | 'cyan' | 'amber' | 'emerald' | 'violet';

type MobileNavItem = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  tone: Tone;
};

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
  const { term, moduleEnabled } = useWorkspace();
  const { can } = useWorkspacePermissions();
  const isAgent = currentUser.role === 'agent';
  const leadPlural = term('lead_plural', 'Opportunities');
  const contactPlural = term('contact_plural', 'Contacts');
  const inboxEnabled = moduleEnabled('inbox', true);
  const leadsEnabled = moduleEnabled('leads', true);
  const tasksEnabled = moduleEnabled('tasks', true);

  const items: MobileNavItem[] = [
    { label: 'Today', href: '/dashboard', icon: LayoutDashboard, tone: 'blue' },
    ...(inboxEnabled && can('inbox.view') ? [{ label: 'Inbox', href: '/inbox', icon: Inbox, tone: 'cyan' as const }] : []),
    ...(leadsEnabled ? [{ label: leadPlural, href: isAgent ? '/my-work' : '/leads', icon: Kanban, tone: 'cyan' as const }] : []),
    ...(tasksEnabled ? [{ label: 'Due Work', href: '/work', icon: CalendarClock, tone: 'amber' as const }] : []),
    ...(inboxEnabled && can('contacts.view') ? [{ label: contactPlural, href: '/contacts', icon: Users, tone: 'emerald' as const }] : []),
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-blue-100/80 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_30px_rgba(37,99,235,0.08)] backdrop-blur md:hidden" aria-label="Primary navigation">
      <div
        className="mx-auto grid max-w-lg gap-1"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, items.length)}, minmax(0, 1fr))` }}
      >
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
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
