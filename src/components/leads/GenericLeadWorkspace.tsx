'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, CircleDashed, Clock3, Loader2, Mail, MapPin, MessageSquare, Phone, Save, UserRound } from 'lucide-react';
import { useApp } from '@/lib/store';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';
import type { DynamicFieldDefinition, PipelineStageConfig } from '@/lib/platform/types';
import type { Lead } from '@/lib/types';
import { buildQualificationSummary, getCanonicalNextAction } from '@/lib/opportunity-workspace';
import UnifiedCommunicationTimeline from './UnifiedCommunicationTimeline';

type Tab = 'overview' | 'communication' | 'details';
type FieldValue = string | number | boolean | string[] | null;

function displayValue(value: unknown) {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  return String(value);
}

function controlValue(value: unknown, field: DynamicFieldDefinition): FieldValue {
  if (field.field_type === 'multi_select') return Array.isArray(value) ? value.map(String) : [];
  if (field.field_type === 'boolean') return value === true;
  if (['number', 'currency', 'percentage', 'rating'].includes(field.field_type)) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : '';
  }
  return value == null ? '' : String(value);
}

function FieldEditor({ field, value, onChange }: { field: DynamicFieldDefinition; value: FieldValue; onChange: (value: FieldValue) => void }) {
  const className = 'mt-1 h-9 w-full rounded-md border border-zinc-200 bg-white px-2.5 text-xs text-zinc-900 outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100';
  const options = Array.isArray(field.options) ? field.options.map(String) : [];

  if (field.field_type === 'textarea') {
    return <textarea aria-label={field.label} rows={3} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} className={`${className} h-auto min-h-20 resize-y py-2`} />;
  }
  if (field.field_type === 'single_select') {
    return (
      <select aria-label={field.label} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} className={className}>
        <option value="">Not set</option>
        {options.map((option) => <option key={option} value={option}>{option.replaceAll('_', ' ')}</option>)}
      </select>
    );
  }
  if (field.field_type === 'multi_select') {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div className="mt-1 flex flex-wrap gap-1.5 rounded-md border border-zinc-200 bg-white p-2">
        {options.map((option) => {
          const active = selected.includes(option);
          return <button key={option} type="button" aria-pressed={active} onClick={() => onChange(active ? selected.filter((item) => item !== option) : [...selected, option])} className={`rounded border px-2 py-1 text-[10px] font-medium ${active ? 'border-zinc-950 bg-zinc-950 text-white' : 'border-zinc-200 text-zinc-600'}`}>{option.replaceAll('_', ' ')}</button>;
        })}
      </div>
    );
  }
  if (field.field_type === 'boolean') {
    return <label className="mt-1 flex min-h-[44px] items-center gap-2 rounded-md border border-zinc-200 px-2.5 text-xs text-zinc-700"><input aria-label={field.label} type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} /> Yes</label>;
  }

  const type = field.field_type === 'email' ? 'email'
    : field.field_type === 'phone' ? 'tel'
      : field.field_type === 'url' ? 'url'
        : field.field_type === 'date' ? 'date'
          : field.field_type === 'datetime' ? 'datetime-local'
            : ['number', 'currency', 'percentage', 'rating'].includes(field.field_type) ? 'number'
              : 'text';
  return <input aria-label={field.label} type={type} value={typeof value === 'string' || typeof value === 'number' ? value : ''} onChange={(event) => onChange(type === 'number' ? (event.target.value === '' ? '' : Number(event.target.value)) : event.target.value)} className={className} />;
}

