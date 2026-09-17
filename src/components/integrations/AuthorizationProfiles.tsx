'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, KeyRound, Loader2, RefreshCw, ShieldAlert, ShieldCheck, Trash2, Unplug, X } from 'lucide-react';
import AppOverlayPortal from '@/components/layout/AppOverlayPortal';

type AuthorizationProfile = {
  key: string;
  kind: 'meta' | 'tiktok' | 'provider';
  display_name: string;
  status?: 'connected' | 'paused' | 'disconnected';
  authorization_ids: string[];
  authorizations: Array<{ id: string; provider: string; status: string }>;
  connected_assets: number;
  total_assets: number;
  last_sync_at: string | null;
};

type Props = {
  onChanged?: () => void | Promise<void>;
};

function providerLabel(provider: string) {
  if (provider === 'facebook') return 'Facebook';
  if (provider === 'instagram') return 'Instagram';
  if (provider === 'whatsapp') return 'WhatsApp';
  if (provider === 'tiktok') return 'TikTok';
  return provider;
}

function reconnectProvider(profile: AuthorizationProfile) {
  if (profile.kind !== 'meta') return profile.authorizations[0]?.provider || profile.kind;
  return profile.authorizations.find((authorization) => ['facebook', 'instagram', 'whatsapp'].includes(authorization.provider))?.provider || 'facebook';
}

