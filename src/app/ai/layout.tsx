'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, BookOpenText, Bot, KeyRound, Megaphone } from 'lucide-react';

const items = [
  { href: '/ai/agents', label: 'Agents', icon: Bot },
  { href: '/ai/providers', label: 'Providers', icon: KeyRound },
  { href: '/ai/knowledge', label: 'Knowledge', icon: BookOpenText },
  { href: '/ai/ads', label: 'Ads Context', icon: Megaphone },
  { href: '/ai/operations', label: 'Operations', icon: Activity },
];

export default function AiLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-0">
      <div className="sticky top-[45px] z-20 bg-[var(--color-canvas)]/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-5 overflow-x-auto border-b border-zinc-200" aria-label="AI navigation">
            {items.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative inline-flex h-11 shrink-0 items-center gap-1.5 border-b-2 text-xs font-medium transition ${active ? 'border-blue-600 text-blue-700' : 'border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-900'}`}
                >
                  <Icon className={`h-3.5 w-3.5 ${active ? 'text-blue-600' : 'text-zinc-400'}`} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
      {children}
    </div>
  );
}
