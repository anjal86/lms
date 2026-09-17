'use client';

import Link from 'next/link';
import { Activity, ArrowRight, Building2, Database, Gauge, ListPlus, ShieldCheck, UserCog, UsersRound } from 'lucide-react';
import { useApp } from '@/lib/store';
import { useWorkspacePermissions } from '@/lib/use-workspace-permissions';

type AdminItem = {
  href: string;
  title: string;
  description: string;
  icon: typeof Building2;
  visible: boolean;
};

function SettingsGroup({ title, description, items }: { title: string; description: string; items: AdminItem[] }) {
  const visibleItems = items.filter((item) => item.visible);
  if (!visibleItems.length) return null;

  return (
    <section>
      <div className="mb-2.5">
        <h2 className="text-[13px] font-semibold text-zinc-900">{title}</h2>
        <p className="mt-0.5 text-xs leading-5 text-zinc-500">{description}</p>
      </div>
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        {visibleItems.map((item, index) => {
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

export default function AdminHubPage() {
  const { currentUser } = useApp();
  const { can } = useWorkspacePermissions();

  if (currentUser.role === 'agent') {
    return <div className="mx-auto max-w-xl py-20 text-center"><ShieldCheck className="mx-auto h-7 w-7 text-zinc-400" /><h1 className="mt-3 text-lg font-semibold text-zinc-950">Admin access required</h1><p className="mt-1 text-sm text-zinc-500">Workspace administration is available to managers and administrators.</p><Link href="/account/profile" className="button-secondary mt-5 inline-flex">Account settings</Link></div>;
  }

  const groups = [
    {
      title: 'Workspace',
      description: 'Identity, terminology and structured business data.',
      items: [
        { href: '/admin/business', title: 'Workspace settings', description: 'Business profile, industry pack, terminology, modules and shared defaults.', icon: Building2, visible: true },
        { href: '/admin/fields', title: 'Custom fields', description: 'Structured business data collected on opportunities and records.', icon: ListPlus, visible: true },
      ],
    },
    {
      title: 'People & access',
      description: 'Membership, teams and workspace capabilities.',
      items: [
        { href: '/admin/people', title: 'People', description: 'Members, roles, availability and workload capacity.', icon: UserCog, visible: true },
        { href: '/admin/teams', title: 'Teams', description: 'Operational teams used by routing and human handoff.', icon: UsersRound, visible: true },
        { href: '/admin/permissions', title: 'Permissions', description: 'Workspace capabilities for managers and agents.', icon: ShieldCheck, visible: can('permissions.view') },
      ],
    },
    {
      title: 'Operations & governance',
      description: 'Assignment rules, shared defaults and administrative evidence.',
      items: [
        { href: '/admin/routing', title: 'Routing & SLA', description: 'Response targets, assignment, reminders, reassignment and recovery.', icon: Gauge, visible: can('service_levels.view') },
        { href: '/admin/data', title: 'Data & defaults', description: 'Regional, commercial, taxonomy and workspace data settings.', icon: Database, visible: true },
        { href: '/admin/audit', title: 'Audit log', description: 'Workspace-level operational evidence and important changes.', icon: Activity, visible: true },
      ],
    },
  ];

  return (
    <div className="app-page">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Administration</p>
          <h1 className="page-title">Workspace administration</h1>
          <p className="page-description">Manage workspace-wide configuration and governance. Feature-specific controls remain inside Inbox, AI and Automations.</p>
        </div>
      </header>

      <div className="space-y-6">
        {groups.map((group) => <SettingsGroup key={group.title} {...group} />)}
      </div>
    </div>
  );
}
