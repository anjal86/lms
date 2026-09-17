'use client';

import { Activity, BookOpenText, Bot, KeyRound, Megaphone, ShieldCheck } from 'lucide-react';
import { useApp } from '@/lib/store';
import { SettingsIndexGroup, type SettingsIndexItem } from '@/components/settings/SettingsIndex';

export default function AiHubPage() {
  const { currentUser } = useApp();

  if (currentUser.role === 'agent') {
    return <div className="mx-auto max-w-xl py-20 text-center"><ShieldCheck className="mx-auto h-7 w-7 text-zinc-400" /><h1 className="mt-3 text-lg font-semibold text-zinc-950">AI administration unavailable</h1><p className="mt-1 text-sm text-zinc-500">Workspace managers and administrators configure AI resources.</p></div>;
  }

  const groups: Array<{ title: string; description: string; items: SettingsIndexItem[] }> = [
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
        {groups.map((group) => <SettingsIndexGroup key={group.title} {...group} />)}
      </div>
    </div>
  );
}
