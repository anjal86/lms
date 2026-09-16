'use client';

import Link from 'next/link';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  Bot,
  Building2,
  Gauge,
  KeyRound,
  ListPlus,
  Megaphone,
  MessageSquareQuote,
  PlugZap,
  Settings,
  ShieldCheck,
  Sparkles,
  UserCog,
  UsersRound,
  Zap,
} from 'lucide-react';
import { useApp } from '@/lib/store';
import { useWorkspacePermissions } from '@/lib/use-workspace-permissions';

type SettingsCard = {
  href: string;
  title: string;
  description: string;
  icon: typeof Settings;
  visible?: boolean;
};

type SettingsSection = {
  title: string;
  description: string;
  cards: SettingsCard[];
};

export default function WorkspaceSettingsHubPage() {
  const { currentUser } = useApp();
  const { can } = useWorkspacePermissions();

  if (currentUser.role === 'agent') {
    return <div className="mx-auto max-w-xl py-16 text-center"><h1 className="text-lg font-semibold text-zinc-950">Workspace settings unavailable</h1><p className="mt-2 text-sm text-zinc-500">Workspace configuration is managed by managers and administrators. Your own preferences are under My Profile.</p><Link href="/settings/profile" className="button-secondary mt-5 inline-flex">My Profile</Link></div>;
  }

  const sections: SettingsSection[] = [
    {
      title: 'General',
      description: 'Business model and shared workspace defaults.',
      cards: [
        { href: '/settings/business', title: 'Business setup', description: 'Industry pack, terminology, modules, pipelines and qualification behavior.', icon: Building2 },
        { href: '/settings/business/fields', title: 'Custom fields', description: 'Structured data collected on opportunities.', icon: ListPlus },
        { href: '/settings/workspace/preferences', title: 'Workspace preferences', description: 'Regional, commercial, taxonomy and workspace data settings.', icon: Settings },
      ],
    },
    {
      title: 'People & access',
      description: 'Who can work here and what they can do.',
      cards: [
        { href: '/team/users', title: 'Users', description: 'Workspace members, roles, availability and capacity.', icon: UserCog },
        { href: '/settings/routing-teams', title: 'Teams', description: 'Operational teams used by routing and handoff.', icon: UsersRound },
        { href: '/settings/permissions', title: 'Permissions', description: 'Capabilities for managers and agents.', icon: ShieldCheck, visible: can('permissions.view') },
      ],
    },
    {
      title: 'Communication',
      description: 'Customer channels and response operations.',
      cards: [
        { href: '/connections', title: 'Connections', description: 'Messaging accounts, webhooks and external system connections.', icon: PlugZap },
        { href: '/templates', title: 'Saved replies', description: 'Reusable customer replies for staff workflows.', icon: MessageSquareQuote },
        { href: '/settings/service-levels', title: 'Service levels & routing', description: 'Response targets, assignment, reminders, reassignment and recovery.', icon: Sparkles, visible: can('service_levels.view') },
      ],
    },
    {
      title: 'AI & knowledge',
      description: 'Workspace-owned intelligence, sources and operations.',
      cards: [
        { href: '/settings/ai-providers', title: 'AI Providers', description: 'Workspace BYOK provider connections and health.', icon: KeyRound },
        { href: '/settings/ai-agents', title: 'AI Agents', description: 'Assisted replies, automatic responses and human handoff.', icon: Bot },
        { href: '/settings/knowledge', title: 'Knowledge', description: 'Verified FAQs, services, pricing and policies used by AI.', icon: BookOpenText },
        { href: '/settings/ad-knowledge', title: 'Ads & AI Context', description: 'Automatic Meta ad context plus optional business overrides.', icon: Megaphone },
        { href: '/settings/ai-observability', title: 'AI Operations', description: 'Runs, model/provider health, latency, failures, handoffs and usage.', icon: Gauge },
      ],
    },
    {
      title: 'Workflow & governance',
      description: 'Automation and workspace-level operational evidence.',
      cards: [
        { href: '/settings/automations', title: 'Automations', description: 'Rules that progress, assign or route work automatically.', icon: Zap, visible: can('automations.view') },
        { href: '/audit', title: 'Activity log', description: 'Important workspace changes and operational events.', icon: Activity },
      ],
    },
  ];

  return (
    <div className="app-page mx-auto max-w-6xl space-y-8">
      <header className="page-header">
        <div><p className="page-eyebrow">Workspace</p><h1 className="page-title">Workspace Settings</h1><p className="page-description">Shared configuration for this business. Personal preferences and installation-wide system controls live in separate settings areas.</p></div>
        <div className="page-actions"><Link href="/settings" className="button-secondary"><ArrowLeft className="h-4 w-4" /> All settings</Link></div>
      </header>

      {sections.map((section) => {
        const cards = section.cards.filter((card) => card.visible !== false);
        if (!cards.length) return null;
        return <section key={section.title}>
          <div className="mb-3"><h2 className="text-sm font-semibold text-zinc-950">{section.title}</h2><p className="mt-0.5 text-xs text-zinc-500">{section.description}</p></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((card) => {
              const Icon = card.icon;
              return <Link key={card.href} href={card.href} className="surface-flat group min-h-[150px] p-5 transition hover:border-zinc-400 hover:bg-zinc-50">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700"><Icon className="h-4 w-4" /></div>
                <h3 className="mt-4 text-sm font-semibold text-zinc-950">{card.title}</h3>
                <p className="mt-1.5 text-xs leading-5 text-zinc-500">{card.description}</p>
                <div className="mt-3 flex items-center gap-1 text-xs font-semibold text-zinc-700">Open <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></div>
              </Link>;
            })}
          </div>
        </section>;
      })}
    </div>
  );
}
