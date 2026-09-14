'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  BellRing,
  Calendar,
  Database,
  DollarSign,
  Download,
  Plus,
  Save,
  Settings,
  Tag,
  Trash2,
  Upload,
  Volume2,
} from 'lucide-react';
import { useApp } from '@/lib/store';
import type { CurrencyCode, DateFormat, SoundPreset } from '@/lib/types';

export default function AdvancedSettingsPage() {
  const {
    currentUser,
    agencySettings,
    updateAgencySettings,
    playNotificationSound,
    exportCrmBackup,
    importCrmBackup,
  } = useApp();
  const restoreFileInputRef = useRef<HTMLInputElement>(null);
  const [savedSection, setSavedSection] = useState<string | null>(null);
  const [backupStatus, setBackupStatus] = useState<{ type: 'idle' | 'success' | 'error'; message?: string }>({ type: 'idle' });

  const [currency, setCurrency] = useState<CurrencyCode>(agencySettings.currency || 'USD');
  const [dateFormat, setDateFormat] = useState<DateFormat>(agencySettings.date_format || 'DD/MM/YYYY');
  const [minMargin, setMinMargin] = useState(agencySettings.min_gross_margin_threshold || 12);
  const [tdsPct, setTdsPct] = useState(agencySettings.commission_tds_pct || 10);

  const [soundEnabled, setSoundEnabled] = useState(agencySettings.notification_sound_enabled ?? true);
  const [soundPreset, setSoundPreset] = useState<SoundPreset>(agencySettings.notification_sound_preset || 'chime');
  const [volume, setVolume] = useState(agencySettings.notification_volume ?? 75);
  const [muteInCall, setMuteInCall] = useState(agencySettings.mute_sound_in_call ?? true);
  const [browserPush, setBrowserPush] = useState(agencySettings.browser_push_enabled ?? false);
  const [toastDuration, setToastDuration] = useState(agencySettings.toast_duration_seconds || 3);

  const [lostReasons, setLostReasons] = useState<string[]>(agencySettings.custom_lost_reasons || []);
  const [newReasonInput, setNewReasonInput] = useState('');
  const [leadSources, setLeadSources] = useState<string[]>(agencySettings.custom_lead_sources || []);
  const [newSourceInput, setNewSourceInput] = useState('');
  const [autoArchiveDays, setAutoArchiveDays] = useState(agencySettings.auto_archive_days || 30);

  useEffect(() => { document.title = 'Advanced Settings'; }, []);

  if (currentUser.role === 'agent') {
    return <div className="mx-auto max-w-xl py-16 text-center"><h1 className="text-lg font-semibold text-zinc-950">Settings unavailable</h1><p className="mt-2 text-sm text-zinc-500">Workspace configuration is managed by managers and administrators.</p></div>;
  }

  const saved = (section: string) => {
    setSavedSection(section);
    window.setTimeout(() => setSavedSection(null), 1600);
  };

  const saveRegional = (event: React.FormEvent) => {
    event.preventDefault();
    updateAgencySettings({ currency, date_format: dateFormat, min_gross_margin_threshold: Number(minMargin), commission_tds_pct: Number(tdsPct) });
    saved('regional');
  };

  const saveNotifications = (event: React.FormEvent) => {
    event.preventDefault();
    updateAgencySettings({
      notification_sound_enabled: soundEnabled,
      notification_sound_preset: soundPreset,
      notification_volume: Number(volume),
      mute_sound_in_call: muteInCall,
      browser_push_enabled: browserPush,
      toast_duration_seconds: Number(toastDuration),
    });
    saved('notifications');
  };

  const saveTaxonomy = () => {
    updateAgencySettings({ custom_lost_reasons: lostReasons, custom_lead_sources: leadSources, auto_archive_days: Number(autoArchiveDays) });
    saved('taxonomy');
  };

  const addReason = (event: React.FormEvent) => {
    event.preventDefault();
    const value = newReasonInput.trim();
    if (!value) return;
    const next = Array.from(new Set([...lostReasons, value]));
    setLostReasons(next);
    setNewReasonInput('');
    updateAgencySettings({ custom_lost_reasons: next });
  };

  const addSource = (event: React.FormEvent) => {
    event.preventDefault();
    const value = newSourceInput.trim().toLowerCase().replace(/\s+/g, '_');
    if (!value) return;
    const next = Array.from(new Set([...leadSources, value]));
    setLeadSources(next);
    setNewSourceInput('');
    updateAgencySettings({ custom_lead_sources: next });
  };

  const importBackup = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const content = loadEvent.target?.result as string;
      const success = Boolean(content) && importCrmBackup(content);
      setBackupStatus(success
        ? { type: 'success', message: 'Workspace snapshot restored.' }
        : { type: 'error', message: 'The selected file is not a valid workspace snapshot.' });
    };
    reader.onerror = () => setBackupStatus({ type: 'error', message: 'Unable to read the selected backup.' });
    reader.readAsText(file);
    event.target.value = '';
  };

  return (
    <div className="app-page mx-auto max-w-6xl">
      <header className="page-header">
        <div><p className="page-eyebrow">Workspace</p><h1 className="page-title">Advanced Settings</h1><p className="page-description">Regional preferences, notifications, taxonomies and data portability. SLA, routing and integrations live in their dedicated settings.</p></div>
        <div className="page-actions"><Link href="/settings/workspace" className="button-secondary"><Settings className="h-4 w-4" /> Settings</Link></div>
      </header>

      <div className="grid gap-4 xl:grid-cols-2">
        <form onSubmit={saveRegional} className="surface-flat p-5">
          <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><DollarSign className="h-4 w-4" /></span><div><h2 className="section-heading">Regional & financial</h2><p className="section-description">Display and commercial defaults used across the workspace.</p></div></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-semibold text-zinc-700">Currency<select value={currency} onChange={(event) => setCurrency(event.target.value as CurrencyCode)} className="select-field mt-1.5 w-full">{(['USD','EUR','GBP','INR','AUD','AED'] as CurrencyCode[]).map((code) => <option key={code} value={code}>{code}</option>)}</select></label>
            <label className="text-xs font-semibold text-zinc-700">Date format<select value={dateFormat} onChange={(event) => setDateFormat(event.target.value as DateFormat)} className="select-field mt-1.5 w-full"><option value="DD/MM/YYYY">DD/MM/YYYY</option><option value="MM/DD/YYYY">MM/DD/YYYY</option><option value="YYYY-MM-DD">YYYY-MM-DD</option></select></label>
            <label className="text-xs font-semibold text-zinc-700">Minimum gross margin (%)<input type="number" min={0} max={100} value={minMargin} onChange={(event) => setMinMargin(Number(event.target.value))} className="field mt-1.5" /></label>
            <label className="text-xs font-semibold text-zinc-700">Commission withholding (%)<input type="number" min={0} max={100} value={tdsPct} onChange={(event) => setTdsPct(Number(event.target.value))} className="field mt-1.5" /></label>
          </div>
          <div className="mt-5 flex justify-end"><button type="submit" className="button-primary"><Save className="h-4 w-4" /> {savedSection === 'regional' ? 'Saved' : 'Save regional'}</button></div>
        </form>

        <form onSubmit={saveNotifications} className="surface-flat p-5">
          <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><BellRing className="h-4 w-4" /></span><div><h2 className="section-heading">Notifications</h2><p className="section-description">Personal workspace alert behavior, separate from SLA policy.</p></div></div>
          <div className="mt-5 space-y-4">
            <label className="flex items-center justify-between gap-4 text-sm font-medium text-zinc-800"><span><span className="block">Notification sound</span><span className="text-xs font-normal text-zinc-500">Play a sound for supported workspace alerts.</span></span><input type="checkbox" checked={soundEnabled} onChange={(event) => setSoundEnabled(event.target.checked)} /></label>
            <div className="grid gap-4 sm:grid-cols-2"><label className="text-xs font-semibold text-zinc-700">Sound<select value={soundPreset} onChange={(event) => setSoundPreset(event.target.value as SoundPreset)} className="select-field mt-1.5 w-full">{(['chime','modern_bell','radar','subtle','off'] as SoundPreset[]).map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label><label className="text-xs font-semibold text-zinc-700">Volume<input type="range" min={0} max={100} value={volume} onChange={(event) => setVolume(Number(event.target.value))} className="mt-3 w-full" /></label></div>
            <div className="flex flex-wrap gap-2"><button type="button" onClick={() => playNotificationSound()} className="button-secondary"><Volume2 className="h-4 w-4" /> Test sound</button></div>
            <label className="flex items-center justify-between gap-4 text-sm font-medium text-zinc-800"><span><span className="block">Mute while in a call</span><span className="text-xs font-normal text-zinc-500">Reduce interruption while your status is in-call.</span></span><input type="checkbox" checked={muteInCall} onChange={(event) => setMuteInCall(event.target.checked)} /></label>
            <label className="flex items-center justify-between gap-4 text-sm font-medium text-zinc-800"><span><span className="block">Browser notifications</span><span className="text-xs font-normal text-zinc-500">Allow supported browser push alerts.</span></span><input type="checkbox" checked={browserPush} onChange={(event) => setBrowserPush(event.target.checked)} /></label>
            <label className="block text-xs font-semibold text-zinc-700">Toast duration (seconds)<input type="number" min={1} max={15} value={toastDuration} onChange={(event) => setToastDuration(Number(event.target.value))} className="field mt-1.5" /></label>
          </div>
          <div className="mt-5 flex justify-end"><button type="submit" className="button-primary"><Save className="h-4 w-4" /> {savedSection === 'notifications' ? 'Saved' : 'Save notifications'}</button></div>
        </form>

        <section className="surface-flat p-5">
          <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-700"><Tag className="h-4 w-4" /></span><div><h2 className="section-heading">Taxonomies</h2><p className="section-description">Shared lost reasons and acquisition sources.</p></div></div>
          <div className="mt-5 space-y-5">
            <div><div className="text-xs font-semibold text-zinc-700">Lost reasons</div><div className="mt-2 flex flex-wrap gap-2">{lostReasons.map((reason) => <span key={reason} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700">{reason}<button type="button" onClick={() => { const next = lostReasons.filter((item) => item !== reason); setLostReasons(next); updateAgencySettings({ custom_lost_reasons: next }); }} aria-label={`Remove ${reason}`}><Trash2 className="h-3 w-3" /></button></span>)}</div><form onSubmit={addReason} className="mt-2 flex gap-2"><input value={newReasonInput} onChange={(event) => setNewReasonInput(event.target.value)} placeholder="Add lost reason" className="field" /><button type="submit" className="button-secondary px-3"><Plus className="h-4 w-4" /></button></form></div>
            <div><div className="text-xs font-semibold text-zinc-700">Lead sources</div><div className="mt-2 flex flex-wrap gap-2">{leadSources.map((source) => <span key={source} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700">{source.replaceAll('_', ' ')}<button type="button" onClick={() => { const next = leadSources.filter((item) => item !== source); setLeadSources(next); updateAgencySettings({ custom_lead_sources: next }); }} aria-label={`Remove ${source}`}><Trash2 className="h-3 w-3" /></button></span>)}</div><form onSubmit={addSource} className="mt-2 flex gap-2"><input value={newSourceInput} onChange={(event) => setNewSourceInput(event.target.value)} placeholder="Add source" className="field" /><button type="submit" className="button-secondary px-3"><Plus className="h-4 w-4" /></button></form></div>
            <label className="block text-xs font-semibold text-zinc-700">Archive closed records after days<input type="number" min={1} max={3650} value={autoArchiveDays} onChange={(event) => setAutoArchiveDays(Number(event.target.value))} className="field mt-1.5" /></label>
          </div>
          <div className="mt-5 flex justify-end"><button type="button" onClick={saveTaxonomy} className="button-primary"><Save className="h-4 w-4" /> {savedSection === 'taxonomy' ? 'Saved' : 'Save taxonomy'}</button></div>
        </section>

        <section className="surface-flat p-5">
          <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-700"><Database className="h-4 w-4" /></span><div><h2 className="section-heading">Data & backup</h2><p className="section-description">Export or restore a controlled workspace snapshot.</p></div></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => { exportCrmBackup(); setBackupStatus({ type: 'success', message: 'Workspace snapshot downloaded.' }); }} className="button-secondary justify-center"><Download className="h-4 w-4" /> Export snapshot</button>
            <button type="button" onClick={() => restoreFileInputRef.current?.click()} className="button-secondary justify-center"><Upload className="h-4 w-4" /> Restore snapshot</button>
            <input ref={restoreFileInputRef} type="file" accept="application/json,.json" onChange={importBackup} className="hidden" />
          </div>
          {backupStatus.type !== 'idle' && <div className={`mt-4 rounded-lg border px-3 py-2 text-xs ${backupStatus.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>{backupStatus.message}</div>}
          <div className="mt-4 flex items-center gap-2 text-xs text-zinc-500"><Calendar className="h-3.5 w-3.5" /> Database-level production backups should remain part of deployment operations.</div>
        </section>
      </div>
    </div>
  );
}
