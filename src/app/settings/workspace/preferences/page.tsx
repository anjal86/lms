'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, Database, DollarSign, Download, Plus, Tag, Trash2, Upload } from 'lucide-react';
import { useApp } from '@/lib/store';
import type { CurrencyCode, DateFormat } from '@/lib/types';
import {
  ConfirmDialog,
  DirtySaveBar,
  FieldLabel,
  InlineNotice,
  SettingsSection,
  useUnsavedChangesGuard,
} from '@/components/settings/SettingsPrimitives';

type Snapshot = {
  currency: CurrencyCode;
  dateFormat: DateFormat;
  timezone: string;
  minMargin: number;
  tdsPct: number;
  lostReasons: string[];
  leadSources: string[];
  autoArchiveDays: number;
};

function comparable(value: Snapshot) {
  return JSON.stringify({ ...value, lostReasons: [...value.lostReasons].sort(), leadSources: [...value.leadSources].sort() });
}

export default function WorkspacePreferencesPage() {
  const { currentUser, agencySettings, updateAgencySettings, exportCrmBackup, importCrmBackup, showToast } = useApp();
  const restoreFileInputRef = useRef<HTMLInputElement>(null);
  const initial = useMemo<Snapshot>(() => ({
    currency: agencySettings.currency || 'USD',
    dateFormat: agencySettings.date_format || 'DD/MM/YYYY',
    timezone: agencySettings.timezone || 'Asia/Kathmandu',
    minMargin: agencySettings.min_gross_margin_threshold || 12,
    tdsPct: agencySettings.commission_tds_pct || 10,
    lostReasons: agencySettings.custom_lost_reasons || [],
    leadSources: agencySettings.custom_lead_sources || [],
    autoArchiveDays: agencySettings.auto_archive_days || 30,
  }), [agencySettings]);

  const [currency, setCurrency] = useState<CurrencyCode>(initial.currency);
  const [dateFormat, setDateFormat] = useState<DateFormat>(initial.dateFormat);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [minMargin, setMinMargin] = useState(initial.minMargin);
  const [tdsPct, setTdsPct] = useState(initial.tdsPct);
  const [lostReasons, setLostReasons] = useState<string[]>(initial.lostReasons);
  const [newReason, setNewReason] = useState('');
  const [leadSources, setLeadSources] = useState<string[]>(initial.leadSources);
  const [newSource, setNewSource] = useState('');
  const [autoArchiveDays, setAutoArchiveDays] = useState(initial.autoArchiveDays);
  const [baseline, setBaseline] = useState<Snapshot>(initial);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);

  useEffect(() => { document.title = 'Workspace Preferences'; }, []);

  const current: Snapshot = useMemo(() => ({ currency, dateFormat, timezone, minMargin, tdsPct, lostReasons, leadSources, autoArchiveDays }), [currency, dateFormat, timezone, minMargin, tdsPct, lostReasons, leadSources, autoArchiveDays]);
  const dirty = comparable(current) !== comparable(baseline);
  useUnsavedChangesGuard(dirty);

  if (currentUser.role === 'agent') {
    return <div className="mx-auto max-w-xl py-16 text-center"><h1 className="text-lg font-semibold text-zinc-950">Workspace settings unavailable</h1><p className="mt-2 text-sm text-zinc-500">Workspace configuration is managed by managers and administrators.</p></div>;
  }

  const saveAll = () => {
    updateAgencySettings({
      currency,
      date_format: dateFormat,
      timezone: timezone.trim() || 'UTC',
      min_gross_margin_threshold: Number(minMargin),
      commission_tds_pct: Number(tdsPct),
      custom_lost_reasons: lostReasons,
      custom_lead_sources: leadSources,
      auto_archive_days: Number(autoArchiveDays),
    });
    setBaseline(current);
    showToast('Workspace preferences saved.', 'success');
  };

  const discard = () => {
    setCurrency(baseline.currency);
    setDateFormat(baseline.dateFormat);
    setTimezone(baseline.timezone);
    setMinMargin(baseline.minMargin);
    setTdsPct(baseline.tdsPct);
    setLostReasons(baseline.lostReasons);
    setLeadSources(baseline.leadSources);
    setAutoArchiveDays(baseline.autoArchiveDays);
  };

  const importBackup = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const content = loadEvent.target?.result as string;
      const success = Boolean(content) && importCrmBackup(content);
      setBackupStatus(success ? 'Workspace snapshot restored.' : 'Restore is unavailable or the snapshot is invalid.');
    };
    reader.onerror = () => setBackupStatus('Unable to read the selected snapshot.');
    reader.readAsText(file);
    event.target.value = '';
  };

  return (
    <div className="app-page">
      <header className="page-header">
        <div><p className="page-eyebrow">Operations & governance</p><h1 className="page-title">Data & defaults</h1><p className="page-description">Shared regional, commercial, taxonomy and workspace-data settings.</p></div>
      </header>

      <div className="space-y-4">
        <SettingsSection title="Regional & commercial" description="Defaults shared by everyone in this workspace." icon={DollarSign}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldLabel label="Currency"><select value={currency} onChange={(event) => setCurrency(event.target.value as CurrencyCode)} className="select-field mt-1.5">{(['USD','EUR','GBP','INR','AUD','AED'] as CurrencyCode[]).map((code) => <option key={code} value={code}>{code}</option>)}</select></FieldLabel>
            <FieldLabel label="Workspace date format"><select value={dateFormat} onChange={(event) => setDateFormat(event.target.value as DateFormat)} className="select-field mt-1.5"><option value="DD/MM/YYYY">DD/MM/YYYY</option><option value="MM/DD/YYYY">MM/DD/YYYY</option><option value="YYYY-MM-DD">YYYY-MM-DD</option></select></FieldLabel>
            <div className="sm:col-span-2"><FieldLabel label="Workspace timezone" hint="Use an IANA timezone. Individual users can override their display preference under Account."><input value={timezone} onChange={(event) => setTimezone(event.target.value)} className="field mt-1.5" placeholder="Asia/Kathmandu" /></FieldLabel></div>
            <FieldLabel label="Minimum gross margin (%)"><input type="number" min={0} max={100} value={minMargin} onChange={(event) => setMinMargin(Number(event.target.value))} className="field mt-1.5" /></FieldLabel>
            <FieldLabel label="Commission withholding (%)"><input type="number" min={0} max={100} value={tdsPct} onChange={(event) => setTdsPct(Number(event.target.value))} className="field mt-1.5" /></FieldLabel>
          </div>
        </SettingsSection>

        <SettingsSection title="Taxonomies" description="Shared lost reasons, acquisition sources and archive behavior." icon={Tag}>
          <div className="grid gap-6 lg:grid-cols-2">
            <div><div className="text-xs font-semibold text-zinc-700">Lost reasons</div><div className="mt-2 flex min-h-8 flex-wrap gap-2">{lostReasons.map((reason) => <span key={reason} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700">{reason}<button type="button" onClick={() => setLostReasons((items) => items.filter((item) => item !== reason))} aria-label={`Remove ${reason}`} className="rounded p-0.5 hover:bg-zinc-200"><Trash2 className="h-3 w-3" /></button></span>)}</div><form onSubmit={(event) => { event.preventDefault(); const value = newReason.trim(); if (!value) return; setLostReasons((items) => Array.from(new Set([...items, value]))); setNewReason(''); }} className="mt-3 flex gap-2"><input value={newReason} onChange={(event) => setNewReason(event.target.value)} placeholder="Add lost reason" className="field" /><button type="submit" className="button-secondary px-3" aria-label="Add lost reason"><Plus className="h-4 w-4" /></button></form></div>
            <div><div className="text-xs font-semibold text-zinc-700">Lead sources</div><div className="mt-2 flex min-h-8 flex-wrap gap-2">{leadSources.map((source) => <span key={source} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700">{source.replaceAll('_', ' ')}<button type="button" onClick={() => setLeadSources((items) => items.filter((item) => item !== source))} aria-label={`Remove ${source}`} className="rounded p-0.5 hover:bg-zinc-200"><Trash2 className="h-3 w-3" /></button></span>)}</div><form onSubmit={(event) => { event.preventDefault(); const value = newSource.trim().toLowerCase().replace(/\s+/g, '_'); if (!value) return; setLeadSources((items) => Array.from(new Set([...items, value]))); setNewSource(''); }} className="mt-3 flex gap-2"><input value={newSource} onChange={(event) => setNewSource(event.target.value)} placeholder="Add source" className="field" /><button type="submit" className="button-secondary px-3" aria-label="Add lead source"><Plus className="h-4 w-4" /></button></form></div>
          </div>
          <div className="mt-5 max-w-sm"><FieldLabel label="Archive closed records after days"><input type="number" min={1} max={3650} value={autoArchiveDays} onChange={(event) => setAutoArchiveDays(Number(event.target.value))} className="field mt-1.5" /></FieldLabel></div>
        </SettingsSection>

        <SettingsSection title="Workspace data" description="Controlled workspace export and restore tools. Installation backups remain a deployment responsibility." icon={Database}>
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => { exportCrmBackup(); setBackupStatus('Workspace snapshot export requested.'); }} className="button-secondary justify-center"><Download className="h-4 w-4" /> Export snapshot</button>
            <button type="button" onClick={() => setConfirmRestore(true)} className="button-secondary justify-center"><Upload className="h-4 w-4" /> Restore snapshot</button>
            <input ref={restoreFileInputRef} type="file" accept="application/json,.json" onChange={importBackup} className="hidden" />
          </div>
          {backupStatus && <div className="mt-4"><InlineNotice tone={backupStatus.includes('restored') || backupStatus.includes('requested') ? 'success' : 'warning'}>{backupStatus}</InlineNotice></div>}
          <div className="mt-4 flex items-center gap-2 text-xs text-zinc-500"><Calendar className="h-3.5 w-3.5" /> Database-level backups, retention and infrastructure health belong to System Console.</div>
        </SettingsSection>

        <DirtySaveBar dirty={dirty} saving={false} onSave={saveAll} onDiscard={discard} label="Save workspace settings" />
      </div>

      <ConfirmDialog open={confirmRestore} title="Restore workspace snapshot?" description="Restoring a snapshot can replace workspace data and configuration. Export a current snapshot first if you may need to roll back." confirmLabel="Choose snapshot" onCancel={() => setConfirmRestore(false)} onConfirm={() => { setConfirmRestore(false); restoreFileInputRef.current?.click(); }} />
    </div>
  );
}
