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
  return <div className="min-h-0"><div className="sticky top-[45px] z-20 border-b border-zinc-200 bg-white/95 px-4 backdrop-blur"><nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto py-2" aria-label="AI navigation">{items.map((item) => { const Icon = item.icon; const active = pathname === item.href; return <Link key={item.href} href={item.href} className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition ${active ? 'bg-blue-50 text-blue-700' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'}`}><Icon className="h-3.5 w-3.5" />{item.label}</Link>; })}</nav></div>{children}</div>;
}
