'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, Plus, Search, UserRound } from 'lucide-react';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';
import { useApp } from '@/lib/store';
import type { Lead } from '@/lib/types';
import LeadModal from './LeadModal';

type GenericLeadSnapshot = {
  items: Lead[];
  total: number;
  totalPages: number;
  fetchedAt: number;
};

const GENERIC_LEAD_RUNTIME_CACHE = new Map<string, GenericLeadSnapshot>();

function show(value: unknown) {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

export default function GenericLeadList() {
  const { config, term } = useWorkspace();
  const { allProfiles, currentUser, formatAppDate } = useApp();
  const pageSize = 50;
  const initialCacheKey = `${currentUser.id}::${config.workspace.id}::1::`;
  const initialSnapshot = GENERIC_LEAD_RUNTIME_CACHE.get(initialCacheKey);
  const [items, setItems] = useState<Lead[]>(() => initialSnapshot?.items || []);
  const [loading, setLoading] = useState(() => !initialSnapshot);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(() => initialSnapshot?.total || 0);
  const [totalPages, setTotalPages] = useState(() => initialSnapshot?.totalPages || 1);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => { setDebouncedQuery(query.trim()); setPage(1); }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const load = useCallback(async (options?: { quiet?: boolean }) => {
    const cacheKey = `${currentUser.id}::${config.workspace.id}::${page}::${debouncedQuery.toLowerCase()}`;
    const cached = GENERIC_LEAD_RUNTIME_CACHE.get(cacheKey);
    if (cached) {
      setItems(cached.items);
      setTotal(cached.total);
      setTotalPages(cached.totalPages);
      setLoading(false);
    } else if (!options?.quiet) {
      setLoading(true);
    }

    const controller = new AbortController();
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), tab: 'all' });
      if (debouncedQuery) params.set('q', debouncedQuery);
      const response = await fetch(`/api/leads?${params}`, { cache: 'no-store', signal: controller.signal });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Unable to load records.');
      const nextItems = (payload?.items || []) as Lead[];
      const nextTotal = Number(payload?.total || 0);
      const nextTotalPages = Number(payload?.totalPages || 1);
      setItems(nextItems);
      setTotal(nextTotal);
      setTotalPages(nextTotalPages);
      GENERIC_LEAD_RUNTIME_CACHE.set(cacheKey, { items: nextItems, total: nextTotal, totalPages: nextTotalPages, fetchedAt: Date.now() });
      setError(null);
    } catch (loadError) {
      if ((loadError as { name?: string })?.name !== 'AbortError' && !cached) setError(loadError instanceof Error ? loadError.message : 'Unable to load records.');
    } finally {
      if (!options?.quiet) setLoading(false);
    }
    return () => controller.abort();
  }, [config.workspace.id, currentUser.id, debouncedQuery, page]);

  useEffect(() => {
    const cacheKey = `${currentUser.id}::${config.workspace.id}::${page}::${debouncedQuery.toLowerCase()}`;
    void load({ quiet: GENERIC_LEAD_RUNTIME_CACHE.has(cacheKey) });
  }, [config.workspace.id, currentUser.id, debouncedQuery, load, page]);

  const visibleFields = useMemo(
    () => config.fields
      .filter((field) => field.entity_type === 'lead' && field.is_active)
      .sort((a, b) => Number(b.is_filterable) - Number(a.is_filterable) || a.sort_order - b.sort_order)
      .slice(0, 3),
    [config.fields]
  );
  const pipeline = config.pipelines.find((item) => item.is_default) || config.pipelines[0];
  const stageNames = useMemo(() => new Map((pipeline?.stages || []).map((stage) => [stage.id, stage.name])), [pipeline]);
  const ownerNames = useMemo(() => new Map(allProfiles.map((profile) => [profile.id, profile.full_name])), [allProfiles]);
  const leadLabel = term('lead', 'Lead');
  const leadPlural = term('lead_plural', 'Leads');
  const contactLabel = term('contact', 'Contact');

  return (
    <div className="app-page">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">{config.workspace.name}</p>
          <h1 className="page-title">{leadPlural}</h1>
          <p className="page-description">{total.toLocaleString()} records · {pipeline?.name || 'Default pipeline'}</p>
        </div>
        <div className="page-actions">
          <button type="button" onClick={() => setShowNew(true)} className="button-primary"><Plus className="h-4 w-4" /> New {leadLabel}</button>
        </div>
      </header>

      <section className="surface-flat overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-zinc-200 p-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative block w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${leadPlural.toLowerCase()}…`} aria-label={`Search ${leadPlural}`} className="field pl-9" />
          </label>
          <div className="text-[11px] text-zinc-500">Columns adapt from your workspace fields</div>
        </div>

        {error && <div role="alert" className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-left">
            <thead className="bg-zinc-50/80">
              <tr className="border-b border-zinc-200 text-zinc-500">
                <th className="px-4 py-2.5">{contactLabel}</th>
                {visibleFields.map((field) => <th key={field.id} className="px-3 py-2.5">{field.label}</th>)}
                <th className="px-3 py-2.5">Stage</th>
                <th className="px-3 py-2.5">Owner</th>
                <th className="px-3 py-2.5">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading && items.length === 0 ? (
                <tr><td colSpan={visibleFields.length + 4} className="h-40 text-center text-sm text-zinc-500"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading {leadPlural.toLowerCase()}…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={visibleFields.length + 4} className="h-40 text-center"><UserRound className="mx-auto h-5 w-5 text-zinc-300" /><div className="mt-2 text-sm font-medium text-zinc-700">No {leadPlural.toLowerCase()} found</div><div className="mt-1 text-xs text-zinc-400">Create a record or adjust your search.</div></td></tr>
              ) : items.map((lead) => (
                <tr key={lead.id} className="group bg-white hover:bg-zinc-50/70">
                  <td className="px-4 py-3">
                    <Link href={`/leads/${lead.id}/workspace`} className="block min-w-48">
                      <div className="flex items-center gap-2"><span className="font-mono text-[9px] text-zinc-400">{lead.lead_code}</span><span className="truncate text-sm font-semibold text-zinc-900 group-hover:text-blue-700">{lead.customer_name}</span></div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-500"><span>{lead.customer_phone || 'No phone'}</span>{lead.source && <><span>·</span><span className="capitalize">{lead.source.replaceAll('_', ' ')}</span></>}</div>
                    </Link>
                  </td>
                  {visibleFields.map((field) => <td key={field.id} className="max-w-52 px-3 py-3 text-xs font-medium text-zinc-700"><span className="line-clamp-2">{show(lead.custom_data?.[field.field_key])}</span></td>)}
                  <td className="px-3 py-3"><span className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-medium text-zinc-600">{stageNames.get(lead.pipeline_stage_id || '') || 'New'}</span></td>
                  <td className="px-3 py-3 text-xs text-zinc-600">{ownerNames.get(lead.assigned_to || '') || 'Unassigned'}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-[10px] text-zinc-400 tabular-nums">{formatAppDate(lead.updated_at || lead.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-3 text-xs">
          <span className="text-zinc-500">Page {page} of {Math.max(1, totalPages)}</span>
          <div className="flex gap-2"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} className="button-secondary button-sm disabled:opacity-40">Previous</button><button type="button" disabled={page >= totalPages || loading} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="button-secondary button-sm disabled:opacity-40">Next</button></div>
        </div>
      </section>

      <LeadModal isOpen={showNew} onClose={() => setShowNew(false)} />
    </div>
  );
}
