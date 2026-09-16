'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Building2, Check, ChevronsUpDown, Loader2, Plus } from 'lucide-react';

type WorkspaceMembership = {
  id: string;
  name: string;
  role: 'owner' | 'admin' | 'manager' | 'agent';
  is_current: boolean;
};

function WorkspaceAvatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const initial = name.trim().charAt(0).toUpperCase();
  // Stable color from name hash
  const hues = [221, 262, 142, 24, 334, 196];
  const hue = hues[(name.charCodeAt(0) + name.length) % hues.length];
  const bg = `hsl(${hue} 65% 92%)`;
  const color = `hsl(${hue} 65% 32%)`;
  const cls = size === 'sm'
    ? 'h-5 w-5 rounded text-[10px] font-bold shrink-0'
    : 'h-6 w-6 rounded-md text-[11px] font-bold shrink-0';
  return (
    <span className={`inline-flex items-center justify-center ${cls}`} style={{ background: bg, color }}>
      {initial}
    </span>
  );
}

export default function WorkspaceSwitcher() {
  const [items, setItems] = useState<WorkspaceMembership[]>([]);
  const [currentId, setCurrentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    void fetch('/api/workspaces', { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json() as Promise<{ currentWorkspaceId?: string | null; workspaces?: WorkspaceMembership[] }>;
      })
      .then((payload) => {
        if (!active) return;
        setItems(payload.workspaces ?? []);
        setCurrentId(payload.currentWorkspaceId ?? payload.workspaces?.find((w) => w.is_current)?.id ?? '');
      })
      .catch(() => { if (active) setItems([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const current = useMemo(
    () => items.find((w) => w.id === currentId) ?? items.find((w) => w.is_current) ?? items[0],
    [currentId, items],
  );

  const switchWorkspace = async (workspaceId: string) => {
    if (!workspaceId || workspaceId === current?.id || switching) return;
    setSwitching(workspaceId);
    setOpen(false);
    try {
      const r = await fetch('/api/workspaces/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      });
      const payload = await r.json().catch(() => null);
      if (!r.ok) throw new Error(payload?.error ?? 'Unable to switch workspace.');
      window.location.assign('/dashboard');
    } catch (err) {
      console.error(err);
      setSwitching(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-10 items-center gap-2 px-2">
        <div className="h-6 w-6 animate-pulse rounded-md bg-zinc-200" />
        <div className="h-3 flex-1 animate-pulse rounded bg-zinc-200" />
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Switch workspace"
        className="flex h-10 w-full items-center gap-2 rounded-lg px-2 text-left transition-colors hover:bg-zinc-200/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
      >
        {current ? (
          <WorkspaceAvatar name={current.name} />
        ) : (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-dashed border-zinc-300 text-zinc-400">
            <Building2 className="h-3.5 w-3.5" />
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-zinc-900">
          {current?.name ?? 'Select workspace'}
        </span>
        {switching ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-zinc-400" />
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          role="listbox"
          aria-label="Workspaces"
          className="absolute left-0 top-[calc(100%+4px)] z-50 w-64 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg animate-in fade-in-0 zoom-in-95 duration-100"
        >
          {/* Header */}
          <div className="border-b border-zinc-100 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Workspaces</p>
          </div>

          {/* List */}
          <ul className="max-h-60 overflow-y-auto py-1">
            {items.map((ws) => {
              const isCurrent = ws.id === currentId || ws.is_current;
              return (
                <li key={ws.id} role="option" aria-selected={isCurrent}>
                  <button
                    type="button"
                    onClick={() => void switchWorkspace(ws.id)}
                    disabled={!!switching}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-zinc-50 disabled:opacity-50"
                  >
                    <WorkspaceAvatar name={ws.name} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-zinc-900">{ws.name}</div>
                      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{ws.role}</div>
                    </div>
                    {isCurrent && <Check className="h-3.5 w-3.5 shrink-0 text-zinc-900" />}
                    {switching === ws.id && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-zinc-500" />}
                  </button>
                </li>
              );
            })}
            {items.length === 0 && (
              <li className="px-3 py-6 text-center text-xs text-zinc-500">No workspaces found.</li>
            )}
          </ul>

          {/* Footer */}
          <div className="border-t border-zinc-100 p-1">
            <Link
              href="/onboarding?new=1"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-[13px] font-medium text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-900"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded border border-dashed border-zinc-300 text-zinc-400">
                <Plus className="h-3 w-3" />
              </span>
              Create workspace
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
