'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronRight,
  Copy,
  Facebook,
  Instagram,
  Loader2,
  Mail,
  Merge,
  MessageCircle,
  MessageSquare,
  RefreshCw,
  Search,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { useApp } from '@/lib/store';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';

type Identity = {
  provider: string;
  identity_type: string;
  identity_value: string;
  is_primary: boolean;
  created_at: string;
};

type Contact = {
  id: string;
  display_name: string | null;
  primary_phone: string | null;
  primary_email: string | null;
  avatar_url: string | null;
  lifecycle_key: string;
  owner_id: string | null;
  tags: unknown;
  custom_data: Record<string, unknown> | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
  owner: { id: string; full_name: string | null; email: string; role: string; status?: string } | null;
  identities: Identity[] | null;
};

type SegmentKey = 'all' | 'new' | 'qualified' | 'opportunity' | 'customer' | 'lost' | 'duplicates';
type ContactSnapshot = { contacts: Contact[]; total: number; fetchedAt: number };

const CONTACTS_RUNTIME_CACHE = new Map<string, ContactSnapshot>();
const PROVIDER_ICONS: Record<string, typeof MessageSquare> = {
  facebook: Facebook,
  instagram: Instagram,
  whatsapp: MessageCircle,
  email: Mail,
};

function contactRuntimeCacheKey(scope: string, search: string, segment: SegmentKey) {
  return `${scope}::${segment}::${search.trim().toLowerCase()}`;
}

function invalidateContactRuntimeScope(scope: string) {
  const prefix = `${scope}::`;
  for (const key of CONTACTS_RUNTIME_CACHE.keys()) {
    if (key.startsWith(prefix)) CONTACTS_RUNTIME_CACHE.delete(key);
  }
}

function relativeTime(value?: string | null) {
  if (!value) return 'Never';
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(diff / 60000));
  if (minutes < 1) return 'Now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function lifecycleLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function normalizedPhone(value: string | null) {
  return value ? value.replace(/[^0-9+]/g, '') : '';
}

function normalizedEmail(value: string | null) {
  return value?.trim().toLowerCase() || '';
}

function duplicateKey(contact: Contact) {
  const phone = normalizedPhone(contact.primary_phone);
  const email = normalizedEmail(contact.primary_email);
  return phone ? `phone:${phone}` : email ? `email:${email}` : '';
}

function initials(value: string | null | undefined) {
  const parts = (value || 'C').trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'C';
}

function uniqueProviders(contact: Contact) {
  return Array.from(new Set((contact.identities || []).map((identity) => identity.provider).filter((provider) => provider && provider !== 'crm')));
}

