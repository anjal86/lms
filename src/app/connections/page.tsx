'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  CirclePause,
  Copy,
  ExternalLink,
  Facebook,
  Globe2,
  Instagram,
  Link2,
  Loader2,
  Mail,
  MessageCircle,
  PlugZap,
  QrCode,
  RefreshCw,
  Send,
  Settings2,
  Unplug,
  X,
} from 'lucide-react';
import BaileysWhatsAppConnect from '@/components/integrations/BaileysWhatsAppConnect';
import AppOverlayPortal from '@/components/layout/AppOverlayPortal';
import { useApp } from '@/lib/store';

type CatalogItem = {
  id: 'facebook' | 'instagram' | 'whatsapp' | 'tiktok' | 'email' | 'website' | 'api';
  name: string;
  shortName: string;
  description: string;
  group: string;
  capabilities: string[];
  connectMode: 'meta_oauth' | 'tiktok_oauth' | 'manual';
  configured: boolean;
  setup: {
    configured: boolean;
    required: string[];
    missing: string[];
  };
};

type Connection = {
  id: string;
  provider: CatalogItem['id'];
  display_name: string;
  external_account_id?: string | null;
  status: 'disconnected' | 'pending' | 'connected' | 'needs_attention' | 'paused';
  capabilities?: string[];
  config?: Record<string, unknown>;
  last_sync_at?: string | null;
  last_event_at?: string | null;
  last_error?: string | null;
};

type ConnectionsResponse = {
  connections: Connection[];
  catalog: CatalogItem[];
  setup?: {
    baseUrl: string;
    urls: {
      metaOauthCallbacks: {
        facebook: string;
        instagram: string;
        whatsapp: string;
      };
      tiktokOauthCallback: string;
      metaWebhook: string;
      tiktokWebhook: string;
      leadWebhook: string;
    };
  };
  migrationRequired?: boolean;
  message?: string;
};

const ICONS = {
  facebook: Facebook,
  instagram: Instagram,
  whatsapp: MessageCircle,
  tiktok: Send,
  email: Mail,
  website: Globe2,
  api: PlugZap,
};

const ACCENTS: Record<CatalogItem['id'], string> = {
  facebook: 'border-blue-200 bg-blue-50 text-blue-700',
  instagram: 'border-pink-200 bg-pink-50 text-pink-700',
  whatsapp: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  tiktok: 'border-zinc-300 bg-zinc-100 text-zinc-900',
  email: 'border-amber-200 bg-amber-50 text-amber-700',
  website: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  api: 'border-violet-200 bg-violet-50 text-violet-700',
};

function friendlyError(code: string | null) {
  if (!code) return null;
  const messages: Record<string, string> = {
    meta_not_configured: 'Meta App ID and App Secret are not configured on the server yet.',
    tiktok_not_configured: 'TikTok App ID and App Secret are not configured on the server yet.',
    invalid_oauth_state: 'The connection request expired or could not be verified. Try connecting again.',
    session_expired: 'Your CRM session expired during connection. Sign in and try again.',
    forbidden: 'Manager or administrator access is required to connect channels.',
    facebook_connection_failed: 'Facebook could not be connected. Check app permissions and the redirect URL.',
    instagram_connection_failed: 'Instagram could not be connected. Check app permissions and the redirect URL.',
    whatsapp_connection_failed: 'WhatsApp could not be connected. Check the Meta business permissions.',
    tiktok_connection_failed: 'TikTok could not be connected. Check the app authorization and Lead Management access.',
  };
  return messages[code] || 'The channel could not be connected. Try again.';
}

function usesBaileys(connection: Connection) {
  return connection.provider === 'whatsapp' && connection.config?.transport === 'baileys';
}

