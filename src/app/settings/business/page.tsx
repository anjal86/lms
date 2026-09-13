'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, Loader2, RefreshCw, Settings2 } from 'lucide-react';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';
import type { WorkspaceConfig } from '@/lib/platform/types';

function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function BusinessSetupPage() {
  const { config, isLoading, error, refresh } = useWorkspace();
  const [selectedTemplate, setSelectedTemplate] = useState(config.workspace.template_key || 'generic');
  const [name, setName] = useState(config.workspace.name);
  const [timezone, setTimezone] = useState(config.workspace.timezone);
  const [currency, setCurrency] = useState(config.workspace.currency);
  const [locale, setLocale] = useState(config.workspace.locale);
  const [leadName, setLeadName] = useState(config.workspace.terminology.lead);
  const [leadPlural, setLeadPlural] = useState(config.workspace.terminology.lead_plural);
  const [contactName, setContactName] = useState(config.workspace.terminology.contact);
  const [dealName, setDealName] = useState(config.workspace.terminology.deal);
  const [workspaceLabel, setWorkspaceLabel] = useState(config.workspace.terminology.workspace_label);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedTemplate(config.workspace.template_key || 'generic');
    setName(config.workspace.name);
    setTimezone(config.workspace.timezone);
    setCurrency(config.workspace.currency);
    setLocale(config.workspace.locale);
    setLeadName(config.workspace.terminology.lead);
    setLeadPlural(config.workspace.terminology.lead_plural);
    setContactName(config.workspace.terminology.contact);
    setDealName(config.workspace.terminology.deal);
    setWorkspaceLabel(config.workspace.terminology.workspace_label);
  }, [config]);

  const defaultPipeline = useMemo(
    () => config.pipelines.find((pipeline) => pipeline.is_default) || config.pipelines[0] || null,
    [config.pipelines]
  );
  const enabledModules = config.modules.filter((module) => module.is_enabled);

  async function updateConfig(body: Record<string, unknown>, successMessage: string) {
    const response = await fetch('/api/platform/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null) as WorkspaceConfig | { error?: string } | null;
    if (!response.ok) {
      const message = payload && 'error' in payload ? payload.error : null;
      throw new Error(message || 'Unable to update the business workspace.');
    }
    await refresh();
    setNotice(successMessage);
  }

  async function applyTemplate() {
    if (!selectedTemplate || selectedTemplate === config.workspace.template_key) return;
    setApplying(true);
    setFormError(null);
    setNotice(null);
    try {
      await updateConfig(
        { templateKey: selectedTemplate },
        'Business template applied. Existing customer and lead records were preserved.'
      );
    } catch (applyError) {
      setFormError(applyError instanceof Error ? applyError.message : 'Unable to apply template.');
    } finally {
      setApplying(false);
    }
  }

  async function saveIdentity() {
    setSaving(true);
    setFormError(null);
    setNotice(null);
    try {
      await updateConfig({
        name,
        timezone,
        currency,
        locale,
        terminology: {
          lead: leadName,
          lead_plural: leadPlural,
          contact: contactName,
          contact_plural: `${contactName}s`,
          deal: dealName,
          deal_plural: `${dealName}s`,
          workspace_label: workspaceLabel,
          convert: `Convert to ${leadName}`,
        },
      }, 'Workspace settings saved.');
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : 'Unable to save workspace settings.');
    } finally {
      setSaving(false);
    }
  }

  if (isLoading && config.templates.length === 0) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-zinc-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading business configuration…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 pb-12">
      <header className="flex flex-col gap-4 border-b border-zinc-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
            <Settings2 className="h-3.5 w-3.5" /> Business configuration
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">Shape the CRM around your business</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
            Choose a starting model, then customize the language, fields, modules and pipeline. Customer data is kept when the business template changes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </header>

      {(error || formError || notice) && (
        <div
          role={formError || error ? 'alert' : 'status'}
          className={`rounded-md border px-4 py-3 text-sm ${
            formError || error
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          {formError || error || notice}
        </div>
      )}

      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-950">Business model</h2>
          <p className="mt-1 text-xs text-zinc-500">Templates seed terminology, recommended fields, modules and a default pipeline.</p>
        </div>

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {config.templates.map((template) => {
            const selected = selectedTemplate === template.key;
            const active = config.workspace.template_key === template.key;
            return (
              <button
                key={template.key}
                type="button"
                onClick={() => setSelectedTemplate(template.key)}
                className={`group flex min-h-28 items-start gap-3 rounded-lg border p-4 text-left transition ${
                  selected
                    ? 'border-zinc-950 bg-zinc-950 text-white'
                    : 'border-zinc-200 bg-white text-zinc-950 hover:border-zinc-300 hover:bg-zinc-50'
                }`}
              >
                <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${selected ? 'border-white/20 bg-white/10' : 'border-zinc-200 bg-zinc-50'}`}>
                  {active ? <Check className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    {template.name}
                    {active && <span className={`text-[10px] font-medium uppercase tracking-wider ${selected ? 'text-zinc-300' : 'text-zinc-500'}`}>Current</span>}
                  </span>
                  <span className={`mt-1.5 block text-xs leading-5 ${selected ? 'text-zinc-300' : 'text-zinc-500'}`}>
                    {template.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            disabled={applying || selectedTemplate === config.workspace.template_key}
            onClick={() => void applyTemplate()}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-zinc-950 px-4 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {applying && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Apply selected model
          </button>
        </div>
      </section>

      <div className="grid gap-8 border-t border-zinc-200 pt-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
        <section className="space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-zinc-950">Workspace identity</h2>
            <p className="mt-1 text-xs text-zinc-500">These labels are used throughout the CRM instead of fixed travel wording.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-xs font-medium text-zinc-700 sm:col-span-2">
              Company / workspace name
              <input value={name} onChange={(event) => setName(event.target.value)} className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-zinc-400" />
            </label>
            <label className="space-y-1.5 text-xs font-medium text-zinc-700">
              Lead name
              <input value={leadName} onChange={(event) => setLeadName(event.target.value)} className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-zinc-400" />
            </label>
            <label className="space-y-1.5 text-xs font-medium text-zinc-700">
              Lead plural
              <input value={leadPlural} onChange={(event) => setLeadPlural(event.target.value)} className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-zinc-400" />
            </label>
            <label className="space-y-1.5 text-xs font-medium text-zinc-700">
              Contact name
              <input value={contactName} onChange={(event) => setContactName(event.target.value)} className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-zinc-400" />
            </label>
            <label className="space-y-1.5 text-xs font-medium text-zinc-700">
              Deal / outcome name
              <input value={dealName} onChange={(event) => setDealName(event.target.value)} className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-zinc-400" />
            </label>
            <label className="space-y-1.5 text-xs font-medium text-zinc-700 sm:col-span-2">
              Workspace subtitle
              <input value={workspaceLabel} onChange={(event) => setWorkspaceLabel(event.target.value)} className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-zinc-400" />
            </label>
          </div>

          <div className="grid gap-4 border-t border-zinc-100 pt-5 sm:grid-cols-3">
            <label className="space-y-1.5 text-xs font-medium text-zinc-700">
              Timezone
              <input value={timezone} onChange={(event) => setTimezone(event.target.value)} className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-zinc-400" />
            </label>
            <label className="space-y-1.5 text-xs font-medium text-zinc-700">
              Currency
              <input value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase().slice(0, 3))} className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 font-mono text-sm uppercase text-zinc-950 outline-none focus:border-zinc-400" />
            </label>
            <label className="space-y-1.5 text-xs font-medium text-zinc-700">
              Locale
              <input value={locale} onChange={(event) => setLocale(event.target.value)} className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 font-mono text-sm text-zinc-950 outline-none focus:border-zinc-400" />
            </label>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveIdentity()}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-zinc-950 px-4 text-xs font-semibold text-white disabled:bg-zinc-400"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save workspace
            </button>
          </div>
        </section>

        <aside className="space-y-7 border-t border-zinc-200 pt-7 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <section>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold text-zinc-950">Current pipeline</h2>
              <span className="text-[11px] text-zinc-500">{defaultPipeline?.stages.length || 0} stages</span>
            </div>
            <div className="mt-3 divide-y divide-zinc-100 border-y border-zinc-200">
              {defaultPipeline?.stages.map((stage, index) => (
                <div key={stage.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="w-5 font-mono text-[10px] text-zinc-400">{String(index + 1).padStart(2, '0')}</span>
                  <span className="min-w-0 flex-1 truncate font-medium text-zinc-800">{stage.name}</span>
                  <span className="font-mono text-[10px] text-zinc-400">{stage.probability}%</span>
                </div>
              )) || <div className="py-4 text-xs text-zinc-500">No pipeline configured.</div>}
            </div>
          </section>

          <section>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold text-zinc-950">Business fields</h2>
              <span className="text-[11px] text-zinc-500">{config.fields.length} active</span>
            </div>
            <div className="mt-3 space-y-1.5">
              {config.fields.slice(0, 10).map((field) => (
                <div key={field.id} className="flex items-center justify-between gap-4 py-1.5 text-xs">
                  <span className="min-w-0 truncate text-zinc-700">{field.label}</span>
                  <span className="shrink-0 font-mono text-[10px] text-zinc-400">{field.field_type}</span>
                </div>
              ))}
              {config.fields.length > 10 && (
                <div className="pt-2 text-[11px] text-zinc-500">+ {config.fields.length - 10} more fields</div>
              )}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-zinc-950">Enabled modules</h2>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {enabledModules.map((module) => (
                <span key={module.module_key} className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] font-medium text-zinc-600">
                  {titleCase(module.module_key)}
                </span>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
