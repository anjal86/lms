'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
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
  switch (state) {
    case 'connected': return 'Connected';
    case 'awaiting_scan': return 'Scan QR';
    case 'connecting': return 'Connecting';
    case 'attention': return 'Needs attention';
    default: return 'Disconnected';
  }
}

function statusDotColor(state: UiState) {
  switch (state) {
    case 'connected': return 'bg-emerald-500';
    case 'awaiting_scan':
    case 'connecting': return 'bg-amber-500';
    case 'attention': return 'bg-rose-500';
    default: return 'bg-zinc-300';
  }
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
    } catch (pollError) {
      setError(pollError instanceof Error ? pollError.message : 'Unable to load WhatsApp accounts.');
    } finally {
      if (!quiet) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void refresh();
  }, [isOpen, refresh]);

  // Keyboard shortcut: Esc to close
  useEffect(() => {
    if (!isOpen || !onClose) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmDisconnectId) setConfirmDisconnectId(null);
        else if (addOpen) setAddOpen(false);
        else onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, addOpen, confirmDisconnectId]);

  const hasPending = useMemo(
    () =>
      connections.some((item) => {
        const state = stateFor(item);
        return state === 'awaiting_scan' || state === 'connecting';
      }),
    [connections]
  );

  useEffect(() => {
    if (!isOpen || !hasPending) return;
    const timer = window.setInterval(() => void refresh(true), 2500);
    return () => window.clearInterval(timer);
  }, [isOpen, hasPending, refresh]);

  const selected = connections.find((item) => item.id === selectedId) || null;
  const selectedState = selected ? stateFor(selected) : null;
  const connectedCount = connections.filter((item) => stateFor(item) === 'connected').length;

  const createConnection = async () => {
    if (!displayName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const response = await fetch('/api/integrations/whatsapp/baileys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim(),
          visibilityScope,
        }),
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
    <div
      className="fixed inset-0 z-50 flex justify-end bg-zinc-950/30 backdrop-blur-xs transition-opacity"
      role="dialog"
      aria-modal="true"
      aria-labelledby="whatsapp-drawer-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      <div className="flex h-full w-full max-w-2xl sm:max-w-3xl flex-col border-l border-zinc-200 bg-white shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <header className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-600">
              <Smartphone className="h-4 w-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="whatsapp-drawer-title" className="text-base font-semibold text-zinc-950">
                  WhatsApp Linked Devices
                </h2>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-medium text-zinc-600">
                  <span className={`h-1.5 w-1.5 rounded-full ${connectedCount > 0 ? 'bg-emerald-500' : 'bg-zinc-300'}`} />
                  {connectedCount} of {connections.length} active
                </span>
              </div>
              <p className="text-xs text-zinc-500">
                Pair personal or business phones via QR code to stream conversations directly into the CRM inbox.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              className="button-secondary button-sm"
              aria-label="Refresh WhatsApp status"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAddOpen(true);
                setConfirmDisconnectId(null);
              }}
              className="button-primary button-sm"
              aria-label="Add new WhatsApp account"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add account</span>
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="button-ghost button-sm px-2 text-zinc-400 hover:text-zinc-600"
                aria-label="Close drawer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </header>

        {/* Global Error Banner if any */}
        {error && (
          <div className="flex items-center gap-2 border-b border-rose-200 bg-rose-50 px-6 py-2.5 text-xs text-rose-700">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <span className="flex-1">{error}</span>
          </div>
        )}

        {/* Main Body (Split Sidebar + Content) */}
        <div className="flex flex-1 flex-col overflow-hidden sm:flex-row">
          {/* Accounts Navigation Sidebar */}
          <aside className="flex w-full shrink-0 flex-col border-b border-zinc-200 bg-zinc-50/70 p-3 sm:w-64 sm:border-b-0 sm:border-r">
            <div className="flex items-center justify-between px-2 pb-2 pt-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              <span>ACCOUNTS ({connections.length})</span>
            </div>

            <div className="flex-1 space-y-1 overflow-y-auto">
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
                    className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                      active
                        ? 'border-zinc-300 bg-white shadow-xs ring-1 ring-zinc-950/5'
                        : 'border-transparent hover:border-zinc-200 hover:bg-white/80'
                    }`}
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${statusDotColor(state)}`} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold text-zinc-900">
                        {item.display_name || 'WhatsApp'}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="font-mono text-[11px] text-zinc-500">
                          {phone ? `+${phone}` : statusLabel(state)}
                        </span>
                        <span className="rounded bg-zinc-100 px-1 py-0.2 text-[9px] font-medium text-zinc-600">
                          {item.visibility_scope === 'workspace' ? 'Shared' : 'Personal'}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                  </button>
                );
              })}

              {connections.length === 0 && (
                <div className="rounded-lg border border-dashed border-zinc-200 bg-white p-4 text-center text-xs text-zinc-500">
                  No accounts linked yet. Click &quot;Add account&quot; to link your phone.
                </div>
              )}
            </div>

            <div className="mt-auto pt-3 border-t border-zinc-200/70">
              <button
                type="button"
                onClick={() => {
                  setAddOpen(true);
                  setConfirmDisconnectId(null);
                }}
                className={`flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                  addOpen
                    ? 'border-zinc-900 bg-zinc-900 text-white'
                    : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950'
                }`}
              >
                <Plus className="h-3.5 w-3.5" />
                Connect another phone
              </button>
            </div>
          </aside>

          {/* Right Workspace Panel */}
          <main className="flex-1 overflow-y-auto p-6 bg-white">
            {addOpen ? (
              <div className="mx-auto max-w-lg">
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className="mb-4 inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-900"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to accounts
                </button>

                <div>
                  <h3 className="text-base font-semibold text-zinc-950">Connect a WhatsApp account</h3>
                  <p className="mt-1 text-xs text-zinc-500">
                    Create the account profile, then point your WhatsApp mobile app camera at the generated QR code.
                  </p>
                </div>

                <div className="mt-5 space-y-4">
                  <div>
                    <label htmlFor="whatsapp-account-name" className="text-xs font-semibold text-zinc-800">
                      Account name
                    </label>
                    <input
                      id="whatsapp-account-name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="field mt-1.5 h-9 text-sm"
                      maxLength={120}
                      placeholder="e.g. Sales Desk, Anjal WhatsApp"
                      autoFocus
                    />
                    <p className="mt-1 text-[11px] text-zinc-400">
                      Use a descriptive label staff can easily recognize in the unified Inbox.
                    </p>
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-zinc-800">Who can use this account?</span>
                    <div className={`mt-1.5 grid gap-2.5 ${canCreateShared ? 'sm:grid-cols-2' : ''}`}>
                      <button
                        type="button"
                        onClick={() => setVisibilityScope('personal')}
                        className={`rounded-lg border p-3 text-left transition-all ${
                          visibilityScope === 'personal'
                            ? 'border-zinc-950 bg-zinc-50/80 shadow-xs ring-1 ring-zinc-950'
                            : 'border-zinc-200 bg-white hover:border-zinc-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900">
                          <ShieldCheck className="h-4 w-4 text-emerald-600" />
                          Personal account
                        </div>
                        <p className="mt-1 text-[11px] leading-4 text-zinc-500">
                          Only you and workspace managers can access conversations.
                        </p>
                      </button>

                      {canCreateShared && (
                        <button
                          type="button"
                          onClick={() => setVisibilityScope('workspace')}
                          className={`rounded-lg border p-3 text-left transition-all ${
                            visibilityScope === 'workspace'
                              ? 'border-zinc-950 bg-zinc-50/80 shadow-xs ring-1 ring-zinc-950'
                              : 'border-zinc-200 bg-white hover:border-zinc-300'
                          }`}
                        >
                          <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900">
                            <Users className="h-4 w-4 text-blue-600" />
                            Shared with team
                          </div>
                          <p className="mt-1 text-[11px] leading-4 text-zinc-500">
                            All staff with Inbox permissions can collaborate on conversations.
                          </p>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-3 text-xs text-zinc-600">
                    <strong>Pairing requirement:</strong> Ensure you have your mobile phone ready with WhatsApp installed.
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setAddOpen(false)}
                      className="button-secondary"
                      disabled={creating}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void createConnection()}
                      className="button-primary"
                      disabled={creating || displayName.trim().length < 2}
                    >
                      {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                      Create &amp; show QR code
                    </button>
                  </div>
                </div>
              </div>
            ) : selected ? (
              <div className="mx-auto max-w-xl space-y-5">
                {/* Account Details Header */}
                <div className="flex items-start justify-between gap-4 border-b border-zinc-100 pb-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-700">
                      <Smartphone className="h-5 w-5" />
                    </span>
                    <div>
                      <h3 className="text-base font-semibold text-zinc-950">
                        {selected.display_name || 'WhatsApp Account'}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 text-xs text-zinc-600">
                          <span className={`h-2 w-2 rounded-full ${statusDotColor(selectedState || 'disconnected')}`} />
                          {statusLabel(selectedState || 'disconnected')}
                        </span>
                        <span className="text-zinc-300">•</span>
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
                          {selected.visibility_scope === 'workspace' ? 'Shared with workspace' : 'Personal account'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void refresh()}
                    disabled={refreshing}
                    className="button-secondary button-sm"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                    <span>Check status</span>
                  </button>
                </div>

                {/* Connected phone number if known */}
                {(selected.bridge?.phone || selected.external_account_id) && (
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 px-4 py-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Connected phone</div>
                    <div className="mt-0.5 font-mono text-sm font-semibold text-zinc-900">
                      +{selected.bridge?.phone || selected.external_account_id}
                    </div>
                  </div>
                )}

                {/* State: Awaiting Scan */}
                {selectedState === 'awaiting_scan' && selected.bridge?.qrDataUrl && (
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50/40 p-5">
                    <div>
                      <div className="text-sm font-semibold text-zinc-950">Scan QR Code with your phone</div>
                      <p className="mt-1 text-xs text-zinc-500">
                        Open WhatsApp on the device you want to connect and scan the code below.
                      </p>
                    </div>

                    <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row sm:items-start">
                      {/* QR container */}
                      <div className="flex shrink-0 flex-col items-center">
                        <div className="rounded-lg border border-zinc-200 bg-white p-3 shadow-xs">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={selected.bridge.qrDataUrl}
                            alt={`QR code for ${selected.display_name || 'WhatsApp'}`}
                            className="aspect-square h-[190px] w-[190px]"
                          />
                        </div>
                        <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-medium text-amber-700">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>Waiting for scan from phone...</span>
                        </div>
                      </div>

                      {/* Instructions */}
                      <div className="flex-1 space-y-3.5 text-xs text-zinc-700">
                        <div className="flex items-start gap-2.5">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-950 text-[10px] font-bold text-white">
                            1
                          </span>
                          <span className="pt-0.5">
                            Open <strong>WhatsApp</strong> on your mobile phone.
                          </span>
                        </div>
                        <div className="flex items-start gap-2.5">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-950 text-[10px] font-bold text-white">
                            2
                          </span>
                          <span className="pt-0.5">
                            Go to <strong>Settings</strong> (or ⋮ menu) → <strong>Linked Devices</strong>.
                          </span>
                        </div>
                        <div className="flex items-start gap-2.5">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-950 text-[10px] font-bold text-white">
                            3
                          </span>
                          <span className="pt-0.5">
                            Tap <strong>Link a Device</strong> and point your camera at the QR code.
                          </span>
                        </div>

                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={() => void reconnect(selected.id)}
                            disabled={busyId === selected.id}
                            className="button-secondary button-sm"
                          >
                            <RefreshCw className={`h-3 w-3 ${busyId === selected.id ? 'animate-spin' : ''}`} />
                            Regenerate QR code
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* State: Connecting */}
                {selectedState === 'connecting' && (
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-5 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-zinc-600" />
                    <div className="mt-3 text-sm font-semibold text-zinc-900">Preparing WhatsApp connection</div>
                    <p className="mt-1 text-xs text-zinc-500">
                      The QR code is being generated. This takes about 2 seconds...
                    </p>
                  </div>
                )}

                {/* State: Connected */}
                {selectedState === 'connected' && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-5">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                      <div>
                        <div className="text-sm font-semibold text-emerald-950">Linked and syncing in real time</div>
                        <p className="mt-1 text-xs leading-5 text-emerald-800">
                          Inbound messages, older history, and outgoing replies sync automatically with your CRM Inbox.
                        </p>
                        <div className="mt-3 text-[11px] text-emerald-700">
                          Session status: <strong>Online</strong> • Local linked device container is active.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* State: Attention */}
                {selectedState === 'attention' && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 p-5">
                    <div className="flex items-start gap-3">
                      <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
                      <div>
                        <div className="text-sm font-semibold text-rose-900">Connection needs attention</div>
                        <p className="mt-1 text-xs leading-5 text-rose-700">
                          {selected.bridge?.lastError || selected.last_error || 'The linked session is not active.'}
                        </p>
                        <button
                          type="button"
                          onClick={() => void reconnect(selected.id)}
                          disabled={busyId === selected.id}
                          className="button-primary button-sm mt-3"
                        >
                          <Link2 className="h-3.5 w-3.5" /> Reconnect account
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* State: Disconnected */}
                {selectedState === 'disconnected' && (
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-5">
                    <div className="flex items-start gap-3">
                      <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-zinc-500" />
                      <div>
                        <div className="text-sm font-semibold text-zinc-900">This account is disconnected</div>
                        <p className="mt-1 text-xs leading-5 text-zinc-500">
                          Existing messages and leads remain safely saved in your database. Reconnect to send and receive new messages.
                        </p>
                        <button
                          type="button"
                          onClick={() => void reconnect(selected.id)}
                          disabled={busyId === selected.id}
                          className="button-primary button-sm mt-3"
                        >
                          <Link2 className="h-3.5 w-3.5" /> Reconnect via QR
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Disconnect Confirmation / Actions */}
                {confirmDisconnectId === selected.id ? (
                  <div className="rounded-lg border border-rose-200 bg-rose-50/80 p-4">
                    <div className="text-xs font-semibold text-rose-900">Disconnect this WhatsApp phone?</div>
                    <p className="mt-1 text-xs leading-5 text-rose-700">
                      Messages already stored in the CRM will remain intact. New WhatsApp messages will stop syncing until you re-link this device.
                    </p>
                    <div className="mt-3 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmDisconnectId(null)}
                        className="button-secondary button-sm"
                        disabled={busyId === selected.id}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void disconnect(selected.id)}
                        className="button-primary button-sm bg-rose-600 hover:bg-rose-700"
                        disabled={busyId === selected.id}
                      >
                        {busyId === selected.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Unplug className="h-3.5 w-3.5" />
                        )}
                        Confirm disconnect
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between border-t border-zinc-100 pt-4 text-xs text-zinc-400">
                    <span>Keep the paired phone connected to the internet.</span>
                    {selected.can_manage !== false && selectedState === 'connected' && (
                      <button
                        type="button"
                        onClick={() => setConfirmDisconnectId(selected.id)}
                        className="button-ghost button-sm text-rose-600 hover:text-rose-700"
                      >
                        <Unplug className="h-3.5 w-3.5" /> Disconnect device
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex min-h-[300px] flex-col items-center justify-center text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-600">
                  <QrCode className="h-6 w-6" />
                </span>
                <h3 className="mt-4 text-base font-semibold text-zinc-950">No WhatsApp account selected</h3>
                <p className="mt-1.5 max-w-sm text-xs text-zinc-500">
                  Select an account from the sidebar or click &quot;Connect another phone&quot; to link a device.
                </p>
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="button-primary button-sm mt-4"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Connect WhatsApp
                </button>
              </div>
            )}
          </main>
        </div>

        {/* Drawer Footer */}
        <footer className="flex shrink-0 items-center justify-between border-t border-zinc-200 bg-zinc-50/60 px-6 py-3 text-[11px] text-zinc-500">
          <span>WhatsApp Linked Device uses persistent Docker sessions.</span>
          <span className="font-mono">Port 3101 • Baileys v7</span>
        </footer>
      </div>
    </div>
  );
}
