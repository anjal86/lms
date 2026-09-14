'use client';

import { useEffect, useRef } from 'react';
import StableInbox from '@/components/inbox/StableInbox';

const AUTO_SYNC_INTERVAL_MS = 30_000;
const AUTO_SYNC_MIN_GAP_MS = 15_000;

export default function InboxPage() {
  const syncingRef = useRef(false);
  const lastSyncStartedAtRef = useRef(0);

  useEffect(() => {
    let disposed = false;
    let activeController: AbortController | null = null;

    const syncProviders = async () => {
      if (disposed || document.visibilityState !== 'visible' || syncingRef.current) return;

      const now = Date.now();
      if (now - lastSyncStartedAtRef.current < AUTO_SYNC_MIN_GAP_MS) return;

      syncingRef.current = true;
      lastSyncStartedAtRef.current = now;
      const controller = new AbortController();
      activeController = controller;

      try {
        const response = await fetch('/api/conversations/sync?mode=live', {
          method: 'POST',
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok && process.env.NODE_ENV !== 'production') {
          console.warn('Automatic Inbox provider sync failed.', response.status);
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
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      activeController?.abort();
      syncingRef.current = false;
    };
  }, []);

  return <StableInbox />;
}
