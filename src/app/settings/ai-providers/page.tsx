'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, KeyRound, Plus, Search, Server, ShieldCheck } from 'lucide-react';
import { useApp } from '@/lib/store';
import type { AiProviderKind, AiProviderPreset } from '@/lib/ai/provider-catalog';
import {
  DirtySaveBar,
  EmptyBlock,
  FieldLabel,
  InlineNotice,
  LoadingBlock,
  SettingsSection,
  StatusBadge,
  useUnsavedChangesGuard,
} from '@/components/settings/SettingsPrimitives';

type ProviderRow = {
  id: string;
  name: string;
  provider: AiProviderKind;
  api_style: string;
  base_url: string;
  is_active: boolean;
  has_api_key: boolean;
  health_status?: 'unknown' | 'healthy' | 'degraded' | 'unhealthy';
  last_health_check_at?: string | null;
  last_health_latency_ms?: number | null;
  last_health_error?: string | null;
  consecutive_failures?: number;
};

type Draft = {
  id: string | null;
  name: string;
  provider: AiProviderKind;
  base_url: string;
  api_key: string;
  clear_api_key: boolean;
  is_active: boolean;
};

const EMPTY: Draft = { id: null, name: 'OpenAI', provider: 'openai', base_url: '', api_key: '', clear_api_key: false, is_active: true };

function comparable(draft: Draft) {
  return JSON.stringify({ ...draft, api_key: draft.api_key ? '__changed__' : '', clear_api_key: draft.clear_api_key });
}

function healthMeta(provider: ProviderRow) {
  if (!provider.is_active) return { label: 'Disabled', tone: 'neutral' as const };
  if (provider.health_status === 'healthy') return { label: provider.last_health_latency_ms != null ? `Healthy · ${provider.last_health_latency_ms} ms` : 'Healthy', tone: 'success' as const };
  if (provider.health_status === 'degraded') return { label: 'Degraded', tone: 'warning' as const };
  if (provider.health_status === 'unhealthy') return { label: 'Unhealthy', tone: 'danger' as const };
  return { label: 'Not tested', tone: 'neutral' as const };
}

function toDraft(provider: ProviderRow): Draft {
  return { id: provider.id, name: provider.name, provider: provider.provider, base_url: provider.base_url, api_key: '', clear_api_key: false, is_active: provider.is_active };
}

