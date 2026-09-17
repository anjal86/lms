'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BellRing, LockKeyhole, Settings2, UserRound } from 'lucide-react';

const items = [
  { href: '/account/profile', label: 'Profile', icon: UserRound },
  { href: '/account/preferences', label: 'Preferences', icon: Settings2 },
  { href: '/account/notifications', label: 'Notifications', icon: BellRing },
  { href: '/account/security', label: 'Security', icon: LockKeyhole },
];

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="app-page mx-auto max-w-6xl">
      <header className="mb-6">
        <p className="page-eyebrow">Account</p>
        <h1 className="page-title">Account settings</h1>
        <p className="page-description">Settings that belong to you and follow you independently of workspace administration.</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside>
          <nav className="surface-flat p-2" aria-label="Account settings">
            {items.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link key={item.href} href={item.href} className={`flex h-10 items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition ${active ? 'bg-blue-50 text-blue-700' : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950'}`}>
                  <Icon className={`h-4 w-4 ${active ? 'text-blue-600' : 'text-zinc-400'}`} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <p className="mt-3 px-2 text-[11px] leading-5 text-zinc-400">Workspace membership, roles and business configuration are managed separately under Admin.</p>
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