export default function ContactsPage() {
  const { currentUser, showToast } = useApp();
  const { config, term } = useWorkspace();
  const contactLabel = term('contact', 'Contact');
  const contactPlural = term('contact_plural', 'Contacts');
  const canManage = currentUser.role === 'admin' || currentUser.role === 'manager';
  const runtimeCacheScope = `${currentUser.id}::${config.workspace.id}`;
  const initialRuntimeKey = contactRuntimeCacheKey(runtimeCacheScope, '', 'all');
  const initialSnapshot = CONTACTS_RUNTIME_CACHE.get(initialRuntimeKey);

  const [contacts, setContacts] = useState<Contact[]>(() => initialSnapshot?.contacts || []);
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState<SegmentKey>('all');
  const [loading, setLoading] = useState(() => !initialSnapshot);
  const [merging, setMerging] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [confirmMerge, setConfirmMerge] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [total, setTotal] = useState(() => initialSnapshot?.total || 0);
  const [copied, setCopied] = useState('');

  const load = useCallback(async (options?: { force?: boolean; quiet?: boolean }) => {
    const force = options?.force === true;
    const quiet = options?.quiet === true;
    const normalizedSearch = search.trim();
    const runtimeKey = contactRuntimeCacheKey(runtimeCacheScope, normalizedSearch, segment);
    const cached = CONTACTS_RUNTIME_CACHE.get(runtimeKey);

    if (cached) {
      setContacts(cached.contacts);
      setTotal(cached.total);
      setLoading(false);
    } else if (!quiet) {
      setLoading(true);
    }

    try {
      const params = new URLSearchParams({ limit: '300' });
      if (normalizedSearch) params.set('search', normalizedSearch);
      if (segment !== 'all' && segment !== 'duplicates') params.set('lifecycle', segment);
      if (force) params.set('refresh', '1');
      const response = await fetch(`/api/contacts?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `Unable to load ${contactPlural.toLowerCase()}.`);
      const nextContacts = Array.isArray(payload.contacts) ? payload.contacts as Contact[] : [];
      const nextTotal = Number(payload.total || 0);
      setContacts(nextContacts);
      setTotal(nextTotal);
      CONTACTS_RUNTIME_CACHE.set(runtimeKey, { contacts: nextContacts, total: nextTotal, fetchedAt: Date.now() });
      setSelectedIds((current) => current.filter((id) => nextContacts.some((contact) => contact.id === id)));
    } catch (error) {
      if (!quiet || !cached) {
        showToast(error instanceof Error ? error.message : `Unable to load ${contactPlural.toLowerCase()}.`, 'error');
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [contactPlural, runtimeCacheScope, search, segment, showToast]);

  useEffect(() => {
    const runtimeKey = contactRuntimeCacheKey(runtimeCacheScope, search, segment);
    const hasSnapshot = CONTACTS_RUNTIME_CACHE.has(runtimeKey);
    const timer = window.setTimeout(() => void load({ quiet: hasSnapshot }), 180);
    return () => window.clearTimeout(timer);
  }, [load, runtimeCacheScope, search, segment]);

  const duplicateKeys = useMemo(() => {
    const counts = new Map<string, number>();
    for (const contact of contacts) {
      const key = duplicateKey(contact);
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    }
    return new Set(Array.from(counts.entries()).filter(([, count]) => count > 1).map(([key]) => key));
  }, [contacts]);

  const visibleContacts = useMemo(() => {
    if (segment !== 'duplicates') return contacts;
    return contacts.filter((contact) => duplicateKeys.has(duplicateKey(contact)));
  }, [contacts, duplicateKeys, segment]);

  const segmentCounts = useMemo(() => {
    const counts: Record<SegmentKey, number> = { all: contacts.length, new: 0, qualified: 0, opportunity: 0, customer: 0, lost: 0, duplicates: 0 };
    for (const contact of contacts) {
      if (contact.lifecycle_key in counts) counts[contact.lifecycle_key as SegmentKey] += 1;
      if (duplicateKeys.has(duplicateKey(contact))) counts.duplicates += 1;
    }
    return counts;
  }, [contacts, duplicateKeys]);

  const selected = useMemo(() => selectedIds.map((id) => contacts.find((contact) => contact.id === id)).filter(Boolean) as Contact[], [contacts, selectedIds]);
  const active = useMemo(() => contacts.find((contact) => contact.id === activeId) || null, [activeId, contacts]);

  const toggleSelection = (id: string) => {
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length < 2) return [...current, id];
      return [current[1], id];
    });
  };

  const openMerge = () => {
    if (selectedIds.length !== 2) return;
    setPrimaryId(selectedIds[0]);
    setConfirmMerge(true);
  };

  const mergeContacts = async () => {
    if (selectedIds.length !== 2 || !primaryId) return;
    const duplicateId = selectedIds.find((id) => id !== primaryId);
    if (!duplicateId) return;
    setMerging(true);
    try {
      const response = await fetch('/api/contacts/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primary_contact_id: primaryId, duplicate_contact_id: duplicateId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `Unable to merge ${contactPlural.toLowerCase()}.`);
      setConfirmMerge(false);
      setSelectedIds([]);
      setPrimaryId(null);
      setActiveId(null);
      invalidateContactRuntimeScope(runtimeCacheScope);
      showToast(`${contactLabel} identities merged.`, 'success');
      await load({ force: true });
    } catch (error) {
      showToast(error instanceof Error ? error.message : `Unable to merge ${contactPlural.toLowerCase()}.`, 'error');
    } finally {
      setMerging(false);
    }
  };

  const copyValue = async (value: string, key: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied(''), 1200);
  };

  const segments: { key: SegmentKey; label: string }[] = [
    { key: 'all', label: `All ${contactPlural}` },
    { key: 'new', label: 'New' },
    { key: 'qualified', label: 'Qualified' },
    { key: 'opportunity', label: 'Opportunity' },
    { key: 'customer', label: 'Customers' },
    { key: 'lost', label: 'Lost' },
    { key: 'duplicates', label: 'Possible duplicates' },
  ];

  return (
    <div className="h-[calc(100vh-4rem)] min-h-[560px] overflow-hidden bg-white">
      <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[210px_minmax(0,1fr)] xl:grid-cols-[210px_minmax(0,1fr)_330px]">
        <aside className="hidden min-h-0 border-r border-zinc-200 bg-zinc-50/70 lg:flex lg:flex-col">
          <div className="flex h-14 items-center gap-2 border-b border-zinc-200 px-4"><Users className="h-4 w-4 text-zinc-900" /><span className="text-sm font-bold text-zinc-950">{contactPlural}</span></div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="px-2 pb-1 text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-400">Segments</div>
            {segments.map((item) => <button key={item.key} type="button" onClick={() => { setSegment(item.key); setActiveId(null); }} className={`mt-0.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium ${segment === item.key ? 'bg-zinc-950 text-white' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950'}`}><span className="flex-1 truncate">{item.label}</span><span className={`font-mono text-[9px] ${segment === item.key ? 'text-zinc-300' : item.key === 'duplicates' && segmentCounts.duplicates ? 'font-bold text-amber-600' : 'text-zinc-400'}`}>{item.key === 'all' ? total : segmentCounts[item.key]}</span></button>)}
          </div>
        </aside>

        <main className="min-h-0 min-w-0 flex flex-col bg-white">
          <div className="border-b border-zinc-200 p-3 md:px-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[240px] flex-1"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${contactPlural.toLowerCase()} by name, phone or email`} className="field h-9 pl-8 text-xs" /></div>
              <select value={segment} onChange={(event) => setSegment(event.target.value as SegmentKey)} className="select-field h-9 text-xs lg:hidden">{segments.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select>
              <button type="button" onClick={() => void load({ force: true })} className="button-secondary button-sm h-9"><RefreshCw className="h-3.5 w-3.5" /></button>
              {canManage && selectedIds.length === 2 && <button type="button" onClick={openMerge} className="button-primary button-sm h-9"><Merge className="h-3.5 w-3.5" /> Review merge</button>}
            </div>
            {canManage && selected.length > 0 && <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-blue-700"><span className="font-semibold">Merge selection:</span>{selected.map((contact, index) => <span key={contact.id} className="rounded bg-blue-50 px-2 py-1">{index + 1}. {contact.display_name || contact.primary_phone || contact.primary_email || contactLabel}</span>)}{selected.length === 1 && <span className="text-blue-500">Choose one more duplicate.</span>}</div>}
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {loading && contacts.length === 0 ? <div className="flex h-40 items-center justify-center gap-2 text-xs text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading {contactPlural.toLowerCase()}…</div> : visibleContacts.length === 0 ? <div className="py-20 text-center"><UserRound className="mx-auto h-7 w-7 text-zinc-300" /><p className="mt-2 text-sm font-medium text-zinc-700">No {contactPlural.toLowerCase()} found</p></div> : <table className="w-full min-w-[780px] text-left text-xs"><thead className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50/95 text-[9px] uppercase tracking-[0.12em] text-zinc-400 backdrop-blur"><tr>{canManage && <th className="w-12 px-4 py-2.5">Merge</th>}<th className="px-4 py-2.5">{contactLabel}</th><th className="px-4 py-2.5">Channels</th><th className="px-4 py-2.5">Lifecycle</th><th className="px-4 py-2.5">Owner</th><th className="px-4 py-2.5">Last seen</th><th className="w-10 px-3 py-2.5" /></tr></thead><tbody className="divide-y divide-zinc-100">{visibleContacts.map((contact) => {
              const selectedIndex = selectedIds.indexOf(contact.id);
              const providers = uniqueProviders(contact);
              return <tr key={contact.id} className={`${activeId === contact.id ? 'bg-blue-50/50' : selectedIndex >= 0 ? 'bg-blue-50/30' : 'hover:bg-zinc-50/70'} cursor-pointer`} onClick={() => setActiveId(contact.id)}>{canManage && <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}><button type="button" onClick={() => toggleSelection(contact.id)} className={`flex h-6 w-6 items-center justify-center rounded border ${selectedIndex >= 0 ? 'border-blue-600 bg-blue-600 text-white' : 'border-zinc-200 text-transparent hover:border-zinc-400'}`} aria-label={`Select ${contact.display_name || contactLabel} for merge`}>{selectedIndex >= 0 ? <span className="font-mono text-[9px] font-bold">{selectedIndex + 1}</span> : <Check className="h-3 w-3" />}</button></td>}<td className="px-4 py-3"><div className="flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-zinc-100 text-[10px] font-bold text-zinc-600">{contact.avatar_url ? <img src={contact.avatar_url} alt="" className="h-full w-full object-cover" /> : initials(contact.display_name)}</span><div className="min-w-0"><div className="max-w-56 truncate font-semibold text-zinc-900">{contact.display_name || contactLabel}</div><div className="mt-0.5 max-w-56 truncate text-[10px] text-zinc-400">{contact.primary_phone || contact.primary_email || 'No primary contact detail'}</div></div></div></td><td className="px-4 py-3"><div className="flex gap-1">{providers.length ? providers.slice(0, 4).map((provider) => { const Icon = PROVIDER_ICONS[provider] || MessageSquare; return <span key={provider} title={provider} className="flex h-6 w-6 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500"><Icon className="h-3 w-3" /></span>; }) : <span className="text-zinc-400">CRM only</span>}</div></td><td className="px-4 py-3"><span className="rounded bg-zinc-100 px-1.5 py-1 text-[10px] font-medium text-zinc-600">{lifecycleLabel(contact.lifecycle_key)}</span></td><td className="px-4 py-3 text-zinc-600">{contact.owner?.full_name || 'Unassigned'}</td><td className="px-4 py-3 text-zinc-500">{relativeTime(contact.last_seen_at)}</td><td className="px-3 py-3"><ChevronRight className="h-4 w-4 text-zinc-300" /></td></tr>;
            })}</tbody></table>}
          </div>
        </main>

        <aside className="hidden min-h-0 border-l border-zinc-200 bg-white xl:block">
          {!active ? <div className="flex h-full items-center justify-center p-6 text-center text-xs text-zinc-400">Select a {contactLabel.toLowerCase()} to inspect identity and channels.</div> : <ContactDrawer contact={active} contactLabel={contactLabel} onCopy={copyValue} copied={copied} />}
        </aside>
      </div>

      {active && <div className="fixed inset-0 z-40 flex justify-end bg-zinc-950/30 xl:hidden" onClick={() => setActiveId(null)}><div className="h-full w-full max-w-sm bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="absolute right-2 top-2 z-10"><button type="button" onClick={() => setActiveId(null)} className="rounded-lg bg-white p-2 text-zinc-500 shadow"><X className="h-4 w-4" /></button></div><ContactDrawer contact={active} contactLabel={contactLabel} onCopy={copyValue} copied={copied} /></div></div>}

      {confirmMerge && selected.length === 2 && primaryId && <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-4" role="dialog" aria-modal="true" aria-label="Review contact merge"><div className="w-full max-w-2xl overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl"><div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3"><div><div className="text-sm font-semibold text-zinc-950">Review duplicate merge</div><div className="mt-0.5 text-[11px] text-zinc-500">Choose which identity survives. Conversations, channels and history from the other record will move into it.</div></div><button type="button" onClick={() => setConfirmMerge(false)} className="rounded p-1 text-zinc-400 hover:bg-zinc-100"><X className="h-4 w-4" /></button></div><div className="grid gap-3 p-4 sm:grid-cols-2">{selected.map((contact) => { const keep = primaryId === contact.id; return <button type="button" key={contact.id} onClick={() => setPrimaryId(contact.id)} className={`rounded-xl border p-4 text-left transition ${keep ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-100' : 'border-zinc-200 hover:border-zinc-300'}`}><div className="flex items-center gap-2"><span className={`flex h-5 w-5 items-center justify-center rounded-full border ${keep ? 'border-blue-600 bg-blue-600 text-white' : 'border-zinc-300 text-transparent'}`}><Check className="h-3 w-3" /></span><span className="text-xs font-bold text-zinc-950">{keep ? 'Keep this identity' : 'Merge this identity'}</span></div><div className="mt-4 text-sm font-semibold text-zinc-900">{contact.display_name || contactLabel}</div><div className="mt-2 space-y-1.5 text-xs text-zinc-600"><div><span className="text-zinc-400">Phone:</span> {contact.primary_phone || '—'}</div><div><span className="text-zinc-400">Email:</span> {contact.primary_email || '—'}</div><div><span className="text-zinc-400">Lifecycle:</span> {lifecycleLabel(contact.lifecycle_key)}</div><div><span className="text-zinc-400">Owner:</span> {contact.owner?.full_name || 'Unassigned'}</div><div><span className="text-zinc-400">Channels:</span> {uniqueProviders(contact).join(', ') || 'CRM only'}</div></div></button>; })}</div><div className="border-t border-amber-100 bg-amber-50/70 px-4 py-2 text-[11px] font-medium text-amber-800">Merge is intentionally irreversible. Review phone, email, lifecycle and ownership before continuing.</div><div className="flex justify-end gap-2 border-t border-zinc-100 bg-zinc-50 px-4 py-3"><button type="button" onClick={() => setConfirmMerge(false)} className="button-secondary">Cancel</button><button type="button" disabled={merging} onClick={() => void mergeContacts()} className="button-primary">{merging && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Merge identities</button></div></div></div>}
    </div>
  );
}

function ContactDrawer({ contact, contactLabel, onCopy, copied }: { contact: Contact; contactLabel: string; onCopy: (value: string, key: string) => Promise<void>; copied: string }) {
  const providers = uniqueProviders(contact);
  const tags = Array.isArray(contact.tags) ? contact.tags : [];
  const identities = contact.identities || [];
  return <div className="flex h-full min-h-0 flex-col"><div className="border-b border-zinc-200 p-4"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-zinc-100 text-xs font-bold text-zinc-700">{contact.avatar_url ? <img src={contact.avatar_url} alt="" className="h-full w-full object-cover" /> : initials(contact.display_name)}</div><div className="min-w-0"><div className="truncate text-sm font-bold text-zinc-950">{contact.display_name || contactLabel}</div><div className="mt-0.5 text-[10px] font-mono text-zinc-400">{contact.id.slice(0, 12)}</div></div></div></div><div className="min-h-0 flex-1 overflow-y-auto p-4"><div className="space-y-5"><section><div className="text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-400">Identity</div><div className="mt-3 space-y-2 text-xs">{contact.primary_phone && <button type="button" onClick={() => void onCopy(contact.primary_phone || '', 'phone')} className="flex w-full items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-left"><span><span className="block text-[9px] text-zinc-400">Phone</span><span className="font-mono font-medium text-zinc-800">{contact.primary_phone}</span></span>{copied === 'phone' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-zinc-400" />}</button>}{contact.primary_email && <button type="button" onClick={() => void onCopy(contact.primary_email || '', 'email')} className="flex w-full items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-left"><span><span className="block text-[9px] text-zinc-400">Email</span><span className="font-medium text-zinc-800">{contact.primary_email}</span></span>{copied === 'email' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-zinc-400" />}</button>}</div></section><section className="border-t border-zinc-100 pt-4"><div className="text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-400">Lifecycle & owner</div><dl className="mt-3 space-y-2 text-xs"><div className="flex justify-between gap-2"><dt className="text-zinc-500">Lifecycle</dt><dd className="font-semibold text-zinc-900">{lifecycleLabel(contact.lifecycle_key)}</dd></div><div className="flex justify-between gap-2"><dt className="text-zinc-500">Owner</dt><dd className="font-semibold text-zinc-900">{contact.owner?.full_name || 'Unassigned'}</dd></div><div className="flex justify-between gap-2"><dt className="text-zinc-500">Last seen</dt><dd className="font-semibold text-zinc-900">{relativeTime(contact.last_seen_at)}</dd></div></dl></section><section className="border-t border-zinc-100 pt-4"><div className="text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-400">Channels</div><div className="mt-3 flex flex-wrap gap-2">{providers.length ? providers.map((provider) => { const Icon = PROVIDER_ICONS[provider] || MessageSquare; return <span key={provider} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-[10px] font-semibold capitalize text-zinc-700"><Icon className="h-3.5 w-3.5" />{provider}</span>; }) : <span className="text-xs text-zinc-400">No connected channel identity.</span>}</div>{identities.length > 0 && <div className="mt-3 space-y-1.5">{identities.slice(0, 8).map((identity, index) => <div key={`${identity.provider}-${identity.identity_type}-${index}`} className="rounded-md bg-zinc-50 px-2.5 py-2 text-[10px]"><div className="font-semibold capitalize text-zinc-700">{identity.provider} · {identity.identity_type}</div><div className="mt-0.5 truncate font-mono text-zinc-400">{identity.identity_value}</div></div>)}</div>}</section>{tags.length > 0 && <section className="border-t border-zinc-100 pt-4"><div className="text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-400">Tags</div><div className="mt-2 flex flex-wrap gap-1.5">{tags.map((tag) => <span key={String(tag)} className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-medium text-zinc-600">{String(tag)}</span>)}</div></section>}<Link href="/inbox?view=all" className="button-primary w-full"><MessageSquare className="h-3.5 w-3.5" /> Open Inbox</Link></div></div></div>;
}