export default function AiProvidersPage() {
  const { currentUser, showToast } = useApp();
  const canManage = currentUser.role === 'admin' || currentUser.role === 'manager';
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [presets, setPresets] = useState<AiProviderPreset[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [baseline, setBaseline] = useState<Draft>(EMPTY);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [privateNetworks, setPrivateNetworks] = useState(false);

  const dirty = useMemo(() => comparable(draft) !== comparable(baseline), [draft, baseline]);
  useUnsavedChangesGuard(dirty);

  const selectedPreset = useMemo(() => presets.find((preset) => preset.id === draft.provider) || null, [presets, draft.provider]);
  const selectedProvider = useMemo(() => providers.find((provider) => provider.id === draft.id) || null, [providers, draft.id]);
  const visibleProviders = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return providers;
    return providers.filter((provider) => {
      const preset = presets.find((row) => row.id === provider.provider);
      return `${provider.name} ${preset?.label || provider.provider}`.toLowerCase().includes(needle);
    });
  }, [providers, presets, query]);

  const load = useCallback(async () => {
    if (!canManage) { setLoading(false); return; }
    setLoading(true);
    try {
      const response = await fetch('/api/settings/ai-providers', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to load AI providers.');
      const rows = (Array.isArray(payload.providers) ? payload.providers : []) as ProviderRow[];
      const nextPresets = (Array.isArray(payload.presets) ? payload.presets : []) as AiProviderPreset[];
      setProviders(rows);
      setPresets(nextPresets);
      setPrivateNetworks(payload.private_provider_networks_enabled === true);
      if (rows[0]) {
        const next = toDraft(rows[0]);
        setDraft(next);
        setBaseline(next);
      } else {
        const preset = nextPresets.find((row) => row.id === 'openai');
        const next = { ...EMPTY, base_url: preset?.defaultBaseUrl || '' };
        setDraft(next);
        setBaseline(next);
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to load AI providers.', 'error');
    } finally {
      setLoading(false);
    }
  }, [canManage, showToast]);

  useEffect(() => { void load(); }, [load]);

  const confirmDiscard = () => !dirty || window.confirm('Discard unsaved provider changes?');

  const choose = (provider: ProviderRow) => {
    if (!confirmDiscard()) return;
    const next = toDraft(provider);
    setDraft(next);
    setBaseline(next);
  };

  const chooseKind = (kind: AiProviderKind) => {
    const preset = presets.find((row) => row.id === kind);
    setDraft((current) => ({ ...current, provider: kind, name: current.id ? current.name : (preset?.label || 'AI Provider'), base_url: kind === 'custom_openai' ? '' : (preset?.defaultBaseUrl || '') }));
  };

  const newProvider = () => {
    if (!confirmDiscard()) return;
    const preset = presets.find((row) => row.id === 'openai');
    const next = { ...EMPTY, base_url: preset?.defaultBaseUrl || '' };
    setDraft(next);
    setBaseline(next);
  };

  const save = async () => {
    if (!draft.name.trim()) { showToast('Give this provider connection a name.', 'error'); return; }
    setSaving(true);
    try {
      const response = await fetch('/api/settings/ai-providers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to save AI provider.');
      const saved = payload.provider as ProviderRow;
      const next = toDraft(saved);
      setProviders((current) => [saved, ...current.filter((row) => row.id !== saved.id)]);
      setDraft(next);
      setBaseline(next);
      showToast(draft.api_key ? 'Provider saved and API key encrypted.' : 'Provider saved.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to save AI provider.', 'error');
    } finally { setSaving(false); }
  };

  const testProvider = async (id: string) => {
    setTestingId(id);
    try {
      const response = await fetch(`/api/settings/ai-providers/${id}/test`, { method: 'POST' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Provider test failed.');
      showToast(`Provider healthy · ${payload.latency_ms} ms · ${payload.model}`, 'success');
      const refresh = await fetch('/api/settings/ai-providers', { cache: 'no-store' });
      const refreshed = await refresh.json().catch(() => ({}));
      if (refresh.ok && Array.isArray(refreshed.providers)) setProviders(refreshed.providers);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Provider test failed.', 'error');
    } finally { setTestingId(null); }
  };

  if (!canManage) return <div className="mx-auto max-w-xl py-20 text-center"><ShieldCheck className="mx-auto h-7 w-7 text-zinc-400" /><h1 className="mt-3 text-lg font-semibold">Manager access required</h1><p className="mt-1 text-sm text-zinc-500">Only workspace managers can configure AI provider credentials.</p></div>;

  const selectedHealth = selectedProvider ? healthMeta(selectedProvider) : null;

  return (
    <div className="app-page">
      <header className="page-header">
        <div><p className="page-eyebrow">Workspace intelligence</p><h1 className="page-title">AI Providers</h1><p className="page-description">Bring your own model provider while keeping credentials isolated to this workspace.</p></div>
        <div className="page-actions"><button type="button" onClick={newProvider} className="button-primary"><Plus className="h-4 w-4" /> Add provider</button></div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[290px_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 p-4">
            <div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold text-zinc-950">Providers</h2><p className="mt-0.5 text-[11px] text-zinc-500">{providers.length} configured</p></div><StatusBadge>{providers.filter((provider) => provider.is_active).length} active</StatusBadge></div>
            {providers.length > 0 && <div className="relative mt-3"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="field h-8 pl-8 text-xs" placeholder="Search providers" aria-label="Search AI providers" /></div>}
          </div>
          {loading ? <LoadingBlock label="Loading providers…" /> : providers.length === 0 ? <EmptyBlock icon={KeyRound} title="No providers yet" description="Add OpenAI, Claude, Gemini, Mistral, OpenRouter, or another compatible provider." action={<button type="button" onClick={newProvider} className="button-secondary button-sm"><Plus className="h-3.5 w-3.5" /> Add provider</button>} /> : visibleProviders.length === 0 ? <div className="px-5 py-12 text-center text-xs text-zinc-500">No providers match “{query}”.</div> : <div className="divide-y divide-zinc-100">{visibleProviders.map((provider) => { const health = healthMeta(provider); return <button key={provider.id} type="button" onClick={() => choose(provider)} className={`flex w-full items-start gap-3 px-4 py-3 text-left transition ${draft.id === provider.id ? 'bg-blue-50' : 'hover:bg-zinc-50'}`}><span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${draft.id === provider.id ? 'border-blue-200 bg-white text-blue-700' : 'border-zinc-200 bg-zinc-50 text-zinc-500'}`}><Server className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-zinc-900">{provider.name}</span><span className="mt-0.5 block text-[10px] text-zinc-500">{presets.find((row) => row.id === provider.provider)?.label || provider.provider}</span><span className="mt-1 flex flex-wrap gap-1.5"><StatusBadge tone={health.tone}>{health.label}</StatusBadge><StatusBadge tone={provider.has_api_key ? 'success' : provider.provider === 'custom_openai' ? 'neutral' : 'warning'}>{provider.has_api_key ? 'Key configured' : 'No key'}</StatusBadge></span></span></button>; })}</div>}
        </aside>

        <div className="min-w-0 space-y-4">
          {selectedProvider?.last_health_error && <InlineNotice tone={selectedProvider.health_status === 'unhealthy' ? 'danger' : 'warning'}>{selectedProvider.last_health_error}</InlineNotice>}

          <SettingsSection title={draft.id ? 'Provider configuration' : 'New provider connection'} description="Choose the vendor and endpoint this workspace should use." icon={Server} actions={draft.id ? <button type="button" onClick={() => void testProvider(draft.id!)} disabled={testingId === draft.id || saving} className="button-secondary button-sm"><Activity className={`h-3.5 w-3.5 ${testingId === draft.id ? 'animate-pulse' : ''}`} /> {testingId === draft.id ? 'Testing…' : 'Test connection'}</button> : undefined}>
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldLabel label="Connection name"><input className="field mt-1.5" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Company OpenAI" /></FieldLabel>
              <FieldLabel label="Provider" hint={draft.id ? 'Provider type is fixed after creation so one vendor key is never reused with another.' : undefined}><select className="select-field mt-1.5" value={draft.provider} onChange={(event) => chooseKind(event.target.value as AiProviderKind)} disabled={Boolean(draft.id)}>{presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select></FieldLabel>
            </div>
            {selectedPreset && <p className="mt-4 rounded-lg bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-500">{selectedPreset.description}</p>}
            <div className="mt-4"><FieldLabel label="Base URL" hint={draft.provider === 'custom_openai' ? `Custom endpoints must use HTTPS.${privateNetworks ? ' Private-network access is enabled on this server.' : ''}` : 'Managed automatically for this provider.'}><input className="field mt-1.5 font-mono text-xs" value={draft.provider === 'custom_openai' ? draft.base_url : (selectedPreset?.defaultBaseUrl || draft.base_url)} onChange={(event) => setDraft((current) => ({ ...current, base_url: event.target.value }))} disabled={draft.provider !== 'custom_openai'} placeholder="https://your-llm-gateway.example/v1" /></FieldLabel></div>
          </SettingsSection>

          <SettingsSection title="Credentials" description="API keys are encrypted server-side and never returned to the browser." icon={KeyRound}>
            <FieldLabel label="API key" hint={selectedProvider?.has_api_key ? 'Leave blank to keep the current key.' : draft.provider === 'custom_openai' ? 'Optional for a trusted local endpoint.' : 'Required before this provider can serve live AI requests.'}><input type="password" autoComplete="new-password" className="field mt-1.5 font-mono" value={draft.api_key} onChange={(event) => setDraft((current) => ({ ...current, api_key: event.target.value, clear_api_key: false }))} placeholder={selectedProvider?.has_api_key ? '••••••••' : 'Paste provider API key'} /></FieldLabel>
            {selectedProvider?.has_api_key && <label className="mt-4 flex items-center gap-2 text-xs text-zinc-600"><input type="checkbox" checked={draft.clear_api_key} onChange={(event) => setDraft((current) => ({ ...current, clear_api_key: event.target.checked, api_key: event.target.checked ? '' : current.api_key }))} /> Remove the stored API key when saving</label>}
          </SettingsSection>

          <SettingsSection title="Availability" description="Disabled providers remain configured but cannot be selected by active agents." icon={Activity}>
            <label className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 px-4 py-3"><span><span className="block text-sm font-semibold text-zinc-900">Provider enabled</span><span className="mt-0.5 block text-xs text-zinc-500">Allow agents in this workspace to use this connection.</span></span><input type="checkbox" checked={draft.is_active} onChange={(event) => setDraft((current) => ({ ...current, is_active: event.target.checked }))} /></label>
            {selectedProvider?.last_health_check_at && <p className="mt-3 text-[11px] text-zinc-500">Last health check {new Date(selectedProvider.last_health_check_at).toLocaleString()}.</p>}
          </SettingsSection>

          <DirtySaveBar dirty={dirty} saving={saving} onSave={() => void save()} onDiscard={() => setDraft(baseline)} label="Save provider" />
        </div>
      </div>
    </div>
  );
}
