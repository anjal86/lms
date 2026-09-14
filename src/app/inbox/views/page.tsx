'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, MessageSquare, Plus, RefreshCw, Save, Search, Trash2, Users, X } from 'lucide-react';
import { useApp } from '@/lib/store';

type Filters = { filter: string; provider: string; state: string; priority: string; sort: string; search: string };
type SavedView = { id: string; name: string; filters: Filters; is_shared: boolean; sort_order: number; owner_id: string };
type Conversation = { id: string; customer_name: string | null; provider: string; workflow_state: string; priority: string; last_message_preview?: string | null; last_message_at: string | null; assigned_profile?: { full_name?: string | null } | null; unread_count: number };

const DEFAULT_FILTERS: Filters = { filter: 'all', provider: 'all', state: '', priority: '', sort: 'newest', search: '' };

export default function SavedInboxViewsPage() {
  const { currentUser, showToast } = useApp();
  const canShare = currentUser.role === 'admin' || currentUser.role === 'manager';
  const [views, setViews] = useState<SavedView[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  const selected = useMemo(() => views.find((view) => view.id === selectedId) || null, [selectedId, views]);

  const loadViews = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/inbox/views', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to load saved views.');
      const rows = (payload.views || []) as SavedView[];
      setViews(rows);
      setSelectedId((current) => current && rows.some((view) => view.id === current) ? current : rows[0]?.id || '');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to load saved views.', 'error');
    } finally { setLoading(false); }
  }, [showToast]);

  const loadQueue = useCallback(async (view: SavedView | null) => {
    if (!view) { setConversations([]); return; }
    setLoadingQueue(true);
    try {
      const query = new URLSearchParams({ filter: view.filters.filter || 'all', provider: view.filters.provider || 'all', sort: view.filters.sort || 'newest', limit: '300' });
      if (view.filters.state) query.set('state', view.filters.state);
      if (view.filters.priority) query.set('priority', view.filters.priority);
      if (view.filters.search) query.set('search', view.filters.search);
      const response = await fetch(`/api/conversations?${query.toString()}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to load saved queue.');
      setConversations(payload.conversations || []);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to load saved queue.', 'error');
    } finally { setLoadingQueue(false); }
  }, [showToast]);

  useEffect(() => { void loadViews(); }, [loadViews]);
  useEffect(() => { void loadQueue(selected); }, [loadQueue, selected]);

  const create = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const response = await fetch('/api/inbox/views', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), filters, is_shared: canShare && shared, sort_order: 100 }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to create saved view.');
      setName(''); setShared(false); setFilters(DEFAULT_FILTERS); setCreateOpen(false);
      await loadViews();
      setSelectedId(payload.view.id);
      showToast('Saved Inbox view created.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to create saved view.', 'error');
    } finally { setSaving(false); }
  };

  const remove = async (view: SavedView) => {
    if (!window.confirm(`Delete saved view “${view.name}”?`)) return;
    const response = await fetch(`/api/inbox/views/${view.id}`, { method: 'DELETE' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { showToast(payload.error || 'Unable to delete saved view.', 'error'); return; }
    await loadViews();
  };

  const queueLabel = selected ? `${selected.name} · ${conversations.length}` : 'Select a saved view';

  return <main className="flex min-h-[calc(100vh-4rem)] bg-zinc-50">
    <aside className="hidden w-64 shrink-0 border-r border-zinc-200 bg-white md:flex md:flex-col"><div className="border-b border-zinc-200 p-4"><Link href="/inbox" className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-900"><ArrowLeft className="h-3.5 w-3.5" /> Inbox</Link><div className="mt-3 flex items-center justify-between"><div><h1 className="text-sm font-bold text-zinc-950">Custom inboxes</h1><p className="text-[11px] text-zinc-500">Reusable operational filters</p></div><button type="button" onClick={() => setCreateOpen(true)} aria-label="Create saved view" className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-200 hover:bg-zinc-50"><Plus className="h-4 w-4" /></button></div></div><div className="min-h-0 flex-1 overflow-y-auto p-2">{loading ? <div className="flex items-center gap-2 p-3 text-xs text-zinc-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…</div> : views.map((view) => <button key={view.id} type="button" onClick={() => setSelectedId(view.id)} className={`mt-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-semibold ${selectedId === view.id ? 'bg-zinc-900 text-white' : 'text-zinc-700 hover:bg-zinc-100'}`}><Users className="h-3.5 w-3.5" /><span className="min-w-0 flex-1 truncate">{view.name}</span>{view.is_shared ? <span className="text-[9px] uppercase tracking-wide opacity-70">Team</span> : null}</button>)}</div></aside>

    <section className="min-w-0 flex-1"><header className="flex min-h-16 items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 sm:px-6"><div><div className="text-sm font-bold text-zinc-950">{queueLabel}</div>{selected ? <div className="mt-1 text-[11px] text-zinc-500">{[selected.filters.filter, selected.filters.provider !== 'all' ? selected.filters.provider : '', selected.filters.state, selected.filters.priority].filter(Boolean).join(' · ') || 'All conversations'}</div> : null}</div><div className="flex items-center gap-2"><button type="button" onClick={() => void loadQueue(selected)} disabled={!selected || loadingQueue} className="button-secondary button-sm">{loadingQueue ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh</button>{selected ? <button type="button" onClick={() => void remove(selected)} className="button-secondary button-sm text-red-600"><Trash2 className="h-3.5 w-3.5" /> Delete</button> : null}<button type="button" onClick={() => setCreateOpen(true)} className="button-primary button-sm md:hidden"><Plus className="h-3.5 w-3.5" /> New view</button></div></header>

      <div className="mx-auto max-w-5xl p-4 sm:p-6">{!selected ? <div className="border border-zinc-200 bg-white px-6 py-16 text-center"><Search className="mx-auto h-6 w-6 text-zinc-300" /><div className="mt-2 text-sm font-bold text-zinc-800">No custom inbox selected</div><button type="button" onClick={() => setCreateOpen(true)} className="button-primary mt-4"><Plus className="h-4 w-4" /> Create custom inbox</button></div> : loadingQueue ? <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading queue…</div> : <div className="overflow-hidden border border-zinc-200 bg-white"><div className="grid grid-cols-[minmax(0,1fr)_120px_100px] border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500"><span>Conversation</span><span>Owner</span><span className="text-right">Status</span></div><div className="divide-y divide-zinc-100">{conversations.map((conversation) => <Link key={conversation.id} href={`/inbox?conversationId=${conversation.id}&view=${encodeURIComponent(selected.filters.filter || 'all')}`} className="grid min-h-16 grid-cols-[minmax(0,1fr)_120px_100px] items-center gap-3 px-4 py-3 hover:bg-zinc-50"><div className="min-w-0"><div className="flex items-center gap-2"><MessageSquare className="h-3.5 w-3.5 shrink-0 text-zinc-400" /><span className="truncate text-sm font-bold text-zinc-900">{conversation.customer_name || 'Customer'}</span>{conversation.unread_count > 0 ? <span className="rounded bg-blue-600 px-1.5 py-0.5 font-mono text-[9px] font-bold text-white">{conversation.unread_count}</span> : null}</div><p className="mt-1 truncate text-xs text-zinc-500">{conversation.last_message_preview || 'No preview'} · {conversation.provider}</p></div><span className="truncate text-xs font-semibold text-zinc-600">{conversation.assigned_profile?.full_name || 'Unassigned'}</span><div className="text-right"><div className="text-xs font-bold capitalize text-zinc-800">{conversation.workflow_state}</div><div className="mt-1 text-[10px] font-semibold uppercase text-zinc-400">{conversation.priority}</div></div></Link>)}{!conversations.length ? <div className="px-4 py-14 text-center text-sm text-zinc-400">This custom inbox is clear.</div> : null}</div></div>}</div>
    </section>

    {createOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-4" role="dialog" aria-modal="true" aria-label="Create custom inbox"><div className="w-full max-w-lg border border-zinc-200 bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3"><div><h2 className="text-sm font-bold text-zinc-950">Create custom inbox</h2><p className="text-xs text-zinc-500">Save a reusable operational filter.</p></div><button type="button" onClick={() => setCreateOpen(false)} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-zinc-100"><X className="h-4 w-4" /></button></div><div className="grid gap-3 p-4 sm:grid-cols-2"><label className="sm:col-span-2 text-xs font-semibold text-zinc-600">Name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="WhatsApp leads needing reply" className="field mt-1.5 h-10 text-sm" /></label><label className="text-xs font-semibold text-zinc-600">Base queue<select value={filters.filter} onChange={(event) => setFilters((current) => ({ ...current, filter: event.target.value }))} className="select-field mt-1.5 h-10 w-full text-sm"><option value="all">All</option><option value="mine">Mine</option><option value="unassigned">Unassigned</option><option value="needs_reply">Needs reply</option><option value="unread">Unread</option><option value="sla_overdue">SLA overdue</option><option value="high_priority">High priority</option><option value="waiting">Waiting</option><option value="snoozed">Snoozed</option><option value="closed">Resolved</option></select></label><label className="text-xs font-semibold text-zinc-600">Channel<select value={filters.provider} onChange={(event) => setFilters((current) => ({ ...current, provider: event.target.value }))} className="select-field mt-1.5 h-10 w-full text-sm"><option value="all">Any channel</option><option value="facebook">Facebook</option><option value="instagram">Instagram</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="website">Website</option></select></label><label className="text-xs font-semibold text-zinc-600">State<select value={filters.state} onChange={(event) => setFilters((current) => ({ ...current, state: event.target.value }))} className="select-field mt-1.5 h-10 w-full text-sm"><option value="">Any state</option><option value="open">Open</option><option value="waiting">Waiting</option><option value="snoozed">Snoozed</option><option value="closed">Resolved</option></select></label><label className="text-xs font-semibold text-zinc-600">Priority<select value={filters.priority} onChange={(event) => setFilters((current) => ({ ...current, priority: event.target.value }))} className="select-field mt-1.5 h-10 w-full text-sm"><option value="">Any priority</option><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label><label className="text-xs font-semibold text-zinc-600">Sort<select value={filters.sort} onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value }))} className="select-field mt-1.5 h-10 w-full text-sm"><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="waiting">Longest waiting</option><option value="sla">SLA soonest</option></select></label><label className="text-xs font-semibold text-zinc-600">Search contains<input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Optional text" className="field mt-1.5 h-10 text-sm" /></label>{canShare ? <label className="sm:col-span-2 flex min-h-10 items-center gap-2 text-xs font-semibold text-zinc-700"><input type="checkbox" checked={shared} onChange={(event) => setShared(event.target.checked)} /> Share with workspace</label> : null}</div><div className="flex justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-3"><button type="button" onClick={() => setCreateOpen(false)} className="button-secondary">Cancel</button><button type="button" onClick={() => void create()} disabled={!name.trim() || saving} className="button-primary">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save view</button></div></div></div>}
  </main>;
}
