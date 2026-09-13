'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Merge, RefreshCw, Search, UserRound, Users, X } from 'lucide-react';
import { useApp } from '@/lib/store';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';

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
};

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

export default function ContactsPage() {
  const { currentUser, showToast } = useApp();
  const { term } = useWorkspace();
  const contactLabel = term('contact', 'Contact');
  const contactPlural = term('contact_plural', 'Contacts');
  const canManage = currentUser.role === 'admin' || currentUser.role === 'manager';

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [lifecycle, setLifecycle] = useState('');
  const [loading, setLoading] = useState(true);
  const [merging, setMerging] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmMerge, setConfirmMerge] = useState(false);
  const [total, setTotal] = useState(0);

  const selected = useMemo(() => selectedIds.map((id) => contacts.find((contact) => contact.id === id)).filter(Boolean) as Contact[], [contacts, selectedIds]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (search.trim()) params.set('search', search.trim());
      if (lifecycle) params.set('lifecycle', lifecycle);
      const response = await fetch(`/api/contacts?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `Unable to load ${contactPlural.toLowerCase()}.`);
      setContacts(payload.contacts || []);
      setTotal(payload.total || 0);
      setSelectedIds((current) => current.filter((id) => (payload.contacts || []).some((contact: Contact) => contact.id === id)));
    } catch (error) {
      showToast(error instanceof Error ? error.message : `Unable to load ${contactPlural.toLowerCase()}.`, 'error');
    } finally {
      setLoading(false);
    }
  }, [contactPlural, lifecycle, search, showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 180);
    return () => window.clearTimeout(timer);
  }, [load]);

  const toggleSelection = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 2 ? [...current, id] : [current[1], id]);
  };

  const mergeContacts = async () => {
    if (selectedIds.length !== 2) return;
    setMerging(true);
    try {
      const response = await fetch('/api/contacts/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primary_contact_id: selectedIds[0], duplicate_contact_id: selectedIds[1] }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `Unable to merge ${contactPlural.toLowerCase()}.`);
      setConfirmMerge(false);
      setSelectedIds([]);
      showToast(`${contactLabel} identities merged.`, 'success');
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : `Unable to merge ${contactPlural.toLowerCase()}.`, 'error');
    } finally {
      setMerging(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-base font-semibold text-zinc-950"><Users className="h-4 w-4" /> {contactPlural}</div>
          <p className="mt-1 text-xs text-zinc-500">One identity across channels and conversations. Merge duplicates without losing history.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 font-mono text-[11px] text-zinc-500">{total} total</span>
          <button type="button" onClick={() => void load()} className="button-secondary"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
          {canManage && selectedIds.length === 2 && <button type="button" onClick={() => setConfirmMerge(true)} className="button-primary"><Merge className="h-3.5 w-3.5" /> Merge selected</button>}
        </div>
      </div>

      {canManage && selected.length > 0 && <div className="rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2 text-xs text-blue-800"><span className="font-semibold">Merge selection:</span> {selected.map((contact, index) => <span key={contact.id} className="ml-2">{index === 0 ? 'Primary' : 'Duplicate'}: <strong>{contact.display_name || contact.primary_phone || contact.primary_email || contactLabel}</strong></span>)}{selected.length === 1 && <span className="ml-2 text-blue-600">Choose one more duplicate.</span>}</div>}

      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 p-3">
          <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-2"><Search className="h-3.5 w-3.5 text-zinc-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${contactPlural.toLowerCase()} by name, phone or email…`} className="min-w-0 flex-1 bg-transparent text-xs outline-none" /></div>
          <select value={lifecycle} onChange={(event) => setLifecycle(event.target.value)} className="select-field h-9 text-xs"><option value="">All lifecycle stages</option><option value="new">New</option><option value="qualified">Qualified</option><option value="opportunity">Opportunity</option><option value="customer">Customer</option><option value="lost">Lost</option></select>
        </div>

        {loading ? <div className="flex items-center justify-center gap-2 py-14 text-xs text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading {contactPlural.toLowerCase()}…</div> : contacts.length === 0 ? <div className="py-16 text-center"><UserRound className="mx-auto h-7 w-7 text-zinc-300" /><p className="mt-2 text-sm font-medium text-zinc-700">No {contactPlural.toLowerCase()} found</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="border-b border-zinc-100 bg-zinc-50/70 text-[10px] uppercase tracking-wide text-zinc-400"><tr>{canManage && <th className="w-12 px-4 py-2.5">Merge</th>}<th className="px-4 py-2.5">{contactLabel}</th><th className="px-4 py-2.5">Phone</th><th className="px-4 py-2.5">Email</th><th className="px-4 py-2.5">Lifecycle</th><th className="px-4 py-2.5">Owner</th><th className="px-4 py-2.5">Last seen</th></tr></thead><tbody className="divide-y divide-zinc-100">{contacts.map((contact) => {
          const selectedIndex = selectedIds.indexOf(contact.id);
          return <tr key={contact.id} className={selectedIndex >= 0 ? 'bg-blue-50/50' : 'hover:bg-zinc-50/60'}>{canManage && <td className="px-4 py-3"><button type="button" onClick={() => toggleSelection(contact.id)} className={`flex h-6 w-6 items-center justify-center rounded border ${selectedIndex >= 0 ? 'border-blue-600 bg-blue-600 text-white' : 'border-zinc-200 text-transparent hover:border-zinc-400'}`} aria-label={`Select ${contact.display_name || contactLabel} for merge`}>{selectedIndex >= 0 ? <span className="font-mono text-[9px] font-bold">{selectedIndex + 1}</span> : <Check className="h-3 w-3" />}</button></td>}<td className="px-4 py-3"><div className="flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-[10px] font-semibold text-zinc-600">{(contact.display_name || contactLabel).slice(0, 2).toUpperCase()}</span><div className="min-w-0"><div className="max-w-52 truncate font-semibold text-zinc-900">{contact.display_name || contactLabel}</div><div className="mt-0.5 font-mono text-[9px] text-zinc-400">{contact.id.slice(0, 8)}</div></div></div></td><td className="px-4 py-3 font-mono text-[11px] text-zinc-600">{contact.primary_phone || '—'}</td><td className="px-4 py-3 text-zinc-600">{contact.primary_email || '—'}</td><td className="px-4 py-3"><span className="rounded bg-zinc-100 px-1.5 py-1 text-[10px] font-medium text-zinc-600">{lifecycleLabel(contact.lifecycle_key)}</span></td><td className="px-4 py-3 text-zinc-600">{contact.owner?.full_name || 'Unassigned'}</td><td className="px-4 py-3 text-zinc-500">{relativeTime(contact.last_seen_at)}</td></tr>;
        })}</tbody></table></div>}
      </div>

      {confirmMerge && selected.length === 2 && <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-4" role="dialog" aria-modal="true" aria-label="Confirm contact merge"><div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white shadow-xl"><div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3"><div className="text-sm font-semibold">Merge duplicate identity</div><button type="button" onClick={() => setConfirmMerge(false)} className="rounded p-1 text-zinc-400 hover:bg-zinc-100"><X className="h-4 w-4" /></button></div><div className="space-y-3 p-4 text-xs text-zinc-600"><p>All channel identities, conversations and timeline history from the duplicate will move to the primary contact.</p><div className="rounded-lg bg-zinc-50 p-3"><div><span className="text-zinc-400">Keep:</span> <strong className="text-zinc-900">{selected[0].display_name || selected[0].primary_phone || contactLabel}</strong></div><div className="mt-1"><span className="text-zinc-400">Merge into it:</span> <strong className="text-zinc-900">{selected[1].display_name || selected[1].primary_phone || contactLabel}</strong></div></div><p className="font-medium text-amber-700">This cannot be automatically undone.</p></div><div className="flex justify-end gap-2 border-t border-zinc-100 bg-zinc-50 px-4 py-3"><button type="button" onClick={() => setConfirmMerge(false)} className="button-secondary">Cancel</button><button type="button" disabled={merging} onClick={() => void mergeContacts()} className="button-primary">{merging && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Merge contacts</button></div></div></div>}
    </div>
  );
}
