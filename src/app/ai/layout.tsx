'use client';

import { Activity, BookOpenText, Bot, KeyRound, LayoutDashboard, Megaphone, Sparkles } from 'lucide-react';
import SectionRailShell from '@/components/layout/SectionRailShell';

const groups = [
  {
    label: 'General',
    items: [
      { href: '/ai', label: 'Overview', icon: LayoutDashboard, exact: true },
    ],
  },
  {
    label: 'Build',
    items: [
      { href: '/ai/agents', label: 'Agents', icon: Bot },
      { href: '/ai/providers', label: 'Providers', icon: KeyRound },
      { href: '/ai/knowledge', label: 'Knowledge', icon: BookOpenText },
    ],
  },
  {
    label: 'Context & operations',
    items: [
      { href: '/ai/ads', label: 'Ads Context', icon: Megaphone },
      { href: '/ai/operations', label: 'Operations', icon: Activity },
    ],
  },
];

export default function AiLayout({ children }: { children: React.ReactNode }) {
  return (
    <SectionRailShell
      title="AI"
      description="Agents, verified knowledge, providers and runtime operations for this workspace."
      icon={Sparkles}
      ariaLabel="AI sections"
      mobileLabel="AI section"
      groups={groups}
    >
      {children}
    </SectionRailShell>
  );
}
