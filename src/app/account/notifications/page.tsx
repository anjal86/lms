'use client';

import { BellRing, Volume2 } from 'lucide-react';
import { useApp } from '@/lib/store';
import type { SoundPreset, UserPreferences } from '@/lib/types';

export default function AccountNotificationsPage() {
  const { currentUser, updateUserPreferences, playNotificationSound, showToast } = useApp();
  const preferences = currentUser.user_preferences || {} as UserPreferences;
  const soundEnabled = preferences.notification_sound_enabled ?? true;
  const soundPreset = preferences.notification_sound_preset || 'chime';
  const volume = preferences.notification_volume ?? 75;
  const muteInCall = preferences.mute_sound_in_call ?? true;
  const browserPush = preferences.browser_push_enabled ?? false;

  const save = (patch: Partial<UserPreferences>) => {
    if (!currentUser.id) return;
    updateUserPreferences(currentUser.id, patch);
    showToast('Notification preference saved.', 'success');
  };

  return (
    <section className="surface-flat">
      <div className="panel-header"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-700"><BellRing className="h-4 w-4" /></span><div><h2 className="section-heading">Notifications</h2><p className="section-description">Alert behavior for your account only.</p></div></div></div>
      <div className="panel-body grid gap-4 md:grid-cols-2">
        <label className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-800"><span><span className="block">Notification sound</span><span className="text-xs font-normal text-zinc-500">Play a sound for supported assignments and alerts.</span></span><input type="checkbox" checked={soundEnabled} onChange={(event) => save({ notification_sound_enabled: event.target.checked })} /></label>
        <label className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-800"><span><span className="block">Mute during calls</span><span className="text-xs font-normal text-zinc-500">Suppress alert audio while your status is in-call.</span></span><input type="checkbox" checked={muteInCall} onChange={(event) => save({ mute_sound_in_call: event.target.checked })} /></label>
        <label className="text-xs font-semibold text-zinc-700">Sound<select value={soundPreset} onChange={(event) => save({ notification_sound_preset: event.target.value as SoundPreset })} className="select-field mt-1.5 w-full">{(['chime','modern_bell','radar','subtle','off'] as SoundPreset[]).map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label>
        <label className="text-xs font-semibold text-zinc-700">Volume<input type="range" min={0} max={100} value={volume} onChange={(event) => save({ notification_volume: Number(event.target.value) })} className="mt-3 w-full" /><span className="mt-1 block text-[11px] font-normal text-zinc-400">{volume}%</span></label>
        <label className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-800 md:col-span-2"><span><span className="block">Browser notifications</span><span className="text-xs font-normal text-zinc-500">Show supported notifications when the CRM tab is not visible.</span></span><input type="checkbox" checked={browserPush} onChange={(event) => save({ browser_push_enabled: event.target.checked })} /></label>
        <div className="md:col-span-2"><button type="button" onClick={() => playNotificationSound(soundPreset, volume)} className="button-secondary"><Volume2 className="h-4 w-4" /> Test sound</button></div>
      </div>
    </section>
  );
}
