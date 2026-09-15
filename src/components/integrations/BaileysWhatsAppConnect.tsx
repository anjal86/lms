'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Link2,
  Loader2,
  Plus,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Unplug,
  Users,
  WifiOff,
  X,
} from 'lucide-react';

type BridgeStatus = {
  instanceId?: string;
  status?: string;
  connected?: boolean;
  phone?: string | null;
  qrDataUrl?: string | null;
  lastError?: string | null;
};

type Connection = {
  id: string;
  display_name?: string | null;
  status: 'disconnected' | 'pending' | 'connected' | 'needs_attention' | 'paused';
  external_account_id?: string | null;
  last_error?: string | null;
  visibility_scope?: 'personal' | 'workspace';
  can_manage?: boolean;
  is_owner?: boolean;
  bridge?: BridgeStatus | null;
};

type Props = {
  connection?: Connection | null;
  onChanged: () => void | Promise<void>;
};

type UiState = 'connected' | 'awaiting_scan' | 'connecting' | 'attention' | 'disconnected';

function stateFor(connection: Connection): UiState {
  if (connection.bridge?.connected === true || connection.status === 'connected') return 'connected';
  if (connection.bridge?.status === 'qr') return 'awaiting_scan';
  if (connection.bridge?.status === 'connecting' || connection.status === 'pending') return 'connecting';
  if (connection.bridge?.status === 'error' || connection.status === 'needs_attention') return 'attention';
  return 'disconnected';
}

function statusLabel(state: UiState) {
  if (state === 'connected') return 'Connected';
  if (state === 'awaiting_scan') return 'Scan QR';
  if (state === 'connecting') return 'Connecting';
  if (state === 'attention') return 'Needs attention';
  return 'Disconnected';
}

function statusClass(state: UiState) {
  if (state === 'connected') return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  if (state === 'awaiting_scan' || state === 'connecting') return 'bg-amber-50 text-amber-700 ring-amber-200';
  if (state === 'attention') return 'bg-rose-50 text-rose-700 ring-rose-200';
  return 'bg-zinc-100 text-zinc-600 ring-zinc-200';
}

