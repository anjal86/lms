'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Building2, Database, Gauge, Home, ListPlus, ShieldCheck, UserCog, UsersRound } from 'lucide-react';

const items = [
  { href: '/admin', label: 'Overview', icon: Home },
  { href: '/admin/business', label: 'Workspace', icon: Building2 },
  { href: '/admin/fields', label: 'Fields', icon: ListPlus },
  { href: '/admin/people', label: 'People', icon: UserCog },
  { href: '/admin/teams', label: 'Teams', icon: UsersRound },
  { href: '/admin/permissions', label: 'Permissions', icon: ShieldCheck },
  { href: '/admin/routing', label: 'Routing & SLA', icon: Gauge },
  { href: '/admin/data', label: 'Data', icon: Database },
  { href: '/admin/audit', label: 'Audit', icon: Activity },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <div className="min-h-0"><div className="sticky top-[45px] z-20 border-b border-zinc-200 bg-white/95 px-4 backdrop-blur"><nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto py-2" aria-label="Workspace administration">{items.map((item) => { const Icon = item.icon; const active = pathname === item.href; return <Link key={item.href} href={item.href} className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition ${active ? 'bg-blue-50 text-blue-700' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'}`}><Icon className="h-3.5 w-3.5" />{item.label}</Link>; })}</nav></div>{children}</div>;
}
