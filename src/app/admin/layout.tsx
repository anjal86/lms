'use client';

import { Activity, Building2, Database, Gauge, Home, ListPlus, Settings2, ShieldCheck, UserCog, UsersRound } from 'lucide-react';
import SectionRailShell from '@/components/layout/SectionRailShell';

const groups = [
  {
    label: 'Workspace',
    items: [
      { href: '/admin', label: 'Overview', icon: Home, exact: true },
      { href: '/admin/business', label: 'Workspace', icon: Building2 },
      { href: '/admin/fields', label: 'Fields', icon: ListPlus },
    ],
  },
  {
    label: 'People & access',
    items: [
      { href: '/admin/people', label: 'People', icon: UserCog },
      { href: '/admin/teams', label: 'Teams', icon: UsersRound },
      { href: '/admin/permissions', label: 'Permissions', icon: ShieldCheck },
    ],
  },
  {
    label: 'Operations & governance',
    items: [
      { href: '/admin/routing', label: 'Routing & SLA', icon: Gauge },
      { href: '/admin/data', label: 'Data', icon: Database },
      { href: '/admin/audit', label: 'Audit', icon: Activity },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SectionRailShell
      title="Workspace admin"
      description="Workspace identity, people, permissions, routing, data and governance."
      icon={Settings2}
      ariaLabel="Workspace administration sections"
      mobileLabel="Admin section"
      groups={groups}
      variant="admin"
    >
      {children}
    </SectionRailShell>
  );
}
