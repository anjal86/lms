'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Check, Link2, Loader2, ShieldCheck } from 'lucide-react';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';

type AvailableAccount = {
  id: string;
  name?: string;
  kind?: string;
  username?: string | null;
  page_name?: string | null;
  display_phone_number?: string | null;
  connected?: boolean;
  unavailable?: boolean;
};

type AuthorizationPayload = {
  authorization?: { id: string; provider: string; display_name: string };
  accounts?: AvailableAccount[];
  error?: string;
};

const providerLabels: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  tiktok: 'TikTok',
};

function secondary(account: AvailableAccount) {
  if (account.kind === 'instagram_business' && account.page_name) return `Connected through ${account.page_name}`;
  if (account.kind === 'whatsapp_phone' && account.display_phone_number) return account.display_phone_number;
  if (account.kind === 'facebook_page') return 'Facebook Page';
  if (account.kind === 'tiktok_advertiser') return 'TikTok advertiser';
  return 'Business account';
}

export default function ConnectionAccountSelectionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { config } = useWorkspace();
  const authorizationId = searchParams.get('authorization') || '';
  const providerParam = searchParams.get('provider') || '';
  const [payload, setPayload] = useState<AuthorizationPayload | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    if (!authorizationId) {
      setError('Authorization is missing. Start the connection again.');
      setLoading(false);
      return;
    }

    void fetch(`/api/integrations/authorizations?authorization=${encodeURIComponent(authorizationId)}`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json().catch(() => null) as AuthorizationPayload | null;
        if (!response.ok) throw new Error(data?.error || 'Unable to load available accounts.');
        return data;
      })
      .then((data) => {
        if (!active) return;
        setPayload(data);
        const available = (data?.accounts || []).filter((account) => !account.connected && !account.unavailable);
        if (available.length === 1) setSelected(new Set([available[0].id]));
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load available accounts.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [authorizationId]);

  const provider = payload?.authorization?.provider || providerParam;
  const label = providerLabels[provider] || 'Provider';
  const accounts = payload?.accounts || [];
  const connectable = useMemo(() => accounts.filter((account) => !account.connected && !account.unavailable), [accounts]);

  const toggle = (id: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const connectSelected = async () => {
    if (!authorizationId || selected.size === 0 || saving) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/integrations/authorizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authorizationId, accountIds: Array.from(selected) }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Unable to connect selected accounts.');
      router.replace(`/connections?connected=${encodeURIComponent(provider || 'account')}`);
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to connect selected accounts.');
      setSaving(false);
    }
  };

  return (
    <div className="app-page">
      <div className="mx-auto w-full max-w-3xl">
        <button type="button" onClick={() => router.push('/connections')} className="button-ghost mb-4 -ml-2">
          <ArrowLeft className="h-4 w-4" /> Back to connections
        </button>

        <header className="mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-950 text-white">
            <Link2 className="h-5 w-5" />
          </div>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-400">{label} authorization complete</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">Choose what belongs to {config.workspace.name}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
            Your login only gave the CRM permission to discover accounts you can access. Nothing is added to this workspace until you select it here.
          </p>
        </header>

        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-zinc-100 bg-zinc-50/70 px-5 py-3 text-xs text-zinc-600">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span>Your personal/provider login is not shown to employees. Only the selected business accounts become workspace connections.</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading available accounts…</div>
          ) : error && !payload ? (
            <div className="p-6"><div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div></div>
          ) : accounts.length === 0 ? (
            <div className="p-8 text-center"><div className="text-sm font-semibold text-zinc-900">No accounts found</div><p className="mt-1 text-xs text-zinc-500">Check your provider permissions and authorize again.</p></div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {accounts.map((account) => {
                const checked = selected.has(account.id);
                const disabled = Boolean(account.connected || account.unavailable);
                return (
                  <button
                    type="button"
                    key={account.id}
                    disabled={disabled}
                    onClick={() => toggle(account.id)}
                    className={`flex w-full items-center gap-3 px-5 py-4 text-left transition ${disabled ? 'cursor-default bg-zinc-50/40' : 'hover:bg-zinc-50'} ${checked ? 'bg-blue-50/50' : ''}`}
                  >
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${account.connected ? 'border-emerald-500 bg-emerald-500 text-white' : checked ? 'border-zinc-950 bg-zinc-950 text-white' : account.unavailable ? 'border-zinc-200 bg-zinc-100 text-zinc-300' : 'border-zinc-300 bg-white text-transparent'}`}>
                      <Check className="h-3 w-3" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-zinc-900">{account.name || account.id}</span>
                      <span className="mt-0.5 block truncate text-xs text-zinc-500">{secondary(account)}</span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${account.connected ? 'bg-emerald-50 text-emerald-700' : account.unavailable ? 'bg-amber-50 text-amber-700' : checked ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-zinc-500'}`}>
                      {account.connected ? 'Connected here' : account.unavailable ? 'Used elsewhere' : checked ? 'Selected' : 'Available'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-zinc-100 bg-zinc-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-zinc-500">
              {connectable.length === 0 ? 'No additional accounts are available to connect.' : `${selected.size} of ${connectable.length} available selected`}
            </div>
            <div className="flex items-center gap-2">
              {connectable.length > 1 && (
                <button
                  type="button"
                  onClick={() => setSelected(selected.size === connectable.length ? new Set() : new Set(connectable.map((account) => account.id)))}
                  className="button-secondary"
                  disabled={saving}
                >
                  {selected.size === connectable.length ? 'Clear' : 'Select all'}
                </button>
              )}
              <button type="button" onClick={() => void connectSelected()} disabled={selected.size === 0 || saving} className="button-primary disabled:cursor-not-allowed disabled:opacity-50">
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Connecting…</> : <>Connect selected <Check className="h-4 w-4" /></>}
              </button>
            </div>
          </div>
        </section>

        {error && payload && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</div>}
      </div>
    </div>
  );
}
