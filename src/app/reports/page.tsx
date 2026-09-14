'use client';

import Link from 'next/link';
import { ArrowRight, BarChart3, MessageSquareText, Trophy } from 'lucide-react';
import { useWorkspacePermissions } from '@/lib/use-workspace-permissions';

const cards = [
  {
    href: '/analytics',
    title: 'Performance',
    description: 'Pipeline conversion, team output and commercial performance.',
    icon: BarChart3,
  },
  {
    href: '/analytics/conversations',
    title: 'Conversation operations',
    description: 'Response time, resolution, SLA health and active workload.',
    icon: MessageSquareText,
  },
  {
    href: '/incentives',
    title: 'Incentives',
    description: 'Review incentive performance without crowding the daily workspace.',
    icon: Trophy,
  },
];

export default function ReportsHubPage() {
  const { can } = useWorkspacePermissions();

  if (!can('reports.view')) {
    return <div className="mx-auto max-w-xl py-16 text-center"><h1 className="text-lg font-semibold text-zinc-950">Reports unavailable</h1><p className="mt-2 text-sm text-zinc-500">Your role does not have reporting access.</p></div>;
  }

  return (
    <div className="app-page mx-auto max-w-5xl space-y-6">
      <header>
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Manage</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">Reports</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">Choose the question you want to answer. Daily work stays in Today, Inbox, Opportunities and Due Work.</p>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.href} href={card.href} className="surface-flat group min-h-[170px] p-5 transition hover:border-zinc-400 hover:bg-zinc-50">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700"><Icon className="h-4 w-4" /></div>
              <h2 className="mt-5 text-sm font-semibold text-zinc-950">{card.title}</h2>
              <p className="mt-2 text-xs leading-5 text-zinc-500">{card.description}</p>
              <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-zinc-700">Open <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
