'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpenText, FileText, Plus, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { useApp } from '@/lib/store';
import {
  ConfirmDialog,
  DirtySaveBar,
  EmptyBlock,
  FieldLabel,
  LoadingBlock,
  StatusBadge,
  useUnsavedChangesGuard,
} from '@/components/settings/SettingsPrimitives';

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

function comparable(draft: Draft) {
  return JSON.stringify(draft);
}

export default function KnowledgeSettingsPage() {
  const { currentUser, showToast } = useApp();
  const canManage = currentUser.role === 'admin' || currentUser.role === 'manager';
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [baseline, setBaseline] = useState<Draft>(EMPTY);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingSource, setLoadingSource] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dirty = useMemo(() => comparable(draft) !== comparable(baseline), [draft, baseline]);
  useUnsavedChangesGuard(dirty);

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

  const visibleSources = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sources;
    return sources.filter((source) => {
      const typeLabel = TYPES.find((type) => type.value === source.source_type)?.label || source.source_type;
      return `${source.name} ${typeLabel}`.toLowerCase().includes(needle);
    });
  }, [query, sources]);

  const confirmDiscard = () => !dirty || window.confirm('Discard unsaved knowledge changes?');

  const choose = async (source: SourceRow) => {
    if (!confirmDiscard()) return;
    setLoadingSource(true);
    try {
      const response = await fetch(`/api/settings/knowledge?id=${encodeURIComponent(source.id)}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to load source.');
      const row = payload.source;
      const next: Draft = {
        id: row.id,
        name: row.name || '',
        source_type: row.source_type || 'manual',
        source_url: row.source_url || '',
        content: row.content || '',
        is_active: row.is_active !== false,
      };
      setDraft(next);
      setBaseline(next);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to load source.', 'error');
    } finally {
      setLoadingSource(false);
    }
  };

  const newSource = () => {
    if (!confirmDiscard()) return;
    setDraft(EMPTY);
    setBaseline(EMPTY);
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
      const next = { ...draft, id: payload.source.id };
      setDraft(next);
      setBaseline(next);
      setSources((current) => {
        const saved = payload.source as SourceRow;
        return [saved, ...current.filter((source) => source.id !== saved.id)];
      });
      showToast('Knowledge indexed for AI.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to save knowledge source.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!draft.id) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/settings/knowledge?id=${encodeURIComponent(draft.id)}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to delete source.');
      setSources((current) => current.filter((source) => source.id !== draft.id));
      setDraft(EMPTY);
      setBaseline(EMPTY);
      setConfirmDelete(false);
      showToast('Knowledge source deleted.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to delete source.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (!canManage) {
    return <div className="mx-auto max-w-xl py-20 text-center"><ShieldCheck className="mx-auto h-7 w-7 text-zinc-400" /><h1 className="mt-3 text-lg font-semibold">Manager access required</h1><p className="mt-1 text-sm text-zinc-500">Only workspace managers can manage AI knowledge.</p></div>;
  }

  return (
    <div className="app-page">
      <header className="page-header">
        <div className="min-w-0">
          <p className="page-eyebrow">Workspace intelligence</p>
          <h1 className="page-title">Knowledge</h1>
          <p className="page-description">Maintain verified facts AI can safely reference when answering customers.</p>
        </div>
        <div className="page-actions"><button type="button" onClick={newSource} className="button-primary"><Plus className="h-4 w-4" /> New source</button></div>
      </header>

      <div className="grid min-h-[620px] overflow-hidden rounded-lg border border-zinc-200 bg-white lg:grid-cols-[290px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-b border-zinc-200 bg-zinc-50/55 lg:border-b-0 lg:border-r">
          <div className="border-b border-zinc-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div><h2 className="text-sm font-semibold text-zinc-950">Sources</h2><p className="mt-0.5 text-[11px] text-zinc-500">{sources.length} indexed</p></div>
              {sources.length > 0 && <StatusBadge>{sources.filter((source) => source.is_active).length} active</StatusBadge>}
            </div>
            {sources.length > 0 && <div className="relative mt-3"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="field h-8 pl-8 text-xs" placeholder="Search sources" aria-label="Search knowledge sources" /></div>}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? <LoadingBlock label="Loading knowledge…" /> : sources.length === 0 ? <EmptyBlock icon={BookOpenText} title="No sources yet" description="Add the first approved fact set your AI can reference." action={<button type="button" onClick={newSource} className="button-secondary button-sm"><Plus className="h-3.5 w-3.5" /> Add source</button>} /> : visibleSources.length === 0 ? <div className="px-5 py-12 text-center text-xs text-zinc-500">No sources match “{query}”.</div> : <div className="divide-y divide-zinc-100 bg-white">{visibleSources.map((source) => { const selected = draft.id === source.id; return <button key={source.id} type="button" onClick={() => void choose(source)} className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition ${selected ? 'bg-blue-50' : 'hover:bg-zinc-50'}`}><span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${selected ? 'border-blue-200 bg-white text-blue-600' : 'border-zinc-200 bg-zinc-50 text-zinc-500'}`}><FileText className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="block min-w-0 flex-1 truncate text-sm font-semibold text-zinc-900">{source.name}</span></span><span className="mt-0.5 block truncate text-[11px] text-zinc-500">{TYPES.find((type) => type.value === source.source_type)?.label || source.source_type}</span><span className="mt-1 flex flex-wrap gap-1.5"><StatusBadge tone={source.is_active ? 'success' : 'neutral'}>{source.is_active ? 'Available' : 'Disabled'}</StatusBadge><StatusBadge>{source.chunk_count} chunk{source.chunk_count === 1 ? '' : 's'}</StatusBadge></span></span></button>; })}</div>}
          </div>
        </aside>

        <main className="min-w-0 bg-white">
          <div className="flex min-h-[620px] flex-col">
            <div className="flex flex-col gap-3 border-b border-zinc-200 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2"><h2 className="text-sm font-semibold text-zinc-950">{draft.id ? 'Edit source' : 'New source'}</h2>{draft.id && <StatusBadge tone={draft.is_active ? 'success' : 'neutral'}>{draft.is_active ? 'Available to AI' : 'Disabled'}</StatusBadge>}</div>
                <p className="mt-1 text-xs leading-5 text-zinc-500">Only include information staff are comfortable sharing directly with customers.</p>
              </div>
              {draft.id && <button type="button" onClick={() => setConfirmDelete(true)} className="button-secondary button-sm text-red-600"><Trash2 className="h-3.5 w-3.5" /> Delete source</button>}
            </div>

            {loadingSource ? <LoadingBlock label="Loading source…" /> : <div className="flex flex-1 flex-col gap-5 p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <FieldLabel label="Name"><input className="field mt-1.5" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Japan admissions fees" /></FieldLabel>
                <FieldLabel label="Type"><select className="select-field mt-1.5" value={draft.source_type} onChange={(event) => setDraft((current) => ({ ...current, source_type: event.target.value as SourceType }))}>{TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></FieldLabel>
              </div>
              <FieldLabel label="Reference URL" hint="Optional. Use the original page or document URL when one exists."><input className="field mt-1.5" value={draft.source_url} onChange={(event) => setDraft((current) => ({ ...current, source_url: event.target.value }))} placeholder="https://…" /></FieldLabel>
              <label className="flex min-h-0 flex-1 flex-col text-xs font-semibold text-zinc-700"><span>Verified knowledge</span><textarea className="field mt-1.5 min-h-[320px] flex-1 resize-y text-sm leading-6" value={draft.content} onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))} placeholder={'Example:\nOctober intake counselling is free.\nApplication fee: …\nRequired documents: …\nIf asked about refunds, hand off to staff.'} /></label>
              <label className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 px-4 py-3"><span><span className="block text-sm font-semibold text-zinc-900">Available to AI</span><span className="mt-0.5 block text-xs text-zinc-500">Disable outdated information without deleting its history.</span></span><input type="checkbox" checked={draft.is_active} onChange={(event) => setDraft((current) => ({ ...current, is_active: event.target.checked }))} /></label>
              <DirtySaveBar dirty={dirty} saving={saving} onSave={() => void save()} onDiscard={() => setDraft(baseline)} label="Save & index" />
            </div>}
          </div>
        </main>
      </div>

      <ConfirmDialog open={confirmDelete} title="Delete knowledge source?" description={`“${draft.name || 'This source'}” will be removed from AI retrieval immediately. This action cannot be undone.`} confirmLabel="Delete source" busy={deleting} onCancel={() => setConfirmDelete(false)} onConfirm={() => void remove()} />
    </div>
  );
}
