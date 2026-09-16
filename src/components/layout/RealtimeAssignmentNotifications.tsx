'use client';

import { useEffect, useRef } from 'react';
import { useApp } from '@/lib/store';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { SoundPreset } from '@/lib/types';

type AssignmentNotification = {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'lead_assigned' | 'reassignment' | string;
  link?: string | null;
};

type PersonalAlertPreferences = {
  notification_sound_enabled?: boolean;
  notification_sound_preset?: SoundPreset;
  notification_volume?: number;
  mute_sound_in_call?: boolean;
  browser_push_enabled?: boolean;
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

  const preferences = (currentUser.user_preferences || {}) as PersonalAlertPreferences;
  const soundEnabled = preferences.notification_sound_enabled ?? agencySettings.notification_sound_enabled ?? true;
  const soundPreset = preferences.notification_sound_preset || agencySettings.notification_sound_preset || 'chime';
  const soundVolume = preferences.notification_volume ?? agencySettings.notification_volume ?? 75;
  const muteInCall = preferences.mute_sound_in_call ?? agencySettings.mute_sound_in_call ?? true;
  const browserPushEnabled = preferences.browser_push_enabled ?? agencySettings.browser_push_enabled ?? false;

  const alertRef = useRef({
    showToast,
    playNotificationSound,
    soundEnabled,
    soundPreset,
    soundVolume,
    muteInCall,
    currentStatus: currentUser.status,
    browserPushEnabled,
  });

  useEffect(() => {
    alertRef.current = {
      showToast,
      playNotificationSound,
      soundEnabled,
      soundPreset,
      soundVolume,
      muteInCall,
      currentStatus: currentUser.status,
      browserPushEnabled,
    };
  }, [browserPushEnabled, currentUser.status, muteInCall, playNotificationSound, showToast, soundEnabled, soundPreset, soundVolume]);

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
          if (alertRef.current.soundEnabled && !(alertRef.current.muteInCall && alertRef.current.currentStatus === 'in_call')) {
            alertRef.current.playNotificationSound(alertRef.current.soundPreset, alertRef.current.soundVolume);
          }

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
