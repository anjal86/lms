'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronRight, Loader2, RefreshCw, Settings2 } from 'lucide-react';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';
import type { WorkspaceConfig } from '@/lib/platform/types';
import BusinessFieldManager from '@/components/platform/BusinessFieldManager';
import PipelineEditor from '@/components/platform/PipelineEditor';
import ModuleManager from '@/components/platform/ModuleManager';

function TemplatePicker({ config, refresh }: { config: WorkspaceConfig; refresh: () => Promise<void> }) {
  const [selectedTemplate, setSelectedTemplate] = useState(config.workspace.template_key || 'generic');
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const applyTemplate = async () => {
    if (!selectedTemplate || selectedTemplate === config.workspace.template_key) return;
    setApplying(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/platform/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateKey: selectedTemplate }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to apply business template.');
      await refresh();
      setNotice('Business model applied. Existing contacts, conversations and records were preserved.');
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : 'Unable to apply business template.');
    } finally {
      setApplying(false);
    }
  };

  return (
    <section className="space-y-4">
      <div><h2 className="text-sm font-semibold text-zinc-950">Business model</h2><p className="mt-1 text-xs text-zinc-500">Choose the closest starting point. Templates seed terminology, fields, modules and a default pipeline; your custom fields survive later template changes.</p></div>
      {(error || notice) && <div role={error ? 'alert' : 'status'} className={`rounded-md border px-3 py-2 text-xs ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{error || notice}</div>}
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {config.templates.map((template) => {
          const selected = selectedTemplate === template.key;
          const active = config.workspace.template_key === template.key;
          return (
            <button key={template.key} type="button" onClick={() => setSelectedTemplate(template.key)} className={`group flex min-h-28 items-start gap-3 rounded-lg border p-4 text-left transition ${selected ? 'border-zinc-950 bg-zinc-950 text-white' : 'border-zinc-200 bg-white text-zinc-950 hover:border-zinc-300 hover:bg-zinc-50'}`}>
              <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${selected ? 'border-white/20 bg-white/10' : 'border-zinc-200 bg-zinc-50'}`}>{active ? <Check className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</span>
              <span className="min-w-0"><span className="flex items-center gap-2 text-sm font-semibold">{template.name}{active && <span className={`text-[9px] uppercase tracking-wider ${selected ? 'text-zinc-300' : 'text-zinc-500'}`}>Current</span>}</span><span className={`mt-1.5 block text-xs leading-5 ${selected ? 'text-zinc-300' : 'text-zinc-500'}`}>{template.description}</span></span>
            </button>
          );
        })}
      </div>
      <div className="flex justify-end"><button type="button" disabled={applying || selectedTemplate === config.workspace.template_key} onClick={() => void applyTemplate()} className="button-primary">{applying && <Loader2 className="h-4 w-4 animate-spin" />} Apply selected model</button></div>
    </section>
  );
}

