'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  FlaskConical,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldAlert,
} from 'lucide-react';
import { useApp } from '@/lib/store';

type Connection = {
  id: string;
  provider: string;
  display_name: string;
  status: string;
};

type ChatwootInbox = {
  id: string;
  integration_connection_id: string | null;
  chatwoot_inbox_id: number;
  name: string | null;
  channel_type: string | null;
  status: string;
  traffic_mode: 'shadow' | 'active';
  metadata?: { crm_provider?: string | null; external_identity?: string | null } | null;
};

type ShadowConversation = {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  last_message_preview: string | null;
  workflow_state: string;
  unread_count: number;
  last_message_at: string;
  chatwoot: { conversationId: number; inboxId: number };
};

type ShadowMessage = {
  id: string;
  direction: 'inbound' | 'outbound' | 'internal';
  message_type: string;
  body: string | null;
  sent_at: string;
  delivery_status?: string | null;
  author_profile?: { full_name?: string | null } | null;
};

function time(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : '—';
}

export default function ChatwootValidationPage() {
  const { currentUser } = useApp();
  const canManage = currentUser.role === 'admin' || currentUser.role === 'manager';
  const [inboxes, setInboxes] = useState<ChatwootInbox[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedInboxId, setSelectedInboxId] = useState<string>('');
  const [conversations, setConversations] = useState<ShadowConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ShadowMessage[]>([]);
  const [note, setNote] = useState('');
  const [dryRunText, setDryRunText] = useState('Test outbound reply');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedInbox = useMemo(
    () => inboxes.find((inbox) => inbox.id === selectedInboxId) || null,
    [inboxes, selectedInboxId]
  );

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.chatwoot.conversationId === selectedConversationId) || null,
    [conversations, selectedConversationId]
  );

  const compatibleConnections = useCallback((inbox: ChatwootInbox) => {
    const provider = inbox.metadata?.crm_provider;
    return connections.filter((connection) => {
      if (!['connected', 'paused'].includes(connection.status)) return false;
      return !provider || provider === 'other' || connection.provider === provider;
    });
  }, [connections]);

  const loadSetup = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [inboxResponse, connectionResponse] = await Promise.all([
        fetch('/api/integrations/chatwoot/inboxes', { cache: 'no-store' }),
        fetch('/api/integrations/connections?refresh=1', { cache: 'no-store' }),
      ]);
      const inboxPayload = await inboxResponse.json().catch(() => ({})) as { inboxes?: ChatwootInbox[]; error?: string };
      const connectionPayload = await connectionResponse.json().catch(() => ({})) as { connections?: Connection[]; error?: string };
      if (!inboxResponse.ok) throw new Error(inboxPayload.error || 'Unable to load Chatwoot inboxes.');
      if (!connectionResponse.ok) throw new Error(connectionPayload.error || 'Unable to load CRM connections.');
      const nextInboxes = (inboxPayload.inboxes || []).filter((inbox) => inbox.status === 'active');
      setInboxes(nextInboxes);
      setConnections(connectionPayload.connections || []);
      setSelectedInboxId((current) => current && nextInboxes.some((inbox) => inbox.id === current) ? current : nextInboxes[0]?.id || '');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load Chatwoot validation data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = 'Chatwoot Validation — Inbox Channels';
    void loadSetup();
  }, [loadSetup]);

  useEffect(() => {
    setConversations([]);
    setMessages([]);
    setSelectedConversationId(null);
    setNotice(null);
  }, [selectedInboxId]);

  const mapInbox = async (inbox: ChatwootInbox, connectionId: string | null) => {
    setBusy(`map:${inbox.id}`);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/integrations/chatwoot/inboxes/${inbox.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId }),
      });
      const payload = await response.json().catch(() => ({})) as { inbox?: ChatwootInbox; error?: string };
      if (!response.ok || !payload.inbox) throw new Error(payload.error || 'Unable to map Chatwoot inbox.');
      setInboxes((current) => current.map((item) => item.id === inbox.id ? { ...item, ...payload.inbox } : item));
      setNotice(connectionId ? 'CRM connection mapped in shadow mode.' : 'CRM connection mapping removed.');
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unable to map Chatwoot inbox.');
    } finally {
      setBusy(null);
    }
  };

  const loadConversations = async () => {
    if (!selectedInbox) return;
    setBusy('conversations');
    setError(null);
    setNotice(null);
    try {
      const params = new URLSearchParams({ inboxLinkId: selectedInbox.id, status: 'all', page: '1' });
      const response = await fetch(`/api/integrations/chatwoot/shadow/conversations?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({})) as { conversations?: ShadowConversation[]; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Unable to load Chatwoot shadow conversations.');
      const next = payload.conversations || [];
      setConversations(next);
      setMessages([]);
      setSelectedConversationId(null);
      setNotice(`${next.length} Chatwoot conversations loaded without switching CRM traffic.`);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unable to load shadow conversations.');
    } finally {
      setBusy(null);
    }
  };

  const loadThread = async (conversationId: number) => {
    if (!selectedInbox) return;
    setSelectedConversationId(conversationId);
    setBusy(`thread:${conversationId}`);
    setError(null);
    try {
      const params = new URLSearchParams({ inboxLinkId: selectedInbox.id });
      const response = await fetch(`/api/integrations/chatwoot/shadow/conversations/${conversationId}?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({})) as { messages?: ShadowMessage[]; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Unable to load Chatwoot thread.');
      setMessages(payload.messages || []);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unable to load Chatwoot thread.');
    } finally {
      setBusy(null);
    }
  };

  const sendInternalNote = async () => {
    if (!selectedInbox || !selectedConversationId || !note.trim()) return;
    setBusy('note');
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/integrations/chatwoot/shadow/conversations/${selectedConversationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inboxLinkId: selectedInbox.id, body: note.trim(), direction: 'internal', dryRun: false }),
      });
      const payload = await response.json().catch(() => ({})) as { message?: ShadowMessage; error?: string };
      if (!response.ok || !payload.message) throw new Error(payload.error || 'Unable to create Chatwoot internal note.');
      setMessages((current) => [...current, payload.message!]);
      setNote('');
      setNotice('Internal note written to Chatwoot. No customer message was sent.');
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unable to create Chatwoot internal note.');
    } finally {
      setBusy(null);
    }
  };

  const dryRunOutbound = async () => {
    if (!selectedInbox || !selectedConversationId || !dryRunText.trim()) return;
    setBusy('dry-run');
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/integrations/chatwoot/shadow/conversations/${selectedConversationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inboxLinkId: selectedInbox.id, body: dryRunText.trim(), direction: 'outbound', dryRun: true }),
      });
      const payload = await response.json().catch(() => ({})) as { valid?: boolean; wouldSend?: boolean; blockedReason?: string | null; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Unable to validate Chatwoot outbound send.');
      setNotice(payload.wouldSend ? 'Outbound path is valid and currently allowed.' : payload.blockedReason || 'Outbound path validated but remains blocked in shadow mode.');
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unable to validate outbound path.');
    } finally {
      setBusy(null);
    }
  };

  if (!canManage) {
    return <div className="mx-auto max-w-3xl px-5 py-10"><div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><ShieldAlert className="mr-2 inline h-4 w-4" /> Manager or administrator access is required for Chatwoot shadow validation.</div></div>;
  }

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center text-sm text-zinc-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading validation workspace…</div>;
  }

  return <div className="mx-auto w-full max-w-7xl px-5 py-7">
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <Link href="/inbox/channels/chatwoot" className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900"><ArrowLeft className="h-3.5 w-3.5" /> Chatwoot setup</Link>
        <div className="flex items-center gap-2"><FlaskConical className="h-5 w-5 text-blue-600" /><h1 className="text-xl font-semibold tracking-tight text-zinc-950">Shadow validation</h1></div>
        <p className="mt-1 text-sm text-zinc-500">Compare Chatwoot data without changing the live CRM Inbox. External replies stay blocked while traffic mode is shadow.</p>
      </div>
      <button type="button" onClick={() => void loadSetup()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"><RefreshCw className="h-3.5 w-3.5" /> Reload</button>
    </div>

    {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
    {notice && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}

    <section className="mb-5 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-3 text-sm font-semibold text-zinc-900">1. Map Chatwoot inboxes to CRM connections</div>
      {inboxes.length === 0 ? <p className="text-sm text-zinc-400">Discover Chatwoot inboxes first from the setup page.</p> : <div className="grid gap-3 md:grid-cols-2">
        {inboxes.map((inbox) => {
          const options = compatibleConnections(inbox);
          return <div key={inbox.id} className={`rounded-xl border p-3 ${selectedInboxId === inbox.id ? 'border-blue-200 bg-blue-50/40' : 'border-zinc-200'}`}>
            <button type="button" onClick={() => setSelectedInboxId(inbox.id)} className="mb-2 block w-full text-left">
              <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium text-zinc-900">{inbox.name || `Inbox ${inbox.chatwoot_inbox_id}`}</span><span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600">{inbox.traffic_mode}</span></div>
              <div className="mt-0.5 text-[11px] text-zinc-400">{inbox.metadata?.crm_provider || inbox.channel_type || 'unknown'} · Chatwoot #{inbox.chatwoot_inbox_id}</div>
            </button>
            <select value={inbox.integration_connection_id || ''} onChange={(event) => void mapInbox(inbox, event.target.value || null)} disabled={busy === `map:${inbox.id}`} className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs text-zinc-700 outline-none focus:border-blue-400">
              <option value="">Not mapped</option>
              {options.map((connection) => <option key={connection.id} value={connection.id}>{connection.display_name} · {connection.provider}</option>)}
            </select>
          </div>;
        })}
      </div>}
    </section>

    <div className="grid min-h-[620px] gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 p-4">
          <div className="flex items-center justify-between gap-2"><div><div className="text-sm font-semibold text-zinc-900">2. Shadow conversations</div><div className="mt-0.5 text-[11px] text-zinc-400">Read-only against the selected Chatwoot inbox.</div></div><button type="button" onClick={() => void loadConversations()} disabled={!selectedInbox || busy === 'conversations'} className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 disabled:opacity-40" aria-label="Load shadow conversations">{busy === 'conversations' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}</button></div>
        </div>
        <div className="max-h-[560px] overflow-y-auto divide-y divide-zinc-100">
          {conversations.length === 0 ? <div className="p-5 text-center text-xs text-zinc-400">Load conversations to compare Chatwoot with the current CRM Inbox.</div> : conversations.map((conversation) => <button key={conversation.id} type="button" onClick={() => void loadThread(conversation.chatwoot.conversationId)} className={`block w-full p-3 text-left hover:bg-zinc-50 ${selectedConversationId === conversation.chatwoot.conversationId ? 'bg-blue-50' : ''}`}>
            <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium text-zinc-900">{conversation.customer_name}</span>{conversation.unread_count > 0 && <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[9px] font-semibold text-white">{conversation.unread_count}</span>}</div>
            <div className="mt-1 truncate text-xs text-zinc-500">{conversation.last_message_preview || 'No text preview'}</div>
            <div className="mt-1.5 flex items-center justify-between text-[10px] text-zinc-400"><span className="capitalize">{conversation.workflow_state}</span><span>{time(conversation.last_message_at)}</span></div>
          </button>)}
        </div>
      </section>

      <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 p-4">
          <div className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-zinc-500" /><div><div className="text-sm font-semibold text-zinc-900">3. Thread & send guard</div><div className="mt-0.5 text-[11px] text-zinc-400">{selectedConversation ? `${selectedConversation.customer_name} · Chatwoot #${selectedConversation.chatwoot.conversationId}` : 'Select a shadow conversation.'}</div></div></div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-zinc-50/50 p-4">
          {!selectedConversation ? <div className="flex h-full min-h-[300px] items-center justify-center text-sm text-zinc-400">No conversation selected.</div> : busy === `thread:${selectedConversationId}` && messages.length === 0 ? <div className="flex h-full min-h-[300px] items-center justify-center text-sm text-zinc-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading Chatwoot thread…</div> : <div className="space-y-2">
            {messages.map((message) => <div key={message.id} className={`max-w-[82%] rounded-xl px-3 py-2 text-sm ${message.direction === 'inbound' ? 'mr-auto border border-zinc-200 bg-white text-zinc-800' : message.direction === 'internal' ? 'mx-auto border border-amber-200 bg-amber-50 text-amber-900' : 'ml-auto bg-blue-600 text-white'}`}>
              {message.direction === 'internal' && <div className="mb-1 text-[9px] font-semibold uppercase tracking-wide opacity-70">Internal note</div>}
              <div className="whitespace-pre-wrap break-words">{message.body || `[${message.message_type}]`}</div>
              <div className="mt-1 text-[9px] opacity-60">{time(message.sent_at)}</div>
            </div>)}
          </div>}
        </div>
        {selectedConversation && <div className="border-t border-zinc-100 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="mb-1.5 text-[11px] font-semibold text-zinc-600">Safe live test: internal note</div>
              <div className="flex gap-2"><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Write an internal Chatwoot note" className="h-9 min-w-0 flex-1 rounded-lg border border-zinc-200 px-3 text-xs outline-none focus:border-blue-400" /><button type="button" onClick={() => void sendInternalNote()} disabled={!note.trim() || busy === 'note'} className="inline-flex h-9 items-center gap-1 rounded-lg bg-zinc-900 px-3 text-xs font-semibold text-white disabled:opacity-40">{busy === 'note' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Note</button></div>
            </div>
            <div>
              <div className="mb-1.5 text-[11px] font-semibold text-zinc-600">Customer reply path: dry run only</div>
              <div className="flex gap-2"><input value={dryRunText} onChange={(event) => setDryRunText(event.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border border-zinc-200 px-3 text-xs outline-none focus:border-blue-400" /><button type="button" onClick={() => void dryRunOutbound()} disabled={!dryRunText.trim() || busy === 'dry-run'} className="inline-flex h-9 items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-700 disabled:opacity-40">{busy === 'dry-run' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Validate</button></div>
            </div>
          </div>
        </div>}
      </section>
    </div>
  </div>;
}
