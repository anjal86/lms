'use client';

import Link from 'next/link';
import { Activity, ArrowRight, BookOpenText, Bot, KeyRound, Megaphone, ShieldCheck } from 'lucide-react';
import { useApp } from '@/lib/store';

type AiItem = {
  href: string;
  title: string;
  description: string;
  icon: typeof Bot;
};

function AiGroup({ title, description, items }: { title: string; description: string; items: AiItem[] }) {
  return (
    <section>
      <div className="mb-2.5">
        <h2 className="text-[13px] font-semibold text-zinc-900">{title}</h2>
        <p className="mt-0.5 text-xs leading-5 text-zinc-500">{description}</p>
      </div>
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        {items.map((item, index) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex min-h-[72px] items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-zinc-50 ${index > 0 ? 'border-t border-zinc-100' : ''}`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-600">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-zinc-900">{item.title}</span>
                <span className="mt-0.5 block text-xs leading-5 text-zinc-500">{item.description}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-500" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export default function AiHubPage() {
  const { currentUser } = useApp();

  if (currentUser.role === 'agent') {
    return <div className="mx-auto max-w-xl py-20 text-center"><ShieldCheck className="mx-auto h-7 w-7 text-zinc-400" /><h1 className="mt-3 text-lg font-semibold text-zinc-950">AI administration unavailable</h1><p className="mt-1 text-sm text-zinc-500">Workspace managers and administrators configure AI resources.</p></div>;
  }

  const groups = [
    {
      title: 'Build',
      description: 'Configure how AI answers and what verified information it can use.',
      items: [
        { href: '/ai/agents', title: 'Agents', description: 'Customer-facing AI agents, operating modes, handoff rules and channel assignment.', icon: Bot },
        { href: '/ai/providers', title: 'Providers', description: 'Workspace BYOK model providers, encrypted credentials and connection health.', icon: KeyRound },
        { href: '/ai/knowledge', title: 'Knowledge', description: 'Verified FAQs, services, pricing, policies and internal guidance used by AI.', icon: BookOpenText },
      ],
    },
    {
      title: 'Context & operations',
      description: 'Understand where conversations came from and how AI behaves in production.',
      items: [
        { href: '/ai/ads', title: 'Ads Context', description: 'Automatic Meta ad-origin context and optional business-only overrides.', icon: Megaphone },
        { href: '/ai/operations', title: 'Operations', description: 'Runs, latency, token usage, failures, handoffs and provider health.', icon: Activity },
      ],
    },
  ];

  return (
    <div className="app-page">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Workspace intelligence</p>
          <h1 className="page-title">AI</h1>
          <p className="page-description">Configure and operate workspace intelligence close to the product surfaces where it is used.</p>
        </div>
      </header>

      <div className="space-y-6">
        {groups.map((group) => <AiGroup key={group.title} {...group} />)}
      </div>
    </div>
  );
}