function IdentityForm({ config, refresh }: { config: WorkspaceConfig; refresh: () => Promise<void> }) {
  const [name, setName] = useState(config.workspace.name);
  const [timezone, setTimezone] = useState(config.workspace.timezone);
  const [currency, setCurrency] = useState(config.workspace.currency);
  const [locale, setLocale] = useState(config.workspace.locale);
  const [leadName, setLeadName] = useState(config.workspace.terminology.lead);
  const [leadPlural, setLeadPlural] = useState(config.workspace.terminology.lead_plural);
  const [contactName, setContactName] = useState(config.workspace.terminology.contact);
  const [contactPlural, setContactPlural] = useState(config.workspace.terminology.contact_plural);
  const [dealName, setDealName] = useState(config.workspace.terminology.deal);
  const [dealPlural, setDealPlural] = useState(config.workspace.terminology.deal_plural);
  const [workspaceLabel, setWorkspaceLabel] = useState(config.workspace.terminology.workspace_label);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/platform/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, timezone, currency, locale,
          terminology: {
            lead: leadName,
            lead_plural: leadPlural,
            contact: contactName,
            contact_plural: contactPlural,
            deal: dealName,
            deal_plural: dealPlural,
            workspace_label: workspaceLabel,
            convert: `Convert to ${leadName}`,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to save workspace.');
      await refresh();
      setNotice('Workspace language and regional settings saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save workspace.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4">
      <div><h2 className="text-sm font-semibold text-zinc-950">Workspace identity & language</h2><p className="mt-1 text-xs text-zinc-500">These labels replace fixed CRM wording throughout navigation, dashboards and business workspaces.</p></div>
      {(error || notice) && <div role={error ? 'alert' : 'status'} className={`rounded-md border px-3 py-2 text-xs ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{error || notice}</div>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="space-y-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 sm:col-span-2 lg:col-span-3">Company / workspace name<input value={name} onChange={(event) => setName(event.target.value)} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-xs font-normal normal-case tracking-normal text-zinc-900" /></label>
        <label className="space-y-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Lead singular<input value={leadName} onChange={(event) => setLeadName(event.target.value)} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-xs font-normal normal-case tracking-normal" /></label>
        <label className="space-y-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Lead plural<input value={leadPlural} onChange={(event) => setLeadPlural(event.target.value)} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-xs font-normal normal-case tracking-normal" /></label>
        <label className="space-y-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Workspace subtitle<input value={workspaceLabel} onChange={(event) => setWorkspaceLabel(event.target.value)} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-xs font-normal normal-case tracking-normal" /></label>
        <label className="space-y-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Contact singular<input value={contactName} onChange={(event) => setContactName(event.target.value)} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-xs font-normal normal-case tracking-normal" /></label>
        <label className="space-y-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Contact plural<input value={contactPlural} onChange={(event) => setContactPlural(event.target.value)} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-xs font-normal normal-case tracking-normal" /></label>
        <label className="space-y-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Deal singular<input value={dealName} onChange={(event) => setDealName(event.target.value)} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-xs font-normal normal-case tracking-normal" /></label>
        <label className="space-y-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Deal plural<input value={dealPlural} onChange={(event) => setDealPlural(event.target.value)} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-xs font-normal normal-case tracking-normal" /></label>
        <label className="space-y-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Timezone<input value={timezone} onChange={(event) => setTimezone(event.target.value)} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-xs font-normal normal-case tracking-normal" /></label>
        <label className="space-y-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Currency<input value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase().slice(0, 3))} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 font-mono text-xs font-normal normal-case tracking-normal" /></label>
        <label className="space-y-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Locale<input value={locale} onChange={(event) => setLocale(event.target.value)} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 font-mono text-xs font-normal normal-case tracking-normal" /></label>
      </div>
      <div className="flex justify-end"><button type="button" onClick={() => void save()} disabled={saving} className="button-primary">{saving && <Loader2 className="h-4 w-4 animate-spin" />} Save workspace</button></div>
    </section>
  );
}

export default function BusinessSetupPage() {
  const { config, isLoading, error, refresh } = useWorkspace();
  const defaultPipeline = useMemo(() => config.pipelines.find((pipeline) => pipeline.is_default) || config.pipelines[0] || null, [config.pipelines]);
  const identityKey = `${config.workspace.name}|${config.workspace.timezone}|${config.workspace.currency}|${config.workspace.locale}|${JSON.stringify(config.workspace.terminology)}`;

  if (isLoading && config.templates.length === 0) {
    return <div className="flex min-h-[50vh] items-center justify-center text-sm text-zinc-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading business configuration…</div>;
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 pb-12">
      <header className="flex flex-col gap-4 border-b border-zinc-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500"><Settings2 className="h-3.5 w-3.5" /> Business configuration</div><h1 className="text-2xl font-semibold tracking-tight text-zinc-950">Shape the CRM around your business</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">Travel, consultancy, health, agency or something custom: configure the same CRM core without maintaining separate applications.</p></div>
        <button type="button" onClick={() => void refresh()} className="button-secondary"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
      </header>

      {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      <TemplatePicker key={config.workspace.template_key || 'no-template'} config={config} refresh={refresh} />

      <div className="border-t border-zinc-200 pt-8"><IdentityForm key={identityKey} config={config} refresh={refresh} /></div>
      <div className="border-t border-zinc-200 pt-8"><ModuleManager /></div>
      <div className="border-t border-zinc-200 pt-8"><BusinessFieldManager /></div>
      <div className="border-t border-zinc-200 pt-8"><PipelineEditor key={defaultPipeline?.id || 'no-pipeline'} pipeline={defaultPipeline} /></div>

      <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
        <div className="text-xs font-semibold text-zinc-800">How adaptation works</div>
        <div className="mt-2 grid gap-3 text-[11px] leading-5 text-zinc-500 md:grid-cols-3"><p><strong className="text-zinc-700">Core CRM stays stable.</strong> Contacts, conversations, ownership, tasks, security and reporting remain shared.</p><p><strong className="text-zinc-700">Business data is configured.</strong> Intake, conversion and record workspaces render the field schema above.</p><p><strong className="text-zinc-700">Specialized modules stay optional.</strong> Travel keeps itinerary/passengers/suppliers; other industries only enable what they need.</p></div>
      </section>
    </div>
  );
}
