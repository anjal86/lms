'use client';

import Link from 'next/link';
import { Activity, ArrowRight, BookOpenText, Bot, KeyRound, Megaphone, ShieldCheck } from 'lucide-react';
import { useApp } from '@/lib/store';

const items = [
  { href: '/ai/agents', title: 'Agents', description: 'Customer-facing AI agents, modes, handoff and channel binding.', icon: Bot },
  { href: '/ai/providers', title: 'Providers', description: 'Workspace BYOK model providers, health and connection testing.', icon: KeyRound },
  { href: '/ai/knowledge', title: 'Knowledge', description: 'Verified FAQs, services, pricing and policies used by AI.', icon: BookOpenText },
  { href: '/ai/ads', title: 'Ads Context', description: 'Automatic Meta ad-origin context and optional business overrides.', icon: Megaphone },
  { href: '/ai/operations', title: 'Operations', description: 'Runs, latency, usage, failures, handoffs and provider health.', icon: Activity },
];

export default function AiHubPage() {
  const { currentUser } = useApp();
  if (currentUser.role === 'agent') {
    return <div className="mx-auto max-w-xl py-20 text-center"><ShieldCheck className="mx-auto h-7 w-7 text-zinc-400" /><h1 className="mt-3 text-lg font-semibold text-zinc-950">AI administration unavailable</h1><p className="mt-1 text-sm text-zinc-500">Workspace managers and administrators configure AI resources.</p></div>;
  }
  return <div className="app-page mx-auto max-w-6xl space-y-6"><header className="page-header"><div><p className="page-eyebrow">Intelligence</p><h1 className="page-title">AI</h1><p className="page-description">Configure and operate workspace intelligence where it is used—not inside generic workspace settings.</p></div></header><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{items.map((item) => { const Icon = item.icon; return <Link key={item.href} href={item.href} className="surface-flat group min-h-[155px] p-5 transition hover:border-zinc-400 hover:bg-zinc-50"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700"><Icon className="h-4 w-4" /></div><h2 className="mt-4 text-sm font-semibold text-zinc-950">{item.title}</h2><p className="mt-1.5 text-xs leading-5 text-zinc-500">{item.description}</p><div className="mt-3 flex items-center gap-1 text-xs font-semibold text-zinc-700">Open <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></div></Link>; })}</div></div>;
}
