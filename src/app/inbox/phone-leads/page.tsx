'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Facebook,
  Instagram,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  PhoneCall,
  RefreshCw,
  Search,
  UserCheck,
} from 'lucide-react';
import { useApp } from '@/lib/store';
import ConvertToLeadDrawer, { type ConversationForConversion } from '@/components/inbox/ConvertToLeadDrawer';

type PhoneLeadRow = {
  id: string;
  lead_id: string | null;
  connection_id: string | null;
  provider: string;
  external_thread_id: string | null;
  external_contact_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_avatar_url: string | null;
  last_message_preview: string | null;
  status: string;
  unread_count: number;
  assigned_to: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  converted_at: string | null;
  metadata?: {
    detected_phone?: string;
    detected_phones?: string[];
    detected_phone_snippet?: string;
    detected_phone_at?: string;
    meta_page_name?: string;
    customer_profile?: Record<string, unknown>;
    [key: string]: unknown;
  } | null;
  lead?: {
    id: string;
    lead_code: string;
    customer_name: string;
    destination: string;
    stage: string;
    priority: string;
    assigned_to: string | null;
    created_at: string;
  } | null;
  assigned_profile?: {
    id: string;
    full_name: string | null;
    email: string;
    role: string;
  } | null;
};

type PhoneLeadsResponse = {
  phoneLeads: PhoneLeadRow[];
  total: number;
  metrics: { total: number; unconverted: number; converted: number };
};

const PAGE_SIZE = 50;
const PROVIDER_ICONS: Record<string, React.ElementType> = {
  facebook: Facebook,
  instagram: Instagram,
  whatsapp: MessageCircle,
  email: Mail,
};

