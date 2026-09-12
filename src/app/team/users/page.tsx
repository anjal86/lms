'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, KeyRound, Loader2, RefreshCcw, Search, Shield, UserCheck, UserX } from 'lucide-react';
import type { Profile, Role } from '@/lib/types';

type ManagedUser = {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  banned_until: string | null;
  is_banned: boolean;
  profile: Profile | null;
};

export default function UserManagementPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/team/users', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to load users.');
      setUsers(payload.users || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = 'User Management — Wanderlust CRM';
    void loadUsers();
  }, [loadUsers]);

  const runAction = async (user: ManagedUser, body: Record<string, unknown>, success: string) => {
    setBusyId(user.id);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/team/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, ...body }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Action failed.');
      setMessage(success);
      await loadUsers();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Action failed.');
    } finally {
      setBusyId(null);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((user) =>
      user.email.toLowerCase().includes(q)
      || user.profile?.full_name?.toLowerCase().includes(q)
      || user.profile?.employee_code?.toLowerCase().includes(q)
    );
  }, [query, users]);

  const activeCount = users.filter((user) => Boolean(user.profile?.is_active) && !user.is_banned).length;
  const disabledCount = users.length - activeCount;

  return (
    <div className="workspace-page">
      <div className="workspace-header">
        <div>
          <Link href="/team" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 transition hover:text-zinc-900">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to team
          </Link>
          <p className="workspace-eyebrow">Administration</p>
          <h1 className="workspace-title flex items-center gap-2.5">
            <Shield className="h-5 w-5 text-zinc-500" /> User management
          </h1>
          <p className="workspace-description">Manage account access, roles, authentication state, and password recovery from one place.</p>
        </div>
        <button type="button" onClick={() => void loadUsers()} disabled={loading} className="button-secondary self-start sm:self-auto">
          <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="panel p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">Total users</p>
          <p className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-zinc-950">{users.length}</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">Active</p>
          <p className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-emerald-700">{activeCount}</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">Disabled</p>
          <p className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-red-700">{disabledCount}</p>
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-zinc-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-950">Agency users</h2>
            <p className="mt-1 text-xs text-zinc-500">Search first, then make access or role changes with the action controls on each row.</p>
          </div>
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, email, or employee code…"
              className="field pl-10"
            />
          </div>
        </div>

        {error && <div role="alert" className="m-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {message && <div role="status" className="m-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div>}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left">
            <thead className="border-b border-zinc-200 bg-zinc-50/80 text-xs font-semibold text-zinc-500">
              <tr>
                <th className="px-5">User</th>
                <th className="px-5">Role</th>
                <th className="px-5">Access</th>
                <th className="px-5">Last sign-in</th>
                <th className="px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading ? (
                <tr><td colSpan={5} className="px-5 py-14 text-center text-sm text-zinc-500"><Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />Loading users…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-14 text-center text-sm text-zinc-500">No users match your search.</td></tr>
              ) : filtered.map((user) => {
                const profile = user.profile;
                const isBusy = busyId === user.id;
                const enabled = Boolean(profile?.is_active) && !user.is_banned;
                return (
                  <tr key={user.id} className="hover:bg-zinc-50/70">
                    <td className="px-5">
                      <div className="font-semibold text-zinc-950">{profile?.full_name || user.email || 'Unknown user'}</div>
                      <div className="mt-1 text-xs text-zinc-500">{user.email}</div>
                      <div className="mt-1 font-mono text-[10px] uppercase tracking-wide text-zinc-400">{profile?.employee_code || user.id.slice(0, 8)}</div>
                    </td>
                    <td className="px-5">
                      <select
                        value={profile?.role || 'agent'}
                        disabled={isBusy || !profile}
                        onChange={(event) => void runAction(user, { action: 'role', role: event.target.value as Role }, 'Role updated.')}
                        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium capitalize text-zinc-700 shadow-2xs disabled:opacity-50"
                        aria-label={`Role for ${user.email}`}
                      >
                        <option value="admin">Admin</option>
                        <option value="manager">Manager</option>
                        <option value="agent">Agent</option>
                      </select>
                    </td>
                    <td className="px-5">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${enabled ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        <span className="text-sm font-semibold text-zinc-800">{enabled ? 'Active' : 'Disabled'}</span>
                      </div>
                      <div className="mt-1 text-xs text-zinc-400">{user.email_confirmed_at ? 'Email confirmed' : 'Email not confirmed'}</div>
                    </td>
                    <td className="px-5 text-sm text-zinc-500">
                      {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : 'Never'}
                    </td>
                    <td className="px-5">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void runAction(user, { action: 'reset_password' }, `Password reset email sent to ${user.email}.`)}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
                        >
                          <KeyRound className="h-3.5 w-3.5" /> Reset password
                        </button>
                        {enabled ? (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void runAction(user, { action: 'disable' }, `${user.email} disabled.`)}
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                          >
                            <UserX className="h-3.5 w-3.5" /> Disable
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void runAction(user, { action: 'enable' }, `${user.email} enabled.`)}
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
                          >
                            <UserCheck className="h-3.5 w-3.5" /> Enable
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