export default function AuthorizationProfiles({ onChanged }: Props) {
  const [profiles, setProfiles] = useState<AuthorizationProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDisconnect, setPendingDisconnect] = useState<AuthorizationProfile | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AuthorizationProfile | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/integrations/authorizations/profiles', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to load authorized accounts.');
      setProfiles(Array.isArray(payload.profiles) ? payload.profiles : []);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load authorized accounts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const disconnectProfile = async () => {
    if (!pendingDisconnect) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/integrations/authorizations/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authorizationIds: pendingDisconnect.authorization_ids }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to disconnect this profile.');
      setPendingDisconnect(null);
      await load();
      await onChanged?.();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unable to disconnect this profile.');
    } finally {
      setBusy(false);
    }
  };

  const deleteProfile = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/integrations/authorizations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authorizationIds: pendingDelete.authorization_ids }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to remove this account.');
      setPendingDelete(null);
      await load();
      await onChanged?.();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unable to remove this account.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-4 py-3.5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-700">
              <KeyRound className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-zinc-950">Authorized logins</h2>
              <p className="mt-0.5 text-xs leading-5 text-zinc-500">These logins only grant access to discover business assets. The Pages, accounts and numbers connected below remain workspace-owned.</p>
            </div>
          </div>
        </div>

        {error && <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">{error}</div>}

        {loading ? (
          <div className="flex h-16 items-center justify-center text-xs text-zinc-400"><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Loading authorized logins…</div>
        ) : profiles.length === 0 ? (
          <div className="px-4 py-4 text-xs text-zinc-500">
            No provider login is currently authorized in this workspace. Use <span className="font-medium text-zinc-700">Add account</span> below to authorize Meta or TikTok, then choose the business assets you want to connect.
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {profiles.map((profile) => {
              const isDisconnected = profile.status === 'disconnected';
              return (
                <div key={profile.key} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate text-xs font-semibold text-zinc-900">{profile.display_name}</div>
                      {isDisconnected ? (
                        <span className="flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" /> Disconnected
                        </span>
                      ) : profile.status === 'paused' ? (
                        <span className="flex items-center gap-1 rounded bg-zinc-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Paused
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 rounded bg-zinc-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Authorized
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-zinc-500">
                      <span>{profile.kind === 'meta' ? 'Meta login' : profile.kind === 'tiktok' ? 'TikTok Business login' : 'Provider login'}</span>
                      <span>{profile.connected_assets} of {profile.total_assets} asset{profile.total_assets === 1 ? '' : 's'} active</span>
                      {profile.last_sync_at && <span>Authorized {new Date(profile.last_sync_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {!isDisconnected && profile.authorizations.map((authorization) => (
                        <Link
                          key={authorization.id}
                          href={`/connections/select?provider=${authorization.provider}&authorization=${authorization.id}`}
                          className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[10px] font-medium text-zinc-600 hover:bg-zinc-50"
                        >
                          {providerLabel(authorization.provider)} assets <ExternalLink className="h-3 w-3" />
                        </Link>
                      ))}
                      {isDisconnected && (
                        <a
                          href={`/api/integrations/oauth/${reconnectProvider(profile)}/start`}
                          className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[10px] font-medium text-zinc-700 hover:bg-zinc-50"
                        >
                          <RefreshCw className="h-3 w-3" /> Reconnect login
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {!isDisconnected && (
                      <button
                        type="button"
                        onClick={() => setPendingDisconnect(profile)}
                        className="button-secondary button-sm shrink-0 text-zinc-700"
                        title="Disconnect this profile and pause its assets"
                      >
                        <Unplug className="h-3.5 w-3.5" /> Disconnect
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setPendingDelete(profile)}
                      className="button-secondary button-sm shrink-0 text-red-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                      title="Remove this authorization and its connected assets from this workspace"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Remove account
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {pendingDisconnect && (
        <AppOverlayPortal>
          <div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-zinc-950/30 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="disconnect-profile-title"
            onClick={(event) => { if (event.target === event.currentTarget && !busy) setPendingDisconnect(null); }}
          >
            <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white shadow-lg">
              <div className="flex items-start justify-between gap-3 border-b border-zinc-200 p-4">
                <div className="flex gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700"><Unplug className="h-4 w-4" /></span>
                  <div>
                    <h2 id="disconnect-profile-title" className="text-sm font-semibold text-zinc-950">Disconnect authorized profile?</h2>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">{pendingDisconnect.display_name}</p>
                  </div>
                </div>
                <button type="button" onClick={() => !busy && setPendingDisconnect(null)} className="button-ghost button-sm" aria-label="Close"><X className="h-4 w-4" /></button>
              </div>
              <div className="space-y-3 p-4">
                <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>This disconnects {pendingDisconnect.connected_assets} active business asset{pendingDisconnect.connected_assets === 1 ? '' : 's'} from this workspace and removes their stored provider credentials. Existing conversations and customer history are preserved.</p>
                </div>
                <p className="text-xs leading-5 text-zinc-500">This does not delete the external provider accounts themselves. You can re-authorize or remove this profile from the workspace later.</p>
              </div>
              <div className="flex justify-end gap-2 border-t border-zinc-200 p-4">
                <button type="button" onClick={() => setPendingDisconnect(null)} disabled={busy} className="button-secondary">Cancel</button>
                <button type="button" onClick={() => void disconnectProfile()} disabled={busy} className="button-primary bg-amber-600 hover:bg-amber-700">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />} Disconnect profile
                </button>
              </div>
            </div>
          </div>
        </AppOverlayPortal>
      )}

      {pendingDelete && (
        <AppOverlayPortal>
          <div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-zinc-950/30 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-profile-title"
            onClick={(event) => { if (event.target === event.currentTarget && !busy) setPendingDelete(null); }}
          >
            <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white shadow-lg">
              <div className="flex items-start justify-between gap-3 border-b border-zinc-200 p-4">
                <div className="flex gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600"><Trash2 className="h-4 w-4" /></span>
                  <div>
                    <h2 id="delete-profile-title" className="text-sm font-semibold text-zinc-950">Remove account &amp; linked assets?</h2>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">{pendingDelete.display_name}</p>
                  </div>
                </div>
                <button type="button" onClick={() => !busy && setPendingDelete(null)} className="button-ghost button-sm" aria-label="Close"><X className="h-4 w-4" /></button>
              </div>
              <div className="space-y-3 p-4">
                <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-900">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-medium">This removes the authorization and all {pendingDelete.total_assets} linked asset{pendingDelete.total_assets === 1 ? '' : 's'} from active use in this workspace.</p>
                    <p className="mt-1 text-[11px] text-red-700">Stored OAuth credentials are erased and the accounts stop receiving or sending new CRM traffic.</p>
                  </div>
                </div>
                <p className="text-xs leading-5 text-zinc-500">Existing customer contacts, messages and conversation history remain stored with their original source-account linkage for audit/history purposes.</p>
              </div>
              <div className="flex justify-end gap-2 border-t border-zinc-200 p-4">
                <button type="button" onClick={() => setPendingDelete(null)} disabled={busy} className="button-secondary">Cancel</button>
                <button type="button" onClick={() => void deleteProfile()} disabled={busy} className="button-primary bg-red-600 hover:bg-red-700">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Remove from workspace
                </button>
              </div>
            </div>
          </div>
        </AppOverlayPortal>
      )}
    </>
  );
}
