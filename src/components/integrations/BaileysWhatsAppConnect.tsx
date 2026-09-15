'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Link2, Loader2, Plus, QrCode, RefreshCw, Smartphone, Unplug } from 'lucide-react';

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

export default function BaileysWhatsAppConnect({ connection, onChanged }: Props) {
  const [connections, setConnections] = useState<Connection[]>(connection ? [connection] : []);
  const [displayName, setDisplayName] = useState('My WhatsApp');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/integrations/whatsapp/baileys', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to load WhatsApp accounts.');
      setConnections(Array.isArray(payload.connections) ? payload.connections : []);
      setError(null);
    } catch (pollError) {
      setError(pollError instanceof Error ? pollError.message : 'Unable to load WhatsApp accounts.');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const hasPending = useMemo(() => connections.some((item) => {
    const bridgeStatus = item.bridge?.status;
    return item.status === 'pending'
      || item.status === 'needs_attention'
      || bridgeStatus === 'qr'
      || bridgeStatus === 'connecting';
  }), [connections]);

  useEffect(() => {
    if (!hasPending) return;
    const timer = window.setInterval(() => void refresh(), 2500);
    return () => window.clearInterval(timer);
  }, [hasPending, refresh]);

  const createConnection = async () => {
    setCreating(true);
    setError(null);
    try {
      const response = await fetch('/api/integrations/whatsapp/baileys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim() || 'My WhatsApp',
          visibilityScope: 'personal',
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to start WhatsApp linked-device setup.');
      setDisplayName('My WhatsApp');
      await refresh();
      await onChanged();
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : 'Unable to start WhatsApp linked-device setup.');
    } finally {
      setCreating(false);
    }
  };

  const reconnect = async (connectionId: string) => {
    setBusyId(connectionId);
    setError(null);
    try {
      const response = await fetch('/api/integrations/whatsapp/baileys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to reconnect WhatsApp.');
      await refresh();
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
      await refresh();
      await onChanged();
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : 'Unable to disconnect WhatsApp.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-900">
            <QrCode className="h-4 w-4" /> WhatsApp linked devices
          </div>
          <p className="mt-1 text-[11px] leading-5 text-emerald-800/80">
            Each staff member can connect their own business WhatsApp. Personal accounts stay private to the owner and managers.
          </p>
        </div>
        <button type="button" onClick={() => void refresh()} className="button-ghost button-sm" aria-label="Refresh WhatsApp accounts">
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-3 space-y-3">
        {connections.map((item) => {
          const bridge = item.bridge || null;
          const connected = bridge ? bridge.connected === true : item.status === 'connected';
          const phone = bridge?.phone || item.external_account_id || null;
          const qr = bridge?.qrDataUrl || null;
          const busy = busyId === item.id;
          const canManage = item.can_manage !== false;

          return (
            <div key={item.id} className="rounded-lg border border-emerald-200 bg-white p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900">
                    <Smartphone className="h-3.5 w-3.5 text-emerald-700" />
                    {item.display_name || 'WhatsApp'}
                    {item.visibility_scope === 'workspace' && (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[9px] font-medium text-zinc-600">Shared</span>
                    )}
                    {item.is_owner && item.visibility_scope !== 'workspace' && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-medium text-emerald-700">Mine</span>
                    )}
                  </div>
                  {phone && <div className="mt-1 font-mono text-[11px] text-zinc-500">+{phone}</div>}
                </div>
                {connected && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Live
                  </span>
                )}
              </div>

              {!connected && qr && canManage && (
                <div className="mt-3 grid gap-3 sm:grid-cols-[160px_1fr] sm:items-center">
                  <div className="rounded-lg border border-zinc-200 bg-white p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qr} alt={`QR code for ${item.display_name || 'WhatsApp'}`} className="aspect-square w-full" />
                  </div>
                  <div className="text-xs leading-5 text-zinc-700">
                    <div className="font-semibold text-zinc-900">Scan from WhatsApp Business</div>
                    <div className="mt-1">WhatsApp → Settings/Menu → Linked devices → Link a device.</div>
                  </div>
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {!connected && canManage && (
                  <button type="button" className="button-secondary button-sm" onClick={() => void reconnect(item.id)} disabled={busy}>
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                    {qr ? 'Refresh QR' : 'Reconnect'}
                  </button>
                )}
                {connected && canManage && (
                  <button type="button" className="button-ghost button-sm text-red-600" onClick={() => void disconnect(item.id)} disabled={busy}>
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />} Disconnect
                  </button>
                )}
              </div>

              {(bridge?.lastError || item.last_error) && (
                <div className="mt-2 text-[11px] leading-5 text-red-600">{bridge?.lastError || item.last_error}</div>
              )}
            </div>
          );
        })}

        {connections.length === 0 && (
          <div className="rounded-md border border-dashed border-emerald-200 bg-white/70 px-3 py-4 text-[11px] text-zinc-600">
            No WhatsApp account is connected for you yet.
          </div>
        )}
      </div>

      <div className="mt-3 rounded-lg border border-emerald-200 bg-white p-3">
        <div className="text-xs font-semibold text-zinc-900">Connect another WhatsApp account</div>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className="input h-9 flex-1 text-xs"
            maxLength={120}
            placeholder="e.g. Anjal WhatsApp"
          />
          <button type="button" onClick={() => void createConnection()} disabled={creating} className="button-primary button-sm">
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add account
          </button>
        </div>
        <p className="mt-2 text-[10px] leading-4 text-zinc-500">
          New staff accounts are personal by default. Managers can still access them for supervision and support.
        </p>
      </div>

      {error && <div className="mt-2 text-[11px] leading-5 text-red-600">{error}</div>}
      <div className="mt-2 text-[10px] leading-4 text-emerald-900/60">
        Uses an unofficial WhatsApp linked-device protocol. Keep each phone logged in and prefer dedicated business numbers.
      </div>
    </div>
  );
}