export default function ConnectionsPage() {
  const params = useSearchParams();
  const { currentUser } = useApp();
  const [data, setData] = useState<ConnectionsResponse>({ connections: [], catalog: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(friendlyError(params.get('error')));
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [whatsappDrawerOpen, setWhatsappDrawerOpen] = useState(false);
  const [setupProviderId, setSetupProviderId] = useState<CatalogItem['id'] | null>(() => {
    const setup = params.get('setup');
    return ['facebook', 'instagram', 'whatsapp', 'tiktok', 'email', 'website', 'api'].includes(setup || '')
      ? (setup as CatalogItem['id'])
      : null;
  });
  const connectedProvider = params.get('connected');
  const canManage = currentUser.role === 'admin' || currentUser.role === 'manager';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/integrations/connections', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to load connections.');
      setData(payload as ConnectionsResponse);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load connections.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = 'Connections — Wanderlust CRM';
    void load();
  }, [load]);

  useEffect(() => {
    if (params.get('whatsapp') === 'open' || params.get('setup') === 'whatsapp') {
      setWhatsappDrawerOpen(true);
    }
  }, [params]);

  const byProvider = useMemo(() => {
    const map = new Map<string, Connection[]>();
    data.connections.forEach((connection) => {
      const list = map.get(connection.provider) || [];
      list.push(connection);
      map.set(connection.provider, list);
    });
    return map;
  }, [data.connections]);

  const setupProvider = useMemo(() => {
    if (!setupProviderId) return null;
    return data.catalog.find((item) => item.id === setupProviderId) || null;
  }, [data.catalog, setupProviderId]);

  const appOrigin = data.setup?.baseUrl || (typeof window === 'undefined' ? '' : window.location.origin);
  const setupUrls = data.setup?.urls;
  const metaWebhook = setupUrls?.metaWebhook || `${appOrigin}/api/integrations/webhooks/meta`;
  const tiktokWebhook = setupUrls?.tiktokWebhook || `${appOrigin}/api/integrations/webhooks/tiktok`;
  const leadWebhook = setupUrls?.leadWebhook || `${appOrigin}/api/leads/webhook`;

  const connectManual = async (provider: CatalogItem) => {
    setBusy(provider.id);
    setError(null);
    try {
      const response = await fetch('/api/integrations/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: provider.id,
          display_name: provider.name,
          external_account_id: provider.id === 'website' ? appOrigin : undefined,
          config: provider.id === 'website' || provider.id === 'api' ? { webhook_url: leadWebhook } : {},
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to enable this channel.');
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unable to enable this channel.');
    } finally {
      setBusy(null);
    }
  };

  const updateConnection = async (connection: Connection, action: 'pause' | 'resume' | 'disconnect') => {
    setBusy(connection.id);
    setError(null);
    try {
      const response = await fetch('/api/integrations/connections', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: connection.id, action }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to update this channel.');
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unable to update this channel.');
    } finally {
      setBusy(null);
    }
  };

  const copy = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 2000);
  };

  const oauthCallbackRows = [
    ['Facebook Lead Ads OAuth callback', setupUrls?.metaOauthCallbacks.facebook || `${appOrigin}/api/integrations/oauth/facebook/callback`],
    ['Instagram Business OAuth callback', setupUrls?.metaOauthCallbacks.instagram || `${appOrigin}/api/integrations/oauth/instagram/callback`],
    ['WhatsApp Business OAuth callback', setupUrls?.metaOauthCallbacks.whatsapp || `${appOrigin}/api/integrations/oauth/whatsapp/callback`],
    ['TikTok OAuth callback', setupUrls?.tiktokOauthCallback || `${appOrigin}/api/integrations/oauth/tiktok/callback`],
  ];

  const webhookRows = [
    ['Meta webhook callback', metaWebhook],
    ['TikTok webhook callback', tiktokWebhook],
    ['Website / automation lead webhook', leadWebhook],
  ];

  if (!canManage) {
    return (
      <div className="empty-state surface-flat">
        <PlugZap className="h-6 w-6 text-violet-500" />
        <h1 className="empty-state-title mt-3">Connections are managed by your team lead</h1>
        <p className="empty-state-description">Agents can use connected channels from lead workspaces without seeing account credentials.</p>
      </div>
    );
  }

  return (
    <div className="app-page space-y-6">
      <header className="flex flex-col gap-4 border-b border-zinc-200/80 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Omnichannel</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">Lead &amp; Conversation Channels</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-zinc-500">Connect Facebook, Instagram, WhatsApp, TikTok, email, and webhooks to feed your unified CRM inbox automatically.</p>
        </div>
        <div className="flex items-center gap-2"><button type="button" onClick={() => void load()} className="button-secondary button-sm" disabled={loading}>{loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh</button></div>
      </header>

      {connectedProvider && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> {connectedProvider[0]?.toUpperCase()}{connectedProvider.slice(1)} connected</div><p className="mt-1 text-xs text-emerald-700">New events from this account will now enter the lead pipeline.</p></div>}

      {(error || data.migrationRequired) && <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4"><div className="flex items-center gap-2 text-sm font-semibold text-amber-800"><AlertCircle className="h-4 w-4" /> Setup needs attention</div><p className="mt-1 text-xs leading-5 text-amber-700">{error || data.message}</p>{data.migrationRequired && <code className="mt-2 inline-block rounded bg-white/70 px-2 py-1 text-[11px] text-amber-900">npm run db:migrate:local</code>}</div>}

      <section>
        <div className="mb-3.5"><h2 className="text-sm font-semibold text-zinc-950">Active Lead Sources</h2><p className="text-xs text-zinc-500">Inbound messages and forms create or match contacts and route them according to your workflow rules.</p></div>
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {data.catalog.map((provider) => {
            const Icon = ICONS[provider.id];
            const connections = byProvider.get(provider.id) || [];
            const baileysConnections = provider.id === 'whatsapp' ? connections.filter(usesBaileys) : [];
            const standardConnections = provider.id === 'whatsapp' ? connections.filter((item) => !usesBaileys(item)) : connections;
            const active = standardConnections.find((item) => item.status === 'connected') || standardConnections[0];
            const baileysConnectedCount = baileysConnections.filter((item) => item.status === 'connected').length;
            const baileysPendingCount = baileysConnections.filter((item) => item.status === 'pending').length;
            const providerConnected = provider.id === 'whatsapp' ? (active?.status === 'connected' || baileysConnectedCount > 0) : active?.status === 'connected';
            const providerPaused = !providerConnected && active?.status === 'paused';
            const providerPending = !providerConnected && !providerPaused && provider.id === 'whatsapp' && baileysPendingCount > 0;
            const isBusy = busy === provider.id || busy === active?.id;

            return (
              <article key={provider.id} className="surface-flat flex flex-col justify-between overflow-hidden rounded-lg border border-zinc-200">
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${ACCENTS[provider.id]}`}><Icon className="h-5 w-5" /></span><div className="min-w-0"><h3 className="text-sm font-semibold text-zinc-950">{provider.name}</h3><p className="mt-0.5 line-clamp-2 text-xs leading-5 text-zinc-500">{provider.description}</p></div></div>
                    <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-zinc-600"><span className={`h-1.5 w-1.5 rounded-full ${providerConnected ? 'bg-emerald-500' : providerPaused ? 'bg-amber-500' : providerPending ? 'bg-amber-400 animate-pulse' : 'bg-zinc-300'}`} />{providerConnected ? (provider.id === 'whatsapp' && baileysConnectedCount > 1 ? `${baileysConnectedCount} connected` : 'Connected') : providerPaused ? 'Paused' : providerPending ? 'Scan needed' : 'Not connected'}</span>
                  </div>
                  <div className="mt-3.5 flex flex-wrap gap-1">{provider.capabilities.map((capability) => <span key={capability} className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">{capability}</span>)}</div>

                  {provider.id === 'whatsapp' && <div className="mt-3.5 space-y-1.5">{baileysConnections.length > 0 ? <div className="divide-y divide-zinc-100 rounded-md border border-zinc-200 bg-zinc-50/50">{baileysConnections.slice(0, 3).map((conn) => { const isConn = conn.status === 'connected'; const phone = conn.external_account_id; return <div key={conn.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs"><div className="min-w-0"><div className="truncate font-semibold text-zinc-900">{conn.display_name || 'WhatsApp'}</div>{phone && <div className="font-mono text-[10px] text-zinc-500">+{phone}</div>}</div><span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium text-zinc-500"><span className={`h-1.5 w-1.5 rounded-full ${isConn ? 'bg-emerald-500' : 'bg-amber-500'}`} />{isConn ? 'Active' : 'Scan QR'}</span></div>; })}{baileysConnections.length > 3 && <div className="px-3 py-1 text-[10px] text-zinc-500">+{baileysConnections.length - 3} more account{baileysConnections.length - 3 > 1 ? 's' : ''}</div>}</div> : <div className="rounded-md border border-dashed border-zinc-200 bg-zinc-50/40 p-3 text-center text-xs text-zinc-500">No linked devices yet. Click below to pair via QR code.</div>}</div>}

                  {provider.id !== 'whatsapp' && active && <div className="mt-3.5 rounded-md border border-zinc-200 bg-zinc-50/60 p-2.5 text-xs"><div className="font-semibold text-zinc-800">{active.display_name}</div><div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-zinc-500">{active.last_event_at && <span>Last event {new Date(active.last_event_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}{active.external_account_id && <span className="font-mono">{active.external_account_id}</span>}</div>{active.last_error && <div className="mt-1.5 text-[10px] text-red-600">{active.last_error}</div>}</div>}
                </div>

                {provider.id === 'whatsapp' ? <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 bg-zinc-50/70 px-4 py-2.5"><button type="button" onClick={() => setWhatsappDrawerOpen(true)} className="button-primary button-sm"><QrCode className="h-3.5 w-3.5" />{baileysConnections.length > 0 ? `Manage WhatsApp (${baileysConnections.length})` : 'Connect with QR'}</button>{!provider.configured && <button type="button" onClick={() => setSetupProviderId(provider.id)} className="button-ghost button-sm text-zinc-500"><Settings2 className="h-3.5 w-3.5" /> Official API</button>}</div> : <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 bg-zinc-50/70 px-4 py-2.5">
                  {!active || active.status === 'disconnected' ? provider.connectMode === 'manual' ? <button type="button" onClick={() => void connectManual(provider)} disabled={isBusy || data.migrationRequired} className="button-primary button-sm">{isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />} Enable</button> : provider.configured && !data.migrationRequired ? <a href={`/api/integrations/oauth/${provider.id}/start`} className="button-primary button-sm"><ExternalLink className="h-3.5 w-3.5" /> Continue with {provider.id === 'tiktok' ? 'TikTok' : 'Meta'}</a> : <button type="button" onClick={() => setSetupProviderId(provider.id)} className="button-primary button-sm" disabled={data.migrationRequired}><Settings2 className="h-3.5 w-3.5" /> Configure official API</button> : active.status === 'paused' ? <button type="button" onClick={() => void updateConnection(active, 'resume')} disabled={isBusy} className="button-primary button-sm"><PlugZap className="h-3.5 w-3.5" /> Resume</button> : <button type="button" onClick={() => void updateConnection(active, 'pause')} disabled={isBusy} className="button-secondary button-sm"><CirclePause className="h-3.5 w-3.5" /> Pause</button>}
                  {active && active.status !== 'disconnected' && <button type="button" onClick={() => void updateConnection(active, 'disconnect')} disabled={isBusy} className="button-ghost button-sm text-red-600"><Unplug className="h-3.5 w-3.5" /> Disconnect</button>}
                  {!provider.configured && provider.connectMode !== 'manual' && <button type="button" onClick={() => setSetupProviderId(provider.id)} className="button-ghost button-sm text-zinc-500"><Settings2 className="h-3.5 w-3.5" /> Official API setup</button>}
                </div>}
              </article>
            );
          })}
        </div>
      </section>

      <section className="surface-flat overflow-hidden rounded-lg border border-zinc-200">
        <div className="border-b border-zinc-200 bg-zinc-50/50 px-4 py-3"><h2 className="text-xs font-semibold text-zinc-950">Provider Portal Webhooks &amp; Redirect URLs</h2><p className="mt-0.5 text-[11px] text-zinc-500">Paste these HTTPS endpoints in the Meta App Dashboard, TikTok Developer Portal, or external webhook senders.</p></div>
        <div className="divide-y divide-zinc-100">{[...oauthCallbackRows, ...webhookRows].map(([label, url]) => { const isCopied = copiedKey === label; return <div key={label} className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-xs font-medium text-zinc-800">{label}</div><code className="mt-0.5 block break-all font-mono text-[11px] text-zinc-500">{url}</code></div><button type="button" onClick={() => void copy(label, url)} className="button-secondary button-sm shrink-0" aria-label={`Copy ${label}`}>{isCopied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}<span>{isCopied ? 'Copied' : 'Copy'}</span></button></div>; })}</div>
      </section>

      <BaileysWhatsAppConnect isOpen={whatsappDrawerOpen} onClose={() => setWhatsappDrawerOpen(false)} onChanged={load} />

      {setupProvider && (
        <AppOverlayPortal>
          <div className="fixed inset-0 z-[80] flex justify-end bg-zinc-950/20 backdrop-blur-xs" role="dialog" aria-modal="true" aria-labelledby="connection-setup-title" onClick={(e) => { if (e.target === e.currentTarget) setSetupProviderId(null); }}>
            <div className="h-dvh w-full max-w-[460px] overflow-y-auto border-l border-zinc-200 bg-white shadow-xl">
              <div className="flex items-start justify-between gap-3 border-b border-zinc-200 p-4">
                <div><p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Setup required</p><h2 id="connection-setup-title" className="text-base font-semibold text-zinc-950">{setupProvider.name}</h2><p className="mt-1 text-xs leading-5 text-zinc-500">Add these server-side values to `.env.local`, restart Next.js, then return here to connect.</p></div>
                <button type="button" onClick={() => setSetupProviderId(null)} className="button-ghost button-sm px-2 text-zinc-400 hover:text-zinc-600" aria-label="Close setup instructions"><X className="h-4 w-4" /></button>
              </div>
              <div className="space-y-5 p-4">
                <section><h3 className="text-xs font-semibold text-zinc-800">Missing environment variables</h3><div className="mt-2 divide-y divide-zinc-100 rounded-md border border-zinc-200">{setupProvider.setup.missing.length > 0 ? setupProvider.setup.missing.map((key) => <div key={key} className="flex items-center justify-between gap-3 px-3 py-2"><code className="break-all font-mono text-[11px] text-zinc-700">{key}</code><span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Missing</span></div>) : <div className="px-3 py-2 text-xs text-zinc-500">All required variables are present.</div>}</div></section>
                <section><h3 className="text-xs font-semibold text-zinc-800">Required server variables</h3><div className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 p-3">{setupProvider.setup.required.map((key) => <code key={key} className="mb-1 block font-mono text-[11px] text-zinc-700">{key}=</code>)}</div></section>
                <section><h3 className="text-xs font-semibold text-zinc-800">{setupProvider.connectMode === 'meta_oauth' ? 'Meta developer portal URLs' : 'TikTok developer portal URLs'}</h3><div className="mt-2 divide-y divide-zinc-100 rounded-md border border-zinc-200">{(setupProvider.connectMode === 'meta_oauth' ? [[`${setupProvider.shortName} OAuth callback`, setupUrls?.metaOauthCallbacks[setupProvider.id as 'facebook' | 'instagram' | 'whatsapp'] || `${appOrigin}/api/integrations/oauth/${setupProvider.id}/callback`], ['Meta webhook callback', metaWebhook]] : [['TikTok OAuth callback', setupUrls?.tiktokOauthCallback || `${appOrigin}/api/integrations/oauth/tiktok/callback`], ['TikTok webhook callback', tiktokWebhook]]).map(([label, url]) => <div key={label} className="px-3 py-2"><div className="flex items-center justify-between gap-3"><span className="text-[11px] font-medium text-zinc-600">{label}</span><button type="button" onClick={() => void copy(label, url)} className="button-ghost button-sm px-2" aria-label={`Copy ${label}`}>{copiedKey === label ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}</button></div><code className="mt-1 block break-all font-mono text-[11px] text-zinc-500">{url}</code></div>)}</div></section>
              </div>
            </div>
          </div>
        </AppOverlayPortal>
      )}
    </div>
  );
}
