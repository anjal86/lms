'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Building2, ServerCog, UserRound } from 'lucide-react';
import { useApp } from '@/lib/store';

export default function SettingsPage() {
  const { currentUser } = useApp();
  const [canAccessSystem, setCanAccessSystem] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch('/api/settings/system/health', { cache: 'no-store' }).then((response) => {
      if (active) setCanAccessSystem(response.ok);
    }).catch(() => {
      if (active) setCanAccessSystem(false);
    });
    return () => { active = false; };
  }, [currentUser.id]);

  const cards = [
    {
      href: '/settings/profile',
      title: 'My Profile',
      eyebrow: 'Personal',
      description: 'Your identity, locale, default workspace entry point and notification preferences.',
      icon: UserRound,
      visible: true,
    },
    {
      href: '/settings/workspace',
      title: 'Workspace Settings',
      eyebrow: 'Workspace',
      description: 'Business configuration, users, connections, routing, automations, AI and workspace governance.',
      icon: Building2,
      visible: currentUser.role !== 'agent',
    },
    {
      href: '/settings/system',
      title: 'System Settings',
      eyebrow: 'Platform',
      description: 'Installation-wide health, worker queues, security configuration presence and platform operations.',
      icon: ServerCog,
      visible: canAccessSystem,
    },
  ].filter((card) => card.visible);

  return (
    <div className="app-page mx-auto max-w-5xl space-y-7">
      <header>
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Settings</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">Choose what you are configuring</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">Personal, workspace and installation settings have separate ownership and permission boundaries.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return <Link key={card.href} href={card.href} className="surface-flat group min-h-[220px] p-6 transition hover:border-zinc-400 hover:bg-zinc-50">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700"><Icon className="h-5 w-5" /></div>
            <div className="mt-6 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">{card.eyebrow}</div>
            <h2 className="mt-1 text-base font-semibold text-zinc-950">{card.title}</h2>
            <p className="mt-2 text-xs leading-5 text-zinc-500">{card.description}</p>
            <div className="mt-5 flex items-center gap-1 text-xs font-semibold text-zinc-700">Open <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></div>
          </Link>;
        })}
      </div>

      {currentUser.role === 'agent' && !canAccessSystem && <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs leading-5 text-zinc-600">Workspace configuration is managed by managers/administrators. Your personal settings remain available here.</div>}
    </div>
  );
}