export default function BaileysWhatsAppConnect({ connection, onChanged }: Props) {
  const [connections, setConnections] = useState<Connection[]>(connection ? [connection] : []);
  const [selectedId, setSelectedId] = useState<string | null>(connection?.id || null);
  const [displayName, setDisplayName] = useState('My WhatsApp');
  const [visibilityScope, setVisibilityScope] = useState<'personal' | 'workspace'>('personal');
  const [canCreateShared, setCanCreateShared] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [confirmDisconnectId, setConfirmDisconnectId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    try {
      const response = await fetch('/api/integrations/whatsapp/baileys', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to load WhatsApp accounts.');
      const next = Array.isArray(payload.connections) ? payload.connections as Connection[] : [];
      setConnections(next);
      setCanCreateShared(Boolean(payload.permissions?.can_create_shared));
      setSelectedId((current) => current && next.some((item) => item.id === current) ? current : next[0]?.id || null);
      setError(null);
    } catch (pollError) {
      setError(pollError instanceof Error ? pollError.message : 'Unable to load WhatsApp accounts.');
    } finally {
      if (!quiet) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const hasPending = useMemo(() => connections.some((item) => {
    const state = stateFor(item);
    return state === 'awaiting_scan' || state === 'connecting';
  }), [connections]);

  useEffect(() => {
    if (!hasPending) return;
    const timer = window.setInterval(() => void refresh(true), 2500);
    return () => window.clearInterval(timer);
  }, [hasPending, refresh]);

  const selected = connections.find((item) => item.id === selectedId) || null;
  const selectedState = selected ? stateFor(selected) : null;
  const connectedCount = connections.filter((item) => stateFor(item) === 'connected').length;

  const createConnection = async () => {
    setCreating(true);
    setError(null);
    try {
      const response = await fetch('/api/integrations/whatsapp/baileys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim() || 'My WhatsApp',
          visibilityScope,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to start WhatsApp setup.');
      const created = payload.connection as Connection | undefined;
      if (created?.id) setSelectedId(created.id);
      setDisplayName('My WhatsApp');
      setVisibilityScope('personal');
      setAddOpen(false);
      await refresh(true);
      await onChanged();
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : 'Unable to start WhatsApp setup.');
    } finally {
      setCreating(false);
    }
  };

  const reconnect = async (connectionId: string) => {
    setBusyId(connectionId);
    setConfirmDisconnectId(null);
    setError(null);
    try {
      const response = await fetch('/api/integrations/whatsapp/baileys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to reconnect WhatsApp.');
      setSelectedId(connectionId);
      await refresh(true);
      await onChanged();
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : 'Unable to reconnect WhatsApp.');
    } finally {
      setBusyId(null);
    }
  };

  const disconnect = async (connectionId: string) => {
    setBusyId(connectionId);
    setError(null);
    try {
      const response = await fetch(`/api/integrations/whatsapp/baileys?id=${encodeURIComponent(connectionId)}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to disconnect WhatsApp.');
      setConfirmDisconnectId(null);
      await refresh(true);
      await onChanged();
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : 'Unable to disconnect WhatsApp.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-zinc-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <Smartphone className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-zinc-950">WhatsApp accounts</div>
              <div className="mt-0.5 text-[11px] text-zinc-500">
                {connections.length === 0 ? 'No accounts connected' : `${connectedCount} of ${connections.length} connected`}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing}
            className="button-secondary button-sm"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => {
              setAddOpen(true);
              setConfirmDisconnectId(null);
            }}
            className="button-primary button-sm"
          >
            <Plus className="h-3.5 w-3.5" />
            Add account
          </button>
        </div>
      </div>

      {error && (
        <div className="border-b border-rose-100 bg-rose-50 px-4 py-2.5 text-[11px] text-rose-700">
          {error}
        </div>
      )}

      <div className="grid min-h-[360px] md:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="border-b border-zinc-200 bg-zinc-50/70 p-2 md:border-b-0 md:border-r">
          <div className="px-2 pb-2 pt-1 text-[10px] font-bold uppercase tracking-wide text-zinc-400">Accounts</div>

          <div className="space-y-1">
            {connections.map((item) => {
              const state = stateFor(item);
              const phone = item.bridge?.phone || item.external_account_id || null;
              const active = item.id === selectedId && !addOpen;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(item.id);
                    setAddOpen(false);
                    setConfirmDisconnectId(null);
                  }}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${active ? 'border-zinc-300 bg-white' : 'border-transparent hover:bg-white'}`}
                >
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${state === 'connected' ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-200 text-zinc-600'}`}>
                    <Smartphone className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-zinc-900">{item.display_name || 'WhatsApp'}</div>
                    <div className="mt-0.5 truncate text-[10px] text-zinc-500">{phone ? `+${phone}` : statusLabel(state)}</div>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                </button>
              );
            })}

            {connections.length === 0 && (
              <div className="rounded-lg border border-dashed border-zinc-200 bg-white px-3 py-5 text-center text-[11px] text-zinc-500">
                Your WhatsApp accounts will appear here.
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setAddOpen(true);
              setConfirmDisconnectId(null);
            }}
            className={`mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold ${addOpen ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-white hover:text-zinc-900'}`}
          >
            <Plus className="h-3.5 w-3.5" />
            Connect another account
          </button>
        </aside>

        <section className="min-w-0 p-4 sm:p-5">
          {addOpen ? (
            <div className="mx-auto max-w-lg">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-base font-semibold text-zinc-950">Connect a WhatsApp account</div>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">
                    Create the account first, then scan one QR code from WhatsApp on your phone.
                  </p>
                </div>
                <button type="button" onClick={() => setAddOpen(false)} className="button-ghost button-sm" aria-label="Close add account form">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <label htmlFor="whatsapp-account-name" className="text-[11px] font-semibold text-zinc-700">Account name</label>
                  <input
                    id="whatsapp-account-name"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    className="field mt-1.5 h-10 text-sm"
                    maxLength={120}
                    placeholder="e.g. Anjal WhatsApp"
                    autoFocus
                  />
                  <p className="mt-1.5 text-[10px] text-zinc-500">Use a name staff can recognize in the Inbox.</p>
                </div>

                <div>
                  <div className="text-[11px] font-semibold text-zinc-700">Who can use this account?</div>
                  <div className={`mt-1.5 grid gap-2 ${canCreateShared ? 'sm:grid-cols-2' : ''}`}>
                    <button
                      type="button"
                      onClick={() => setVisibilityScope('personal')}
                      className={`rounded-lg border p-3 text-left ${visibilityScope === 'personal' ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-200 hover:border-zinc-300'}`}
                    >
                      <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900">
                        <ShieldCheck className="h-4 w-4" /> Personal
                      </div>
                      <p className="mt-1 text-[10px] leading-4 text-zinc-500">You and managers can access its conversations.</p>
                    </button>

                    {canCreateShared && (
                      <button
                        type="button"
                        onClick={() => setVisibilityScope('workspace')}
                        className={`rounded-lg border p-3 text-left ${visibilityScope === 'workspace' ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-200 hover:border-zinc-300'}`}
                      >
                        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900">
                          <Users className="h-4 w-4" /> Shared with team
                        </div>
                        <p className="mt-1 text-[10px] leading-4 text-zinc-500">Workspace staff with Inbox access can use it.</p>
                      </button>
                    )}
                  </div>
                </div>

                <div className="rounded-lg bg-zinc-50 px-3 py-3 text-[10px] leading-4 text-zinc-500">
                  On your phone: open WhatsApp → Linked devices → Link a device. Keep the phone signed in after pairing.
                </div>

                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setAddOpen(false)} className="button-secondary" disabled={creating}>Cancel</button>
                  <button type="button" onClick={() => void createConnection()} className="button-primary" disabled={creating || displayName.trim().length < 2}>
                    {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                    Create & show QR
                  </button>
                </div>
              </div>
            </div>
          ) : selected ? (
            <div className="mx-auto max-w-2xl">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${selectedState === 'connected' ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-600'}`}>
                    <Smartphone className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold text-zinc-950">{selected.display_name || 'WhatsApp'}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {selectedState && (
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${statusClass(selectedState)}`}>
                          {statusLabel(selectedState)}
                        </span>
                      )}
                      <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600">
                        {selected.visibility_scope === 'workspace' ? 'Shared' : selected.is_owner ? 'Mine' : 'Personal'}
                      </span>
                    </div>
                  </div>
                </div>

                <button type="button" onClick={() => void refresh()} className="button-ghost button-sm self-start" disabled={refreshing}>
                  <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                  Refresh status
                </button>
              </div>

              {(selected.bridge?.phone || selected.external_account_id) && (
                <div className="mt-5 rounded-lg border border-zinc-200 px-3 py-3">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">Connected number</div>
                  <div className="mt-1 font-mono text-sm font-semibold text-zinc-900">+{selected.bridge?.phone || selected.external_account_id}</div>
                </div>
              )}

              {selectedState === 'connected' && (
                <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                    <div>
                      <div className="text-sm font-semibold text-emerald-950">Connected and ready</div>
                      <p className="mt-1 text-xs leading-5 text-emerald-800/80">New WhatsApp messages will sync into the Inbox automatically.</p>
                    </div>
                  </div>
                </div>
              )}

              {selectedState === 'awaiting_scan' && selected.bridge?.qrDataUrl && selected.can_manage !== false && (
                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/50 p-4 sm:p-5">
                  <div className="text-sm font-semibold text-zinc-950">Scan this QR code</div>
                  <p className="mt-1 text-xs leading-5 text-zinc-600">Use the WhatsApp account you want connected to this CRM profile.</p>

                  <div className="mt-4 grid gap-5 sm:grid-cols-[220px_minmax(0,1fr)] sm:items-center">
                    <div className="rounded-xl border border-zinc-200 bg-white p-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={selected.bridge.qrDataUrl} alt={`QR code for ${selected.display_name || 'WhatsApp'}`} className="aspect-square w-full" />
                    </div>
                    <ol className="space-y-3 text-xs text-zinc-700">
                      <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-[10px] font-bold text-white">1</span><span className="pt-1">Open WhatsApp on your phone.</span></li>
                      <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-[10px] font-bold text-white">2</span><span className="pt-1">Open <strong>Linked devices</strong> and choose <strong>Link a device</strong>.</span></li>
                      <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-[10px] font-bold text-white">3</span><span className="pt-1">Scan the code. This screen will update automatically.</span></li>
                    </ol>
                  </div>

                  <div className="mt-4 flex items-center gap-2 text-[11px] text-amber-800">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting for WhatsApp to connect…
                  </div>
                </div>
              )}

              {selectedState === 'connecting' && (
                <div className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin text-zinc-600" />
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">Preparing WhatsApp connection</div>
                      <p className="mt-1 text-xs text-zinc-500">The QR code should appear here automatically.</p>
                    </div>
                  </div>
                </div>
              )}

              {selectedState === 'attention' && (
                <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4">
                  <div className="flex items-start gap-3">
                    <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" />
                    <div>
                      <div className="text-sm font-semibold text-rose-900">WhatsApp needs to reconnect</div>
                      <p className="mt-1 text-xs leading-5 text-rose-700">{selected.bridge?.lastError || selected.last_error || 'The linked device is not currently available.'}</p>
                    </div>
                  </div>
                </div>
              )}

              {selectedState === 'disconnected' && (
                <div className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="flex items-start gap-3">
                    <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-zinc-500" />
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">This account is disconnected</div>
                      <p className="mt-1 text-xs leading-5 text-zinc-500">Existing CRM history stays available. Reconnect to receive and send new WhatsApp messages.</p>
                    </div>
                  </div>
                </div>
              )}

              {confirmDisconnectId === selected.id ? (
                <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4">
                  <div className="text-sm font-semibold text-rose-900">Disconnect this WhatsApp account?</div>
                  <p className="mt-1 text-xs leading-5 text-rose-700">Messages already stored in the CRM will stay. New WhatsApp messages will stop syncing until you reconnect.</p>
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <button type="button" onClick={() => setConfirmDisconnectId(null)} className="button-secondary button-sm" disabled={busyId === selected.id}>Cancel</button>
                    <button type="button" onClick={() => void disconnect(selected.id)} className="button-primary button-sm bg-rose-600 hover:bg-rose-700" disabled={busyId === selected.id}>
                      {busyId === selected.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />}
                      Disconnect
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-4">
                  <div className="text-[10px] leading-4 text-zinc-400">Linked-device connection · keep the phone signed in</div>
                  {selected.can_manage !== false && (
                    <div className="flex flex-wrap gap-2">
                      {selectedState !== 'connected' && (
                        <button type="button" className="button-primary button-sm" onClick={() => void reconnect(selected.id)} disabled={busyId === selected.id}>
                          {busyId === selected.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                          {selectedState === 'awaiting_scan' ? 'Generate new QR' : 'Reconnect'}
                        </button>
                      )}
                      {selectedState === 'connected' && (
                        <button type="button" className="button-ghost button-sm text-rose-600" onClick={() => setConfirmDisconnectId(selected.id)}>
                          <Unplug className="h-3.5 w-3.5" />
                          Disconnect
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex min-h-[320px] items-center justify-center">
              <div className="max-w-sm text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                  <QrCode className="h-6 w-6" />
                </div>
                <div className="mt-4 text-base font-semibold text-zinc-950">Connect your first WhatsApp account</div>
                <p className="mt-2 text-xs leading-5 text-zinc-500">Pair a WhatsApp Business account with one QR scan. It will then appear in your CRM Inbox.</p>
                <button type="button" onClick={() => setAddOpen(true)} className="button-primary mt-4">
                  <Plus className="h-4 w-4" />
                  Connect WhatsApp
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="border-t border-zinc-100 px-4 py-2.5 text-[10px] leading-4 text-zinc-400">
        WhatsApp linked-device access uses an unofficial protocol. Prefer dedicated business numbers and keep each paired phone logged in.
      </div>
    </div>
  );
}
