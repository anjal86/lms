'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import StableInbox from '@/components/inbox/StableInbox';
import InboxChannelScopeBar from '@/components/inbox/InboxChannelScopeBar';
import InboxCommandPalette from '@/components/inbox/InboxCommandPalette';

const AUTO_SYNC_INTERVAL_MS = 30_000;
const AUTO_SYNC_MIN_GAP_MS = 15_000;
const MAX_MAINTENANCE_PASSES = 6;
const MAINTENANCE_PASS_DELAY_MS = 350;

type SyncPayload = {
  messagesCount?: number;
  olderConversationsDiscovered?: number;
  historyPreviewMessagesInserted?: number;
  maintenanceContinues?: boolean;
  conversationDiscovery?: {
    conversationsDiscovered?: number;
    previewMessagesInserted?: number;
    historyComplete?: boolean;
  };
};

function ScopedInbox({ refreshRevision }: { refreshRevision: number }) {
  const params = useSearchParams();
  const accountId = params.get('accountId') || 'all';
  const accountProvider = params.get('accountProvider') || 'all';
  const provider = params.get('provider') || 'all';

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white">
      <InboxChannelScopeBar />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <StableInbox key={`${provider}:${accountProvider}:${accountId}:${refreshRevision}`} />
      </div>
      <InboxCommandPalette />
    </div>
  );
}

function syncPayloadChanged(payload: SyncPayload) {
  return [
    payload.messagesCount,
    payload.olderConversationsDiscovered,
    payload.historyPreviewMessagesInserted,
    payload.conversationDiscovery?.conversationsDiscovered,
    payload.conversationDiscovery?.previewMessagesInserted,
  ].some((value) => Number(value || 0) > 0);
}

export default function InboxPage() {
  const syncingRef = useRef(false);
  const lastSyncStartedAtRef = useRef(0);
  const [refreshRevision, setRefreshRevision] = useState(0);

  useEffect(() => {
    let disposed = false;
    let activeController: AbortController | null = null;
    let maintenanceTimer: number | null = null;

    const waitForMaintenancePass = () => new Promise<void>((resolve) => {
      maintenanceTimer = window.setTimeout(() => {
        maintenanceTimer = null;
        resolve();
      }, MAINTENANCE_PASS_DELAY_MS);
    });

    const syncProviders = async () => {
      if (disposed || document.visibilityState !== 'visible' || syncingRef.current) return;

      const now = Date.now();
      if (now - lastSyncStartedAtRef.current < AUTO_SYNC_MIN_GAP_MS) return;

      syncingRef.current = true;
      lastSyncStartedAtRef.current = now;
      const controller = new AbortController();
      activeController = controller;
      let changed = false;

      try {
        // One Meta conversations page used to be discovered per poll, which meant an
        // old Page with hundreds of chats effectively required repeated manual Refresh
        // clicks. Continue the saved cursor automatically in the same visible session.
        for (let pass = 0; pass < MAX_MAINTENANCE_PASSES && !disposed; pass += 1) {
          const response = await fetch('/api/conversations/sync?mode=live', {
            method: 'POST',
            cache: 'no-store',
            signal: controller.signal,
          });

          const payload = await response.json().catch(() => ({})) as SyncPayload;
          if (!response.ok) {
            if (process.env.NODE_ENV !== 'production') {
              console.warn('Automatic Inbox provider sync failed.', response.status);
            }
            break;
          }

          changed = changed || syncPayloadChanged(payload);
          if (payload.maintenanceContinues !== true) break;
          await waitForMaintenancePass();
        }

        // Supabase Realtime is helpful but must not be required for history discovery
        // to become visible. Remount the Inbox data view only when the sync actually
        // inserted messages or discovered/repaired conversations.
        if (changed && !disposed) {
          setRefreshRevision((revision) => revision + 1);
        }
      } catch (error) {
        if ((error as { name?: string })?.name !== 'AbortError' && process.env.NODE_ENV !== 'production') {
          console.warn('Automatic Inbox provider sync failed.', error);
        }
      } finally {
        if (activeController === controller) activeController = null;
        syncingRef.current = false;
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') void syncProviders();
    };
    const onFocus = () => void syncProviders();

    const initialTimer = window.setTimeout(() => void syncProviders(), 500);
    const interval = window.setInterval(() => void syncProviders(), AUTO_SYNC_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);

    return () => {
      disposed = true;
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
      if (maintenanceTimer !== null) window.clearTimeout(maintenanceTimer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      activeController?.abort();
      syncingRef.current = false;
    };
  }, []);

  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center p-8 text-xs text-zinc-400">Loading inbox…</div>}>
      <ScopedInbox refreshRevision={refreshRevision} />
    </Suspense>
  );
}