function formatTime(timestamp?: string | null) {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '—';
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (diffDays === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function phoneFor(row: PhoneLeadRow) {
  return row.metadata?.detected_phone || row.customer_phone || '—';
}

function snippetFor(row: PhoneLeadRow) {
  return row.metadata?.detected_phone_snippet || row.last_message_preview || '—';
}

export default function PhoneLeadsPage() {
  const { showToast } = useApp();
  const [data, setData] = useState<PhoneLeadsResponse>({
    phoneLeads: [],
    total: 0,
    metrics: { total: 0, unconverted: 0, converted: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unconverted' | 'converted'>('unconverted');
  const [providerFilter, setProviderFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [convertConversation, setConvertConversation] = useState<ConversationForConversion | null>(null);
  const [prefilledPhone, setPrefilledPhone] = useState<string | null>(null);
  const [isConvertOpen, setIsConvertOpen] = useState(false);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(0);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadLeads = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);

    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (providerFilter !== 'all') params.set('provider', providerFilter);
      if (debouncedSearch) params.set('search', debouncedSearch);

      const response = await fetch(`/api/conversations/phone-leads?${params}`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to load phone leads.');
      if (!controller.signal.aborted) setData(payload as PhoneLeadsResponse);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      showToast(error instanceof Error ? error.message : 'Unable to load phone leads.', 'error');
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  }, [statusFilter, providerFilter, debouncedSearch, page, showToast]);

  useEffect(() => {
    document.title = 'Phone Leads from Chat — Travel LMS';
    void loadLeads();
    return () => requestRef.current?.abort();
  }, [loadLeads]);

  const pageCount = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const pageStart = data.total === 0 ? 0 : page * PAGE_SIZE + 1;
  const pageEnd = Math.min((page + 1) * PAGE_SIZE, data.total);

  const handleCopy = async (phone: string, id: string) => {
    if (!phone || phone === '—') return;
    try {
      await navigator.clipboard.writeText(phone);
      setCopiedId(id);
      showToast(`Copied ${phone}`, 'success');
      window.setTimeout(() => setCopiedId(null), 1600);
    } catch {
      showToast('Failed to copy phone number.', 'error');
    }
  };

  const openConvert = (row: PhoneLeadRow) => {
    const phone = phoneFor(row) === '—' ? '' : phoneFor(row);
    setPrefilledPhone(phone);
    setConvertConversation({
      id: row.id,
      provider: row.provider,
      customer_name: row.customer_name,
      customer_phone: phone,
      customer_email: row.customer_email,
      last_message_preview: snippetFor(row),
      assigned_to: row.assigned_to,
      metadata: row.metadata || null,
    });
    setIsConvertOpen(true);
  };

  const handleConverted = (lead: { id: string; customer_name: string; destination: string }) => {
    showToast(`Lead created for ${lead.customer_name}`, 'success');
    void loadLeads();
  };

  const moveRowFocus = (event: React.KeyboardEvent<HTMLTableRowElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const rows = Array.from(document.querySelectorAll<HTMLTableRowElement>('[data-phone-lead-row="true"]'));
    const index = rows.indexOf(event.currentTarget);
    const next = event.key === 'ArrowDown' ? Math.min(rows.length - 1, index + 1) : Math.max(0, index - 1);
    rows[next]?.focus();
  };

  const metrics = useMemo(() => [
    { label: 'Phone leads', value: data.metrics.total, detail: 'Detected across chat channels' },
    { label: 'Unconverted', value: data.metrics.unconverted, detail: 'Ready for qualification' },
    { label: 'Converted', value: data.metrics.converted, detail: 'Already in sales pipeline' },
  ], [data.metrics]);

  return (
    <div className="app-page p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/inbox" className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 transition-colors hover:text-zinc-950">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Inbox
          </Link>
          <h1 className="mt-1.5 text-xl font-bold tracking-tight text-zinc-950">Phone Leads from Chat</h1>
          <p className="mt-0.5 text-xs font-medium text-zinc-600">Customer conversations where a phone number was detected.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void loadLeads()} disabled={loading} className="button-secondary button-sm font-medium">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <Link href="/inbox" className="button-primary button-sm font-semibold">
            <MessageSquare className="h-3.5 w-3.5" /> Open Inbox
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {metrics.map((metric, index) => (
          <div key={metric.label} className="rounded-lg border border-zinc-200 bg-white p-3.5 shadow-2xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">{metric.label}</span>
              {index === 1 ? <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" /> : <PhoneCall className="h-3.5 w-3.5 text-zinc-400" />}
            </div>
            <div className="mt-1.5 font-mono text-xl font-bold tracking-tight text-zinc-950">{metric.value}</div>
            <p className="mt-0.5 text-[11px] font-medium text-zinc-500">{metric.detail}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2.5 rounded-lg border border-zinc-200 bg-white p-3 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
        <label className="relative flex-1">
          <span className="sr-only">Search phone leads</span>
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search traveler, phone, or message"
            className="h-9 w-full rounded-md border border-zinc-200 bg-white pl-9 pr-3 text-xs font-medium text-zinc-950 placeholder:text-zinc-400 focus:border-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-950"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md bg-zinc-100 p-0.5 text-xs font-semibold" role="group" aria-label="Lead conversion status">
            {(['unconverted', 'all', 'converted'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => { setStatusFilter(status); setPage(0); }}
                aria-pressed={statusFilter === status}
                className={`rounded px-2.5 py-1 capitalize transition-colors ${statusFilter === status ? 'bg-white font-bold text-zinc-950 shadow-2xs' : 'font-medium text-zinc-600 hover:text-zinc-900'}`}
              >
                {status === 'unconverted' ? 'New' : status}
              </button>
            ))}
          </div>
          <select
            value={providerFilter}
            onChange={(event) => { setProviderFilter(event.target.value); setPage(0); }}
            className="h-8 rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-semibold text-zinc-800 focus:border-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-950"
            aria-label="Filter phone leads by channel"
          >
            <option value="all">All channels</option>
            <option value="facebook">Facebook</option>
            <option value="instagram">Instagram</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-2xs" aria-busy={loading}>
        {loading ? (
          <div className="flex h-56 items-center justify-center gap-2 text-xs font-medium text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading phone leads…
          </div>
        ) : data.phoneLeads.length === 0 ? (
          <div className="py-14 text-center">
            <Phone className="mx-auto h-7 w-7 text-zinc-400" />
            <p className="mt-2 text-sm font-bold text-zinc-900">No phone leads found</p>
            <p className="mt-1 text-xs font-medium text-zinc-500">Try another search or filter.</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-zinc-100 md:hidden">
              {data.phoneLeads.map((row) => {
                const Icon = PROVIDER_ICONS[row.provider] || MessageSquare;
                const phone = phoneFor(row);
                const isConverted = Boolean(row.lead_id);
                return (
                  <article key={row.id} className="space-y-2.5 p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-zinc-950">{row.customer_name || 'Traveler'}</div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] font-medium text-zinc-500">
                          <span className="inline-flex items-center gap-1 capitalize"><Icon className="h-3 w-3" />{row.provider}</span>
                          <span className="font-mono">{formatTime(row.last_message_at || row.created_at)}</span>
                        </div>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-zinc-700">
                        <span className={`h-1.5 w-1.5 rounded-full ${isConverted ? 'bg-emerald-500' : 'bg-amber-500'}`} aria-hidden="true" />
                        {isConverted ? `Lead ${row.lead?.lead_code || 'Active'}` : 'Unconverted'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-mono text-xs font-bold text-zinc-900">{phone}</span>
                      <button type="button" onClick={() => void handleCopy(phone, row.id)} className="button-ghost button-sm px-2" aria-label={`Copy ${phone}`}>
                        {copiedId === row.id ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                    <p className="line-clamp-2 text-xs font-medium leading-relaxed text-zinc-600">{snippetFor(row)}</p>
                    <div className="flex items-center justify-end gap-1.5">
                      {!isConverted ? (
                        <button type="button" onClick={() => openConvert(row)} className="button-primary button-sm font-semibold">
                          <UserCheck className="h-3.5 w-3.5" /> Create lead
                        </button>
                      ) : (
                        <Link href={`/leads/${row.lead_id}/workspace`} className="button-secondary button-sm font-medium">
                          <ExternalLink className="h-3.5 w-3.5" /> View lead
                        </Link>
                      )}
                      <Link href={`/inbox?conversationId=${row.id}`} className="button-secondary button-sm font-medium">
                        <MessageSquare className="h-3.5 w-3.5" /> Chat
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">Phone numbers detected from customer chat conversations</caption>
                <thead className="border-b border-zinc-200 bg-zinc-50 text-[11px] font-bold uppercase tracking-wider text-zinc-600">
                  <tr>
                    <th scope="col" className="px-4 py-2.5">Traveler</th>
                    <th scope="col" className="px-4 py-2.5">Phone</th>
                    <th scope="col" className="px-4 py-2.5">Chat snippet</th>
                    <th scope="col" className="px-4 py-2.5">Channel</th>
                    <th scope="col" className="px-4 py-2.5">Date</th>
                    <th scope="col" className="px-4 py-2.5">Status</th>
                    <th scope="col" className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {data.phoneLeads.map((row) => {
                    const Icon = PROVIDER_ICONS[row.provider] || MessageSquare;
                    const phone = phoneFor(row);
                    const snippet = snippetFor(row);
                    const isConverted = Boolean(row.lead_id);
                    return (
                      <tr
                        key={row.id}
                        data-phone-lead-row="true"
                        tabIndex={0}
                        onKeyDown={moveRowFocus}
                        className="outline-none transition-colors hover:bg-zinc-50/80 focus-visible:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-950"
                        aria-label={`${row.customer_name || 'Traveler'}, ${phone}, ${isConverted ? 'converted' : 'unconverted'}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-[10px] font-bold text-zinc-700">
                              {row.customer_name?.slice(0, 2).toUpperCase() || 'T'}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate font-bold text-zinc-950">{row.customer_name || 'Traveler'}</div>
                              {row.metadata?.meta_page_name && <div className="truncate text-[10px] font-medium text-zinc-500">{String(row.metadata.meta_page_name)}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="inline-flex items-center gap-1.5">
                            <Phone className="h-3 w-3 text-zinc-400" />
                            <span className="font-mono text-xs font-bold text-zinc-900">{phone}</span>
                            <button type="button" onClick={() => void handleCopy(phone, row.id)} className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950" aria-label={`Copy ${phone}`}>
                              {copiedId === row.id ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                            </button>
                          </div>
                        </td>
                        <td className="max-w-xs px-4 py-3 text-zinc-700"><p className="line-clamp-2 font-medium leading-relaxed" title={snippet}>{snippet}</p></td>
                        <td className="px-4 py-3"><span className="inline-flex items-center gap-1 text-[11px] font-semibold capitalize text-zinc-700"><Icon className="h-3 w-3" />{row.provider}</span></td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] font-medium text-zinc-500">{formatTime(row.last_message_at || row.created_at)}</td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-800">
                            <span className={`h-1.5 w-1.5 rounded-full ${isConverted ? 'bg-emerald-500' : 'bg-amber-500'}`} aria-hidden="true" />
                            {isConverted ? `Lead ${row.lead?.lead_code || 'Active'}` : 'Unconverted'}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            {!isConverted ? (
                              <button type="button" onClick={() => openConvert(row)} className="button-primary button-sm font-semibold"><UserCheck className="h-3.5 w-3.5" /> Create lead</button>
                            ) : (
                              <Link href={`/leads/${row.lead_id}/workspace`} className="button-secondary button-sm font-medium"><ExternalLink className="h-3.5 w-3.5" /> View lead</Link>
                            )}
                            <Link href={`/inbox?conversationId=${row.id}`} className="button-ghost button-sm font-medium text-zinc-600"><MessageSquare className="h-3.5 w-3.5" /> Chat</Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {!loading && data.total > 0 && (
        <div className="flex items-center justify-between gap-3 text-xs font-medium text-zinc-500">
          <span className="font-mono">{pageStart}–{pageEnd} of {data.total}</span>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0} className="button-secondary button-sm px-2 disabled:opacity-40" aria-label="Previous page"><ChevronLeft className="h-3.5 w-3.5" /></button>
            <span className="min-w-16 text-center font-mono text-[11px]">{page + 1} / {pageCount}</span>
            <button type="button" onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} disabled={page + 1 >= pageCount} className="button-secondary button-sm px-2 disabled:opacity-40" aria-label="Next page"><ChevronRight className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      )}

      <ConvertToLeadDrawer
        isOpen={isConvertOpen}
        onClose={() => {
          setIsConvertOpen(false);
          setConvertConversation(null);
          setPrefilledPhone(null);
        }}
        conversation={convertConversation}
        onConverted={handleConverted}
        initialPhone={prefilledPhone}
      />
    </div>
  );
}