export default function GenericLeadWorkspace() {
  const params = useParams();
  const leadId = String(params.id || '');
  const { activities, allProfiles, followUps, formatAppDate } = useApp();
  const { config, term } = useWorkspace();
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Record<string, FieldValue>>({});
  const [stageId, setStageId] = useState<string>('');

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/leads/${leadId}`, { cache: 'no-store', signal: controller.signal });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || 'Unable to load record.');
        const loaded = payload.lead as Lead;
        setLead(loaded);
        setStageId(loaded.pipeline_stage_id || '');
        setError(null);
      } catch (loadError) {
        if ((loadError as { name?: string })?.name !== 'AbortError') setError(loadError instanceof Error ? loadError.message : 'Unable to load record.');
      } finally {
        setLoading(false);
      }
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [leadId]);

  const fields = useMemo(() => config.fields.filter((field) => field.entity_type === 'lead' && field.is_active).sort((a, b) => a.sort_order - b.sort_order), [config.fields]);
  const sections = useMemo(() => {
    const map = new Map<string, DynamicFieldDefinition[]>();
    for (const field of fields) map.set(field.section_key, [...(map.get(field.section_key) || []), field]);
    return Array.from(map.entries());
  }, [fields]);
  const pipeline = config.pipelines.find((item) => item.id === lead?.pipeline_id) || config.pipelines.find((item) => item.is_default) || config.pipelines[0];
  const currentStage = pipeline?.stages.find((stage) => stage.id === lead?.pipeline_stage_id);
  const owner = allProfiles.find((profile) => profile.id === lead?.assigned_to);
  const leadActivities = activities.filter((activity) => activity.lead_id === leadId);
  const leadLabel = term('lead', 'Lead');
  const contactLabel = term('contact', 'Contact');
  const qualification = lead ? buildQualificationSummary(lead, config.workspace.business_type, fields) : null;
  const nextAction = lead ? getCanonicalNextAction(lead, followUps, currentStage?.stage_key || currentStage?.name) : null;

  function beginEdit() {
    if (!lead) return;
    const customData = lead.custom_data || {};
    const next: Record<string, FieldValue> = {};
    for (const field of fields) next[field.field_key] = controlValue(customData[field.field_key], field);
    setDraft(next);
    setStageId(lead.pipeline_stage_id || '');
    setEditing(true);
  }

  async function saveChanges() {
    if (!lead) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customData: draft, pipelineStageId: stageId || null }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || `Unable to update ${leadLabel.toLowerCase()}.`);
      setLead(payload.lead as Lead);
      setEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : `Unable to update ${leadLabel.toLowerCase()}.`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="flex min-h-[45vh] items-center justify-center text-sm text-zinc-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading {leadLabel.toLowerCase()}…</div>;
  if (!lead) return <div className="mx-auto max-w-xl py-16 text-center"><UserRound className="mx-auto h-6 w-6 text-zinc-300" /><h1 className="mt-3 text-lg font-semibold text-zinc-950">{leadLabel} unavailable</h1><p className="mt-2 text-sm text-zinc-500">{error || 'This record may have been removed or is outside your workspace.'}</p><Link href="/leads" className="mt-5 inline-flex text-sm font-semibold text-blue-600">Back to {term('lead_plural', 'Leads')}</Link></div>;

  return (
    <div className="app-page space-y-4">
      <header className="surface-flat overflow-hidden">
        <div className="flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Link href="/leads" className="button-secondary button-sm px-2" aria-label={`Back to ${term('lead_plural', 'Leads')}`}><ArrowLeft className="h-4 w-4" /></Link>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3"><span className="font-mono text-[10px] font-semibold text-zinc-400">{lead.lead_code}</span><span className="status-line"><span className="status-dot bg-zinc-500" /><span className="capitalize">{config.workspace.business_type.replaceAll('_', ' ')}</span></span>{currentStage && <span className="status-line"><span className="status-dot bg-blue-600" /><span>{currentStage.name}</span></span>}</div>
              <h1 className="mt-1 truncate text-xl font-semibold text-zinc-950">{lead.customer_name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
                {lead.customer_phone && <span className="inline-flex items-center gap-1 font-mono"><Phone className="h-3 w-3" />{lead.customer_phone}</span>}
                {lead.customer_email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{lead.customer_email}</span>}
                {(lead.customer_city || lead.customer_country) && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{[lead.customer_city, lead.customer_country].filter(Boolean).join(', ')}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden text-right sm:block"><div className="text-[10px] uppercase tracking-wide text-zinc-400">Owner</div><div className="text-xs font-semibold text-zinc-700">{owner?.full_name || 'Unassigned'}</div></div>
            {!editing ? <button type="button" onClick={beginEdit} className="button-primary">Edit {leadLabel}</button> : <><button type="button" onClick={() => setEditing(false)} disabled={saving} className="button-secondary">Cancel</button><button type="button" onClick={() => void saveChanges()} disabled={saving} className="button-primary">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save</button></>}
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-zinc-200 px-3 pt-2" aria-label={`${leadLabel} workspace sections`}>
          {(['overview','communication','details'] as Tab[]).map((tab) => <button key={tab} type="button" aria-current={activeTab === tab ? 'page' : undefined} onClick={() => setActiveTab(tab)} className={`min-h-[44px] border-b-2 px-3 text-xs font-semibold capitalize focus-visible:ring-1 focus-visible:ring-zinc-950 ${activeTab === tab ? 'border-zinc-950 text-zinc-950' : 'border-transparent text-zinc-500 hover:text-zinc-900'}`}>{tab === 'overview' ? 'Opportunity' : tab === 'communication' ? 'Conversations' : 'All details'}</button>)}
        </nav>
      </header>

      {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      {activeTab === 'communication' ? (
        <section className="surface-flat p-4"><UnifiedCommunicationTimeline leadId={lead.id} activities={leadActivities} profiles={allProfiles} formatDate={formatAppDate} /></section>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <main className="surface-flat p-5">
            {activeTab === 'overview' && nextAction && qualification && (
              <div className="mb-6 space-y-6">
                <section aria-labelledby="generic-next-action" className="rounded-lg border border-zinc-300 bg-zinc-950 p-4 text-white">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div><div id="generic-next-action" className="flex items-center gap-2 text-[10px] font-semibold uppercase text-zinc-400"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" /> Next action</div><div className="mt-1 text-base font-semibold">{nextAction.title}</div><div className="mt-1 font-mono text-[11px] text-zinc-400">{nextAction.scheduledAt ? formatAppDate(nextAction.scheduledAt) : 'No due date set'}{nextAction.channel ? ` · ${nextAction.channel.replaceAll('_', ' ')}` : ''}</div></div>
                    <button type="button" onClick={() => setActiveTab('communication')} className="button-secondary min-h-[44px] border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800"><MessageSquare className="h-4 w-4" aria-hidden="true" /> Conversations</button>
                  </div>
                </section>

                <section aria-labelledby="generic-qualification" className="border-b border-zinc-200 pb-6">
                  <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="generic-qualification" className="text-sm font-semibold text-zinc-950">Qualification</h2><p className="mt-1 text-xs text-zinc-500">{qualification.packLabel} progression requirements</p></div><div className="font-mono text-sm font-semibold text-zinc-900">{qualification.percent}% <span className="text-[11px] font-normal text-zinc-500">complete</span></div></div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-100" aria-label={`${qualification.percent}% qualification complete`} role="progressbar" aria-valuenow={qualification.percent} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-zinc-950" style={{ width: `${qualification.percent}%` }} /></div>
                  <div className="mt-4 grid gap-x-6 border-y border-zinc-200 sm:grid-cols-2">
                    {qualification.items.map((item) => <div key={item.key} className="flex min-h-[44px] items-center gap-2 border-b border-zinc-100 py-2 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0">{item.complete ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" /> : <CircleDashed className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />}<span className="min-w-0 flex-1 text-xs font-medium text-zinc-700">{item.label}</span><span className={`max-w-[48%] truncate text-right text-[11px] ${item.complete ? 'text-zinc-500' : 'font-semibold text-amber-700'}`} title={item.value}>{item.value}</span></div>)}
                  </div>
                  {qualification.missing.length > 0 && <p className="mt-3 text-xs text-zinc-600"><span className="font-semibold text-zinc-900">Missing:</span> {qualification.missing.join(', ')}</p>}
                </section>
              </div>
            )}
            <div className="mb-5"><h2 className="text-sm font-semibold text-zinc-950">Opportunity details</h2><p className="mt-1 text-xs text-zinc-500">Fields defined by {config.workspace.name} for this {leadLabel.toLowerCase()}.</p></div>
            <div className="space-y-7">
              {sections.map(([section, sectionFields]) => <section key={section}><div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">{section.replaceAll('_', ' ')}</div><div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">{sectionFields.map((field) => <div key={field.id} className={field.field_type === 'textarea' || field.field_type === 'multi_select' ? 'sm:col-span-2 lg:col-span-3' : ''}><div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{field.label}{field.is_required && <span className="ml-1 text-red-500">*</span>}</div>{editing ? <FieldEditor field={field} value={Object.prototype.hasOwnProperty.call(draft, field.field_key) ? draft[field.field_key] : controlValue(lead.custom_data?.[field.field_key], field)} onChange={(value) => setDraft((current) => ({ ...current, [field.field_key]: value }))} /> : <div className="mt-1 break-words text-sm font-medium text-zinc-800">{displayValue(lead.custom_data?.[field.field_key])}</div>}</div>)}</div></section>)}
              {sections.length === 0 && <div className="rounded-md border border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-500">No business-specific fields are configured yet.</div>}
            </div>
          </main>

          <aside className="space-y-3">
            <section className="surface-flat p-4"><div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Pipeline</div>{editing ? <select value={stageId} onChange={(event) => setStageId(event.target.value)} className="mt-2 h-9 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs">{pipeline?.stages.map((stage: PipelineStageConfig) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select> : <div className="mt-2 text-sm font-semibold text-zinc-900">{currentStage?.name || 'Not set'}</div>}<div className="mt-1 text-[11px] text-zinc-500">{pipeline?.name || 'Default pipeline'}</div></section>
            <section className="surface-flat p-4"><div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{contactLabel}</div><dl className="mt-3 space-y-3 text-xs"><div><dt className="text-zinc-400">Source</dt><dd className="mt-0.5 font-medium capitalize text-zinc-700">{lead.source?.replaceAll('_', ' ') || 'Unknown'}</dd></div><div><dt className="text-zinc-400">Priority</dt><dd className="mt-0.5 font-medium capitalize text-zinc-700">{lead.priority}</dd></div><div><dt className="text-zinc-400">Created</dt><dd className="mt-0.5 font-mono text-[11px] text-zinc-700">{formatAppDate(lead.created_at)}</dd></div></dl></section>
            {activeTab === 'details' && <section className="surface-flat p-4"><div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Technical</div><dl className="mt-3 space-y-3 text-[11px]"><div><dt className="text-zinc-400">Record ID</dt><dd className="mt-0.5 break-all font-mono text-zinc-600">{lead.id}</dd></div><div><dt className="text-zinc-400">Workspace</dt><dd className="mt-0.5 font-medium text-zinc-700">{config.workspace.name}</dd></div></dl></section>}
          </aside>
        </div>
      )}
    </div>
  );
}
