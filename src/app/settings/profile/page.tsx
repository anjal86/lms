'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BellRing, Save, ShieldCheck, UserRound, Volume2 } from 'lucide-react';
import { useApp } from '@/lib/store';
import type { DateFormat, SoundPreset, UserPreferences } from '@/lib/types';

type PersonalPreferences = UserPreferences & {
  language?: string;
  timezone?: string | null;
  date_format?: DateFormat | null;
  notification_sound_enabled?: boolean;
  notification_sound_preset?: SoundPreset;
  notification_volume?: number;
  mute_sound_in_call?: boolean;
  browser_push_enabled?: boolean;
  toast_duration_seconds?: number;
};

export default function ProfileSettingsPage() {
  const { currentUser, updateProfile, updateUserPreferences, playNotificationSound, showToast } = useApp();
  const preferences = useMemo(() => (currentUser.user_preferences || {}) as PersonalPreferences, [currentUser.user_preferences]);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [bio, setBio] = useState('');
  const [officeLocation, setOfficeLocation] = useState('');
  const [language, setLanguage] = useState('auto');
  const [timezone, setTimezone] = useState('');
  const [dateFormat, setDateFormat] = useState<DateFormat | ''>('');
  const [landingPage, setLandingPage] = useState<UserPreferences['default_landing_page']>('/leads');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundPreset, setSoundPreset] = useState<SoundPreset>('chime');
  const [volume, setVolume] = useState(75);
  const [muteInCall, setMuteInCall] = useState(true);
  const [browserPush, setBrowserPush] = useState(false);
  const [toastDuration, setToastDuration] = useState(3);

  useEffect(() => {
    setFullName(currentUser.full_name || '');
    setPhone(currentUser.phone || '');
    setAvatarUrl(currentUser.avatar_url || '');
    setBio(currentUser.bio || '');
    setOfficeLocation(currentUser.office_location || '');
    setLanguage(preferences.language || 'auto');
    setTimezone(preferences.timezone || '');
    setDateFormat(preferences.date_format || '');
    setLandingPage(preferences.default_landing_page || '/leads');
    setSoundEnabled(preferences.notification_sound_enabled ?? true);
    setSoundPreset(preferences.notification_sound_preset || 'chime');
    setVolume(preferences.notification_volume ?? 75);
    setMuteInCall(preferences.mute_sound_in_call ?? true);
    setBrowserPush(preferences.browser_push_enabled ?? false);
    setToastDuration(preferences.toast_duration_seconds || 3);
  }, [currentUser.id, currentUser.full_name, currentUser.phone, currentUser.avatar_url, currentUser.bio, currentUser.office_location, preferences]);

  const save = () => {
    if (!currentUser.id || !fullName.trim()) return;
    updateProfile(currentUser.id, {
      full_name: fullName.trim(),
      phone: phone.trim(),
      avatar_url: avatarUrl.trim(),
      bio: bio.trim(),
      office_location: officeLocation.trim(),
    });
    updateUserPreferences(currentUser.id, {
      language: language.trim() || 'auto',
      timezone: timezone.trim() || null,
      date_format: dateFormat || null,
      default_landing_page: landingPage,
      notification_sound_enabled: soundEnabled,
      notification_sound_preset: soundPreset,
      notification_volume: volume,
      mute_sound_in_call: muteInCall,
      browser_push_enabled: browserPush,
      toast_duration_seconds: toastDuration,
    } as Partial<UserPreferences>);
    showToast('Personal settings saved.', 'success');
  };

  return (
    <div className="app-page mx-auto max-w-5xl space-y-5">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Personal</p>
          <h1 className="page-title">My Profile</h1>
          <p className="page-description">Your identity, preferences and alert behavior. These settings belong to your account, not the workspace.</p>
        </div>
        <div className="page-actions">
          <Link href="/settings" className="button-secondary"><ArrowLeft className="h-4 w-4" /> Settings</Link>
          <button type="button" onClick={save} className="button-primary"><Save className="h-4 w-4" /> Save profile</button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="surface-flat p-5">
          <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700"><UserRound className="h-4 w-4" /></span><div><h2 className="section-heading">Personal information</h2><p className="section-description">Used across assignments, mentions and customer-facing activity.</p></div></div>
          <div className="mt-5 grid gap-4">
            <label className="text-xs font-semibold text-zinc-700">Full name<input className="field mt-1.5" value={fullName} onChange={(event) => setFullName(event.target.value)} /></label>
            <label className="text-xs font-semibold text-zinc-700">Phone<input className="field mt-1.5" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
            <label className="text-xs font-semibold text-zinc-700">Avatar URL<input className="field mt-1.5" value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} placeholder="https://…" /></label>
            <label className="text-xs font-semibold text-zinc-700">Office location<input className="field mt-1.5" value={officeLocation} onChange={(event) => setOfficeLocation(event.target.value)} /></label>
            <label className="text-xs font-semibold text-zinc-700">Bio<textarea className="field mt-1.5 min-h-24" value={bio} onChange={(event) => setBio(event.target.value)} /></label>
          </div>
        </section>

        <section className="surface-flat p-5">
          <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><ShieldCheck className="h-4 w-4" /></span><div><h2 className="section-heading">Account & preferences</h2><p className="section-description">Workspace access is managed separately by administrators.</p></div></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-semibold text-zinc-700 sm:col-span-2">Email<input className="field mt-1.5 bg-zinc-50" value={currentUser.email || ''} readOnly /></label>
            <label className="text-xs font-semibold text-zinc-700">Workspace role<input className="field mt-1.5 bg-zinc-50 capitalize" value={currentUser.workspace_role || currentUser.role} readOnly /></label>
            <label className="text-xs font-semibold text-zinc-700">Language<input className="field mt-1.5" value={language} onChange={(event) => setLanguage(event.target.value)} placeholder="auto or en" /></label>
            <label className="text-xs font-semibold text-zinc-700">Personal timezone<input className="field mt-1.5" value={timezone} onChange={(event) => setTimezone(event.target.value)} placeholder="Asia/Kathmandu" /></label>
            <label className="text-xs font-semibold text-zinc-700">Date format<select className="select-field mt-1.5 w-full" value={dateFormat} onChange={(event) => setDateFormat(event.target.value as DateFormat | '')}><option value="">Use workspace default</option><option value="DD/MM/YYYY">DD/MM/YYYY</option><option value="MM/DD/YYYY">MM/DD/YYYY</option><option value="YYYY-MM-DD">YYYY-MM-DD</option></select></label>
            <label className="text-xs font-semibold text-zinc-700 sm:col-span-2">Default landing page<select className="select-field mt-1.5 w-full" value={landingPage} onChange={(event) => setLandingPage(event.target.value as UserPreferences['default_landing_page'])}><option value="/dashboard">Dashboard</option><option value="/leads">Leads / Work</option><option value="/follow-ups">Follow-ups</option><option value="/analytics">Analytics</option><option value="/team">Team</option></select></label>
          </div>
        </section>

        <section className="surface-flat p-5 lg:col-span-2">
          <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-700"><BellRing className="h-4 w-4" /></span><div><h2 className="section-heading">My notifications</h2><p className="section-description">Personal alert preferences no longer modify workspace-wide notification behavior.</p></div></div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-800"><span><span className="block">Notification sound</span><span className="text-xs font-normal text-zinc-500">Play sound for supported alerts.</span></span><input type="checkbox" checked={soundEnabled} onChange={(event) => setSoundEnabled(event.target.checked)} /></label>
            <label className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-800"><span><span className="block">Mute while in a call</span><span className="text-xs font-normal text-zinc-500">Reduce interruptions while your status is in-call.</span></span><input type="checkbox" checked={muteInCall} onChange={(event) => setMuteInCall(event.target.checked)} /></label>
            <label className="text-xs font-semibold text-zinc-700">Sound<select value={soundPreset} onChange={(event) => setSoundPreset(event.target.value as SoundPreset)} className="select-field mt-1.5 w-full">{(['chime','modern_bell','radar','subtle','off'] as SoundPreset[]).map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label>
            <label className="text-xs font-semibold text-zinc-700">Volume<input type="range" min={0} max={100} value={volume} onChange={(event) => setVolume(Number(event.target.value))} className="mt-3 w-full" /></label>
            <label className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-800"><span><span className="block">Browser notifications</span><span className="text-xs font-normal text-zinc-500">Allow supported browser push alerts.</span></span><input type="checkbox" checked={browserPush} onChange={(event) => setBrowserPush(event.target.checked)} /></label>
            <label className="text-xs font-semibold text-zinc-700">Toast duration (seconds)<input type="number" min={1} max={15} value={toastDuration} onChange={(event) => setToastDuration(Number(event.target.value))} className="field mt-1.5" /></label>
          </div>
          <div className="mt-4"><button type="button" onClick={() => playNotificationSound(soundPreset, volume)} className="button-secondary"><Volume2 className="h-4 w-4" /> Test sound</button></div>
        </section>
      </div>
    </div>
  );
}
