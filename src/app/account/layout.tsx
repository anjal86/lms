'use client';

import { BellRing, LockKeyhole, Settings2, UserRound } from 'lucide-react';
import SectionRailShell from '@/components/layout/SectionRailShell';

const groups = [
  {
    label: 'Personal',
    items: [
      { href: '/account/profile', label: 'Profile', icon: UserRound, exact: true },
      { href: '/account/preferences', label: 'Preferences', icon: Settings2, exact: true },
      { href: '/account/notifications', label: 'Notifications', icon: BellRing, exact: true },
      { href: '/account/security', label: 'Security', icon: LockKeyhole, exact: true },
    ],
  },
];

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <SectionRailShell
      title="Account"
      description="Your profile, preferences, notifications and security."
      icon={UserRound}
      ariaLabel="Account navigation"
      mobileLabel="Account section"
      groups={groups}
    >
      {children}
    </SectionRailShell>
  );
}
