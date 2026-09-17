'use client';

import Link from 'next/link';
import { KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useApp } from '@/lib/store';

export default function AccountSecurityPage() {
  const { currentUser } = useApp();
  return (
    <div className="space-y-4">
      <section className="surface-flat">
        <div className="panel-header"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><LockKeyhole className="h-4 w-4" /></span><div><h2 className="section-heading">Security</h2><p className="section-description">Authentication details for your user account.</p></div></div></div>
        <div className="panel-body space-y-4">
          <div className="rounded-lg border border-zinc-200 p-4"><div className="text-xs font-semibold text-zinc-500">Login email</div><div className="mt-1 text-sm font-medium text-zinc-900">{currentUser.email}</div></div>
          <div className="rounded-lg border border-zinc-200 p-4"><div className="flex items-start justify-between gap-4"><div><div className="text-sm font-semibold text-zinc-900">Password</div><p className="mt-1 text-xs leading-5 text-zinc-500">Use the secure password reset flow to change your credential.</p></div><Link href="/forgot-password" className="button-secondary"><KeyRound className="h-4 w-4" /> Change password</Link></div></div>
        </div>
      </section>

      <section className="surface-flat p-5">
        <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-zinc-500" /><div><h3 className="text-sm font-semibold text-zinc-900">Access is managed separately</h3><p className="mt-1 text-xs leading-5 text-zinc-500">Your workspace role is <span className="font-semibold capitalize text-zinc-700">{currentUser.workspace_role || currentUser.role}</span>. Workspace roles and permissions are controlled by workspace administrators; system-console access is a separate platform privilege.</p></div></div>
      </section>
    </div>
  );
}
