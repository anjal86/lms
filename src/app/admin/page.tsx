'use client';

import Link from 'next/link';
import { Activity, Building2, Database, Gauge, ListPlus, ShieldCheck, UserCog, UsersRound } from 'lucide-react';
import { useApp } from '@/lib/store';
import { useWorkspacePermissions } from '@/lib/use-workspace-permissions';
import { SettingsIndexGroup, type SettingsIndexItem } from '@/components/settings/SettingsIndex';

export default function AdminHubPage() {
  const { currentUser } = useApp();
  const { can } = useWorkspacePermissions();

  if (currentUser.role === 'agent') {
    return <div className="mx-auto max-w-xl py-20 text-center"><ShieldCheck className="mx-auto h-7 w-7 text-zinc-400" /><h1 className="mt-3 text-lg font-semibold text-zinc-950">Admin access required</h1><p className="mt-1 text-sm text-zinc-500">Workspace administration is available to managers and administrators.</p><Link href="/account/profile" className="button-secondary mt-5 inline-flex">Account settings</Link></div>;
  }

  const groups: Array<{ title: string; description: string; items: SettingsIndexItem[] }> = [
    {
      title: 'Workspace',
      description: 'Identity, terminology and structured business data.',
      items: [
        { href: '/admin/business', title: 'Workspace settings', description: 'Business profile, industry pack, terminology, modules and shared defaults.', icon: Building2 },
        { href: '/admin/fields', title: 'Custom fields', description: 'Structured business data collected on opportunities and records.', icon: ListPlus },
      ],
    },
    {
      title: 'People & access',
      description: 'Membership, teams and workspace capabilities.',
      items: [
        { href: '/admin/people', title: 'People', description: 'Members, roles, availability and workload capacity.', icon: UserCog },
        { href: '/admin/teams', title: 'Teams', description: 'Operational teams used by routing and human handoff.', icon: UsersRound },
        { href: '/admin/permissions', title: 'Permissions', description: 'Workspace capabilities for managers and agents.', icon: ShieldCheck, visible: can('permissions.view') },
      ],
    },
    {
      title: 'Operations & governance',
      description: 'Assignment rules, shared defaults and administrative evidence.',
      items: [
        { href: '/admin/routing', title: 'Routing & SLA', description: 'Response targets, assignment, reminders, reassignment and recovery.', icon: Gauge, visible: can('service_levels.view') },
        { href: '/admin/data', title: 'Data & defaults', description: 'Regional, commercial, taxonomy and workspace data settings.', icon: Database },
        { href: '/admin/audit', title: 'Audit log', description: 'Workspace-level operational evidence and important changes.', icon: Activity },
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
        {groups.map((group) => <SettingsIndexGroup key={group.title} {...group} />)}
      </div>
    </div>
  );
}
