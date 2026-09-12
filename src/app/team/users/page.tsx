'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, KeyRound, Loader2, RefreshCcw, Shield, UserCheck, UserX } from 'lucide-react';
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

  return (
    <main className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/team" className="mb-2 inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-900">
            <ArrowLeft className="h-3 w-3" /> Team
          </Link>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-zinc-950">
            <Shield className="h-5 w-5 text-zinc-500" /> User Management
          </h1>
          <p className="mt-1 text-xs text-zinc-500">Authentication status, roles, account access, and password recovery.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadUsers()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 self-start rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 sm:self-auto"
        >
          <RefreshCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-3">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, email, or employee code…"
          className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs outline-none focus:border-zinc-400 focus:bg-white"
        />
      </div>

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</div>}
      {message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">{message}</div>}

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-[10px] uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-2.5">User</th>
                <th className="px-4 py-2.5">Role</th>
                <th className="px-4 py-2.5">Auth</th>
                <th className="px-4 py-2.5">Last sign-in</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-zinc-500"><Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" />Loading users…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-zinc-500">No matching users.</td></tr>
              ) : filtered.map((user) => {
                const profile = user.profile;
                const isBusy = busyId === user.id;
                const enabled = Boolean(profile?.is_active) && !user.is_banned;
                return (
                  <tr key={user.id} className="hover:bg-zinc-50/70">
                    <td className="px-4 py-3">
                      <div className="font-medium text-zinc-900">{profile?.full_name || user.email || 'Unknown user'}</div>
                      <div className="mt-0.5 font-mono text-[10px] text-zinc-500">{user.email}</div>
                      <div className="mt-0.5 text-[10px] text-zinc-400">{profile?.employee_code || user.id.slice(0, 8)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={profile?.role || 'agent'}
                        disabled={isBusy || !profile}
                        onChange={(event) => void runAction(user, { action: 'role', role: event.target.value as Role }, 'Role updated.')}
                        className="rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs capitalize text-zinc-700 disabled:opacity-50"
                        aria-label={`Role for ${user.email}`}
                      >
                        <option value="admin">Admin</option>
                        <option value="manager">Manager</option>
                        <option value="agent">Agent</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${enabled ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        <span className="font-medium text-zinc-800">{enabled ? 'Active' : 'Disabled'}</span>
                      </div>
                      <div className="mt-1 text-[10px] text-zinc-400">{user.email_confirmed_at ? 'Email confirmed' : 'Invite / email not confirmed'}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-[10px] text-zinc-500">
                      {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : 'Never'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void runAction(user, { action: 'reset_password' }, `Password reset email sent to ${user.email}.`)}
                          className="inline-flex items-center gap-1 rounded border border-zinc-200 px-2 py-1.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                        >
                          <KeyRound className="h-3 w-3" /> Reset password
                        </button>
                        {enabled ? (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void runAction(user, { action: 'disable' }, `${user.email} disabled.`)}
                            className="inline-flex items-center gap-1 rounded border border-red-200 px-2 py-1.5 text-[11px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                          >
                            <UserX className="h-3 w-3" /> Disable
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void runAction(user, { action: 'enable' }, `${user.email} enabled.`)}
                            className="inline-flex items-center gap-1 rounded border border-emerald-200 px-2 py-1.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                          >
                            <UserCheck className="h-3 w-3" /> Enable
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
      </div>
    </main>
  );
}
