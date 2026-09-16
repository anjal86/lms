'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BookOpenText, FileText, Loader2, Plus, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { useApp } from '@/lib/store';

type SourceType = 'manual' | 'faq' | 'service' | 'pricing' | 'policy' | 'website' | 'document';
type SourceRow = {
  id: string;
  name: string;
  source_type: SourceType;
  source_url?: string | null;
  is_active: boolean;
  chunk_count: number;
  updated_at: string;
};
type Draft = {
  id: string | null;
  name: string;
  source_type: SourceType;
  source_url: string;
  content: string;
  is_active: boolean;
};

const EMPTY: Draft = { id: null, name: '', source_type: 'manual', source_url: '', content: '', is_active: true };
const TYPES: Array<{ value: SourceType; label: string }> = [
  { value: 'manual', label: 'Manual knowledge' },
  { value: 'faq', label: 'FAQ' },
  { value: 'service', label: 'Services / products' },
  { value: 'pricing', label: 'Pricing' },
  { value: 'policy', label: 'Policy' },
  { value: 'website', label: 'Website content' },
  { value: 'document', label: 'Document text' },
];

export default function KnowledgeSettingsPage() {
  const { currentUser, showToast } = useApp();
  const canManage = currentUser.role === 'admin' || currentUser.role === 'manager';
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [loadingSource, setLoadingSource] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!canManage) { setLoading(false); return; }
    setLoading(true);
    try {
      const response = await fetch('/api/settings/knowledge', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to load knowledge.');
      setSources(Array.isArray(payload.sources) ? payload.sources : []);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to load knowledge.', 'error');
    } finally {
      setLoading(false);
    }
  }, [canManage, showToast]);

  useEffect(() => { void load(); }, [load]);

  const choose = async (source: SourceRow) => {
    setLoadingSource(true);
    try {
      const response = await fetch(`/api/settings/knowledge?id=${encodeURIComponent(source.id)}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to load source.');
      const row = payload.source;
      setDraft({
        id: row.id,
        name: row.name || '',
        source_type: row.source_type || 'manual',
        source_url: row.source_url || '',
        content: row.content || '',
        is_active: row.is_active !== false,
      });
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to load source.', 'error');
    } finally {
      setLoadingSource(false);
    }
  };

  const save = async () => {
    if (!draft.name.trim() || !draft.content.trim()) { showToast('Name and knowledge content are required.', 'error'); return; }
    setSaving(true);
    try {
      const response = await fetch('/api/settings/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, source_url: draft.source_url || null }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to save knowledge source.');
      showToast('Knowledge indexed for AI.', 'success');
      setDraft((current) => ({ ...current, id: payload.source.id }));
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to save knowledge source.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!draft.id || !window.confirm('Delete this knowledge source?')) return;
    try {
      const response = await fetch(`/api/settings/knowledge?id=${encodeURIComponent(draft.id)}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to delete source.');
      setDraft(EMPTY);
      await load();
      showToast('Knowledge source deleted.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to delete source.', 'error');
    }
  };

  if (!canManage) {
    return <div className="mx-auto max-w-xl px-6 py-20 text-center"><ShieldCheck className="mx-auto h-7 w-7 text-zinc-400" /><h1 className="mt-3 text-lg font-semibold">Manager access required</h1><p className="mt-1 text-sm text-zinc-500">Only workspace managers can manage AI knowledge.</p></div>;
  }

  return <div className="app-page max-w-7xl space-y-5">
    <header className="page-header">
      <div><p className="page-eyebrow">Workspace intelligence</p><h1 className="page-title">Knowledge</h1><p className="page-description">Give AI verified business facts. Content is chunked and retrieved only inside this workspace; ad context remains automatic and separate.</p></div>
      <div className="page-actions"><Link href="/settings/workspace" className="button-secondary"><ArrowLeft className="h-4 w-4" /> Settings</Link><button type="button" onClick={() => setDraft(EMPTY)} className="button-primary"><Plus className="h-4 w-4" /> New source</button></div>
    </header>

    <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="surface-flat overflow-hidden">
        <div className="panel-header"><div><h2 className="section-heading">Knowledge sources</h2><p className="section-description">{sources.length} indexed</p></div></div>
        {loading ? <div className="flex items-center justify-center gap-2 py-16 text-xs text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div> : sources.length === 0 ? <div className="px-5 py-14 text-center"><BookOpenText className="mx-auto h-7 w-7 text-zinc-300" /><div className="mt-2 text-sm font-semibold text-zinc-700">No knowledge yet</div><p className="mt-1 text-xs text-zinc-400">Add services, pricing, FAQs and policies the AI is allowed to use.</p></div> : <div className="divide-y divide-zinc-100">{sources.map((source) => <button key={source.id} type="button" onClick={() => void choose(source)} className={`flex w-full items-start gap-3 px-4 py-3 text-left ${draft.id === source.id ? 'bg-blue-50' : 'hover:bg-zinc-50'}`}><span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500"><FileText className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-zinc-900">{source.name}</span><span className="mt-0.5 block text-[10px] text-zinc-500">{TYPES.find((type) => type.value === source.source_type)?.label || source.source_type} · {source.chunk_count} chunks</span><span className={`mt-1 block text-[10px] ${source.is_active ? 'text-emerald-600' : 'text-zinc-400'}`}>{source.is_active ? 'Available to AI' : 'Disabled'}</span></span></button>)}</div>}
      </aside>

      <main className="surface-flat p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="section-heading">{draft.id ? 'Edit knowledge source' : 'New knowledge source'}</h2><p className="section-description mt-1">Only put facts here that staff would be comfortable giving directly to a customer.</p></div><div className="flex gap-2">{draft.id && <button type="button" onClick={() => void remove()} className="button-secondary text-red-600"><Trash2 className="h-4 w-4" /> Delete</button>}<button type="button" onClick={() => void save()} disabled={saving || loadingSource} className="button-primary">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save & index</button></div></div>

        {loadingSource ? <div className="flex items-center gap-2 py-10 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading source…</div> : <div className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2"><label className="text-xs font-semibold text-zinc-700">Name<input className="field mt-1.5" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Japan admissions fees" /></label><label className="text-xs font-semibold text-zinc-700">Type<select className="select-field mt-1.5" value={draft.source_type} onChange={(event) => setDraft((current) => ({ ...current, source_type: event.target.value as SourceType }))}>{TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label></div>
          <label className="block text-xs font-semibold text-zinc-700">Source URL <span className="font-normal text-zinc-400">optional reference</span><input className="field mt-1.5" value={draft.source_url} onChange={(event) => setDraft((current) => ({ ...current, source_url: event.target.value }))} placeholder="https://…" /></label>
          <label className="block text-xs font-semibold text-zinc-700">Verified knowledge<textarea className="field mt-1.5 min-h-[360px] resize-y font-mono text-xs leading-5" value={draft.content} onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))} placeholder={'Example:\nOctober intake counselling is free.\nApplication fee: …\nRequired documents: …\nIf asked about refunds, hand off to staff.'} /></label>
          <label className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3"><span><span className="block text-sm font-semibold text-zinc-900">Available to AI</span><span className="mt-0.5 block text-xs text-zinc-500">Disable outdated information without deleting it.</span></span><input type="checkbox" checked={draft.is_active} onChange={(event) => setDraft((current) => ({ ...current, is_active: event.target.checked }))} /></label>
          <p className="text-[11px] leading-5 text-zinc-500">Retrieval currently uses workspace-scoped PostgreSQL search, so it works in local Docker and production without an external vector service. The chunk schema is ready for semantic embeddings later.</p>
        </div>}
      </main>
    </div>
  </div>;
}
