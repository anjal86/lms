'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, BadgeCheck, Bot, Loader2, Megaphone, Plus, Save, Trash2 } from 'lucide-react';
import { useApp } from '@/lib/store';

type AdKnowledge = {
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

type Draft = Omit<AdKnowledge, 'id'> & { id: string | null };

const EMPTY: Draft = {
  id: null,
  name: '',
  provider: 'whatsapp',
  platform: 'meta',
  campaign_id: null,
  ad_id: null,
  source_id: null,
  title: null,
  offer_summary: null,
  knowledge_text: '',
  valid_from: null,
  valid_to: null,
  is_active: true,
};

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

export default function AdKnowledgePage() {
  const { currentUser, showToast } = useApp();
  const canManage = currentUser.role === 'admin' || currentUser.role === 'manager';
  const [items, setItems] = useState<AdKnowledge[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!canManage) { setLoading(false); return; }
    setLoading(true);
    try {
      const response = await fetch('/api/settings/ad-knowledge', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to load ad knowledge.');
      setItems(Array.isArray(payload.items) ? payload.items : []);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to load ad knowledge.', 'error');
    } finally {
      setLoading(false);
    }
  }, [canManage, showToast]);

  useEffect(() => { void load(); }, [load]);

  const choose = (item: AdKnowledge) => setDraft({ ...item });
  const reset = () => setDraft({ ...EMPTY });

  const save = async () => {
    if (!draft.name.trim()) { showToast('Give this ad knowledge entry a name.', 'error'); return; }
    if (!draft.ad_id?.trim() && !draft.source_id?.trim() && !draft.campaign_id?.trim()) {
      showToast('Add at least one Ad ID, Source ID, or Campaign ID.', 'error');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/settings/ad-knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to save ad knowledge.');
      const saved = payload.item as AdKnowledge;
      setItems((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setDraft({ ...saved });
      showToast('Ad knowledge saved.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to save ad knowledge.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!draft.id) return;
    setSaving(true);
    try {
      const response = await fetch('/api/settings/ad-knowledge', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: draft.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to delete ad knowledge.');
      setItems((current) => current.filter((item) => item.id !== draft.id));
      reset();
      showToast('Ad knowledge deleted.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to delete ad knowledge.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) {
    return <div className="mx-auto max-w-xl px-6 py-20 text-center"><Megaphone className="mx-auto h-7 w-7 text-zinc-400" /><h1 className="mt-3 text-lg font-semibold">Manager access required</h1><p className="mt-1 text-sm text-zinc-500">Only workspace managers can configure ad knowledge.</p></div>;
  }

  return <div className="app-page max-w-7xl space-y-5">
    <header className="page-header">
      <div><p className="page-eyebrow">AI grounding</p><h1 className="page-title">Ad Knowledge</h1><p className="page-description">Teach AI what each paid ad actually offers, when it is valid, and what facts are safe to answer from.</p></div>
      <div className="page-actions"><Link href="/settings/ai-agents" className="button-secondary"><Bot className="h-4 w-4" /> AI Agents</Link><Link href="/settings/workspace" className="button-secondary"><ArrowLeft className="h-4 w-4" /> Settings</Link><button type="button" onClick={reset} className="button-primary"><Plus className="h-4 w-4" /> New mapping</button></div>
    </header>

    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="surface-flat overflow-hidden">
        <div className="panel-header"><div><h2 className="section-heading">Mapped ads</h2><p className="section-description">{items.length} knowledge entries</p></div></div>
        {loading ? <div className="flex items-center justify-center gap-2 py-16 text-xs text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div> : items.length === 0 ? <div className="px-5 py-14 text-center"><Megaphone className="mx-auto h-7 w-7 text-zinc-300" /><div className="mt-2 text-sm font-semibold text-zinc-700">No ads mapped yet</div><p className="mt-1 text-xs text-zinc-400">Incoming ad chats are still attributed, but AI will only know the creative text until you map approved business knowledge.</p></div> : <div className="divide-y divide-zinc-100">{items.map((item) => <button key={item.id} type="button" onClick={() => choose(item)} className={`w-full px-4 py-3 text-left ${draft.id === item.id ? 'bg-blue-50' : 'hover:bg-zinc-50'}`}><div className="flex items-start gap-2"><Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" /><div className="min-w-0"><div className="truncate text-sm font-semibold text-zinc-900">{item.name}</div><div className="mt-0.5 truncate font-mono text-[10px] text-zinc-500">{item.ad_id || item.source_id || item.campaign_id}</div><div className={`mt-1 text-[10px] ${item.is_active ? 'text-emerald-600' : 'text-zinc-400'}`}>{item.is_active ? 'Active' : 'Disabled'}</div></div></div></button>)}</div>}
      </aside>

      <main className="surface-flat p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="section-heading">{draft.id ? 'Ad knowledge' : 'New ad knowledge'}</h2><p className="section-description mt-1">Use the exact IDs from the ad-origin card in Inbox. Ad ID matches take priority over Source ID and Campaign ID.</p></div><div className="flex gap-2">{draft.id && <button type="button" onClick={() => void remove()} disabled={saving} className="button-secondary text-rose-600"><Trash2 className="h-4 w-4" /> Delete</button>}<button type="button" onClick={() => void save()} disabled={saving || loading} className="button-primary">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save</button></div></div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-semibold text-zinc-700">Mapping name<input className="field mt-1.5" value={draft.name} onChange={(e) => setDraft((current) => ({ ...current, name: e.target.value }))} placeholder="October Intake Ad" /></label>
          <label className="text-xs font-semibold text-zinc-700">Provider<select className="select-field mt-1.5" value={draft.provider || ''} onChange={(e) => setDraft((current) => ({ ...current, provider: e.target.value || null }))}><option value="">Any provider</option><option value="whatsapp">WhatsApp</option><option value="instagram">Instagram</option><option value="facebook">Facebook</option></select></label>
          <label className="text-xs font-semibold text-zinc-700">Ad ID<input className="field mt-1.5 font-mono text-xs" value={draft.ad_id || ''} onChange={(e) => setDraft((current) => ({ ...current, ad_id: e.target.value || null }))} placeholder="120203456789012345" /></label>
          <label className="text-xs font-semibold text-zinc-700">Source ID<input className="field mt-1.5 font-mono text-xs" value={draft.source_id || ''} onChange={(e) => setDraft((current) => ({ ...current, source_id: e.target.value || null }))} placeholder="Meta referral source_id" /></label>
          <label className="text-xs font-semibold text-zinc-700">Campaign ID<input className="field mt-1.5 font-mono text-xs" value={draft.campaign_id || ''} onChange={(e) => setDraft((current) => ({ ...current, campaign_id: e.target.value || null }))} placeholder="Optional campaign fallback" /></label>
          <label className="text-xs font-semibold text-zinc-700">Platform<input className="field mt-1.5" value={draft.platform || ''} onChange={(e) => setDraft((current) => ({ ...current, platform: e.target.value || null }))} placeholder="instagram / facebook / meta" /></label>
        </div>

        <label className="mt-4 block text-xs font-semibold text-zinc-700">Ad / offer title<input className="field mt-1.5" value={draft.title || ''} onChange={(e) => setDraft((current) => ({ ...current, title: e.target.value || null }))} placeholder="Study in Japan — October Intake" /></label>
        <label className="mt-4 block text-xs font-semibold text-zinc-700">Offer summary<textarea className="field mt-1.5" rows={3} value={draft.offer_summary || ''} onChange={(e) => setDraft((current) => ({ ...current, offer_summary: e.target.value || null }))} placeholder="Free counselling for October intake applicants." /></label>
        <label className="mt-4 block text-xs font-semibold text-zinc-700">Approved AI knowledge<textarea className="field mt-1.5" rows={8} value={draft.knowledge_text} onChange={(e) => setDraft((current) => ({ ...current, knowledge_text: e.target.value }))} placeholder={'What this ad means\nEligibility\nPricing or price rules\nWhat is included\nImportant exclusions\nWhat AI must hand off'} /></label>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-semibold text-zinc-700">Valid from<input type="datetime-local" className="field mt-1.5" value={localDate(draft.valid_from)} onChange={(e) => setDraft((current) => ({ ...current, valid_from: isoDate(e.target.value) }))} /></label>
          <label className="text-xs font-semibold text-zinc-700">Valid until<input type="datetime-local" className="field mt-1.5" value={localDate(draft.valid_to)} onChange={(e) => setDraft((current) => ({ ...current, valid_to: isoDate(e.target.value) }))} /></label>
        </div>
        <label className="mt-5 flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3"><span><span className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900"><BadgeCheck className="h-4 w-4" /> Use for AI grounding</span><span className="mt-0.5 block text-xs text-zinc-500">Disable an old offer without deleting its historical attribution.</span></span><input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft((current) => ({ ...current, is_active: e.target.checked }))} /></label>
      </main>
    </div>
  </div>;
}
