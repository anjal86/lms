'use client';

import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  Bot,
  Building2,
  KeyRound,
  ListPlus,
  Megaphone,
  MessageSquareQuote,
  PlugZap,
  Settings,
  ShieldCheck,
  Sparkles,
  UserCog,
  Zap,
} from 'lucide-react';
import { useApp } from '@/lib/store';
import { useWorkspacePermissions } from '@/lib/use-workspace-permissions';

type SettingsCard = {
  href: string;
  title: string;
  description: string;
  icon: typeof Settings;
  visible: boolean;
};

export default function WorkspaceSettingsHubPage() {
  const { currentUser } = useApp();
  const { can } = useWorkspacePermissions();
  const isAgent = currentUser.role === 'agent';

  if (isAgent) {
    return <div className="mx-auto max-w-xl py-16 text-center"><h1 className="text-lg font-semibold text-zinc-950">Settings unavailable</h1><p className="mt-2 text-sm text-zinc-500">Workspace configuration is managed by managers and administrators.</p></div>;
  }

  const cards: SettingsCard[] = [
    { href: '/settings/business', title: 'Business setup', description: 'Industry pack, terminology, modules, pipelines and qualification behavior.', icon: Building2, visible: true },
    { href: '/settings/business/fields', title: 'Custom fields', description: 'Control the structured data collected on opportunities.', icon: ListPlus, visible: true },
    { href: '/connections', title: 'Connections', description: 'Manage messaging channels, webhooks and external system connections.', icon: PlugZap, visible: true },
    { href: '/settings/ai-providers', title: 'AI Providers', description: 'Bring your own OpenAI, Claude, Gemini, Mistral, OpenRouter or compatible LLM key.', icon: KeyRound, visible: true },
    { href: '/settings/ai-agents', title: 'AI Agents', description: 'Configure workspace agents for assisted replies, automatic responses and human handoff.', icon: Bot, visible: true },
    { href: '/settings/ad-knowledge', title: 'Ad Knowledge', description: 'Map paid-ad IDs to approved offers and facts so AI understands vague replies from ad-origin chats.', icon: Megaphone, visible: true },
    { href: '/templates', title: 'Saved replies', description: 'Reusable customer replies available to the communication workflow.', icon: MessageSquareQuote, visible: true },
    { href: '/team/users', title: 'Users', description: 'Manage workspace members, roles and availability.', icon: UserCog, visible: true },
    { href: '/settings/automations', title: 'Automations', description: 'Workflow rules that progress or route work automatically.', icon: Zap, visible: can('automations.view') },
    { href: '/settings/service-levels', title: 'Service levels & routing', description: 'Response targets, assignment strategy, reminders, reassignment and recovery.', icon: Sparkles, visible: can('service_levels.view') },
    { href: '/settings/permissions', title: 'Permissions', description: 'Control capabilities for managers and agents.', icon: ShieldCheck, visible: can('permissions.view') },
    { href: '/audit', title: 'Activity log', description: 'Review important workspace changes and operational events.', icon: Activity, visible: true },
    { href: '/settings/advanced', title: 'Advanced settings', description: 'Regional preferences, notifications, taxonomies and backup.', icon: Settings, visible: true },
  ];

  return (
    <div className="app-page mx-auto max-w-6xl space-y-6">
      <header>
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Workspace</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">Settings</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">Configuration lives here so operational screens stay focused on customer work. Each setting has one owner and one place to edit it.</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.filter((card) => card.visible).map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.href} href={card.href} className="surface-flat group min-h-[164px] p-5 transition hover:border-zinc-400 hover:bg-zinc-50">
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
