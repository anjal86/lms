'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpenText, CheckCircle2, FileText, Loader2, Plus, Save, Search, ShieldCheck, Trash2 } from 'lucide-react';
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
  const [query, setQuery] = useState('');
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

  const visibleSources = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sources;
    return sources.filter((source) => {
      const typeLabel = TYPES.find((type) => type.value === source.source_type)?.label || source.source_type;
      return `${source.name} ${typeLabel}`.toLowerCase().includes(needle);
    });
  }, [query, sources]);

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

  return (
    <div className="app-page mx-auto max-w-6xl gap-4 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="page-eyebrow">Workspace intelligence</p>
          <h1 className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-zinc-950">Knowledge</h1>
          <p className="mt-1 max-w-2xl text-sm leading-5 text-zinc-500">Maintain the verified facts AI can use when answering customers.</p>
        </div>
        <button type="button" onClick={() => setDraft(EMPTY)} className="button-primary shrink-0 self-start"><Plus className="h-4 w-4" /> New source</button>
      </header>

      <div className="grid min-h-[620px] overflow-hidden rounded-xl border border-zinc-200 bg-white lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-b border-zinc-200 bg-zinc-50/55 lg:border-b-0 lg:border-r">
          <div className="border-b border-zinc-200 bg-white px-4 py-3.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-zinc-950">Sources</h2>
                <p className="mt-0.5 text-[11px] text-zinc-500">{sources.length} indexed</p>
              </div>
              {sources.length > 0 && <span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-semibold text-zinc-600">{sources.filter((source) => source.is_active).length} active</span>}
            </div>
            {sources.length > 0 && (
              <div className="relative mt-3">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} className="field h-8 pl-8 text-xs" placeholder="Search sources" aria-label="Search knowledge sources" />
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-xs text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
            ) : sources.length === 0 ? (
              <div className="flex h-full min-h-[260px] flex-col items-center justify-center px-7 py-10 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-400"><BookOpenText className="h-5 w-5" /></span>
                <div className="mt-3 text-sm font-semibold text-zinc-800">No sources yet</div>
                <p className="mt-1 max-w-48 text-xs leading-5 text-zinc-500">Add the first approved fact set your AI can reference.</p>
                <button type="button" onClick={() => setDraft(EMPTY)} className="button-secondary button-sm mt-4"><Plus className="h-3.5 w-3.5" /> Add source</button>
              </div>
            ) : visibleSources.length === 0 ? (
              <div className="px-5 py-12 text-center text-xs text-zinc-500">No sources match “{query}”.</div>
            ) : (
              <div className="divide-y divide-zinc-100 bg-white">
                {visibleSources.map((source) => {
                  const selected = draft.id === source.id;
                  return (
                    <button key={source.id} type="button" onClick={() => void choose(source)} className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition ${selected ? 'bg-blue-50' : 'hover:bg-zinc-50'}`}>
                      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${selected ? 'border-blue-200 bg-white text-blue-600' : 'border-zinc-200 bg-zinc-50 text-zinc-500'}`}><FileText className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="block min-w-0 flex-1 truncate text-sm font-semibold text-zinc-900">{source.name}</span>
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${source.is_active ? 'bg-emerald-500' : 'bg-zinc-300'}`} />
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-zinc-500">{TYPES.find((type) => type.value === source.source_type)?.label || source.source_type}</span>
                        <span className="mt-1 block text-[10px] text-zinc-400">{source.chunk_count} chunk{source.chunk_count === 1 ? '' : 's'}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        <main className="min-w-0 bg-white">
          <div className="flex min-h-[620px] flex-col">
            <div className="flex flex-col gap-3 border-b border-zinc-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-zinc-950">{draft.id ? 'Edit source' : 'New source'}</h2>
                  {draft.id && <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${draft.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>{draft.is_active && <CheckCircle2 className="h-3 w-3" />}{draft.is_active ? 'Available to AI' : 'Disabled'}</span>}
                </div>
                <p className="mt-0.5 text-xs text-zinc-500">Only include information staff are comfortable sharing directly with customers.</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {draft.id && <button type="button" onClick={() => void remove()} className="button-secondary button-sm text-red-600"><Trash2 className="h-3.5 w-3.5" /> Delete</button>}
                <button type="button" onClick={() => void save()} disabled={saving || loadingSource} className="button-primary button-sm">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save & index</button>
              </div>
            </div>

            {loadingSource ? (
              <div className="flex flex-1 items-center justify-center gap-2 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading source…</div>
            ) : (
              <div className="flex flex-1 flex-col gap-4 p-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-xs font-semibold text-zinc-700">Name<input className="field mt-1.5" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Japan admissions fees" /></label>
                  <label className="text-xs font-semibold text-zinc-700">Type<select className="select-field mt-1.5 w-full" value={draft.source_type} onChange={(event) => setDraft((current) => ({ ...current, source_type: event.target.value as SourceType }))}>{TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
                </div>

                <label className="block text-xs font-semibold text-zinc-700">Reference URL <span className="font-normal text-zinc-400">optional</span><input className="field mt-1.5" value={draft.source_url} onChange={(event) => setDraft((current) => ({ ...current, source_url: event.target.value }))} placeholder="https://…" /></label>

                <label className="flex min-h-0 flex-1 flex-col text-xs font-semibold text-zinc-700">
                  <span>Verified knowledge</span>
                  <textarea className="field mt-1.5 min-h-[300px] flex-1 resize-y text-sm leading-6" value={draft.content} onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))} placeholder={'Example:\nOctober intake counselling is free.\nApplication fee: …\nRequired documents: …\nIf asked about refunds, hand off to staff.'} />
                </label>

                <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-zinc-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">Available to AI</div>
                    <p className="mt-0.5 text-xs text-zinc-500">Turn this off when information becomes outdated without deleting the source.</p>
                  </div>
                  <label className="inline-flex shrink-0 items-center gap-2 text-xs font-medium text-zinc-600">
                    <span>{draft.is_active ? 'Enabled' : 'Disabled'}</span>
                    <input type="checkbox" checked={draft.is_active} onChange={(event) => setDraft((current) => ({ ...current, is_active: event.target.checked }))} />
                  </label>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
