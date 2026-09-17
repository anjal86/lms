'use client';

import Link from 'next/link';
import { Activity, ArrowRight, Building2, Database, Gauge, ListPlus, ShieldCheck, UserCog, UsersRound } from 'lucide-react';
import { useApp } from '@/lib/store';
import { useWorkspacePermissions } from '@/lib/use-workspace-permissions';

const cardClass = 'surface-flat group min-h-[150px] p-5 transition hover:border-zinc-400 hover:bg-zinc-50';

export default function AdminHubPage() {
  const { currentUser } = useApp();
  const { can } = useWorkspacePermissions();
  if (currentUser.role === 'agent') {
    return <div className="mx-auto max-w-xl py-20 text-center"><ShieldCheck className="mx-auto h-7 w-7 text-zinc-400" /><h1 className="mt-3 text-lg font-semibold text-zinc-950">Admin access required</h1><p className="mt-1 text-sm text-zinc-500">Workspace administration is available to managers and administrators.</p><Link href="/account/profile" className="button-secondary mt-5 inline-flex">Account settings</Link></div>;
  }

  const cards = [
    { href: '/admin/business', title: 'Workspace', description: 'Business profile, industry pack, terminology, modules and shared defaults.', icon: Building2, visible: true },
    { href: '/admin/fields', title: 'Custom fields', description: 'Structured business data collected on opportunities and records.', icon: ListPlus, visible: true },
    { href: '/admin/people', title: 'People', description: 'Members, roles, availability and capacity.', icon: UserCog, visible: true },
    { href: '/admin/teams', title: 'Teams', description: 'Operational teams used by routing and human handoff.', icon: UsersRound, visible: true },
    { href: '/admin/permissions', title: 'Permissions', description: 'Workspace capabilities for managers and agents.', icon: ShieldCheck, visible: can('permissions.view') },
    { href: '/admin/routing', title: 'Routing & SLA', description: 'Response targets, assignment, reminders, reassignment and recovery.', icon: Gauge, visible: can('service_levels.view') },
    { href: '/admin/data', title: 'Data & defaults', description: 'Regional, commercial, taxonomy and workspace data settings.', icon: Database, visible: true },
    { href: '/admin/audit', title: 'Audit log', description: 'Workspace-level operational evidence and important changes.', icon: Activity, visible: true },
  ].filter((item) => item.visible);

  return (
    <div className="app-page mx-auto max-w-6xl space-y-6">
      <header className="page-header"><div><p className="page-eyebrow">Admin</p><h1 className="page-title">Workspace administration</h1><p className="page-description">Govern the current workspace. Feature configuration lives with Inbox, AI and Automations; personal settings live under Account.</p></div></header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => { const Icon = card.icon; return <Link key={card.href} href={card.href} className={cardClass}><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700"><Icon className="h-4 w-4" /></div><h2 className="mt-4 text-sm font-semibold text-zinc-950">{card.title}</h2><p className="mt-1.5 text-xs leading-5 text-zinc-500">{card.description}</p><div className="mt-3 flex items-center gap-1 text-xs font-semibold text-zinc-700">Open <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></div></Link>; })}
      </div>
    </div>
  );
}
