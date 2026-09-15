'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Building2, ChevronDown, Plus } from 'lucide-react';

type WorkspaceMembership = {
  id: string;
  name: string;
  role: 'owner' | 'admin' | 'manager' | 'agent';
  is_current: boolean;
};

export default function WorkspaceSwitcher({ compact = false }: { compact?: boolean }) {
  const [items, setItems] = useState<WorkspaceMembership[]>([]);
  const [currentId, setCurrentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch('/api/workspaces', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load workspaces.');
        return response.json() as Promise<{ currentWorkspaceId?: string | null; workspaces?: WorkspaceMembership[] }>;
      })
      .then((payload) => {
        if (!active) return;
        setItems(payload.workspaces || []);
        setCurrentId(payload.currentWorkspaceId || payload.workspaces?.find((item) => item.is_current)?.id || '');
      })
      .catch(() => {
        if (active) setItems([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const current = useMemo(
    () => items.find((item) => item.id === currentId) || items.find((item) => item.is_current) || items[0],
    [currentId, items]
  );

  const switchWorkspace = async (workspaceId: string) => {
    if (!workspaceId || workspaceId === current?.id || switching) return;
    setSwitching(true);
    try {
      const response = await fetch('/api/workspaces/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Unable to switch workspace.');
      window.location.assign('/dashboard');
    } catch (error) {
      console.error(error);
      setSwitching(false);
    }
  };

  if (compact) {
    const initial = current?.name?.trim().charAt(0).toUpperCase() || 'W';
    return (
      <Link
        href="/settings/workspace"
        title={current?.name || 'Workspace'}
        className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 via-violet-500 to-cyan-400 text-xs font-bold text-white shadow-[0_8px_24px_rgba(79,70,229,0.28)] ring-1 ring-white/25"
      >
        {initial}
      </Link>
    );
  }

  if (loading) {
    return <div className="h-10 animate-pulse rounded-xl bg-white/[0.06]" />;
  }

  if (!current) {
    return (
      <Link href="/onboarding" className="flex items-center gap-2 rounded-xl border border-dashed border-white/15 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/[0.06]">
        <Plus className="h-3.5 w-3.5" /> Create workspace
      </Link>
    );
  }

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.035] p-1.5">
      <div className="relative">
        <Building2 className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-cyan-300" />
        <select
          value={current.id}
          onChange={(event) => void switchWorkspace(event.target.value)}
          disabled={switching}
          aria-label="Switch workspace"
          className="h-9 w-full appearance-none rounded-lg border-0 bg-transparent pl-8 pr-8 text-[12px] font-semibold text-white outline-none disabled:opacity-60"
        >
          {items.map((item) => (
            <option key={item.id} value={item.id} className="bg-slate-950 text-white">
              {item.name}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
      </div>
      <div className="mt-1 flex items-center justify-between px-2 pb-0.5 text-[9px] uppercase tracking-[0.12em] text-slate-500">
        <span>{current.role}</span>
        <Link href="/onboarding?new=1" className="normal-case tracking-normal text-slate-400 hover:text-white">+ New</Link>
      </div>
    </div>
  );
}
