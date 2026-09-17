'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Bot,
  ExternalLink,
  Loader2,
  Megaphone,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useApp } from '@/lib/store';

type AdOverride = {
  id: string;
  name: string;
  provider: string | null;
  platform: string | null;
  campaign_id: string | null;
  ad_id: string | null;
  source_id: string | null;
  title: string | null;
  offer_summary: string | null;
  knowledge_text: string;
  valid_from: string | null;
  valid_to: string | null;
  is_active: boolean;
};

type AdRegistryItem = {
  id: string;
  provider: string;
  platform: string | null;
  ad_id: string;
  source_id: string | null;
  source_url: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  ad_name: string | null;
  creative_id: string | null;
  headline: string | null;
  body: string | null;
  call_to_action_type: string | null;
  destination_url: string | null;
  media_type: string | null;
  media_url: string | null;
  status: string | null;
  effective_status: string | null;
  adset_status: string | null;
  adset_effective_status: string | null;
  campaign_status: string | null;
  campaign_effective_status: string | null;
  adset_start_time: string | null;
  adset_end_time: string | null;
  enrichment_status: 'pending' | 'enriched' | 'permission_required' | 'failed' | 'unsupported';
  last_meta_sync_at: string | null;
  last_meta_sync_error: string | null;
  first_seen_at: string;
  last_seen_at: string;
  override: AdOverride | null;
};

type Summary = {
  detected: number;
  enriched: number;
  permission_required: number;
  pending: number;
};

type Draft = Omit<AdOverride, 'id'> & { id: string | null };

