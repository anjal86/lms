'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  CalendarClock,
  Inbox,
  Kanban,
  LayoutDashboard,
  LogOut,
  Settings,
  Settings2,
  UserCog,
  Users,
  Zap,
} from 'lucide-react';
import { useApp } from '@/lib/store';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';
import { useWorkspacePermissions } from '@/lib/use-workspace-permissions';
import { AgentStatus } from '@/lib/types';
import WorkspaceSwitcher from './WorkspaceSwitcher';

type NavItem = { label: string; href: string; icon: typeof LayoutDashboard };

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`));
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-label={item.label}
      aria-current={active ? 'page' : undefined}
      className={`group flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors ${
        active
          ? 'bg-white text-zinc-900 shadow-xs ring-1 ring-zinc-200/80'
          : 'text-zinc-600 hover:bg-zinc-200/50 hover:text-zinc-900'
      }`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-zinc-800' : 'text-zinc-400 group-hover:text-zinc-600'}`} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function NavGroup({ label, items, pathname }: { label: string; items: NavItem[]; pathname: string }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{label}</p>
      <div className="space-y-0.5">
        {items.map((item) => <NavLink key={item.href} item={item} pathname={pathname} />)}
      </div>
    </div>
  );
}

const STATUS_CONFIG: Record<AgentStatus, { label: string; dot: string }> = {
  available: { label: 'Available',  dot: 'bg-emerald-500' },
  in_call:   { label: 'In a call',  dot: 'bg-amber-500'  },
  on_break:  { label: 'On a break', dot: 'bg-blue-500'   },
  offline:   { label: 'Offline',    dot: 'bg-zinc-400'   },
};

function UserMenu({
  fullName,
  role,
  status,
  onStatusChange,
  onSignOut,
}: {
  fullName: string;
  role: string;
  status: AgentStatus;
  onStatusChange: (s: AgentStatus) => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initials = fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
  const currentStatus = STATUS_CONFIG[status] ?? STATUS_CONFIG.offline;

  useEffect(() => {
    if (!open) return;
    const onMouse = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onMouse);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onMouse); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="User menu"
        className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-left transition-colors hover:bg-zinc-200/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
      >
        {/* Avatar with status ring */}
        <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-zinc-900 text-[10px] font-bold text-white">
          {initials}
          {/* Status micro-dot */}
          <span className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-zinc-50 ${currentStatus.dot}`} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-zinc-900">{fullName}</div>
        </div>
        <Settings2 className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
      </button>

      {/* Popup */}
      {open && (
        <div
          role="menu"
          className="absolute bottom-[calc(100%+4px)] left-0 z-50 w-56 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg animate-in fade-in-0 zoom-in-95 duration-100"
        >
          {/* Identity */}
          <div className="border-b border-zinc-100 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-900 text-[10px] font-bold text-white">
                {initials}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-zinc-900">{fullName}</div>
                <div className="text-[10px] capitalize text-zinc-500">{role}</div>
              </div>
            </div>
          </div>

          {/* Status switcher */}
          <div className="border-b border-zinc-100 p-1.5">
            <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Status</p>
            {(Object.entries(STATUS_CONFIG) as [AgentStatus, { label: string; dot: string }][]).map(([key, cfg]) => (
              <button
                key={key}
                type="button"
                role="menuitem"
                onClick={() => { onStatusChange(key); setOpen(false); }}
                className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
                  status === key
                    ? 'bg-zinc-100 font-semibold text-zinc-900'
                    : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
                }`}
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${cfg.dot}`} />
                {cfg.label}
              </button>
            ))}
          </div>

          {/* Account */}
          <div className="p-1">
            <Link
              href="/profile"
              onClick={() => setOpen(false)}
              role="menuitem"
              className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-zinc-700 transition-colors hover:bg-zinc-50 hover:text-zinc-900"
            >
              <Settings className="h-3.5 w-3.5 text-zinc-400" />
              Account settings
            </Link>
          </div>

          {/* Sign out */}
          <div className="border-t border-zinc-100 p-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); onSignOut(); }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-zinc-700 transition-colors hover:bg-zinc-50 hover:text-zinc-900"
            >
              <LogOut className="h-3.5 w-3.5 text-zinc-400" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, logout, updateAgentStatus, showToast } = useApp();
  const { term, moduleEnabled } = useWorkspace();
  const { can } = useWorkspacePermissions();

  const inboxEnabled = moduleEnabled('inbox', true);
  const leadsEnabled = moduleEnabled('leads', true);
  const tasksEnabled = moduleEnabled('tasks', true);
  const leadPlural = term('lead_plural', 'Opportunities');
  const contactPlural = term('contact_plural', 'Contacts');
  const isAgent = currentUser.role === 'agent';

  const work: NavItem[] = [
    { label: 'Today',   href: '/dashboard',               icon: LayoutDashboard },
    ...(inboxEnabled && can('inbox.view')    ? [{ label: 'Inbox',    href: '/inbox',                      icon: Inbox        }] : []),
    ...(leadsEnabled                         ? [{ label: leadPlural, href: isAgent ? '/my-work' : '/leads', icon: Kanban       }] : []),
    ...(tasksEnabled                         ? [{ label: 'Due Work', href: '/work',                         icon: CalendarClock }] : []),
    ...(inboxEnabled && can('contacts.view') ? [{ label: contactPlural, href: '/contacts',                  icon: Users        }] : []),
  ];

  const manage: NavItem[] = isAgent ? [] : [
    { label: 'Team',        href: '/team',                  icon: UserCog  },
    ...(can('reports.view')     ? [{ label: 'Reports',     href: '/reports',              icon: BarChart3 }] : []),
    ...(can('automations.view') ? [{ label: 'Automations', href: '/settings/automations', icon: Zap       }] : []),
  ];

  const admin: NavItem[] = isAgent ? [] : [
    { label: 'Settings', href: '/settings/workspace', icon: Settings },
  ];

  const handleStatusChange = (status: AgentStatus) => {
    updateAgentStatus(status);
    showToast(`Status: ${STATUS_CONFIG[status].label}`, 'info');
  };

  const signOut = async () => { await logout(); router.push('/login'); };

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 md:flex">
      {/* ── Workspace Switcher ── */}
      <div className="border-b border-zinc-200 px-2 py-2.5">
        <WorkspaceSwitcher />
      </div>

      {/* ── Main Nav ── */}
      <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
        <NavGroup label="Work"      items={work}   pathname={pathname} />
        {manage.length > 0 && <NavGroup label="Manage"    items={manage} pathname={pathname} />}
        {admin.length  > 0 && <NavGroup label="Workspace" items={admin}  pathname={pathname} />}
      </nav>

      {/* ── User Menu ── */}
      <div className="border-t border-zinc-200 px-2 py-2.5">
        <UserMenu
          fullName={currentUser.full_name}
          role={currentUser.role}
          status={(currentUser.status as AgentStatus) ?? 'offline'}
          onStatusChange={handleStatusChange}
          onSignOut={() => void signOut()}
        />
      </div>
    </aside>
  );
}
