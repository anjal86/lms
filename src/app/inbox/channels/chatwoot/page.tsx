'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  Loader2,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Webhook,
} from 'lucide-react';
import { useApp } from '@/lib/store';

type ChatwootMapping = {
  id: string;
  chatwoot_account_id: number;
  name: string | null;
  status: string;
  last_verified_at: string | null;
};

type ChatwootInbox = {
  id: string;
  chatwoot_inbox_id: number;
  name: string | null;
  channel_type: string | null;
  status: string;
  metadata?: {
    crm_provider?: string | null;
    external_identity?: string | null;
    provider_name?: string | null;
  } | null;
  last_synced_at: string | null;
};

type AccountResponse = {
  configured: boolean;
  baseUrl: string | null;
  webhookUrl: string;
  mapping: ChatwootMapping | null;
  migrationRequired?: boolean;
  error?: string;
};

type InboxesResponse = {
  inboxes: ChatwootInbox[];
  migrationRequired?: boolean;
  error?: string;
};

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not yet';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : 'Not yet';
}

function channelLabel(value: string | null | undefined) {
  if (!value) return 'Unknown channel';
  return value.replace(/^Channel::/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
}

export default function ChatwootSetupPage() {
  const { currentUser } = useApp();
  const canManage = currentUser.role === 'admin' || currentUser.role === 'manager';
  const [account, setAccount] = useState<AccountResponse | null>(null);
  const [inboxes, setInboxes] = useState<ChatwootInbox[]>([]);
  const [accountId, setAccountId] = useState('');
  const [name, setName] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [accountResponse, inboxResponse] = await Promise.all([
        fetch('/api/integrations/chatwoot/account', { cache: 'no-store' }),
        fetch('/api/integrations/chatwoot/inboxes', { cache: 'no-store' }),
      ]);
      const accountPayload = await accountResponse.json().catch(() => ({})) as AccountResponse;
      const inboxPayload = await inboxResponse.json().catch(() => ({})) as InboxesResponse;
      if (!accountResponse.ok) throw new Error(accountPayload.error || 'Unable to load Chatwoot setup.');
      if (!inboxResponse.ok) throw new Error(inboxPayload.error || 'Unable to load Chatwoot inboxes.');
      setAccount(accountPayload);
      setInboxes(inboxPayload.inboxes || []);
      if (accountPayload.mapping) {
        setAccountId(String(accountPayload.mapping.chatwoot_account_id));
        setName(accountPayload.mapping.name || '');
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load Chatwoot setup.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = 'Chatwoot — Inbox Channels';
    void load();
  }, [load]);

  const activeInboxes = useMemo(() => inboxes.filter((inbox) => inbox.status === 'active'), [inboxes]);

  const saveAccount = async () => {
    const numericAccountId = Number(accountId);
    if (!Number.isSafeInteger(numericAccountId) || numericAccountId <= 0) {
      setError('Enter a valid Chatwoot Account ID.');
      return;
    }
    if (webhookSecret.trim().length < 16) {
      setError('Enter the webhook signing secret from Chatwoot.');
      return;
    }

    setBusy('account');
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/integrations/chatwoot/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: numericAccountId,
          name: name.trim() || undefined,
          webhookSecret: webhookSecret.trim(),
        }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; verifiedAgentCount?: number };
      if (!response.ok) throw new Error(payload.error || 'Unable to save Chatwoot account.');
      setWebhookSecret('');
      setNotice(`Chatwoot account verified${typeof payload.verifiedAgentCount === 'number' ? ` · ${payload.verifiedAgentCount} agents visible` : ''}.`);
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unable to save Chatwoot account.');
    } finally {
      setBusy(null);
    }
  };

  const discoverInboxes = async () => {
    setBusy('inboxes');
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/integrations/chatwoot/inboxes', { method: 'POST' });
      const payload = await response.json().catch(() => ({})) as InboxesResponse & { discovered?: number; disabled?: number };
      if (!response.ok) throw new Error(payload.error || 'Unable to discover Chatwoot inboxes.');
      setInboxes(payload.inboxes || []);
      setNotice(`${payload.discovered ?? payload.inboxes.length} Chatwoot inboxes synchronized${payload.disabled ? ` · ${payload.disabled} removed inboxes disabled` : ''}.`);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unable to discover Chatwoot inboxes.');
    } finally {
      setBusy(null);
    }
  };

  const copyWebhook = async () => {
    if (!account?.webhookUrl) return;
    await navigator.clipboard.writeText(account.webhookUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center text-sm text-zinc-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading Chatwoot setup…</div>;
  }

  return <div className="mx-auto w-full max-w-5xl px-5 py-7">
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <Link href="/inbox/channels" className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900"><ArrowLeft className="h-3.5 w-3.5" /> Channels</Link>
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white"><MessageSquare className="h-4 w-4 text-blue-600" /></div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-950">Chatwoot conversation engine</h1>
            <p className="mt-0.5 text-sm text-zinc-500">Connect this CRM workspace to one Chatwoot Account, then discover its channel inboxes.</p>
          </div>
        </div>
      </div>
      {account?.mapping && <div className="mt-7 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Verified</div>}
    </div>

    {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
    {notice && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}
    {account?.migrationRequired && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Apply the latest database migrations before configuring Chatwoot.</div>}

    <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-zinc-500" /><h2 className="text-sm font-semibold text-zinc-950">Workspace mapping</h2></div>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-zinc-700">Chatwoot Account ID</span>
            <input value={accountId} onChange={(event) => setAccountId(event.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="1" disabled={!canManage} className="h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-zinc-50" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-zinc-700">Display name <span className="font-normal text-zinc-400">optional</span></span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Primary Chatwoot" disabled={!canManage} className="h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-zinc-50" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-zinc-700">Webhook signing secret</span>
            <input type="password" value={webhookSecret} onChange={(event) => setWebhookSecret(event.target.value)} placeholder={account?.mapping ? 'Enter again only when rotating/updating' : 'Paste Chatwoot webhook secret'} disabled={!canManage} autoComplete="new-password" className="h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-zinc-50" />
            <p className="mt-1.5 text-[11px] leading-4 text-zinc-400">Stored encrypted with the CRM integration key. The plaintext secret is never returned to the browser.</p>
          </label>

          <button type="button" onClick={() => void saveAccount()} disabled={!canManage || busy === 'account' || !account?.configured} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
            {busy === 'account' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Verify & save
          </button>
          {!account?.configured && <p className="text-xs text-amber-700">Set CHATWOOT_BASE_URL and CHATWOOT_API_ACCESS_TOKEN on the CRM server first.</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-center gap-2"><Webhook className="h-4 w-4 text-zinc-500" /><h2 className="text-sm font-semibold text-zinc-950">Webhook</h2></div>
        <p className="mb-3 text-xs leading-5 text-zinc-500">Create/configure the Chatwoot Account webhook with this URL and use the same signing secret you save here.</p>
        <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2">
          <code className="min-w-0 flex-1 truncate px-1 text-[11px] text-zinc-700">{account?.webhookUrl || '—'}</code>
          <button type="button" onClick={() => void copyWebhook()} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-white hover:text-zinc-900" aria-label="Copy webhook URL">{copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}</button>
        </div>
        <dl className="mt-5 grid gap-3 text-xs">
          <div className="flex justify-between gap-4"><dt className="text-zinc-500">Chatwoot URL</dt><dd className="max-w-[65%] truncate font-medium text-zinc-800">{account?.baseUrl || 'Not configured'}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-zinc-500">Mapped account</dt><dd className="font-medium text-zinc-800">{account?.mapping?.chatwoot_account_id ?? 'None'}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-zinc-500">Last verified</dt><dd className="text-right font-medium text-zinc-800">{formatDate(account?.mapping?.last_verified_at)}</dd></div>
        </dl>
      </section>
    </div>

    <section className="mt-5 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-4 border-b border-zinc-100 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-950">Chatwoot inboxes</h2>
          <p className="mt-0.5 text-xs text-zinc-500">Safe channel metadata only; Chatwoot credentials are never copied into this list.</p>
        </div>
        <button type="button" onClick={() => void discoverInboxes()} disabled={!canManage || !account?.mapping || busy === 'inboxes'} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-45">
          <RefreshCw className={`h-3.5 w-3.5 ${busy === 'inboxes' ? 'animate-spin' : ''}`} /> Discover inboxes
        </button>
      </div>

      {inboxes.length === 0 ? <div className="px-5 py-10 text-center text-sm text-zinc-400">No Chatwoot inboxes synchronized yet.</div> : <div className="divide-y divide-zinc-100">
        {inboxes.map((inbox) => <div key={inbox.id} className="flex items-center gap-3 px-5 py-3.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100"><MessageSquare className="h-4 w-4 text-zinc-500" /></div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-medium text-zinc-900">{inbox.name || `Inbox ${inbox.chatwoot_inbox_id}`}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${inbox.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>{inbox.status}</span>
            </div>
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-zinc-400">
              <span>{channelLabel(inbox.channel_type)}</span>
              {inbox.metadata?.crm_provider && <><span>·</span><span className="capitalize">{inbox.metadata.crm_provider}</span></>}
              {inbox.metadata?.external_identity && <><span>·</span><span className="truncate">{inbox.metadata.external_identity}</span></>}
            </div>
          </div>
          <div className="shrink-0 text-right text-[10px] text-zinc-400">
            <div>#{inbox.chatwoot_inbox_id}</div>
            <div className="mt-0.5">{formatDate(inbox.last_synced_at)}</div>
          </div>
        </div>)}
      </div>}

      {activeInboxes.length > 0 && <div className="border-t border-zinc-100 bg-zinc-50/60 px-5 py-3 text-[11px] text-zinc-500">{activeInboxes.length} active Chatwoot inbox{activeInboxes.length === 1 ? '' : 'es'} ready for CRM mapping.</div>}
    </section>
  </div>;
}
