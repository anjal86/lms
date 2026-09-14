'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, Merge, RefreshCw, ShieldCheck, UserRound, X } from 'lucide-react';
import { useApp } from '@/lib/store';

type Contact = { id: string; display_name: string | null; primary_phone: string | null; primary_email: string | null; lifecycle_key: string; last_seen_at: string | null };
type Suggestion = { id: string; score: number; reasons: string[]; primary_suggestion_id: string; contacts: [Contact, Contact] };

export default function DuplicateContactsPage() {
  const { currentUser, showToast } = useApp();
  const canMerge = currentUser.role === 'admin' || currentUser.role === 'manager';
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [merging, setMerging] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [primaryByPair, setPrimaryByPair] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/contacts/duplicates', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to scan duplicates.');
      const rows = (payload.suggestions || []) as Suggestion[];
      setSuggestions(rows);
      setPrimaryByPair(Object.fromEntries(rows.map((row) => [row.id, row.primary_suggestion_id])));
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to scan duplicates.', 'error');
    } finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { void load(); }, [load]);

  const merge = async (suggestion: Suggestion) => {
    const primary = primaryByPair[suggestion.id] || suggestion.primary_suggestion_id;
    const duplicate = suggestion.contacts.find((contact) => contact.id !== primary)?.id;
    if (!duplicate || !window.confirm('Merge these contacts? The selected primary record will be preserved and the duplicate will be removed.')) return;
    setMerging(suggestion.id);
    try {
      const response = await fetch('/api/contacts/merge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ primary_contact_id: primary, duplicate_contact_id: duplicate }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to merge contacts.');
      showToast('Contacts merged.', 'success');
      setSuggestions((current) => current.filter((row) => row.id !== suggestion.id));
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to merge contacts.', 'error');
    } finally { setMerging(null); }
  };

  const visible = suggestions.filter((row) => !dismissed.has(row.id));

  return <main className="min-h-full bg-zinc-50 px-4 py-5 sm:px-6"><div className="mx-auto max-w-6xl space-y-5">
    <header className="flex flex-col gap-3 border-b border-zinc-200 pb-4 sm:flex-row sm:items-end sm:justify-between"><div><Link href="/contacts" className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-900"><ArrowLeft className="h-3.5 w-3.5" /> Contacts</Link><h1 className="text-2xl font-bold tracking-tight text-zinc-950">Duplicate review</h1><p className="mt-1 text-sm text-zinc-500">High-confidence identity matches only. Review before merging.</p></div><button type="button" onClick={() => void load()} disabled={loading} className="button-secondary">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Rescan</button></header>

    {!canMerge && <div className="border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">You can review duplicate suggestions, but only managers can merge records.</div>}

    {loading ? <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Comparing contact identities…</div> : visible.length === 0 ? <div className="border border-zinc-200 bg-white px-6 py-16 text-center"><CheckCircle2 className="mx-auto h-7 w-7 text-emerald-600" /><h2 className="mt-3 text-base font-bold text-zinc-900">No likely duplicates</h2><p className="mt-1 text-sm text-zinc-500">The current contact set has no high-confidence matches.</p></div> : <div className="space-y-3">{visible.map((suggestion) => {
      const primary = primaryByPair[suggestion.id] || suggestion.primary_suggestion_id;
      return <section key={suggestion.id} className="border border-zinc-200 bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-zinc-600" /><span className="font-mono text-sm font-bold text-zinc-900">{suggestion.score}% match</span><span className="text-xs text-zinc-500">{suggestion.reasons.join(' · ')}</span></div><button type="button" onClick={() => setDismissed((current) => new Set(current).add(suggestion.id))} className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"><X className="h-3.5 w-3.5" /> Not duplicate</button></div>
        <div className="grid gap-px bg-zinc-200 md:grid-cols-2">{suggestion.contacts.map((contact) => <label key={contact.id} className="cursor-pointer bg-white p-4 hover:bg-zinc-50"><div className="flex items-start gap-3"><input type="radio" name={`primary-${suggestion.id}`} checked={primary === contact.id} onChange={() => setPrimaryByPair((current) => ({ ...current, [suggestion.id]: contact.id }))} className="mt-1" /><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><span className="truncate text-sm font-bold text-zinc-950">{contact.display_name || 'Unnamed contact'}</span>{primary === contact.id ? <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Keep as primary</span> : null}</div><dl className="mt-3 grid gap-2 text-xs"><div className="flex justify-between gap-3"><dt className="text-zinc-500">Phone</dt><dd className="font-mono font-semibold text-zinc-900">{contact.primary_phone || '—'}</dd></div><div className="flex justify-between gap-3"><dt className="text-zinc-500">Email</dt><dd className="truncate font-semibold text-zinc-900">{contact.primary_email || '—'}</dd></div><div className="flex justify-between gap-3"><dt className="text-zinc-500">Lifecycle</dt><dd className="font-semibold capitalize text-zinc-900">{contact.lifecycle_key}</dd></div><div className="flex justify-between gap-3"><dt className="text-zinc-500">Last seen</dt><dd className="font-mono text-zinc-700">{contact.last_seen_at ? new Date(contact.last_seen_at).toLocaleDateString() : '—'}</dd></div></dl><Link href={`/contacts/${contact.id}`} className="mt-3 inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-900" onClick={(event) => event.stopPropagation()}><UserRound className="h-3.5 w-3.5" /> Review full contact</Link></div></div></label>)}</div>
        <div className="flex flex-col gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2 text-xs text-zinc-500"><AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> Merge is permanent. Conversations and channel identities move to the primary contact.</div><button type="button" disabled={!canMerge || merging === suggestion.id} onClick={() => void merge(suggestion)} className="button-primary button-sm">{merging === suggestion.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Merge className="h-3.5 w-3.5" />} Merge into primary</button></div>
      </section>;
    })}</div>}
  </div></main>;
}
