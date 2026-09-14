'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  CalendarClock,
  Ellipsis,
  Inbox,
  Kanban,
  LayoutDashboard,
  Settings,
  User,
  UserCog,
  Users,
  X,
  Zap,
} from 'lucide-react';
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

type MoreItem = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  description: string;
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

function pathActive(pathname: string, href: string) {
  return pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`));
}

export default function MobileBottomNav() {
  const pathname = usePathname();
  const { currentUser } = useApp();
  const { term, moduleEnabled } = useWorkspace();
  const { can } = useWorkspacePermissions();
  const [moreOpen, setMoreOpen] = useState(false);
  const isAgent = currentUser.role === 'agent';
  const leadPlural = term('lead_plural', 'Opportunities');
  const contactPlural = term('contact_plural', 'Contacts');
  const inboxEnabled = moduleEnabled('inbox', true);
  const leadsEnabled = moduleEnabled('leads', true);
  const tasksEnabled = moduleEnabled('tasks', true);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  const primaryItems: MobileNavItem[] = [
    { label: 'Today', href: '/dashboard', icon: LayoutDashboard, tone: 'blue' },
    ...(inboxEnabled && can('inbox.view') ? [{ label: 'Inbox', href: '/inbox', icon: Inbox, tone: 'cyan' as const }] : []),
    ...(leadsEnabled ? [{ label: leadPlural, href: isAgent ? '/my-work' : '/leads', icon: Kanban, tone: 'violet' as const }] : []),
    ...(tasksEnabled ? [{ label: 'Due Work', href: '/work', icon: CalendarClock, tone: 'amber' as const }] : []),
    ...(isAgent && inboxEnabled && can('contacts.view') ? [{ label: contactPlural, href: '/contacts', icon: Users, tone: 'emerald' as const }] : []),
  ];

  const moreItems: MoreItem[] = isAgent ? [] : [
    ...(inboxEnabled && can('contacts.view') ? [{ label: contactPlural, href: '/contacts', icon: Users, description: 'Customer identities and lifecycle' }] : []),
    { label: 'Team', href: '/team', icon: UserCog, description: 'People, workload and availability' },
    ...(can('reports.view') ? [{ label: 'Reports', href: '/reports', icon: BarChart3, description: 'Performance and operational reporting' }] : []),
    ...(can('automations.view') ? [{ label: 'Automations', href: '/settings/automations', icon: Zap, description: 'Routing and workflow rules' }] : []),
    { label: 'Settings', href: '/settings/workspace', icon: Settings, description: 'Workspace configuration' },
    { label: 'My Profile', href: '/profile', icon: User, description: 'Status and account' },
  ];

  const moreActive = moreItems.some((item) => pathActive(pathname, item.href));
  const navCount = primaryItems.length + (isAgent ? 0 : 1);

  return (
    <>
      {moreOpen && !isAgent && (
        <div className="fixed inset-0 z-50 bg-zinc-950/35 backdrop-blur-[2px] md:hidden" onClick={() => setMoreOpen(false)}>
          <section role="dialog" aria-modal="true" aria-label="More navigation" className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-zinc-200 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-200" />
            <div className="flex items-center justify-between gap-3">
              <div><div className="text-sm font-semibold text-zinc-950">Manage workspace</div><div className="mt-0.5 text-[11px] text-zinc-500">Management and configuration tools</div></div>
              <button type="button" onClick={() => setMoreOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-xl text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900" aria-label="Close more menu"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {moreItems.map((item) => {
                const Icon = item.icon;
                const active = pathActive(pathname, item.href);
                return <Link key={item.href} href={item.href} className={`flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2.5 ${active ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50'}`}><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-blue-100 text-blue-700' : 'bg-zinc-100 text-zinc-600'}`}><Icon className="h-4 w-4" /></span><span className="min-w-0"><span className="block text-xs font-semibold">{item.label}</span><span className="mt-0.5 block truncate text-[10px] text-zinc-500">{item.description}</span></span></Link>;
              })}
            </div>
          </section>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-blue-100/80 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_30px_rgba(37,99,235,0.08)] backdrop-blur md:hidden" aria-label="Primary navigation">
        <div
          className="mx-auto grid max-w-lg gap-1"
          style={{ gridTemplateColumns: `repeat(${Math.max(1, navCount)}, minmax(0, 1fr))` }}
        >
          {primaryItems.map((item) => {
            const isActive = pathActive(pathname, item.href);
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
          {!isAgent && (
            <button type="button" onClick={() => setMoreOpen(true)} aria-expanded={moreOpen} aria-haspopup="dialog" className={`flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl px-2 text-[10px] font-semibold transition-all ${moreActive || moreOpen ? 'bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-100' : 'text-zinc-500 hover:bg-blue-50/50 hover:text-zinc-900'}`}>
              <Ellipsis className={`h-[18px] w-[18px] ${moreActive || moreOpen ? 'text-violet-600' : 'text-zinc-500'}`} />
              <span>More</span>
            </button>
          )}
        </div>
      </nav>
    </>
  );
}
