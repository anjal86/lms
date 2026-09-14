'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Kanban,
  LayoutDashboard,
  LogOut,
  Settings,
  UserCog,
  Users,
} from 'lucide-react';
import { useApp } from '@/lib/store';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';
import { useWorkspacePermissions } from '@/lib/use-workspace-permissions';

type Tone = 'blue' | 'cyan' | 'amber' | 'emerald' | 'violet' | 'rose';
type NavItem = { label: string; href: string; icon: typeof LayoutDashboard; tone: Tone };

const ACTIVE: Record<Tone, string> = {
  blue: 'bg-blue-500/15 text-blue-50 ring-1 ring-inset ring-blue-400/20',
  cyan: 'bg-cyan-500/15 text-cyan-50 ring-1 ring-inset ring-cyan-400/20',
  amber: 'bg-amber-500/15 text-amber-50 ring-1 ring-inset ring-amber-400/20',
  emerald: 'bg-emerald-500/15 text-emerald-50 ring-1 ring-inset ring-emerald-400/20',
  violet: 'bg-violet-500/15 text-violet-50 ring-1 ring-inset ring-violet-400/20',
  rose: 'bg-rose-500/15 text-rose-50 ring-1 ring-inset ring-rose-400/20',
};

function Group({ label, items, pathname, collapsed }: { label: string; items: NavItem[]; pathname: string; collapsed: boolean }) {
  if (!items.length) return null;
  return <div className="space-y-1">
    {collapsed ? <div className="mx-1.5 my-2.5 h-px bg-white/[0.08]" /> : <div className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</div>}
    {items.map((item) => {
      const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`));
      const Icon = item.icon;
      return <Link key={item.href} href={item.href} title={collapsed ? item.label : undefined} aria-label={item.label} aria-current={active ? 'page' : undefined} className={`group flex items-center transition-all ${collapsed ? 'mx-auto h-10 w-10 justify-center rounded-xl' : 'min-h-11 gap-3 rounded-xl px-3 text-[13px] font-semibold'} ${active ? `${ACTIVE[item.tone]} shadow-sm` : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-100'}`}><span className={`flex shrink-0 items-center justify-center rounded-lg ${collapsed ? 'h-8 w-8' : 'h-7 w-7'} ${active ? 'bg-white/[0.08]' : 'bg-white/[0.025] group-hover:bg-white/[0.05]'}`}><Icon className="h-4 w-4" /></span>{!collapsed && <span className="truncate">{item.label}</span>}</Link>;
    })}
  </div>;
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, logout } = useApp();
  const { config, term, moduleEnabled } = useWorkspace();
  const { can } = useWorkspacePermissions();
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = localStorage.getItem('travel_lms_sidebar_collapsed');
        if (stored !== null) setCollapsed(stored === 'true');
      } catch { /* noop */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const toggle = () => setCollapsed((value) => {
    const next = !value;
    try { localStorage.setItem('travel_lms_sidebar_collapsed', String(next)); } catch { /* noop */ }
    return next;
  });

  const inboxEnabled = moduleEnabled('inbox', true);
  const leadsEnabled = moduleEnabled('leads', true);
  const tasksEnabled = moduleEnabled('tasks', true);
  const leadPlural = term('lead_plural', 'Opportunities');
  const contactPlural = term('contact_plural', 'Contacts');
  const workspaceName = config.workspace.name || 'Workspace';
  const initial = workspaceName.trim().charAt(0).toUpperCase() || 'W';
  const isAgent = currentUser.role === 'agent';

  const work: NavItem[] = [
    { label: 'Today', href: '/dashboard', icon: LayoutDashboard, tone: 'blue' },
    ...(inboxEnabled && can('inbox.view') ? [{ label: 'Inbox', href: '/inbox', icon: Inbox, tone: 'cyan' as const }] : []),
    ...(leadsEnabled ? [{ label: leadPlural, href: isAgent ? '/my-work' : '/leads', icon: Kanban, tone: 'cyan' as const }] : []),
    ...(tasksEnabled ? [{ label: 'Due Work', href: '/work', icon: CalendarClock, tone: 'amber' as const }] : []),
    ...(inboxEnabled && can('contacts.view') ? [{ label: contactPlural, href: '/contacts', icon: Users, tone: 'emerald' as const }] : []),
  ];

  const manage: NavItem[] = isAgent ? [] : [
    { label: 'Team', href: '/team', icon: UserCog, tone: 'emerald' },
    ...(can('reports.view') ? [{ label: 'Reports', href: '/reports', icon: BarChart3, tone: 'violet' as const }] : []),
  ];

  const admin: NavItem[] = isAgent ? [] : [
    { label: 'Settings', href: '/settings/workspace', icon: Settings, tone: 'blue' },
  ];

  const signOut = async () => { await logout(); router.push('/login'); };

  return <aside className={`hidden shrink-0 flex-col border-r border-slate-800/80 bg-[linear-gradient(180deg,#081226_0%,#0b1730_48%,#10172a_100%)] text-slate-300 transition-[width] duration-200 md:flex ${collapsed ? 'w-16' : 'w-60'}`}>
    <div className={`flex h-16 items-center border-b border-white/[0.07] ${collapsed ? 'justify-center px-2' : 'justify-between px-4'}`}><Link href="/dashboard" className="flex min-w-0 items-center gap-3" title={collapsed ? workspaceName : undefined}><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-violet-500 text-xs font-bold text-white ring-1 ring-white/20">{initial}</span>{!collapsed && <span className="min-w-0"><span className="block truncate text-sm font-bold text-white">{workspaceName}</span><span className="block truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-300/60">Business workspace</span></span>}</Link>{!collapsed && <button type="button" onClick={toggle} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Collapse sidebar"><ChevronLeft className="h-4 w-4" /></button>}</div>
    {collapsed && <div className="flex justify-center pb-0.5 pt-2"><button type="button" onClick={toggle} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Expand sidebar" title="Expand sidebar"><ChevronRight className="h-4 w-4" /></button></div>}
    <nav className={`flex-1 overflow-y-auto py-2 ${collapsed ? 'px-2' : 'px-2.5'}`}><Group label="Work" items={work} pathname={pathname} collapsed={collapsed} /><Group label="Manage" items={manage} pathname={pathname} collapsed={collapsed} /><Group label="Workspace" items={admin} pathname={pathname} collapsed={collapsed} /></nav>
    <div className={`border-t border-white/[0.07] ${collapsed ? 'p-2' : 'p-3'}`}><Link href="/profile" title={collapsed ? `${currentUser.full_name} · ${currentUser.role}` : undefined} className={`block rounded-xl bg-white/[0.04] hover:bg-white/[0.07] ${collapsed ? 'p-1' : 'p-3'}`}><div className="flex items-center gap-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 text-[10px] font-bold text-white">{currentUser.full_name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')}</span>{!collapsed && <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-semibold text-slate-100">{currentUser.full_name}</div><div className="text-[10px] uppercase tracking-wide text-slate-500">{currentUser.role}</div></div>}</div></Link><button type="button" onClick={() => void signOut()} title={collapsed ? 'Sign out' : undefined} className={`mt-2 flex items-center rounded-xl text-slate-400 hover:bg-rose-500/10 hover:text-rose-300 ${collapsed ? 'h-10 w-10 justify-center' : 'w-full gap-2 px-3 py-2 text-xs font-semibold'}`}><LogOut className="h-4 w-4" />{!collapsed && 'Sign out'}</button></div>
  </aside>;
}