function localDate(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function isoDate(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function compactId(value?: string | null) {
  if (!value) return '—';
  return value.length > 25 ? `${value.slice(0, 11)}…${value.slice(-8)}` : value;
}

function displayDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function statusLabel(item: AdRegistryItem) {
  if (item.enrichment_status === 'permission_required') return 'Reconnect Meta';
  if (item.enrichment_status === 'pending') return 'Sync pending';
  if (item.enrichment_status === 'failed') return 'Sync failed';
  if (item.enrichment_status === 'enriched') return item.effective_status || 'Synced';
  return 'Webhook context';
}

function overrideDraft(item: AdRegistryItem): Draft {
  if (item.override) return { ...item.override };
  return {
    id: null,
    name: item.ad_name || item.headline || item.campaign_name || `Meta ad ${item.ad_id}`,
    provider: item.provider,
    platform: item.platform,
    campaign_id: item.campaign_id,
    ad_id: item.ad_id,
    source_id: item.source_id,
    title: null,
    offer_summary: null,
    knowledge_text: '',
    valid_from: null,
    valid_to: null,
    is_active: true,
  };
}

export default function AdKnowledgePage() {
  const { currentUser, showToast } = useApp();
  const canManage = currentUser.role === 'admin' || currentUser.role === 'manager';
  const [items, setItems] = useState<AdRegistryItem[]>([]);
  const [legacyCount, setLegacyCount] = useState(0);
  const [summary, setSummary] = useState<Summary>({ detected: 0, enriched: 0, permission_required: 0, pending: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async (preserveSelection = true) => {
    if (!canManage) { setLoading(false); return; }
    setLoading(true);
    try {
      const response = await fetch('/api/settings/ad-knowledge', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to load ads.');
      const nextItems = Array.isArray(payload.items) ? payload.items as AdRegistryItem[] : [];
      setItems(nextItems);
      setLegacyCount(Array.isArray(payload.legacy_overrides) ? payload.legacy_overrides.length : 0);
      setSummary(payload.summary || { detected: nextItems.length, enriched: 0, permission_required: 0, pending: 0 });
      const wantedId = preserveSelection ? selectedId : null;
      const selected = nextItems.find((item) => item.id === wantedId) || nextItems[0] || null;
      setSelectedId(selected?.id || null);
      setDraft(selected ? overrideDraft(selected) : null);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to load ads.', 'error');
    } finally {
      setLoading(false);
    }
  }, [canManage, selectedId, showToast]);

  useEffect(() => { void load(false); }, [canManage]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = useMemo(() => items.find((item) => item.id === selectedId) || null, [items, selectedId]);

  const choose = (item: AdRegistryItem) => {
    setSelectedId(item.id);
    setDraft(overrideDraft(item));
  };

  const saveOverride = async () => {
    if (!selected || !draft) return;
    setSaving(true);
    try {
      const payload = {
        ...draft,
        name: draft.name.trim() || selected.ad_name || selected.headline || `Meta ad ${selected.ad_id}`,
        provider: selected.provider,
        platform: selected.platform,
        ad_id: selected.ad_id,
        source_id: selected.source_id,
        campaign_id: selected.campaign_id,
        valid_from: draft.valid_from,
        valid_to: draft.valid_to,
        metadata: { registry_id: selected.id },
      };
      const response = await fetch('/api/settings/ad-knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Unable to save AI override.');
      const saved = body.item as AdOverride;
      setDraft({ ...saved });
      setItems((current) => current.map((item) => item.id === selected.id ? { ...item, override: saved } : item));
      showToast('Optional AI override saved.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to save AI override.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const removeOverride = async () => {
    if (!selected || !draft?.id) return;
    setSaving(true);
    try {
      const response = await fetch('/api/settings/ad-knowledge', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: draft.id }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Unable to remove AI override.');
      setItems((current) => current.map((item) => item.id === selected.id ? { ...item, override: null } : item));
      setDraft(overrideDraft({ ...selected, override: null }));
      showToast('AI override removed. Automatic Meta context remains active.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to remove AI override.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const syncNow = async () => {
    if (!selected) return;
    setSyncing(true);
    try {
      const response = await fetch('/api/settings/ad-knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync', registry_id: selected.id }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Unable to queue Meta refresh.');
      setItems((current) => current.map((item) => item.id === selected.id ? { ...item, enrichment_status: 'pending', last_meta_sync_error: null } : item));
      showToast('Meta ad refresh queued.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to queue Meta refresh.', 'error');
    } finally {
      setSyncing(false);
    }
  };

  if (!canManage) {
    return <div className="mx-auto max-w-xl px-6 py-20 text-center"><Megaphone className="mx-auto h-7 w-7 text-zinc-400" /><h1 className="mt-3 text-lg font-semibold">Manager access required</h1><p className="mt-1 text-sm text-zinc-500">Only workspace managers can review automatic ad context and optional overrides.</p></div>;
  }

  return <div className="app-page max-w-7xl space-y-5">
    <header className="page-header">
      <div>
        <p className="page-eyebrow">Automatic AI grounding</p>
        <h1 className="page-title">Ads & AI Context</h1>
        <p className="page-description">Ads appear here automatically when a customer replies from Meta. Webhook creative is usable immediately; campaign, ad-set, status and schedule are enriched in the background when Meta permissions allow.</p>
      </div>
      <div className="page-actions"><Link href="/settings/ai-agents" className="button-secondary"><Bot className="h-4 w-4" /> AI Agents</Link><Link href="/settings/workspace" className="button-secondary"><ArrowLeft className="h-4 w-4" /> Settings</Link></div>
    </header>

    <div className="grid gap-3 sm:grid-cols-4">
      <div className="surface-flat p-4"><div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Detected</div><div className="mt-1 text-xl font-semibold text-zinc-950">{summary.detected}</div></div>
      <div className="surface-flat p-4"><div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Meta enriched</div><div className="mt-1 text-xl font-semibold text-emerald-700">{summary.enriched}</div></div>
      <div className="surface-flat p-4"><div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Sync pending</div><div className="mt-1 text-xl font-semibold text-blue-700">{summary.pending}</div></div>
      <div className="surface-flat p-4"><div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Reconnect needed</div><div className="mt-1 text-xl font-semibold text-amber-700">{summary.permission_required}</div></div>
    </div>

    <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="surface-flat overflow-hidden">
        <div className="panel-header"><div><h2 className="section-heading">Detected Meta ads</h2><p className="section-description">No manual mapping required</p></div></div>
        {loading ? <div className="flex items-center justify-center gap-2 py-16 text-xs text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div> : items.length === 0 ? <div className="px-5 py-14 text-center"><Megaphone className="mx-auto h-7 w-7 text-zinc-300" /><div className="mt-2 text-sm font-semibold text-zinc-700">No ad conversations yet</div><p className="mt-1 text-xs leading-5 text-zinc-400">When a customer replies to a Facebook, Instagram or Click-to-WhatsApp ad, the ad will appear here automatically.</p></div> : <div className="divide-y divide-zinc-100">{items.map((item) => <button key={item.id} type="button" onClick={() => choose(item)} className={`w-full px-4 py-3 text-left ${selectedId === item.id ? 'bg-blue-50' : 'hover:bg-zinc-50'}`}><div className="flex items-start gap-2"><Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" /><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-zinc-900">{item.ad_name || item.headline || item.campaign_name || `Meta ad ${compactId(item.ad_id)}`}</div><div className="mt-0.5 truncate text-[10px] text-zinc-500">{item.campaign_name || item.provider} · {compactId(item.ad_id)}</div><div className={`mt-1 text-[10px] ${item.enrichment_status === 'enriched' ? 'text-emerald-600' : item.enrichment_status === 'permission_required' || item.enrichment_status === 'failed' ? 'text-amber-700' : 'text-blue-600'}`}>{statusLabel(item)}{item.override ? ' · Override' : ''}</div></div></div></button>)}</div>}
        {legacyCount > 0 && <div className="border-t border-zinc-100 px-4 py-3 text-[10px] leading-4 text-zinc-500">{legacyCount} older manual mapping{legacyCount === 1 ? '' : 's'} remain available to AI for historical conversations.</div>}
      </aside>

      <main className="surface-flat p-5">
        {!selected || !draft ? <div className="py-20 text-center text-sm text-zinc-400">Select a detected ad to inspect its context.</div> : <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><div className="flex items-center gap-2"><h2 className="section-heading">{selected.ad_name || selected.headline || 'Meta ad'}</h2>{selected.enrichment_status === 'enriched' && <BadgeCheck className="h-4 w-4 text-emerald-600" />}</div><p className="section-description mt-1">Automatically detected from a real customer ad reply.</p></div>
            <div className="flex gap-2">{selected.source_url && <a href={selected.source_url} target="_blank" rel="noreferrer" className="button-secondary"><ExternalLink className="h-4 w-4" /> View source</a>}<button type="button" onClick={() => void syncNow()} disabled={syncing} className="button-secondary">{syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Sync Meta</button></div>
          </div>

          {selected.enrichment_status === 'permission_required' && <div className="rounded-lg border border-amber-200 bg-amber-50 p-4"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 text-amber-700" /><div><div className="text-sm font-semibold text-amber-900">Reconnect Meta for richer ad data</div><p className="mt-1 text-xs leading-5 text-amber-800">The AI already has the webhook creative and can understand this ad. Reconnecting grants the new <code>ads_read</code> scope so campaign, ad-set, status and schedule can sync automatically.</p><Link href="/connections" className="mt-2 inline-flex text-xs font-semibold text-amber-900 underline">Open Connections</Link></div></div></div>}

          <section className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900"><Sparkles className="h-4 w-4" /> Automatic Meta context</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div><div className="text-[10px] uppercase tracking-wide text-zinc-400">Ad ID</div><div className="mt-1 font-mono text-xs text-zinc-800">{selected.ad_id}</div></div>
              <div><div className="text-[10px] uppercase tracking-wide text-zinc-400">Campaign</div><div className="mt-1 text-xs font-medium text-zinc-800">{selected.campaign_name || 'Waiting for Meta enrichment'}</div></div>
              <div><div className="text-[10px] uppercase tracking-wide text-zinc-400">Ad set</div><div className="mt-1 text-xs font-medium text-zinc-800">{selected.adset_name || 'Waiting for Meta enrichment'}</div></div>
              <div><div className="text-[10px] uppercase tracking-wide text-zinc-400">Effective status</div><div className="mt-1 text-xs font-medium text-zinc-800">{selected.effective_status || statusLabel(selected)}</div></div>
              <div><div className="text-[10px] uppercase tracking-wide text-zinc-400">Starts</div><div className="mt-1 text-xs text-zinc-700">{displayDate(selected.adset_start_time)}</div></div>
              <div><div className="text-[10px] uppercase tracking-wide text-zinc-400">Ends</div><div className="mt-1 text-xs text-zinc-700">{displayDate(selected.adset_end_time)}</div></div>
            </div>
            {selected.headline && <div className="mt-4"><div className="text-[10px] uppercase tracking-wide text-zinc-400">Headline</div><div className="mt-1 text-sm font-semibold text-zinc-900">{selected.headline}</div></div>}
            {selected.body && <div className="mt-3"><div className="text-[10px] uppercase tracking-wide text-zinc-400">Creative copy</div><p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-zinc-700">{selected.body}</p></div>}
            <div className="mt-3 grid gap-3 sm:grid-cols-2"><div><div className="text-[10px] uppercase tracking-wide text-zinc-400">CTA</div><div className="mt-1 text-xs text-zinc-700">{selected.call_to_action_type || '—'}</div></div><div><div className="text-[10px] uppercase tracking-wide text-zinc-400">Last Meta sync</div><div className="mt-1 text-xs text-zinc-700">{displayDate(selected.last_meta_sync_at)}</div></div></div>
            {selected.last_meta_sync_error && selected.enrichment_status !== 'permission_required' && <p className="mt-3 text-[10px] leading-4 text-amber-700">Partial sync: {selected.last_meta_sync_error}</p>}
          </section>

          <section className="rounded-xl border border-zinc-200 p-4">
            <div><h3 className="text-sm font-semibold text-zinc-950">Optional business override</h3><p className="mt-1 text-xs leading-5 text-zinc-500">Usually leave this empty. Add only facts Meta cannot know—special eligibility, internal price rules, exclusions, or instructions for when AI must hand off.</p></div>
            <label className="mt-4 block text-xs font-semibold text-zinc-700">Display / offer title override<input className="field mt-1.5" value={draft.title || ''} onChange={(e) => setDraft((current) => current ? { ...current, title: e.target.value || null } : current)} placeholder={selected.headline || selected.ad_name || 'Optional'} /></label>
            <label className="mt-4 block text-xs font-semibold text-zinc-700">Offer summary override<textarea className="field mt-1.5" rows={3} value={draft.offer_summary || ''} onChange={(e) => setDraft((current) => current ? { ...current, offer_summary: e.target.value || null } : current)} placeholder="Only if the Meta creative needs business clarification" /></label>
            <label className="mt-4 block text-xs font-semibold text-zinc-700">Additional AI instructions<textarea className="field mt-1.5" rows={6} value={draft.knowledge_text} onChange={(e) => setDraft((current) => current ? { ...current, knowledge_text: e.target.value } : current)} placeholder={'Optional business-only facts\nPricing rules\nEligibility\nImportant exclusions\nWhen to hand off'} /></label>
            <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-xs font-semibold text-zinc-700">Override valid from<input type="datetime-local" className="field mt-1.5" value={localDate(draft.valid_from)} onChange={(e) => setDraft((current) => current ? { ...current, valid_from: isoDate(e.target.value) } : current)} /></label><label className="text-xs font-semibold text-zinc-700">Override valid until<input type="datetime-local" className="field mt-1.5" value={localDate(draft.valid_to)} onChange={(e) => setDraft((current) => current ? { ...current, valid_to: isoDate(e.target.value) } : current)} /></label></div>
            <div className="mt-5 flex flex-wrap justify-between gap-2"><div className="text-[10px] leading-4 text-zinc-400">Automatic Meta context remains active even with no override.</div><div className="flex gap-2">{draft.id && <button type="button" onClick={() => void removeOverride()} disabled={saving} className="button-secondary text-rose-600"><Trash2 className="h-4 w-4" /> Remove override</button>}<button type="button" onClick={() => void saveOverride()} disabled={saving} className="button-primary">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save override</button></div></div>
          </section>
        </div>}
      </main>
    </div>
  </div>;
}
