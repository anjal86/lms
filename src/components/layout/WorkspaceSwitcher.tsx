'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Building2, Check, ChevronsUpDown, Loader2, Plus } from 'lucide-react';

type WorkspaceMembership = {
  id: string;
  name: string;
  role: 'owner' | 'admin' | 'manager' | 'agent';
  is_current: boolean;
};

function WorkspaceAvatar({ name, active = false }: { name: string; active?: boolean }) {
  const initial = name.trim().charAt(0).toUpperCase() || 'W';
  return (
    <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold ${active ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-600'}`}>
      {initial}
    </span>
  );
}

export default function WorkspaceSwitcher() {
  const [items, setItems] = useState<WorkspaceMembership[]>([]);
  const [currentId, setCurrentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
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

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

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
  const switchingWorkspace = switching ? items.find((item) => item.id === switching) : null;

  const switchWorkspace = async (workspaceId: string) => {
    if (!workspaceId || workspaceId === current?.id || switching) return;
    setSwitchError(null);
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
      // A hard navigation is intentional here: workspace is tenant context and all
      // providers/stores must rehydrate before data from the next company is shown.
      window.location.assign('/dashboard');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to switch workspace.';
      console.error(err);
      setSwitchError(message);
      setSwitching(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-10 items-center gap-2 px-2" aria-label="Loading workspaces">
        <div className="h-7 w-7 animate-pulse rounded-lg bg-zinc-100" />
        <div className="h-3 w-28 animate-pulse rounded bg-zinc-100" />
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => !switching && setOpen((v) => !v)}
        disabled={Boolean(switching)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Switch workspace"
        className="flex h-10 w-full items-center gap-2.5 rounded-lg px-2 text-left transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20 disabled:cursor-wait disabled:opacity-80"
      >
        {current ? <WorkspaceAvatar name={current.name} active /> : (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-dashed border-zinc-300 text-zinc-400"><Building2 className="h-3.5 w-3.5" /></span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-zinc-900">{switchingWorkspace?.name ?? current?.name ?? 'Select workspace'}</span>
          {switchingWorkspace && <span className="mt-0.5 block text-[10px] text-blue-600">Switching workspace…</span>}
        </span>
        {switching ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-600" /> : <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-zinc-400" />}
      </button>

      {switchError && (
        <button type="button" onClick={() => setSwitchError(null)} className="mt-1.5 flex w-full items-start gap-1.5 rounded-lg bg-rose-50 px-2 py-1.5 text-left text-[10px] leading-4 text-rose-700" aria-label="Dismiss workspace switch error">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="min-w-0 flex-1">{switchError}</span>
        </button>
      )}

      {open && (
        <div role="listbox" aria-label="Workspaces" className="absolute left-0 top-[calc(100%+6px)] z-50 w-72 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl animate-in fade-in-0 zoom-in-95 duration-100">
          <div className="border-b border-zinc-100 px-3 py-2.5">
            <p className="text-[11px] font-medium text-zinc-500">Switch workspace</p>
          </div>

          <ul className="max-h-64 overflow-y-auto p-1.5">
            {items.map((ws) => {
              const isCurrent = ws.id === currentId || ws.is_current;
              return (
                <li key={ws.id} role="option" aria-selected={isCurrent}>
                  <button
                    type="button"
                    onClick={() => void switchWorkspace(ws.id)}
                    disabled={!!switching}
                    className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-left transition-colors disabled:opacity-50 ${isCurrent ? 'bg-blue-50' : 'hover:bg-zinc-50'}`}
                  >
                    <WorkspaceAvatar name={ws.name} active={isCurrent} />
                    <div className="min-w-0 flex-1">
                      <div className={`truncate text-[13px] font-medium ${isCurrent ? 'text-blue-800' : 'text-zinc-900'}`}>{ws.name}</div>
                      <div className="mt-0.5 text-[10px] capitalize text-zinc-500">{ws.role}</div>
                    </div>
                    {isCurrent && <Check className="h-3.5 w-3.5 shrink-0 text-blue-600" />}
                  </button>
                </li>
              );
            })}
            {items.length === 0 && <li className="px-3 py-6 text-center text-xs text-zinc-500">No workspaces found.</li>}
          </ul>

          <div className="border-t border-zinc-100 p-1.5">
            <Link href="/onboarding?new=1" onClick={() => setOpen(false)} className="flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-950">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-dashed border-zinc-300 text-zinc-400"><Plus className="h-3.5 w-3.5" /></span>
              Create workspace
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
