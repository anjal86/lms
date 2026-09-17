'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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
  Inbox,
  Instagram,
  Link2,
  Loader2,
  Mail,
  MessageCircle,
  Plus,
  PlugZap,
  QrCode,
  RefreshCw,
  Send,
  Settings2,
  ShieldAlert,
  Trash2,
  Unplug,
  X,
} from 'lucide-react';
import AuthorizationProfiles from '@/components/integrations/AuthorizationProfiles';
import BaileysWhatsAppConnect from '@/components/integrations/BaileysWhatsAppConnect';
import AppOverlayPortal from '@/components/layout/AppOverlayPortal';
import { useApp } from '@/lib/store';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';

type ProviderId = 'facebook' | 'instagram' | 'whatsapp' | 'tiktok' | 'email' | 'website' | 'api';

type CatalogItem = {
  id: ProviderId;
  name: string;
  shortName: string;
  description: string;
  group: string;
  capabilities: string[];
  connectMode: 'meta_oauth' | 'tiktok_oauth' | 'manual';
  configured: boolean;
  setup: { configured: boolean; required: string[]; missing: string[] };
};

type Connection = {
  id: string;
  workspace_id?: string | null;
  provider: ProviderId;
  display_name: string;
  external_account_id?: string | null;
  status: 'disconnected' | 'pending' | 'connected' | 'needs_attention' | 'paused' | 'reconnect_required' | 'token_expiring' | 'permission_revoked' | 'webhook_error' | 'disabled';
  capabilities?: string[];
  config?: Record<string, unknown>;
  visibility_scope?: 'personal' | 'workspace';
  connected_by?: string | null;
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
      metaOauthCallbacks: { facebook: string; instagram: string; whatsapp: string };
      tiktokOauthCallback: string;
      metaWebhook: string;
      tiktokWebhook: string;
      leadWebhook: string;
    };
  };
  migrationRequired?: boolean;
  message?: string;
};

const CONNECTIONS_RUNTIME_CACHE = new Map<string, ConnectionsResponse>();
const ICONS = {
  facebook: Facebook,
  instagram: Instagram,
  whatsapp: MessageCircle,
  tiktok: Send,
  email: Mail,
  website: Globe2,
  api: PlugZap,
};

const ACCENTS: Record<ProviderId, string> = {
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
    workspace_missing: 'Your account is not attached to a workspace.',
    facebook_connection_failed: 'Facebook could not be connected. Check permissions and the redirect URL.',
    instagram_connection_failed: 'Instagram could not be connected. Check permissions and the redirect URL.',
    whatsapp_connection_failed: 'WhatsApp could not be connected. Check the Meta business permissions.',
    tiktok_connection_failed: 'TikTok could not be connected. Check authorization and Lead Management access.',
  };
  return messages[code] || 'The channel could not be connected. Try again.';
}

function usesBaileys(connection: Connection) {
  return connection.provider === 'whatsapp' && connection.config?.transport === 'baileys';
}

function statusLabel(status: Connection['status']) {
  if (status === 'connected') return 'Connected';
  if (status === 'pending') return 'Pending';
  if (status === 'paused') return 'Paused';
  if (status === 'token_expiring') return 'Token expiring';
  if (status === 'reconnect_required') return 'Reconnect';
  if (status === 'permission_revoked') return 'Permission removed';
  if (status === 'webhook_error') return 'Webhook issue';
  if (status === 'needs_attention') return 'Needs attention';
  if (status === 'disabled') return 'Disabled';
  return 'Disconnected';
}

function statusDot(status: Connection['status']) {
  if (status === 'connected') return 'bg-emerald-500';
  if (status === 'pending') return 'bg-blue-500';
  if (status === 'paused') return 'bg-amber-500';
  if (['needs_attention', 'token_expiring', 'reconnect_required', 'permission_revoked', 'webhook_error'].includes(status)) return 'bg-orange-500';
  return 'bg-zinc-300';
}

