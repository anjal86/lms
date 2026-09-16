'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Activity, ArrowLeft, Bot, CheckCircle2, KeyRound, Loader2, Plus, Save, Server, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useApp } from '@/lib/store';
import type { AiProviderKind, AiProviderPreset } from '@/lib/ai/provider-catalog';

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

function healthLabel(provider: ProviderRow) {
  if (!provider.is_active) return { text: 'Disabled', className: 'text-zinc-400' };
  if (provider.health_status === 'healthy') return { text: provider.last_health_latency_ms != null ? `Healthy · ${provider.last_health_latency_ms} ms` : 'Healthy', className: 'text-emerald-600' };
  if (provider.health_status === 'degraded') return { text: 'Degraded', className: 'text-amber-600' };
  if (provider.health_status === 'unhealthy') return { text: 'Unhealthy', className: 'text-red-600' };
  return { text: 'Not tested yet', className: 'text-zinc-400' };
}

export default function AiProvidersPage() {
  const { currentUser, showToast } = useApp();
  const canManage = currentUser.role === 'admin' || currentUser.role === 'manager';
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [presets, setPresets] = useState<AiProviderPreset[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [privateNetworks, setPrivateNetworks] = useState(false);

  const selectedPreset = useMemo(() => presets.find((preset) => preset.id === draft.provider) || null, [presets, draft.provider]);
  const selectedProvider = useMemo(() => providers.find((provider) => provider.id === draft.id) || null, [providers, draft.id]);

  const load = useCallback(async () => {
    if (!canManage) { setLoading(false); return; }
    setLoading(true);
    try {
      const response = await fetch('/api/settings/ai-providers', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to load AI providers.');
      setProviders(Array.isArray(payload.providers) ? payload.providers : []);
      setPresets(Array.isArray(payload.presets) ? payload.presets : []);
      setPrivateNetworks(payload.private_provider_networks_enabled === true);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to load AI providers.', 'error');
    } finally {
      setLoading(false);
    }
  }, [canManage, showToast]);

  useEffect(() => { void load(); }, [load]);

  const choose = (provider: ProviderRow) => setDraft({ id: provider.id, name: provider.name, provider: provider.provider, base_url: provider.base_url, api_key: '', clear_api_key: false, is_active: provider.is_active });
  const chooseKind = (kind: AiProviderKind) => {
    const preset = presets.find((row) => row.id === kind);
    setDraft((current) => ({ ...current, provider: kind, name: preset?.label || 'AI Provider', base_url: kind === 'custom_openai' ? '' : (preset?.defaultBaseUrl || '') }));
  };
  const newProvider = () => {
    const preset = presets.find((row) => row.id === 'openai');
    setDraft({ ...EMPTY, base_url: preset?.defaultBaseUrl || '' });
  };

  const save = async () => {
    if (!draft.name.trim()) { showToast('Give this provider connection a name.', 'error'); return; }
    setSaving(true);
    try {
      const response = await fetch('/api/settings/ai-providers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to save AI provider.');
      const saved = payload.provider as ProviderRow;
      setProviders((current) => [saved, ...current.filter((row) => row.id !== saved.id)]);
      setDraft({ id: saved.id, name: saved.name, provider: saved.provider, base_url: saved.base_url, api_key: '', clear_api_key: false, is_active: saved.is_active });
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
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Provider test failed.', 'error');
      await load();
    } finally { setTestingId(null); }
  };

  if (!canManage) return <div className="mx-auto max-w-xl px-6 py-20 text-center"><ShieldCheck className="mx-auto h-7 w-7 text-zinc-400" /><h1 className="mt-3 text-lg font-semibold">Manager access required</h1><p className="mt-1 text-sm text-zinc-500">Only workspace managers can configure AI provider credentials.</p></div>;

  const selectedHealth = selectedProvider ? healthLabel(selectedProvider) : null;

  return <div className="app-page max-w-7xl space-y-5">
    <header className="page-header">
      <div><p className="page-eyebrow">Workspace intelligence</p><h1 className="page-title">AI Providers</h1><p className="page-description">Bring your own API key. Keys are encrypted server-side and never returned to the browser. Live runs continuously update provider health.</p></div>
      <div className="page-actions"><Link href="/settings/workspace" className="button-secondary"><ArrowLeft className="h-4 w-4" /> Settings</Link><Link href="/settings/ai-agents" className="button-secondary"><Bot className="h-4 w-4" /> AI Agents</Link><button type="button" onClick={newProvider} className="button-primary"><Plus className="h-4 w-4" /> Add provider</button></div>
    </header>

    <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="surface-flat overflow-hidden">
        <div className="panel-header"><div><h2 className="section-heading">Provider connections</h2><p className="section-description">{providers.length} configured</p></div></div>
        {loading ? <div className="flex items-center justify-center gap-2 py-16 text-xs text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div> : providers.length === 0 ? <div className="px-5 py-14 text-center"><KeyRound className="mx-auto h-7 w-7 text-zinc-300" /><div className="mt-2 text-sm font-semibold text-zinc-700">No provider keys yet</div><p className="mt-1 text-xs text-zinc-400">Add OpenAI, Claude, Gemini, Mistral, OpenRouter, or another compatible provider.</p></div> : <div className="divide-y divide-zinc-100">{providers.map((provider) => { const health = healthLabel(provider); return <button key={provider.id} type="button" onClick={() => choose(provider)} className={`flex w-full items-start gap-3 px-4 py-3 text-left ${draft.id === provider.id ? 'bg-blue-50' : 'hover:bg-zinc-50'}`}><span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${draft.id === provider.id ? 'bg-blue-100 text-blue-700' : 'bg-zinc-100 text-zinc-500'}`}><Server className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-zinc-900">{provider.name}</span><span className="mt-0.5 block text-[10px] text-zinc-500">{presets.find((row) => row.id === provider.provider)?.label || provider.provider}</span><span className={`mt-1 block text-[10px] ${health.className}`}>{health.text}</span><span className={`mt-0.5 inline-flex items-center gap-1 text-[10px] ${provider.has_api_key ? 'text-emerald-600' : provider.provider === 'custom_openai' ? 'text-zinc-400' : 'text-amber-600'}`}>{provider.has_api_key && <CheckCircle2 className="h-3 w-3" />}{provider.has_api_key ? 'Key configured' : 'No key stored'}</span></span></button>; })}</div>}
      </aside>

      <main className="surface-flat p-5">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="section-heading">{draft.id ? 'Provider configuration' : 'New provider connection'}</h2><p className="section-description mt-1">Use a separate key per workspace if you want billing and limits isolated by company.</p></div><div className="flex gap-2">{draft.id && <button type="button" onClick={() => void testProvider(draft.id!)} disabled={testingId === draft.id || saving} className="button-secondary">{testingId === draft.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />} Test connection</button>}<button type="button" onClick={() => void save()} disabled={saving || loading} className="button-primary">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save provider</button></div></div>

        {selectedProvider && <div className={`mt-4 rounded-lg border px-3 py-2.5 text-xs ${selectedProvider.health_status === 'healthy' ? 'border-emerald-100 bg-emerald-50 text-emerald-800' : selectedProvider.health_status === 'unhealthy' ? 'border-red-100 bg-red-50 text-red-800' : selectedProvider.health_status === 'degraded' ? 'border-amber-100 bg-amber-50 text-amber-800' : 'border-zinc-200 bg-zinc-50 text-zinc-600'}`}><div className="flex items-center gap-2 font-semibold">{selectedProvider.health_status === 'unhealthy' || selectedProvider.health_status === 'degraded' ? <TriangleAlert className="h-4 w-4" /> : <Activity className="h-4 w-4" />} {selectedHealth?.text}</div>{selectedProvider.last_health_error && <p className="mt-1 break-words text-[11px] leading-4">{selectedProvider.last_health_error}</p>}{selectedProvider.last_health_check_at && <p className="mt-1 text-[10px] opacity-70">Last checked {new Date(selectedProvider.last_health_check_at).toLocaleString()}</p>}</div>}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-semibold text-zinc-700">Connection name<input className="field mt-1.5" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Company OpenAI" /></label>
          <label className="text-xs font-semibold text-zinc-700">Provider<select className="select-field mt-1.5" value={draft.provider} onChange={(event) => chooseKind(event.target.value as AiProviderKind)} disabled={Boolean(draft.id)}>{presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select>{draft.id && <span className="mt-1 block text-[10px] font-normal text-zinc-400">Provider type is fixed after creation so one vendor’s key is never reused with another.</span>}</label>
        </div>
        {selectedPreset && <div className="mt-3 rounded-lg bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-500">{selectedPreset.description}</div>}
        <label className="mt-4 block text-xs font-semibold text-zinc-700">Base URL<input className="field mt-1.5 font-mono text-xs" value={draft.provider === 'custom_openai' ? draft.base_url : (selectedPreset?.defaultBaseUrl || draft.base_url)} onChange={(event) => setDraft((current) => ({ ...current, base_url: event.target.value }))} disabled={draft.provider !== 'custom_openai'} placeholder="https://your-llm-gateway.example/v1" /></label>
        {draft.provider === 'custom_openai' && <p className="mt-1.5 text-[11px] text-zinc-500">Custom endpoints must use HTTPS. Trusted local/private endpoints can be enabled server-side with <code>AI_ALLOW_PRIVATE_PROVIDER_NETWORKS=true</code>{privateNetworks ? ' (enabled on this server).' : '.'}</p>}
        <label className="mt-4 block text-xs font-semibold text-zinc-700">API key<input type="password" autoComplete="new-password" className="field mt-1.5 font-mono" value={draft.api_key} onChange={(event) => setDraft((current) => ({ ...current, api_key: event.target.value, clear_api_key: false }))} placeholder={selectedProvider?.has_api_key ? '••••••••  Leave blank to keep current key' : draft.provider === 'custom_openai' ? 'Optional for a trusted local endpoint' : 'Paste provider API key'} /></label>
        <p className="mt-1.5 text-[11px] text-zinc-500">The key is encrypted with the server encryption key before database storage. Existing keys are never returned to this page.</p>
        {selectedProvider?.has_api_key && <label className="mt-3 flex items-center gap-2 text-xs text-zinc-600"><input type="checkbox" checked={draft.clear_api_key} onChange={(event) => setDraft((current) => ({ ...current, clear_api_key: event.target.checked, api_key: event.target.checked ? '' : current.api_key }))} /> Remove the stored API key when saving</label>}
        <label className="mt-5 flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3"><span><span className="block text-sm font-semibold text-zinc-900">Provider enabled</span><span className="mt-0.5 block text-xs text-zinc-500">Disabled providers cannot be used by active agents.</span></span><input type="checkbox" checked={draft.is_active} onChange={(event) => setDraft((current) => ({ ...current, is_active: event.target.checked }))} /></label>
      </main>
    </div>
  </div>;
}
