'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, KeyRound, Loader2, RefreshCcw, Search, Shield, UserCheck, UserX } from 'lucide-react';
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

  const loadUsers = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/team/users', { cache: 'no-store', signal });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to load users.');
      setUsers(Array.isArray(payload.users) ? payload.users : []);
    } catch (loadError) {
      if (signal?.aborted) return;
      setError(loadError instanceof Error ? loadError.message : 'Unable to load users.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = 'User Management — Wanderlust CRM';
    const controller = new AbortController();
    const initial = window.setTimeout(() => void loadUsers(controller.signal), 0);
    return () => {
      window.clearTimeout(initial);
      controller.abort();
    };
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
    const normalized = query.trim().toLowerCase();
    if (!normalized) return users;
    return users.filter((user) =>
      user.email.toLowerCase().includes(normalized)
      || user.profile?.full_name?.toLowerCase().includes(normalized)
      || user.profile?.employee_code?.toLowerCase().includes(normalized)
    );
  }, [query, users]);

  const activeCount = users.filter((user) => Boolean(user.profile?.is_active) && !user.is_banned).length;
  const disabledCount = users.length - activeCount;

  const renderActions = (user: ManagedUser, compact = false) => {
    const profile = user.profile;
    const isBusy = busyId === user.id;
    const enabled = Boolean(profile?.is_active) && !user.is_banned;
    return (
      <div className={`flex flex-wrap gap-2 ${compact ? '' : 'justify-end'}`}>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => void runAction(user, { action: 'reset_password' }, `Password reset email sent to ${user.email}.`)}
          className="button-secondary button-sm"
        >
          {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />} Reset password
        </button>
        {enabled ? (
          <button type="button" disabled={isBusy} onClick={() => void runAction(user, { action: 'disable' }, `${user.email} disabled.`)} className="button-danger button-sm">
            <UserX className="h-3.5 w-3.5" /> Disable
          </button>
        ) : (
          <button type="button" disabled={isBusy} onClick={() => void runAction(user, { action: 'enable' }, `${user.email} enabled.`)} className="button-secondary button-sm">
            <UserCheck className="h-3.5 w-3.5" /> Enable
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="app-page">
      <header className="page-header">
        <div>
          <Link href="/team" className="button-ghost button-sm mb-2 -ml-2"><ArrowLeft className="h-3.5 w-3.5" /> Team</Link>
          <p className="page-eyebrow">Administration</p>
          <h1 className="page-title flex items-center gap-2"><Shield className="h-5 w-5 text-zinc-400" /> User management</h1>
          <p className="page-description">Manage who can sign in, what role they have, and password recovery.</p>
        </div>
        <div className="page-actions">
          <button type="button" onClick={() => void loadUsers()} disabled={loading} className="button-secondary">
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </header>

      <section className="grid gap-2 sm:grid-cols-3" aria-label="User summary">
        <div className="metric"><div className="metric-label">Total users</div><div className="metric-value">{users.length}</div></div>
        <div className="metric"><div className="metric-label">Active</div><div className="metric-value">{activeCount}</div></div>
        <div className="metric"><div className="metric-label">Disabled</div><div className="metric-value">{disabledCount}</div></div>
      </section>

      {error && (
        <div role="alert" className="surface-flat flex items-start justify-between gap-4 p-4">
          <div className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" /><div><p className="text-xs font-semibold text-zinc-800">User management action failed</p><p className="mt-1 text-xs text-zinc-500">{error}</p></div></div>
          <button type="button" onClick={() => void loadUsers()} className="button-secondary button-sm">Retry</button>
        </div>
      )}
      {message && <div role="status" className="surface-flat px-4 py-3 text-xs font-medium text-zinc-700">{message}</div>}

      <section className="surface-flat overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="section-heading">Agency users</h2><p className="section-description">Search first, then change role or account access.</p></div>
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email or employee code" className="field pl-9" />
          </div>
        </div>

        {loading && users.length === 0 ? (
          <div className="space-y-2 p-4" role="status" aria-label="Loading users">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-12 animate-pulse rounded-md bg-zinc-100" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><Search className="h-5 w-5 text-zinc-300" /><h2 className="empty-state-title mt-3">No users found</h2><p className="empty-state-description">Try another name, email, or employee code.</p></div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table>
                <thead><tr><th>User</th><th>Role</th><th>Access</th><th>Last sign-in</th><th className="text-right">Actions</th></tr></thead>
                <tbody>
                  {filtered.map((user) => {
                    const profile = user.profile;
                    const enabled = Boolean(profile?.is_active) && !user.is_banned;
                    return (
                      <tr key={user.id}>
                        <td>
                          <div className="font-semibold text-zinc-900">{profile?.full_name || user.email || 'Unknown user'}</div>
                          <div className="mt-0.5 text-[11px] text-zinc-500">{user.email}</div>
                          <div className="mt-0.5 font-mono text-[10px] text-zinc-400">{profile?.employee_code || user.id.slice(0, 8)}</div>
                        </td>
                        <td>
                          <select
                            value={profile?.role || 'agent'}
                            disabled={busyId === user.id || !profile}
                            onChange={(event) => void runAction(user, { action: 'role', role: event.target.value as Role }, 'Role updated.')}
                            className="select-field field-sm min-w-28 capitalize"
                            aria-label={`Role for ${user.email}`}
                          >
                            <option value="admin">Admin</option><option value="manager">Manager</option><option value="agent">Agent</option>
                          </select>
                        </td>
                        <td><span className="status-line"><span className={`status-dot ${enabled ? 'status-dot-success' : 'status-dot-danger'}`} />{enabled ? 'Active' : 'Disabled'}</span><div className="mt-1 text-[10px] text-zinc-400">{user.email_confirmed_at ? 'Email confirmed' : 'Email not confirmed'}</div></td>
                        <td className="font-mono text-[11px]">{user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : 'Never'}</td>
                        <td>{renderActions(user)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-line md:hidden">
              {filtered.map((user) => {
                const profile = user.profile;
                const enabled = Boolean(profile?.is_active) && !user.is_banned;
                return (
                  <article key={user.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><div className="truncate text-sm font-semibold text-zinc-900">{profile?.full_name || user.email}</div><div className="mt-1 truncate text-xs text-zinc-500">{user.email}</div></div>
                      <span className="status-line"><span className={`status-dot ${enabled ? 'status-dot-success' : 'status-dot-danger'}`} />{enabled ? 'Active' : 'Disabled'}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <label className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Role<select value={profile?.role || 'agent'} disabled={busyId === user.id || !profile} onChange={(event) => void runAction(user, { action: 'role', role: event.target.value as Role }, 'Role updated.')} className="select-field mt-1 normal-case"><option value="admin">Admin</option><option value="manager">Manager</option><option value="agent">Agent</option></select></label>
                      <div><div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Last sign-in</div><div className="mt-1 font-mono text-[11px] text-zinc-600">{user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString() : 'Never'}</div></div>
                    </div>
                    <div className="mt-3 border-t border-line pt-3">{renderActions(user, true)}</div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
