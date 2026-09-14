'use client';

import { useEffect, useRef } from 'react';
import { useApp } from '@/lib/store';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

type AssignmentNotification = {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'lead_assigned' | 'reassignment' | string;
  link?: string | null;
};

export default function RealtimeAssignmentNotifications() {
  const {
    currentUser,
    isAuthenticated,
    isHydrated,
    agencySettings,
    showToast,
    playNotificationSound,
  } = useApp();

  const alertRef = useRef({
    showToast,
    playNotificationSound,
    browserPushEnabled: agencySettings.browser_push_enabled,
  });

  useEffect(() => {
    alertRef.current = {
      showToast,
      playNotificationSound,
      browserPushEnabled: agencySettings.browser_push_enabled,
    };
  }, [agencySettings.browser_push_enabled, playNotificationSound, showToast]);

  useEffect(() => {
    if (!isHydrated || !isAuthenticated || !currentUser.id) return;

    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`assignment-alerts:${currentUser.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${currentUser.id}`,
        },
        (payload) => {
          const notification = payload.new as AssignmentNotification;
          if (notification.type !== 'lead_assigned' && notification.type !== 'reassignment') return;

          const title = notification.title || 'New assignment';
          const message = notification.message || 'New work was assigned to you.';
          alertRef.current.showToast(`${title} — ${message}`, 'info');
          alertRef.current.playNotificationSound();

          if (
            alertRef.current.browserPushEnabled
            && typeof document !== 'undefined'
            && document.visibilityState !== 'visible'
            && 'Notification' in window
            && Notification.permission === 'granted'
          ) {
            const browserNotification = new Notification(title, { body: message, tag: notification.id });
            browserNotification.onclick = () => {
              window.focus();
              if (notification.link) window.location.assign(notification.link);
              browserNotification.close();
            };
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUser.id, isAuthenticated, isHydrated]);

  return null;
}
