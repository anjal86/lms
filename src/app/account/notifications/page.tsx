'use client';

import { useEffect, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { useApp } from '@/lib/store';
import type { SoundPreset, UserPreferences } from '@/lib/types';
import { FormField, SettingsSection, SettingsToggle, StickySaveBar } from '@/components/settings/SettingsPrimitives';

type Draft = { notification_sound_enabled: boolean; mute_sound_in_call: boolean; notification_sound_preset: SoundPreset; notification_volume: number; browser_push_enabled: boolean };
const fromPreferences = (preferences: UserPreferences): Draft => ({
  notification_sound_enabled: preferences.notification_sound_enabled ?? true,
  mute_sound_in_call: preferences.mute_sound_in_call ?? true,
  notification_sound_preset: preferences.notification_sound_preset || 'chime',
  notification_volume: preferences.notification_volume ?? 75,
  browser_push_enabled: preferences.browser_push_enabled ?? false,
});

export default function AccountNotificationsPage() {
  const { currentUser, updateUserPreferences, playNotificationSound, showToast } = useApp();
  const saved = fromPreferences(currentUser.user_preferences || {} as UserPreferences);
  const [draft, setDraft] = useState<Draft>(saved);
  useEffect(() => { setDraft(saved); }, [currentUser.id, currentUser.user_preferences]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const change = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((previous) => ({ ...previous, [key]: value }));
  const save = () => {
    if (!currentUser.id) return;
    updateUserPreferences(currentUser.id, draft);
    showToast('Notification preferences saved.', 'success');
  };
  return <div className="surface-flat p-5">
    <SettingsSection id="account-notifications" title="Notifications" description="Alert behavior for your account only.">
      <SettingsToggle label="Notification sound" description="Play a sound for supported assignments and alerts." checked={draft.notification_sound_enabled} onChange={(value) => change('notification_sound_enabled', value)} />
      <SettingsToggle label="Mute during calls" description="Suppress alert audio while your status is in-call." checked={draft.mute_sound_in_call} onChange={(value) => change('mute_sound_in_call', value)} />
      <div className="grid gap-4 border-t border-zinc-200 py-4 sm:grid-cols-2">
        <FormField label="Sound"><select value={draft.notification_sound_preset} onChange={(event) => change('notification_sound_preset', event.target.value as SoundPreset)} className="select-field w-full">{(['chime', 'modern_bell', 'radar', 'subtle', 'off'] as SoundPreset[]).map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></FormField>
        <FormField label={`Volume: ${draft.notification_volume}%`}><input type="range" min={0} max={100} value={draft.notification_volume} onChange={(event) => change('notification_volume', Number(event.target.value))} className="mt-2 w-full" /></FormField>
        <button type="button" onClick={() => playNotificationSound(draft.notification_sound_preset, draft.notification_volume)} className="button-secondary min-h-11 justify-self-start"><Volume2 className="h-4 w-4" /> Test sound</button>
      </div>
      <SettingsToggle label="Browser notifications" description="Show supported notifications when the CRM tab is not visible." checked={draft.browser_push_enabled} onChange={(value) => change('browser_push_enabled', value)} />
    </SettingsSection>
    {dirty && <StickySaveBar saving={false} onSave={save} onDiscard={() => setDraft(saved)} />}
  </div>;
}
