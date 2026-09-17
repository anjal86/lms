'use client';

import { Suspense, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import StableInbox from '@/components/inbox/StableInbox';
import InboxChannelScopeBar from '@/components/inbox/InboxChannelScopeBar';
import InboxCommandPalette from '@/components/inbox/InboxCommandPalette';
import InboxAssignmentEnhancements from '@/components/inbox/InboxAssignmentEnhancements';

const AUTO_SYNC_INTERVAL_MS = 60_000;
const AUTO_SYNC_MIN_GAP_MS = 30_000;
const INITIAL_SYNC_DELAY_MS = 8_000;
const MAX_MAINTENANCE_PASSES = 2;
const MAINTENANCE_PASS_DELAY_MS = 1_500;

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

function ScopedInbox() {
  const params = useSearchParams();
  const accountId = params.get('accountId') || 'all';
  const accountProvider = params.get('accountProvider') || 'all';
  const provider = params.get('provider') || 'all';

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white">
      <InboxChannelScopeBar />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <StableInbox key={`${provider}:${accountProvider}:${accountId}`} />
        <InboxAssignmentEnhancements />
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

export default function LegacyInboxPage() {
  const syncingRef = useRef(false);
  const lastSyncStartedAtRef = useRef(0);

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

      try {
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

          if (syncPayloadChanged(payload) && !disposed) {
            window.dispatchEvent(new Event('inbox:provider-sync'));
          }
          if (payload.maintenanceContinues !== true) break;
          await waitForMaintenancePass();
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
      if (document.visibilityState === 'visible' && lastSyncStartedAtRef.current > 0) void syncProviders();
    };
    const onFocus = () => {
      if (lastSyncStartedAtRef.current > 0 && Date.now() - lastSyncStartedAtRef.current >= AUTO_SYNC_MIN_GAP_MS) {
        void syncProviders();
      }
    };

    const initialTimer = window.setTimeout(() => void syncProviders(), INITIAL_SYNC_DELAY_MS);
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
      <ScopedInbox />
    </Suspense>
  );
}
