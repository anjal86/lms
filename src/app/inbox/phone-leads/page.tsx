'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
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
  metrics: {
    total: number;
    unconverted: number;
    converted: number;
  };
};

const PROVIDER_ICONS: Record<string, React.ElementType> = {
  facebook: Facebook,
  instagram: Instagram,
  whatsapp: MessageCircle,
  email: Mail,
};

function formatTime(timestamp?: string | null) {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
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
  const [statusFilter, setStatusFilter] = useState<'all' | 'unconverted' | 'converted'>('unconverted');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Conversion drawer state
  const [convertConversation, setConvertConversation] = useState<ConversationForConversion | null>(null);
  const [prefilledPhone, setPrefilledPhone] = useState<string | null>(null);
  const [isConvertOpen, setIsConvertOpen] = useState(false);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (providerFilter !== 'all') params.set('provider', providerFilter);
      if (search.trim()) params.set('search', search.trim());
      params.set('limit', '100');

      const res = await fetch(`/api/conversations/phone-leads?${params.toString()}`, { cache: 'no-store' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || 'Failed to load phone leads.');
      setData(payload as PhoneLeadsResponse);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to load phone leads.', 'error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, providerFilter, search, showToast]);

  useEffect(() => {
    document.title = 'Phone Leads from Chat — Travel LMS';
    void loadLeads();
  }, [loadLeads]);

  const handleCopy = async (phone: string, id: string) => {
    try {
      await navigator.clipboard.writeText(phone);
      setCopiedId(id);
      showToast(`Copied ${phone}`, 'success');
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      showToast('Failed to copy', 'error');
    }
  };

  const openConvert = (row: PhoneLeadRow) => {
    const phone = row.metadata?.detected_phone || row.customer_phone || '';
    setPrefilledPhone(phone);
    setConvertConversation({
      id: row.id,
      provider: row.provider,
      customer_name: row.customer_name,
      customer_phone: phone,
      customer_email: row.customer_email,
      last_message_preview: row.metadata?.detected_phone_snippet || row.last_message_preview,
      assigned_to: row.assigned_to,
    });
    setIsConvertOpen(true);
  };

  const handleConverted = (lead: { id: string; customer_name: string; destination: string }) => {
    showToast(`Lead created for ${lead.customer_name}`, 'success');
    void loadLeads();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6 lg:p-8">
      {/* Header with Navigation */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/inbox"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-950 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Inbox
            </Link>
          </div>
          <h1 className="mt-1.5 text-xl font-bold tracking-tight text-zinc-950 sm:text-2xl">
            Phone Leads from Chat
          </h1>
          <p className="mt-0.5 text-xs font-medium text-zinc-600">
            Every customer inquiry containing a valid phone number detected from Facebook, Instagram, and WhatsApp threads.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadLeads()}
            disabled={loading}
            className="button-secondary button-sm font-medium"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Link href="/inbox" className="button-primary button-sm font-semibold">
            <MessageSquare className="h-3.5 w-3.5" />
            Open Inbox
          </Link>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-600 uppercase tracking-wider">Total Phone Leads</span>
            <PhoneCall className="h-4 w-4 text-zinc-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tracking-tight text-zinc-950">
            {data.metrics.total}
          </div>
          <p className="mt-0.5 text-[11px] font-medium text-zinc-500">Inquiries with phone numbers detected</p>
        </div>

        <div className="rounded-lg border border-emerald-300 bg-emerald-50/50 p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Unconverted Inquiries</span>
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 ring-4 ring-emerald-200" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tracking-tight text-emerald-950">
            {data.metrics.unconverted}
          </div>
          <p className="mt-0.5 text-[11px] font-medium text-emerald-700">Ready to convert into CRM sales leads</p>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-600 uppercase tracking-wider">Converted to Leads</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tracking-tight text-zinc-950">
            {data.metrics.converted}
          </div>
          <p className="mt-0.5 text-[11px] font-medium text-zinc-500">Active in the sales pipeline</p>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col gap-2.5 rounded-lg border border-zinc-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between shadow-2xs">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search traveler name, phone number, or message text..."
            className="h-9 w-full rounded-md border border-zinc-200 bg-white pl-9 pr-3 text-xs font-medium text-zinc-950 placeholder:text-zinc-400 focus:border-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-950"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter */}
          <div className="flex rounded-md bg-zinc-100 p-0.5 text-xs font-semibold">
            {(['unconverted', 'all', 'converted'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`rounded px-2.5 py-1 capitalize transition-colors ${statusFilter === st ? 'bg-white text-zinc-950 font-bold shadow-2xs' : 'text-zinc-600 hover:text-zinc-900 font-medium'}`}
              >
                {st === 'unconverted' ? 'New Only' : st}
              </button>
            ))}
          </div>

          {/* Channel Filter */}
          <select
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
            className="h-8 rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-semibold text-zinc-800 focus:border-zinc-950 focus:outline-none"
            aria-label="Filter by channel"
          >
            <option value="all">All Channels</option>
            <option value="facebook">Facebook</option>
            <option value="instagram">Instagram</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </div>
      </div>

      {/* High-Density Phone Leads Table */}
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-2xs">
        {loading ? (
          <div className="flex h-64 items-center justify-center gap-2 text-xs font-medium text-zinc-500">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
            Loading phone leads...
          </div>
        ) : data.phoneLeads.length === 0 ? (
          <div className="py-16 text-center">
            <Phone className="mx-auto h-8 w-8 text-zinc-400" />
            <p className="mt-2 text-sm font-bold text-zinc-900">No phone leads found</p>
            <p className="mt-1 text-xs font-medium text-zinc-500">
              {search || statusFilter !== 'all' ? 'Try adjusting your search or filters.' : 'When customers send their phone numbers in chat, they will appear here.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-[11px] font-bold uppercase tracking-wider text-zinc-600">
                <tr>
                  <th className="px-4 py-2.5">Traveler</th>
                  <th className="px-4 py-2.5">Detected Phone</th>
                  <th className="px-4 py-2.5">Chat Snippet</th>
                  <th className="px-4 py-2.5">Channel</th>
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Lead Status</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {data.phoneLeads.map((row) => {
                  const Icon = PROVIDER_ICONS[row.provider] || MessageSquare;
                  const phone = row.metadata?.detected_phone || row.customer_phone || '—';
                  const snippet = row.metadata?.detected_phone_snippet || row.last_message_preview || '—';
                  const isConverted = Boolean(row.lead_id);

                  return (
                    <tr key={row.id} className="hover:bg-zinc-50/80 transition-colors">
                      {/* Traveler Name */}
                      <td className="px-4 py-3 font-semibold text-zinc-950">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-200 bg-zinc-100 text-[10px] font-bold text-zinc-700">
                            {row.customer_name?.slice(0, 2).toUpperCase() || 'T'}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-bold text-zinc-950">{row.customer_name || 'Traveler'}</div>
                            {row.metadata?.meta_page_name && (
                              <div className="truncate text-[10px] font-medium text-zinc-500">
                                {String(row.metadata.meta_page_name)}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Phone Number with One-Click Copy */}
                      <td className="px-4 py-3">
                        <div className="inline-flex items-center gap-1.5 rounded bg-emerald-50 border border-emerald-200 px-2 py-1">
                          <Phone className="h-3 w-3 text-emerald-600" />
                          <span className="font-mono text-xs font-bold text-emerald-900">{phone}</span>
                          <button
                            type="button"
                            onClick={() => void handleCopy(phone, row.id)}
                            className="ml-1 text-emerald-700 hover:text-emerald-950"
                            title="Copy phone number"
                            aria-label={`Copy ${phone}`}
                          >
                            {copiedId === row.id ? <Check className="h-3 w-3 text-emerald-700" /> : <Copy className="h-3 w-3" />}
                          </button>
                        </div>
                      </td>

                      {/* Chat Snippet */}
                      <td className="max-w-xs px-4 py-3 text-zinc-700">
                        <p className="line-clamp-2 text-xs font-medium leading-relaxed" title={snippet}>
                          {snippet}
                        </p>
                      </td>

                      {/* Channel */}
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 rounded bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-800 capitalize">
                          <Icon className="h-3 w-3" />
                          {row.provider}
                        </span>
                      </td>

                      {/* Date */}
                      <td className="px-4 py-3 font-mono text-[11px] font-medium text-zinc-500 whitespace-nowrap">
                        {formatTime(row.last_message_at || row.created_at)}
                      </td>

                      {/* Lead Status */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {isConverted ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-900 border border-zinc-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Lead {row.lead?.lead_code || 'Active'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 border border-amber-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            Unconverted
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {!isConverted ? (
                            <button
                              type="button"
                              onClick={() => openConvert(row)}
                              className="button-primary button-sm text-xs py-1 px-2.5 font-semibold bg-emerald-700 hover:bg-emerald-800"
                            >
                              <UserCheck className="h-3.5 w-3.5" />
                              Create Lead
                            </button>
                          ) : (
                            <Link
                              href={`/leads/${row.lead_id}/workspace`}
                              className="button-secondary button-sm text-xs py-1 px-2.5 font-medium"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              View Lead
                            </Link>
                          )}

                          <Link
                            href={`/inbox?conversationId=${row.id}`}
                            className="button-ghost button-sm text-xs py-1 px-2 text-zinc-600 hover:text-zinc-950 font-medium"
                            title="Open conversation in Inbox"
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                            Chat
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Convert to Lead Drawer */}
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
