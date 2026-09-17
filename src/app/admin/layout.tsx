'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Activity, Building2, Database, Gauge, Home, ListPlus, Settings2, ShieldCheck, UserCog, UsersRound } from 'lucide-react';

const items = [
  { href: '/admin', label: 'Overview', description: 'Workspace administration summary', icon: Home },
  { href: '/admin/business', label: 'Workspace', description: 'Business identity and defaults', icon: Building2 },
  { href: '/admin/fields', label: 'Fields', description: 'Custom data and terminology', icon: ListPlus },
  { href: '/admin/people', label: 'People', description: 'Members and access', icon: UserCog },
  { href: '/admin/teams', label: 'Teams', description: 'Queues and team structure', icon: UsersRound },
  { href: '/admin/permissions', label: 'Permissions', description: 'Roles and capabilities', icon: ShieldCheck },
  { href: '/admin/routing', label: 'Routing & SLA', description: 'Assignment and service rules', icon: Gauge },
  { href: '/admin/data', label: 'Data', description: 'Workspace data controls', icon: Database },
  { href: '/admin/audit', label: 'Audit', description: 'Administrative activity', icon: Activity },
];

function isActive(pathname: string, href: string) {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const current = items.find((item) => isActive(pathname, item.href))?.href || '/admin';

  return (
    <div className="mx-auto w-full max-w-[96rem] px-4 py-6 sm:px-6 lg:px-8">
      <div className="grid min-w-0 gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden lg:block" aria-label="Workspace administration sections">
          <div className="mb-5 px-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-white">
              <Settings2 className="h-4 w-4" />
            </div>
            <h2 className="mt-3 text-sm font-semibold text-zinc-950">Workspace admin</h2>
            <p className="mt-1 text-xs leading-5 text-zinc-500">Manage this workspace without mixing in personal or system settings.</p>
          </div>

          <nav className="space-y-1">
            {items.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`group flex min-h-11 items-start gap-2.5 rounded-lg px-2.5 py-2 transition-colors ${active ? 'bg-white text-zinc-950 ring-1 ring-zinc-200' : 'text-zinc-600 hover:bg-white/70 hover:text-zinc-950'}`}
                >
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${active ? 'text-blue-600' : 'text-zinc-400 group-hover:text-zinc-600'}`} />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium">{item.label}</span>
                    <span className="mt-0.5 block text-[10px] leading-4 text-zinc-400">{item.description}</span>
                  </span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0">
          <div className="mb-5 lg:hidden">
            <label className="block text-xs font-medium text-zinc-600">
              Admin section
              <select
                value={current}
                onChange={(event) => router.push(event.target.value)}
                className="select-field mt-1.5 w-full bg-white"
              >
                {items.map((item) => <option key={item.href} value={item.href}>{item.label}</option>)}
              </select>
            </label>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