export default function ConnectionsPage() {
  const params = useSearchParams();
  const { currentUser } = useApp();
  const { config } = useWorkspace();
  const connectedProvider = params.get('connected');
  const runtimeCacheKey = `${currentUser.id}::${config.workspace.id}`;
  const initialSnapshot = CONNECTIONS_RUNTIME_CACHE.get(runtimeCacheKey);
  const [data, setData] = useState<ConnectionsResponse>(() => initialSnapshot || { connections: [], catalog: [] });
  const [loading, setLoading] = useState(() => !initialSnapshot);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(friendlyError(params.get('error')));
  const [notice, setNotice] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [whatsappDrawerOpen, setWhatsappDrawerOpen] = useState(false);
  const [setupProviderId, setSetupProviderId] = useState<ProviderId | null>(() => {
    const setup = params.get('setup');
    return ['facebook', 'instagram', 'whatsapp', 'tiktok', 'email', 'website', 'api'].includes(setup || '')
      ? setup as ProviderId
      : null;
  });
  const [manualProviderId, setManualProviderId] = useState<ProviderId | null>(null);
  const [manualName, setManualName] = useState('');
  const [manualExternalId, setManualExternalId] = useState('');
  const [pendingDeleteConnection, setPendingDeleteConnection] = useState<Connection | null>(null);
  const canManage = currentUser.role === 'admin' || currentUser.role === 'manager';

  const load = useCallback(async (options?: { force?: boolean; quiet?: boolean }) => {
    const force = options?.force === true;
    const quiet = options?.quiet === true;
    if (!quiet) setLoading(true);
    try {
      const response = await fetch(`/api/integrations/connections${force ? '?refresh=1' : ''}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to load connections.');
      const nextData = payload as ConnectionsResponse;
      setData(nextData);
      CONNECTIONS_RUNTIME_CACHE.set(runtimeCacheKey, nextData);
      setError(friendlyError(params.get('error')));
    } catch (loadError) {
      if (!quiet || !CONNECTIONS_RUNTIME_CACHE.has(runtimeCacheKey)) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load connections.');
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [params, runtimeCacheKey]);

  useEffect(() => {
    document.title = 'Connections — CRM';
    const hasSnapshot = CONNECTIONS_RUNTIME_CACHE.has(runtimeCacheKey);
    const timer = window.setTimeout(() => void load({ force: Boolean(connectedProvider), quiet: hasSnapshot }), 0);
    return () => window.clearTimeout(timer);
  }, [connectedProvider, load, runtimeCacheKey]);

  useEffect(() => {
    const openWhatsApp = params.get('whatsapp') === 'open';
    const setup = params.get('setup');
    const validSetup = ['facebook', 'instagram', 'whatsapp', 'tiktok', 'email', 'website', 'api'].includes(setup || '')
      ? setup as ProviderId
      : null;
    if (!openWhatsApp && !validSetup) return;

    const timer = window.setTimeout(() => {
      if (openWhatsApp) setWhatsappDrawerOpen(true);
      if (validSetup) setSetupProviderId(validSetup);
      const url = new URL(window.location.href);
      url.searchParams.delete('whatsapp');
      url.searchParams.delete('setup');
      const nextSearch = url.searchParams.toString();
      window.history.replaceState(window.history.state, '', `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash}`);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [params]);

  const byProvider = useMemo(() => {
    const map = new Map<ProviderId, Connection[]>();
    for (const connection of data.connections) {
      const list = map.get(connection.provider) || [];
      list.push(connection);
      map.set(connection.provider, list);
    }
    return map;
  }, [data.connections]);

  const setupProvider = useMemo(
    () => setupProviderId ? data.catalog.find((item) => item.id === setupProviderId) || null : null,
    [data.catalog, setupProviderId]
  );
  const manualProvider = useMemo(
    () => manualProviderId ? data.catalog.find((item) => item.id === manualProviderId) || null : null,
    [data.catalog, manualProviderId]
  );

  const appOrigin = data.setup?.baseUrl || (typeof window === 'undefined' ? '' : window.location.origin);
  const setupUrls = data.setup?.urls;
  const metaWebhook = setupUrls?.metaWebhook || `${appOrigin}/api/integrations/webhooks/meta`;
  const tiktokWebhook = setupUrls?.tiktokWebhook || `${appOrigin}/api/integrations/webhooks/tiktok`;
  const leadWebhook = setupUrls?.leadWebhook || `${appOrigin}/api/leads/webhook`;

  const openManual = (provider: CatalogItem) => {
    setManualProviderId(provider.id);
    setManualName(provider.id === 'email' ? 'Shared Inbox' : provider.id === 'website' ? 'Website' : 'Custom API');
    setManualExternalId(provider.id === 'website' ? appOrigin : '');
  };

  const connectManual = async () => {
    if (!manualProvider || !manualName.trim()) return;
    setBusy(`manual:${manualProvider.id}`);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/integrations/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: manualProvider.id,
          display_name: manualName.trim(),
          external_account_id: manualExternalId.trim() || undefined,
          config: manualProvider.id === 'website' || manualProvider.id === 'api'
            ? { webhook_url: leadWebhook }
            : {},
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to add this source.');
      setManualProviderId(null);
      setManualName('');
      setManualExternalId('');
      await load({ force: true, quiet: true });
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unable to add this source.');
    } finally {
      setBusy(null);
    }
  };

  const updateConnection = async (connection: Connection, action: 'pause' | 'resume' | 'disconnect' | 'sync') => {
    setBusy(connection.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/integrations/connections', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: connection.id, action }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to update this account.');
      if (action === 'sync') {
        const history = payload.historySync || {};
        const conversations = Number(history.conversationsDiscovered || 0);
        const messages = Number(history.messagesInserted || 0);
        const warningCount = Array.isArray(history.errors) ? history.errors.length : 0;
        setNotice(
          warningCount
            ? `History sync completed with ${warningCount} warning${warningCount === 1 ? '' : 's'}. ${conversations} conversations and ${messages} message previews added.`
            : `History sync complete. ${conversations} conversations and ${messages} message previews added.`
        );
      }
      await load({ force: true, quiet: true });
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unable to update this account.');
    } finally {
      setBusy(null);
    }
  };

  const deleteConnection = async () => {
    if (!pendingDeleteConnection) return;
    const target = pendingDeleteConnection;
    setBusy(target.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/integrations/connections', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: target.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to delete this connection.');
      setPendingDeleteConnection(null);
      await load({ force: true, quiet: true });
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unable to delete this connection.');
    } finally {
      setBusy(null);
    }
  };

  const copy = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 1600);
  };

  const providerConnectAction = (provider: CatalogItem, compact = false) => {
    if (provider.id === 'whatsapp') {
      return (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setWhatsappDrawerOpen(true)} className={compact ? 'button-secondary button-sm' : 'button-primary button-sm'}>
            <QrCode className="h-3.5 w-3.5" /> Linked device
          </button>
          {provider.configured ? (
            <a href="/api/integrations/oauth/whatsapp/start" className="button-secondary button-sm">
              <ExternalLink className="h-3.5 w-3.5" /> Official API
            </a>
          ) : (
            <button type="button" onClick={() => setSetupProviderId('whatsapp')} className="button-secondary button-sm">
              <Settings2 className="h-3.5 w-3.5" /> Official API
            </button>
          )}
        </div>
      );
    }

    if (provider.connectMode === 'manual') {
      return <button type="button" onClick={() => openManual(provider)} className="button-secondary button-sm"><Plus className="h-3.5 w-3.5" /> Add source</button>;
    }

    if (!provider.configured) {
      return <button type="button" onClick={() => setSetupProviderId(provider.id)} className="button-secondary button-sm"><Settings2 className="h-3.5 w-3.5" /> Configure</button>;
    }

    return <a href={`/api/integrations/oauth/${provider.id}/start`} className="button-secondary button-sm"><Plus className="h-3.5 w-3.5" /> Add account</a>;
  };

  const developerRows = [
    ['Facebook OAuth', setupUrls?.metaOauthCallbacks.facebook || `${appOrigin}/api/integrations/oauth/facebook/callback`],
    ['Instagram OAuth', setupUrls?.metaOauthCallbacks.instagram || `${appOrigin}/api/integrations/oauth/instagram/callback`],
    ['WhatsApp OAuth', setupUrls?.metaOauthCallbacks.whatsapp || `${appOrigin}/api/integrations/oauth/whatsapp/callback`],
    ['TikTok OAuth', setupUrls?.tiktokOauthCallback || `${appOrigin}/api/integrations/oauth/tiktok/callback`],
    ['Meta webhook', metaWebhook],
    ['TikTok webhook', tiktokWebhook],
    ['Website / API webhook', leadWebhook],
  ];

  if (!canManage) {
    return (
      <div className="empty-state surface-flat">
        <PlugZap className="h-6 w-6 text-violet-500" />
        <h1 className="empty-state-title mt-3">Connections are managed by your team lead</h1>
        <p className="empty-state-description">You can use the channel accounts available to you from the Inbox.</p>
      </div>
    );
  }

  return (
    <div className="app-page space-y-5">
      <header className="flex flex-col gap-3 border-b border-zinc-200/80 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Omnichannel</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">Connections</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-500">One workspace for every customer channel. Each Page, number, advertiser, inbox, or source is kept as its own account.</p>
        </div>
        <button type="button" onClick={() => void load({ force: true })} className="button-secondary button-sm self-start sm:self-auto" disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
        </button>
      </header>

      {connectedProvider && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-800">
          <CheckCircle2 className="h-4 w-4" /> {connectedProvider[0]?.toUpperCase()}{connectedProvider.slice(1)} accounts updated.
        </div>
      )}

      {notice && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> {notice}
        </div>
      )}

      {(error || data.migrationRequired) && (
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-900"><AlertCircle className="h-4 w-4" /> Setup needs attention</div>
          <p className="mt-1 text-xs leading-5 text-amber-800">{error || data.message}</p>
          {data.migrationRequired && <code className="mt-2 inline-block rounded bg-white/70 px-2 py-1 text-[11px]">npm run db:migrate:local</code>}
        </div>
      )}

      <AuthorizationProfiles onChanged={() => void load({ force: true, quiet: true })} />

      <section className="grid gap-3 lg:grid-cols-2">
        {data.catalog.map((provider) => {
          const Icon = ICONS[provider.id];
          const accounts = byProvider.get(provider.id) || [];
          const connectedCount = accounts.filter((item) => item.status === 'connected').length;

          return (
            <article key={provider.id} className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
              <div className="flex items-start justify-between gap-3 p-4">
                <div className="flex min-w-0 gap-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${ACCENTS[provider.id]}`}><Icon className="h-4.5 w-4.5" /></span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold text-zinc-950">{provider.shortName}</h2>{accounts.length > 0 && <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-600">{connectedCount}/{accounts.length} active</span>}</div>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">{provider.description}</p>
                  </div>
                </div>
                <div className="shrink-0">{providerConnectAction(provider, accounts.length > 0)}</div>
              </div>

              <div className="border-t border-zinc-100">
                {loading && accounts.length === 0 ? (
                  <div className="flex h-16 items-center justify-center text-xs text-zinc-400"><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Loading accounts…</div>
                ) : accounts.length === 0 ? (
                  <div className="px-4 py-5 text-center text-xs text-zinc-400">No account connected yet.</div>
                ) : (
                  <div className="divide-y divide-zinc-100">
                    {accounts.map((connection) => {
                      const linkedDevice = usesBaileys(connection);
                      const actionBusy = busy === connection.id;
                      const canSyncMetaHistory = !linkedDevice
                        && ['facebook', 'instagram'].includes(connection.provider)
                        && ['connected', 'paused', 'token_expiring'].includes(connection.status);
                      return (
                        <div key={connection.id} className="flex items-center gap-3 px-4 py-3">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot(connection.status)}`} />
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-2">
                              <div className="truncate text-xs font-semibold text-zinc-900">{connection.display_name}</div>
                              {connection.visibility_scope === 'personal' && <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] font-semibold text-zinc-500">Personal</span>}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-zinc-500">
                              <span>{statusLabel(connection.status)}</span>
                              {connection.external_account_id && <span className="max-w-52 truncate font-mono">{connection.external_account_id}</span>}
                              {connection.last_sync_at && <span>Last sync {new Date(connection.last_sync_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
                              {connection.last_event_at && <span>Last event {new Date(connection.last_event_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
                            </div>
                            {connection.last_error && <div className="mt-1 truncate text-[10px] text-red-600">{connection.last_error}</div>}
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <Link href={`/inbox?provider=${provider.id}&accountProvider=${provider.id}&accountId=${connection.id}`} className="button-ghost button-sm" title="Open this account in Inbox"><Inbox className="h-3.5 w-3.5" /></Link>
                            {canSyncMetaHistory && (
                              <button
                                type="button"
                                onClick={() => void updateConnection(connection, 'sync')}
                                disabled={actionBusy}
                                className="button-ghost button-sm"
                                title="Sync conversation history now"
                                aria-label={`Sync ${connection.display_name} history`}
                              >
                                {actionBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                              </button>
                            )}
                            {linkedDevice ? (
                              <button type="button" onClick={() => setWhatsappDrawerOpen(true)} className="button-secondary button-sm">Manage</button>
                            ) : connection.status === 'connected' ? (
                              <button type="button" onClick={() => void updateConnection(connection, 'pause')} disabled={actionBusy} className="button-ghost button-sm" title="Pause"><CirclePause className="h-3.5 w-3.5" /></button>
                            ) : connection.status === 'paused' ? (
                              <button type="button" onClick={() => void updateConnection(connection, 'resume')} disabled={actionBusy} className="button-secondary button-sm">Resume</button>
                            ) : null}
                            {!linkedDevice && connection.status !== 'disconnected' && (
                              <button type="button" onClick={() => void updateConnection(connection, 'disconnect')} disabled={actionBusy} className="button-ghost button-sm text-zinc-500 hover:text-red-600" title="Disconnect" aria-label={`Disconnect ${connection.display_name}`}>
                                {actionBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />}
                              </button>
                            )}
                            {!linkedDevice && (
                              <button
                                type="button"
                                onClick={() => setPendingDeleteConnection(connection)}
                                disabled={actionBusy}
                                className="button-ghost button-sm text-zinc-400 hover:text-red-600 hover:bg-red-50"
                                title="Delete connection"
                                aria-label={`Delete ${connection.display_name}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </section>

      <details className="rounded-xl border border-zinc-200 bg-white">
        <summary className="cursor-pointer px-4 py-3 text-xs font-semibold text-zinc-700">Developer callbacks &amp; webhooks</summary>
        <div className="divide-y divide-zinc-100 border-t border-zinc-100">
          {developerRows.map(([labelText, url]) => (
            <div key={labelText} className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0"><div className="text-xs font-medium text-zinc-800">{labelText}</div><code className="mt-0.5 block break-all font-mono text-[10px] text-zinc-500">{url}</code></div>
              <button type="button" onClick={() => void copy(labelText, url)} className="button-secondary button-sm shrink-0">{copiedKey === labelText ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />} {copiedKey === labelText ? 'Copied' : 'Copy'}</button>
            </div>
          ))}
        </div>
      </details>

      <BaileysWhatsAppConnect isOpen={whatsappDrawerOpen} onClose={() => setWhatsappDrawerOpen(false)} onChanged={() => void load({ force: true, quiet: true })} />

      {manualProvider && (
        <AppOverlayPortal>
          <div className="fixed inset-0 z-[80] flex justify-end bg-zinc-950/20" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) setManualProviderId(null); }}>
            <div className="h-dvh w-full max-w-[420px] bg-white shadow-xl">
              <div className="flex items-start justify-between border-b border-zinc-200 p-4"><div><div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Add source</div><h2 className="mt-1 text-base font-semibold">{manualProvider.name}</h2></div><button type="button" onClick={() => setManualProviderId(null)} className="button-ghost button-sm"><X className="h-4 w-4" /></button></div>
              <div className="space-y-4 p-4">
                <label className="block"><span className="text-xs font-semibold text-zinc-700">Display name</span><input value={manualName} onChange={(e) => setManualName(e.target.value)} className="field mt-1.5" placeholder="e.g. Support inbox" /></label>
                <label className="block"><span className="text-xs font-semibold text-zinc-700">Account / source ID <span className="font-normal text-zinc-400">optional</span></span><input value={manualExternalId} onChange={(e) => setManualExternalId(e.target.value)} className="field mt-1.5" placeholder={manualProvider.id === 'email' ? 'support@example.com' : 'Identifier'} /></label>
                {manualProvider.id === 'email' && <div className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800">This registers the inbox as a CRM source. Email transport must be configured before outbound replies are enabled.</div>}
                {(manualProvider.id === 'website' || manualProvider.id === 'api') && <div className="rounded-lg bg-zinc-50 p-3 text-xs text-zinc-600"><div className="font-semibold">Webhook endpoint</div><code className="mt-1 block break-all text-[10px]">{leadWebhook}</code></div>}
                <button type="button" onClick={() => void connectManual()} disabled={!manualName.trim() || busy === `manual:${manualProvider.id}`} className="button-primary w-full">{busy === `manual:${manualProvider.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Add source</button>
              </div>
            </div>
          </div>
        </AppOverlayPortal>
      )}

      {setupProvider && (
        <AppOverlayPortal>
          <div className="fixed inset-0 z-[80] flex justify-end bg-zinc-950/20" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) setSetupProviderId(null); }}>
            <div className="h-dvh w-full max-w-[460px] overflow-y-auto border-l border-zinc-200 bg-white shadow-xl">
              <div className="flex items-start justify-between gap-3 border-b border-zinc-200 p-4"><div><p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Server setup</p><h2 className="mt-1 text-base font-semibold">{setupProvider.name}</h2><p className="mt-1 text-xs leading-5 text-zinc-500">Configure the provider credentials once; individual accounts are discovered after OAuth.</p></div><button type="button" onClick={() => setSetupProviderId(null)} className="button-ghost button-sm"><X className="h-4 w-4" /></button></div>
              <div className="space-y-5 p-4">
                <section><h3 className="text-xs font-semibold">Required server variables</h3><div className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">{setupProvider.setup.required.map((key) => <div key={key} className="flex items-center justify-between gap-3 py-1"><code className="font-mono text-[10px]">{key}=</code><span className={`text-[10px] font-medium ${setupProvider.setup.missing.includes(key) ? 'text-amber-600' : 'text-emerald-600'}`}>{setupProvider.setup.missing.includes(key) ? 'Missing' : 'Ready'}</span></div>)}</div></section>
                {setupProvider.connectMode !== 'manual' && <section><h3 className="text-xs font-semibold">Provider portal</h3><p className="mt-1 text-xs leading-5 text-zinc-500">Use the callback and webhook URLs from “Developer callbacks & webhooks” on this page, then restart the app after adding environment variables.</p></section>}
                {setupProvider.setup.configured && setupProvider.connectMode !== 'manual' && <a href={`/api/integrations/oauth/${setupProvider.id}/start`} className="button-primary w-full"><ExternalLink className="h-4 w-4" /> Continue to {setupProvider.id === 'tiktok' ? 'TikTok' : 'Meta'}</a>}
              </div>
            </div>
          </div>
        </AppOverlayPortal>
      )}

      {pendingDeleteConnection && (
        <AppOverlayPortal>
          <div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-zinc-950/30 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-connection-title"
            onClick={(event) => { if (event.target === event.currentTarget && !busy) setPendingDeleteConnection(null); }}
          >
            <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white shadow-2xl">
              <div className="flex items-start justify-between gap-3 border-b border-zinc-200 p-4">
                <div className="flex gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600"><Trash2 className="h-4 w-4" /></span>
                  <div>
                    <h2 id="delete-connection-title" className="text-sm font-semibold text-zinc-950">Remove channel connection?</h2>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">{pendingDeleteConnection.display_name}</p>
                  </div>
                </div>
                <button type="button" onClick={() => !busy && setPendingDeleteConnection(null)} className="button-ghost button-sm" aria-label="Close"><X className="h-4 w-4" /></button>
              </div>
              <div className="space-y-3 p-4">
                <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-900">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-medium">Removes this page/channel from your active workspace connections.</p>
                    <p className="mt-1 text-[11px] text-red-700">Any credentials tied specifically to this channel will be erased.</p>
                  </div>
                </div>
                <p className="text-xs leading-5 text-zinc-500">
                  Existing customer contacts, messages, and lead conversation history remain safely stored in your CRM.
                </p>
              </div>
              <div className="flex justify-end gap-2 border-t border-zinc-200 p-4">
                <button type="button" onClick={() => setPendingDeleteConnection(null)} disabled={Boolean(busy)} className="button-secondary">Cancel</button>
                <button type="button" onClick={() => void deleteConnection()} disabled={Boolean(busy)} className="button-primary bg-red-600 hover:bg-red-700">
                  {busy === pendingDeleteConnection.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Remove connection
                </button>
              </div>
            </div>
          </div>
        </AppOverlayPortal>
      )}
    </div>
  );
}
