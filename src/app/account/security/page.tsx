'use client';

import Link from 'next/link';
import { KeyRound } from 'lucide-react';
import { useApp } from '@/lib/store';
import { SettingsSection } from '@/components/settings/SettingsPrimitives';

export default function AccountSecurityPage() {
  const { currentUser } = useApp();
  return (
    <div className="surface-flat p-5">
      <SettingsSection id="account-security" title="Security" description="Authentication details for your user account.">
        <div className="divide-y divide-zinc-200">
          <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-3"><span className="text-[13px] font-semibold text-zinc-800">Login email</span><span className="text-sm font-medium text-zinc-950">{currentUser.email}</span></div>
          <div className="flex flex-wrap items-center justify-between gap-4 py-3"><div><h3 className="text-[13px] font-semibold text-zinc-900">Password</h3><p className="mt-1 text-[13px] text-zinc-600">Use the secure password reset flow to change your credential.</p></div><Link href="/forgot-password" className="button-secondary min-h-11"><KeyRound aria-hidden="true" className="h-4 w-4" /> Change password</Link></div>
        </div>
      </SettingsSection>
      <SettingsSection id="account-access" title="Workspace access" description="Roles and permissions are managed by workspace administrators.">
        <p className="text-[13px] leading-5 text-zinc-600">Your workspace role is <span className="font-semibold capitalize text-zinc-900">{currentUser.workspace_role || currentUser.role}</span>. System-console access is a separate platform privilege.</p>
      </SettingsSection>
    </div>
  );
}
