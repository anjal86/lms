'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Loader2, MessageSquare, RefreshCw, Save, UserRound } from 'lucide-react';
import { useApp } from '@/lib/store';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';

type Contact = { id: string; display_name: string | null; primary_phone: string | null; primary_email: string | null; lifecycle_key: string; owner_id: string | null; tags: unknown; custom_data: Record<string, unknown> | null; last_seen_at: string | null; owner: { id: string; full_name: string | null; email: string } | null };
type Identity = { id: string; provider: string; identity_type: string; identity_value: string; is_primary: boolean };
type Conversation = { id: string; provider: string; workflow_state: string; priority: string; last_message_at: string | null; resolution_code: string | null };
type Payload = { contact: Contact; identities: Identity[]; conversations: Conversation[] };

export default function ContactDetailPage() {
  const params = useParams<{ id: string }>();
  const { allProfiles, showToast } = useApp();
  const { term } = useWorkspace();
  const contactLabel = term('contact', 'Contact');
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ display_name: '', primary_phone: '', primary_email: '', lifecycle_key: 'new', owner_id: '', tags: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/contacts/${params.id}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Unable to load ${contactLabel.toLowerCase()}.`);
      const next = data as Payload;
      setPayload(next);
      setForm({
        display_name: next.contact.display_name || '',
        primary_phone: next.contact.primary_phone || '',
        primary_email: next.contact.primary_email || '',
        lifecycle_key: next.contact.lifecycle_key || 'new',
        owner_id: next.contact.owner_id || '',
        tags: Array.isArray(next.contact.tags) ? next.contact.tags.map(String).join(', ') : '',
      });
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to load contact.', 'error');
    } finally { setLoading(false); }
  }, [contactLabel, params.id, showToast]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/contacts/${params.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: form.display_name.trim() || null,
          primary_phone: form.primary_phone.trim() || null,
          primary_email: form.primary_email.trim() || null,
          lifecycle_key: form.lifecycle_key,
          owner_id: form.owner_id || null,
          tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to save contact.');
      showToast(`${contactLabel} updated.`, 'success');
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to save contact.', 'error');
    } finally { setSaving(false); }
  };

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center gap-2 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading {contactLabel.toLowerCase()}…</div>;
  if (!payload) return <div className="mx-auto max-w-xl px-5 py-16 text-center"><UserRound className="mx-auto h-7 w-7 text-zinc-300" /><h1 className="mt-3 text-lg font-semibold text-zinc-950">{contactLabel} unavailable</h1><button type="button" onClick={() => void load()} className="button-secondary mt-4"><RefreshCw className="h-4 w-4" /> Retry</button></div>;

  return <main className="min-h-full bg-zinc-50 px-4 py-5 sm:px-6"><div className="mx-auto max-w-6xl space-y-5">
    <header className="flex flex-col gap-3 border-b border-zinc-200 pb-4 sm:flex-row sm:items-end sm:justify-between"><div><Link href="/contacts" className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-900"><ArrowLeft className="h-3.5 w-3.5" /> {term('contact_plural','Contacts')}</Link><h1 className="text-2xl font-bold tracking-tight text-zinc-950">{payload.contact.display_name || contactLabel}</h1><p className="mt-1 text-sm text-zinc-500">Identity, ownership, lifecycle and conversation history.</p></div><button type="button" onClick={() => void save()} disabled={saving} className="button-primary">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save changes</button></header>

    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="border border-zinc-200 bg-white"><div className="border-b border-zinc-200 px-4 py-3"><h2 className="text-sm font-bold text-zinc-900">Profile</h2></div><div className="grid gap-4 p-4 sm:grid-cols-2">
        <label className="text-xs font-semibold text-zinc-600">Name<input value={form.display_name} onChange={(event) => setForm((current) => ({ ...current, display_name: event.target.value }))} className="field mt-1.5 h-10 text-sm" /></label>
        <label className="text-xs font-semibold text-zinc-600">Lifecycle<select value={form.lifecycle_key} onChange={(event) => setForm((current) => ({ ...current, lifecycle_key: event.target.value }))} className="select-field mt-1.5 h-10 w-full text-sm"><option value="new">New</option><option value="qualified">Qualified</option><option value="opportunity">Opportunity</option><option value="customer">Customer</option><option value="lost">Lost</option></select></label>
        <label className="text-xs font-semibold text-zinc-600">Phone<input value={form.primary_phone} onChange={(event) => setForm((current) => ({ ...current, primary_phone: event.target.value }))} className="field mt-1.5 h-10 font-mono text-sm" /></label>
        <label className="text-xs font-semibold text-zinc-600">Email<input type="email" value={form.primary_email} onChange={(event) => setForm((current) => ({ ...current, primary_email: event.target.value }))} className="field mt-1.5 h-10 text-sm" /></label>
        <label className="text-xs font-semibold text-zinc-600">Owner<select value={form.owner_id} onChange={(event) => setForm((current) => ({ ...current, owner_id: event.target.value }))} className="select-field mt-1.5 h-10 w-full text-sm"><option value="">No owner</option>{allProfiles.filter((profile) => profile.is_active).map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name}</option>)}</select></label>
        <label className="text-xs font-semibold text-zinc-600">Tags<input value={form.tags} onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))} placeholder="VIP, Kailash, Hot" className="field mt-1.5 h-10 text-sm" /><span className="mt-1 block text-[10px] font-normal text-zinc-400">Comma separated</span></label>
      </div></section>

      <aside className="border border-zinc-200 bg-white"><div className="border-b border-zinc-200 px-4 py-3"><h2 className="text-sm font-bold text-zinc-900">Channel identities</h2></div><div className="divide-y divide-zinc-100">{payload.identities.length ? payload.identities.map((identity) => <div key={identity.id} className="px-4 py-3"><div className="flex items-center justify-between gap-3"><span className="text-xs font-bold capitalize text-zinc-800">{identity.provider} · {identity.identity_type}</span>{identity.is_primary ? <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Primary</span> : null}</div><div className="mt-1 break-all font-mono text-xs text-zinc-500">{identity.identity_value}</div></div>) : <div className="px-4 py-8 text-center text-xs text-zinc-400">No channel identities.</div>}</div></aside>
    </div>

    <section className="overflow-hidden border border-zinc-200 bg-white"><div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3"><div><h2 className="text-sm font-bold text-zinc-900">Conversation history</h2><p className="text-xs text-zinc-500">Every channel thread attached to this identity</p></div><span className="font-mono text-xs font-bold text-zinc-500">{payload.conversations.length}</span></div><div className="divide-y divide-zinc-100">{payload.conversations.map((conversation) => <Link key={conversation.id} href={`/inbox?conversationId=${conversation.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-zinc-50"><MessageSquare className="h-4 w-4 shrink-0 text-zinc-400" /><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-xs font-bold capitalize text-zinc-900">{conversation.provider}</span><span className="text-[10px] font-semibold capitalize text-zinc-500">{conversation.workflow_state}</span></div><div className="mt-1 text-[11px] text-zinc-500">{conversation.resolution_code ? conversation.resolution_code.replaceAll('_',' ') : conversation.priority}</div></div><span className="font-mono text-[10px] text-zinc-400">{conversation.last_message_at ? new Date(conversation.last_message_at).toLocaleDateString() : '—'}</span></Link>)}{!payload.conversations.length ? <div className="px-4 py-10 text-center text-xs text-zinc-400">No conversations attached yet.</div> : null}</div></section>
  </div></main>;
}
