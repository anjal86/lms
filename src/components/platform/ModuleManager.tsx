'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';

function titleCase(value: string) {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function ModuleManager() {
  const { config, refresh } = useWorkspace();
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = async (moduleKey: string, enabled: boolean) => {
    setSaving(moduleKey);
    setError(null);
    try {
      const response = await fetch('/api/platform/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modules: { [moduleKey]: enabled } }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to update module.');
      await refresh();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : 'Unable to update module.');
    } finally {
      setSaving(null);
    }
  };

  return (
    <section className="space-y-4">
      <div><h2 className="text-sm font-semibold text-zinc-950">Modules</h2><p className="mt-1 text-xs text-zinc-500">Turn optional capabilities on or off for this workspace. Core CRM and Inbox stay available.</p></div>
      {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {config.modules.map((moduleRow) => (
          <label key={moduleRow.module_key} className="flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2.5">
            <div><div className="text-xs font-semibold text-zinc-800">{titleCase(moduleRow.module_key)}</div><div className="mt-0.5 text-[10px] text-zinc-400">{moduleRow.is_enabled ? 'Enabled' : 'Disabled'}</div></div>
            {saving === moduleRow.module_key ? <Loader2 className="h-4 w-4 animate-spin text-zinc-400" /> : <input type="checkbox" checked={moduleRow.is_enabled} onChange={(event) => void toggle(moduleRow.module_key, event.target.checked)} className="h-4 w-4 rounded border-zinc-300" />}
          </label>
        ))}
      </div>
    </section>
  );
}
