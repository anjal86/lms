'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Link2, Loader2, QrCode, RefreshCw, Unplug } from 'lucide-react';

type Connection = {
  id: string;
  status: 'disconnected' | 'pending' | 'connected' | 'needs_attention' | 'paused';
  external_account_id?: string | null;
  last_error?: string | null;
};

type BridgeStatus = {
  instanceId?: string;
  status?: string;
  connected?: boolean;
  phone?: string | null;
  qrDataUrl?: string | null;
  lastError?: string | null;
};

type Props = {
  connection?: Connection | null;
  onChanged: () => void | Promise<void>;
};

export default function BaileysWhatsAppConnect({ connection, onChanged }: Props) {
  const [bridge, setBridge] = useState<BridgeStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    if (!connection?.id) return;
    try {
      const response = await fetch(`/api/integrations/whatsapp/baileys?id=${encodeURIComponent(connection.id)}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to check WhatsApp linked device.');
      const nextBridge = (payload.bridge || null) as BridgeStatus | null;
      setBridge(nextBridge);
      if (nextBridge && Boolean(nextBridge.connected) !== (connection.status === 'connected')) await onChanged();
    } catch (pollError) {
      setError(pollError instanceof Error ? pollError.message : 'Unable to check WhatsApp linked device.');
    }
  }, [connection?.id, connection?.status, onChanged]);

  useEffect(() => {
    if (!connection?.id || connection.status === 'disconnected') {
      setBridge(null);
      return;
    }
    void poll();
    if (connection.status === 'connected') return;
    const timer = window.setInterval(() => void poll(), 2500);
    return () => window.clearInterval(timer);
  }, [connection?.id, connection?.status, poll]);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/integrations/whatsapp/baileys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'WhatsApp Business — Linked Device' }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to start WhatsApp linked-device setup.');
      setBridge(payload.bridge || null);
      await onChanged();
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : 'Unable to start WhatsApp linked-device setup.');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!connection?.id) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/integrations/whatsapp/baileys?id=${encodeURIComponent(connection.id)}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to disconnect WhatsApp.');
      setBridge(null);
      await onChanged();
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : 'Unable to disconnect WhatsApp.');
    } finally {
      setBusy(false);
    }
  };

  const connected = bridge ? bridge.connected === true : connection?.status === 'connected';
  const phone = bridge?.phone || connection?.external_account_id || null;
  const qr = bridge?.qrDataUrl || null;

  return (
    <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-900">
            <QrCode className="h-4 w-4" /> Self-hosted linked device
          </div>
          <p className="mt-1 text-[11px] leading-5 text-emerald-800/80">
            Pair the normal WhatsApp Business app by QR. No Meta Cloud API credentials are required.
          </p>
        </div>
        {connected && <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Live</span>}
      </div>

      {connected ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-200 bg-white px-3 py-2">
          <div>
            <div className="text-xs font-semibold text-zinc-900">WhatsApp is logging in realtime</div>
            {phone && <div className="mt-0.5 font-mono text-[11px] text-zinc-500">+{phone}</div>}
          </div>
          <button type="button" className="button-ghost button-sm text-red-600" onClick={() => void disconnect()} disabled={busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />} Disconnect
          </button>
        </div>
      ) : qr ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-[170px_1fr] sm:items-center">
          <div className="rounded-lg border border-zinc-200 bg-white p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="WhatsApp linked-device QR code" className="aspect-square w-full" />
          </div>
          <div className="text-xs leading-5 text-zinc-700">
            <div className="font-semibold text-zinc-900">Scan from WhatsApp Business</div>
            <div className="mt-1">WhatsApp → Settings/Menu → Linked devices → Link a device.</div>
            <button type="button" onClick={() => void poll()} className="button-secondary button-sm mt-3" disabled={busy}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh status
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => void connect()} disabled={busy} className="button-primary button-sm mt-3">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />} Connect without Meta API
        </button>
      )}

      {(error || bridge?.lastError || connection?.last_error) && (
        <div className="mt-2 text-[11px] leading-5 text-red-600">{error || bridge?.lastError || connection?.last_error}</div>
      )}
      <div className="mt-2 text-[10px] leading-4 text-emerald-900/60">
        Uses an unofficial WhatsApp linked-device protocol. Keep the phone logged in and use a dedicated business number.
      </div>
    </div>
  );
}
