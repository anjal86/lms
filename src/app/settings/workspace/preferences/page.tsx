'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Calendar, Database, DollarSign, Download, Plus, Save, Tag, Trash2, Upload } from 'lucide-react';
import { useApp } from '@/lib/store';
import type { CurrencyCode, DateFormat } from '@/lib/types';

export default function WorkspacePreferencesPage() {
  const { currentUser, agencySettings, updateAgencySettings, exportCrmBackup, importCrmBackup, showToast } = useApp();
  const restoreFileInputRef = useRef<HTMLInputElement>(null);
  const [currency, setCurrency] = useState<CurrencyCode>(agencySettings.currency || 'USD');
  const [dateFormat, setDateFormat] = useState<DateFormat>(agencySettings.date_format || 'DD/MM/YYYY');
  const [timezone, setTimezone] = useState(agencySettings.timezone || 'Asia/Kathmandu');
  const [minMargin, setMinMargin] = useState(agencySettings.min_gross_margin_threshold || 12);
  const [tdsPct, setTdsPct] = useState(agencySettings.commission_tds_pct || 10);
  const [lostReasons, setLostReasons] = useState<string[]>(agencySettings.custom_lost_reasons || []);
  const [newReason, setNewReason] = useState('');
  const [leadSources, setLeadSources] = useState<string[]>(agencySettings.custom_lead_sources || []);
  const [newSource, setNewSource] = useState('');
  const [autoArchiveDays, setAutoArchiveDays] = useState(agencySettings.auto_archive_days || 30);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);

  useEffect(() => { document.title = 'Workspace Preferences'; }, []);

  if (currentUser.role === 'agent') {
    return <div className="mx-auto max-w-xl py-16 text-center"><h1 className="text-lg font-semibold text-zinc-950">Workspace settings unavailable</h1><p className="mt-2 text-sm text-zinc-500">Workspace configuration is managed by managers and administrators.</p></div>;
  }

  const saveRegional = () => {
    updateAgencySettings({ currency, date_format: dateFormat, timezone: timezone.trim() || 'UTC', min_gross_margin_threshold: Number(minMargin), commission_tds_pct: Number(tdsPct) });
    showToast('Workspace preferences saved.', 'success');
  };

  const saveTaxonomy = () => {
    updateAgencySettings({ custom_lost_reasons: lostReasons, custom_lead_sources: leadSources, auto_archive_days: Number(autoArchiveDays) });
    showToast('Workspace taxonomies saved.', 'success');
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
    <div className="app-page mx-auto max-w-6xl space-y-5">
      <header className="page-header">
        <div><p className="page-eyebrow">Workspace</p><h1 className="page-title">Workspace Preferences</h1><p className="page-description">Shared regional, commercial, taxonomy and data settings. Personal notification preferences now live under My Profile.</p></div>
        <div className="page-actions"><Link href="/settings/workspace" className="button-secondary"><ArrowLeft className="h-4 w-4" /> Workspace settings</Link></div>
      </header>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="surface-flat p-5">
          <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><DollarSign className="h-4 w-4" /></span><div><h2 className="section-heading">Regional & commercial</h2><p className="section-description">Defaults shared by everyone in this workspace.</p></div></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-semibold text-zinc-700">Currency<select value={currency} onChange={(event) => setCurrency(event.target.value as CurrencyCode)} className="select-field mt-1.5 w-full">{(['USD','EUR','GBP','INR','AUD','AED'] as CurrencyCode[]).map((code) => <option key={code} value={code}>{code}</option>)}</select></label>
            <label className="text-xs font-semibold text-zinc-700">Workspace date format<select value={dateFormat} onChange={(event) => setDateFormat(event.target.value as DateFormat)} className="select-field mt-1.5 w-full"><option value="DD/MM/YYYY">DD/MM/YYYY</option><option value="MM/DD/YYYY">MM/DD/YYYY</option><option value="YYYY-MM-DD">YYYY-MM-DD</option></select></label>
            <label className="text-xs font-semibold text-zinc-700 sm:col-span-2">Workspace timezone<input value={timezone} onChange={(event) => setTimezone(event.target.value)} className="field mt-1.5" placeholder="Asia/Kathmandu" /><span className="mt-1 block text-[11px] font-normal text-zinc-400">Use an IANA timezone. Individual users can override display preference in My Profile.</span></label>
            <label className="text-xs font-semibold text-zinc-700">Minimum gross margin (%)<input type="number" min={0} max={100} value={minMargin} onChange={(event) => setMinMargin(Number(event.target.value))} className="field mt-1.5" /></label>
            <label className="text-xs font-semibold text-zinc-700">Commission withholding (%)<input type="number" min={0} max={100} value={tdsPct} onChange={(event) => setTdsPct(Number(event.target.value))} className="field mt-1.5" /></label>
          </div>
          <div className="mt-5 flex justify-end"><button type="button" onClick={saveRegional} className="button-primary"><Save className="h-4 w-4" /> Save workspace defaults</button></div>
        </section>

        <section className="surface-flat p-5">
          <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-700"><Tag className="h-4 w-4" /></span><div><h2 className="section-heading">Taxonomies</h2><p className="section-description">Shared lost reasons and acquisition sources.</p></div></div>
          <div className="mt-5 space-y-5">
            <div><div className="text-xs font-semibold text-zinc-700">Lost reasons</div><div className="mt-2 flex flex-wrap gap-2">{lostReasons.map((reason) => <span key={reason} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700">{reason}<button type="button" onClick={() => setLostReasons((current) => current.filter((item) => item !== reason))} aria-label={`Remove ${reason}`}><Trash2 className="h-3 w-3" /></button></span>)}</div><form onSubmit={(event) => { event.preventDefault(); const value = newReason.trim(); if (!value) return; setLostReasons((current) => Array.from(new Set([...current, value]))); setNewReason(''); }} className="mt-2 flex gap-2"><input value={newReason} onChange={(event) => setNewReason(event.target.value)} placeholder="Add lost reason" className="field" /><button type="submit" className="button-secondary px-3"><Plus className="h-4 w-4" /></button></form></div>
            <div><div className="text-xs font-semibold text-zinc-700">Lead sources</div><div className="mt-2 flex flex-wrap gap-2">{leadSources.map((source) => <span key={source} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700">{source.replaceAll('_', ' ')}<button type="button" onClick={() => setLeadSources((current) => current.filter((item) => item !== source))} aria-label={`Remove ${source}`}><Trash2 className="h-3 w-3" /></button></span>)}</div><form onSubmit={(event) => { event.preventDefault(); const value = newSource.trim().toLowerCase().replace(/\s+/g, '_'); if (!value) return; setLeadSources((current) => Array.from(new Set([...current, value]))); setNewSource(''); }} className="mt-2 flex gap-2"><input value={newSource} onChange={(event) => setNewSource(event.target.value)} placeholder="Add source" className="field" /><button type="submit" className="button-secondary px-3"><Plus className="h-4 w-4" /></button></form></div>
            <label className="block text-xs font-semibold text-zinc-700">Archive closed records after days<input type="number" min={1} max={3650} value={autoArchiveDays} onChange={(event) => setAutoArchiveDays(Number(event.target.value))} className="field mt-1.5" /></label>
          </div>
          <div className="mt-5 flex justify-end"><button type="button" onClick={saveTaxonomy} className="button-primary"><Save className="h-4 w-4" /> Save taxonomies</button></div>
        </section>

        <section className="surface-flat p-5 xl:col-span-2">
          <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-700"><Database className="h-4 w-4" /></span><div><h2 className="section-heading">Workspace data</h2><p className="section-description">Controlled workspace export/restore tools. Installation backups remain a System/deployment responsibility.</p></div></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => { exportCrmBackup(); setBackupStatus('Workspace snapshot export requested.'); }} className="button-secondary justify-center"><Download className="h-4 w-4" /> Export snapshot</button>
            <button type="button" onClick={() => restoreFileInputRef.current?.click()} className="button-secondary justify-center"><Upload className="h-4 w-4" /> Restore snapshot</button>
            <input ref={restoreFileInputRef} type="file" accept="application/json,.json" onChange={importBackup} className="hidden" />
          </div>
          {backupStatus && <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">{backupStatus}</div>}
          <div className="mt-4 flex items-center gap-2 text-xs text-zinc-500"><Calendar className="h-3.5 w-3.5" /> Database-level backups, retention and infrastructure health belong to System Settings.</div>
        </section>
      </div>
    </div>
  );
}
