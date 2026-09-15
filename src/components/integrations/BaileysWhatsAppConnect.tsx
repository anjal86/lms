'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
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
import AppOverlayPortal from '@/components/layout/AppOverlayPortal';

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
  isOpen?: boolean;
  onClose?: () => void;
  onChanged: () => void | Promise<void>;
  connection?: Connection | null;
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
  if (state === 'awaiting_scan') return 'Scan QR code';
  if (state === 'connecting') return 'Connecting';
  if (state === 'attention') return 'Needs attention';
  return 'Disconnected';
}

function statusDot(state: UiState) {
  if (state === 'connected') return 'bg-emerald-500';
  if (state === 'awaiting_scan' || state === 'connecting') return 'bg-amber-500';
  if (state === 'attention') return 'bg-rose-500';
  return 'bg-zinc-300';
}

export default function BaileysWhatsAppConnect({
  isOpen = true,
  onClose,
  onChanged,
  connection,
}: Props) {
  const [connections, setConnections] = useState<Connection[]>(connection ? [connection] : []);
  const [selectedId, setSelectedId] = useState<string | null>(connection?.id || null);
  const [displayName, setDisplayName] = useState('');
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
      const next = Array.isArray(payload.connections) ? (payload.connections as Connection[]) : [];
      setConnections(next);
      setCanCreateShared(Boolean(payload.permissions?.can_create_shared));
      setSelectedId((current) => (current && next.some((item) => item.id === current) ? current : next[0]?.id || null));
      setError(null);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to load WhatsApp accounts.');
    } finally {
      if (!quiet) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) void refresh();
  }, [isOpen, refresh]);

  useEffect(() => {
    if (!isOpen || !onClose) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (confirmDisconnectId) setConfirmDisconnectId(null);
      else if (addOpen) setAddOpen(false);
      else onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [addOpen, confirmDisconnectId, isOpen, onClose]);

  const hasPending = useMemo(
    () => connections.some((item) => ['awaiting_scan', 'connecting'].includes(stateFor(item))),
    [connections]
  );

  useEffect(() => {
    if (!isOpen || !hasPending) return;
    const timer = window.setInterval(() => void refresh(true), 2500);
    return () => window.clearInterval(timer);
  }, [hasPending, isOpen, refresh]);

  const selected = connections.find((item) => item.id === selectedId) || null;
  const selectedState = selected ? stateFor(selected) : null;
  const connectedCount = connections.filter((item) => stateFor(item) === 'connected').length;

  const createConnection = async () => {
    if (displayName.trim().length < 2) return;
    setCreating(true);
    setError(null);
    try {
      const response = await fetch('/api/integrations/whatsapp/baileys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: displayName.trim(), visibilityScope }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to start WhatsApp setup.');
      const created = payload.connection as Connection | undefined;
      if (created?.id) setSelectedId(created.id);
      setDisplayName('');
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
      const response = await fetch(`/api/integrations/whatsapp/baileys?id=${encodeURIComponent(connectionId)}`, {
        method: 'DELETE',
      });
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

  if (!isOpen) return null;

  return (
    <AppOverlayPortal>
      <div
        className="fixed inset-0 z-[80] flex justify-end bg-zinc-950/25"
        role="dialog"
        aria-modal="true"
        aria-labelledby="whatsapp-connection-title"
        onClick={(event) => {
          if (event.target === event.currentTarget && onClose) onClose();
        }}
      >
        <div className="flex h-dvh w-full max-w-3xl flex-col border-l border-zinc-200 bg-white shadow-xl">
          <header className="flex shrink-0 items-center justify-between gap-4 border-b border-zinc-200 px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <h2 id="whatsapp-connection-title" className="text-base font-semibold text-zinc-950">WhatsApp connections</h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                {connections.length === 0
                  ? 'Connect a phone to start syncing messages.'
                  : `${connectedCount} of ${connections.length} ${connections.length === 1 ? 'account' : 'accounts'} connected`}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button type="button" onClick={() => void refresh()} disabled={refreshing} className="button-ghost button-sm px-2" aria-label="Refresh connections" title="Refresh">
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              <button type="button" onClick={() => { setAddOpen(true); setConfirmDisconnectId(null); }} className="button-primary button-sm">
                <Plus className="h-3.5 w-3.5" /> Add account
              </button>
              {onClose && <button type="button" onClick={onClose} className="button-ghost button-sm px-2" aria-label="Close"><X className="h-4 w-4" /></button>}
            </div>
          </header>

          {error && (
            <div className="flex items-center gap-2 border-b border-rose-100 bg-rose-50 px-5 py-2.5 text-xs text-rose-700 sm:px-6">
              <AlertCircle className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1">{error}</span>
              <button type="button" onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700" aria-label="Dismiss error"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}

          <div className="grid min-h-0 flex-1 md:grid-cols-[220px_minmax(0,1fr)]">
            <aside className="min-h-0 border-b border-zinc-200 bg-zinc-50/50 md:border-b-0 md:border-r">
              <div className="flex gap-2 overflow-x-auto p-3 md:block md:h-full md:overflow-y-auto">
                {connections.map((item) => {
                  const state = stateFor(item);
                  const active = item.id === selectedId && !addOpen;
                  const phone = item.bridge?.phone || item.external_account_id;
                  return (
                    <button key={item.id} type="button" onClick={() => { setSelectedId(item.id); setAddOpen(false); setConfirmDisconnectId(null); }} className={`mb-0 flex min-w-[190px] items-center gap-2.5 rounded-lg px-3 py-2.5 text-left md:mb-1 md:w-full md:min-w-0 ${active ? 'bg-white ring-1 ring-zinc-200' : 'hover:bg-white'}`}>
                      <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot(state)}`} />
                      <div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold text-zinc-900">{item.display_name || 'WhatsApp'}</div><div className="mt-0.5 truncate text-[10px] text-zinc-500">{phone ? `+${phone}` : statusLabel(state)}</div></div>
                    </button>
                  );
                })}
                {connections.length === 0 && <div className="p-3 text-xs leading-5 text-zinc-500">No accounts connected yet.</div>}
              </div>
            </aside>

            <main className="min-h-0 overflow-y-auto">
              {addOpen ? (
                <div className="mx-auto max-w-lg px-5 py-6 sm:px-8 sm:py-8">
                  <button type="button" onClick={() => setAddOpen(false)} className="mb-6 inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900"><ArrowLeft className="h-3.5 w-3.5" /> Back</button>
                  <h3 className="text-lg font-semibold text-zinc-950">Connect WhatsApp</h3>
                  <p className="mt-1 text-sm text-zinc-500">Give this account a name. You’ll scan a QR code next.</p>
                  <div className="mt-6">
                    <label htmlFor="whatsapp-account-name" className="text-xs font-semibold text-zinc-700">Account name</label>
                    <input id="whatsapp-account-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && displayName.trim().length >= 2 && !creating) void createConnection(); }} className="field mt-2 h-10 text-sm" maxLength={120} placeholder="e.g. Sales WhatsApp" autoFocus />
                  </div>

                  {canCreateShared && (
                    <div className="mt-6">
                      <div className="text-xs font-semibold text-zinc-700">Access</div>
                      <div className="mt-2 overflow-hidden rounded-lg border border-zinc-200">
                        <button type="button" onClick={() => setVisibilityScope('personal')} className={`flex w-full items-center gap-3 px-3.5 py-3 text-left ${visibilityScope === 'personal' ? 'bg-zinc-50' : 'bg-white hover:bg-zinc-50/70'}`}><ShieldCheck className="h-4 w-4 text-zinc-500" /><div className="min-w-0 flex-1"><div className="text-xs font-semibold text-zinc-900">Personal</div><div className="mt-0.5 text-[11px] text-zinc-500">You and managers</div></div>{visibilityScope === 'personal' && <Check className="h-4 w-4 text-zinc-900" />}</button>
                        <button type="button" onClick={() => setVisibilityScope('workspace')} className={`flex w-full items-center gap-3 border-t border-zinc-200 px-3.5 py-3 text-left ${visibilityScope === 'workspace' ? 'bg-zinc-50' : 'bg-white hover:bg-zinc-50/70'}`}><Users className="h-4 w-4 text-zinc-500" /><div className="min-w-0 flex-1"><div className="text-xs font-semibold text-zinc-900">Shared</div><div className="mt-0.5 text-[11px] text-zinc-500">Available to the team</div></div>{visibilityScope === 'workspace' && <Check className="h-4 w-4 text-zinc-900" />}</button>
                      </div>
                    </div>
                  )}

                  <div className="mt-8 flex justify-end gap-2"><button type="button" onClick={() => setAddOpen(false)} className="button-secondary" disabled={creating}>Cancel</button><button type="button" onClick={() => void createConnection()} className="button-primary" disabled={creating || displayName.trim().length < 2}>{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />} Continue</button></div>
                </div>
              ) : selected ? (
                <div className="mx-auto max-w-xl px-5 py-6 sm:px-8 sm:py-8">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0"><div className="flex items-center gap-2"><h3 className="truncate text-lg font-semibold text-zinc-950">{selected.display_name || 'WhatsApp'}</h3><span className={`h-2 w-2 shrink-0 rounded-full ${statusDot(selectedState || 'disconnected')}`} /></div><div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500"><span>{statusLabel(selectedState || 'disconnected')}</span><span className="text-zinc-300">·</span><span>{selected.visibility_scope === 'workspace' ? 'Shared' : 'Personal'}</span>{(selected.bridge?.phone || selected.external_account_id) && <><span className="text-zinc-300">·</span><span className="font-mono">+{selected.bridge?.phone || selected.external_account_id}</span></>}</div></div>
                  </div>

                  <div className="mt-8">
                    {selectedState === 'awaiting_scan' && selected.bridge?.qrDataUrl && (
                      <div className="grid items-start gap-7 sm:grid-cols-[210px_minmax(0,1fr)]">
                        <div><div className="rounded-xl border border-zinc-200 bg-white p-3"><img src={selected.bridge.qrDataUrl} alt={`QR code for ${selected.display_name || 'WhatsApp'}`} className="aspect-square w-full" /></div><div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-zinc-500"><Loader2 className="h-3 w-3 animate-spin" /> Waiting for scan</div></div>
                        <div className="pt-1"><h4 className="text-sm font-semibold text-zinc-950">Scan with WhatsApp</h4><ol className="mt-4 space-y-3 text-xs leading-5 text-zinc-600"><li><span className="font-semibold text-zinc-900">1.</span> Open WhatsApp on your phone.</li><li><span className="font-semibold text-zinc-900">2.</span> Open Linked devices.</li><li><span className="font-semibold text-zinc-900">3.</span> Tap Link a device and scan this code.</li></ol><button type="button" onClick={() => void reconnect(selected.id)} disabled={busyId === selected.id} className="button-secondary button-sm mt-5"><RefreshCw className={`h-3.5 w-3.5 ${busyId === selected.id ? 'animate-spin' : ''}`} /> New QR code</button></div>
                      </div>
                    )}
                    {selectedState === 'connecting' && <div className="flex min-h-48 flex-col items-center justify-center text-center"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /><div className="mt-3 text-sm font-semibold text-zinc-900">Preparing connection</div><div className="mt-1 text-xs text-zinc-500">Your QR code will appear here.</div></div>}
                    {selectedState === 'connected' && <div className="flex min-h-44 flex-col items-center justify-center text-center"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><Check className="h-5 w-5" /></span><div className="mt-3 text-sm font-semibold text-zinc-950">WhatsApp is connected</div><div className="mt-1 max-w-sm text-xs leading-5 text-zinc-500">Messages will sync automatically with the CRM inbox.</div></div>}
                    {selectedState === 'attention' && <div className="flex min-h-44 flex-col items-center justify-center text-center"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-50 text-rose-600"><WifiOff className="h-5 w-5" /></span><div className="mt-3 text-sm font-semibold text-zinc-950">Reconnect this account</div><div className="mt-1 max-w-sm text-xs leading-5 text-zinc-500">{selected.bridge?.lastError || selected.last_error || 'The WhatsApp session is no longer active.'}</div><button type="button" onClick={() => void reconnect(selected.id)} disabled={busyId === selected.id} className="button-primary button-sm mt-4">{busyId === selected.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />} Reconnect</button></div>}
                    {selectedState === 'disconnected' && <div className="flex min-h-44 flex-col items-center justify-center text-center"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-100 text-zinc-500"><Smartphone className="h-5 w-5" /></span><div className="mt-3 text-sm font-semibold text-zinc-950">Account disconnected</div><div className="mt-1 max-w-sm text-xs leading-5 text-zinc-500">Your CRM history is safe. Reconnect to resume WhatsApp syncing.</div><button type="button" onClick={() => void reconnect(selected.id)} disabled={busyId === selected.id} className="button-primary button-sm mt-4">{busyId === selected.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />} Connect</button></div>}
                  </div>

                  {selected.can_manage !== false && selectedState === 'connected' && (
                    <div className="mt-8 border-t border-zinc-100 pt-4">
                      {confirmDisconnectId === selected.id ? <div className="flex flex-col gap-3 rounded-lg bg-rose-50 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-xs font-semibold text-rose-900">Disconnect this account?</div><div className="mt-0.5 text-[11px] text-rose-700">Existing CRM messages will remain available.</div></div><div className="flex gap-2"><button type="button" onClick={() => setConfirmDisconnectId(null)} className="button-secondary button-sm" disabled={busyId === selected.id}>Cancel</button><button type="button" onClick={() => void disconnect(selected.id)} className="button-primary button-sm bg-rose-600 hover:bg-rose-700" disabled={busyId === selected.id}>{busyId === selected.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />} Disconnect</button></div></div> : <button type="button" onClick={() => setConfirmDisconnectId(selected.id)} className="text-xs font-medium text-zinc-400 hover:text-rose-600">Disconnect account</button>}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex h-full min-h-80 flex-col items-center justify-center px-6 text-center"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-100 text-zinc-500"><Smartphone className="h-5 w-5" /></span><div className="mt-3 text-sm font-semibold text-zinc-950">Connect WhatsApp</div><div className="mt-1 max-w-xs text-xs leading-5 text-zinc-500">Link a phone to bring WhatsApp conversations into your CRM inbox.</div><button type="button" onClick={() => setAddOpen(true)} className="button-primary button-sm mt-4"><Plus className="h-3.5 w-3.5" /> Add account</button></div>
              )}
            </main>
          </div>
        </div>
      </div>
    </AppOverlayPortal>
  );
}
