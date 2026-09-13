'use client';

import { useState } from 'react';
import { Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';
import type { DynamicFieldDefinition } from '@/lib/platform/types';

const FIELD_TYPES = [
  ['text', 'Text'], ['textarea', 'Long text'], ['number', 'Number'], ['currency', 'Currency'],
  ['date', 'Date'], ['datetime', 'Date & time'], ['boolean', 'Yes / No'], ['single_select', 'Single select'],
  ['multi_select', 'Multi select'], ['phone', 'Phone'], ['email', 'Email'], ['url', 'URL'],
  ['country', 'Country'], ['city', 'City'], ['address', 'Address'], ['percentage', 'Percentage'], ['rating', 'Rating'],
] as const;

type Draft = {
  id?: string;
  label: string;
  fieldType: string;
  sectionKey: string;
  description: string;
  optionsText: string;
  required: boolean;
  searchable: boolean;
  filterable: boolean;
  sortOrder: number;
};

const EMPTY: Draft = {
  label: '', fieldType: 'text', sectionKey: 'details', description: '', optionsText: '',
  required: false, searchable: false, filterable: false, sortOrder: 100,
};

function toDraft(field: DynamicFieldDefinition): Draft {
  return {
    id: field.id,
    label: field.label,
    fieldType: field.field_type,
    sectionKey: field.section_key,
    description: field.description || '',
    optionsText: Array.isArray(field.options) ? field.options.map(String).join(', ') : '',
    required: field.is_required,
    searchable: field.is_searchable,
    filterable: field.is_filterable,
    sortOrder: field.sort_order,
  };
}

export default function BusinessFieldManager() {
  const { config, refresh } = useWorkspace();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fields = config.fields
    .filter((field) => field.entity_type === 'lead' && field.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);

  const startCreate = () => {
    const nextOrder = fields.length ? Math.max(...fields.map((field) => field.sort_order)) + 10 : 100;
    setDraft({ ...EMPTY, sortOrder: nextOrder });
    setError(null);
    setOpen(true);
  };

  const startEdit = (field: DynamicFieldDefinition) => {
    setDraft(toDraft(field));
    setError(null);
    setOpen(true);
  };

  const save = async () => {
    if (!draft.label.trim()) return setError('Field label is required.');
    setSaving(true);
    setError(null);
    try {
      const options = draft.optionsText.split(',').map((item) => item.trim()).filter(Boolean);
      const response = await fetch('/api/platform/fields', {
        method: draft.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: draft.id,
          label: draft.label,
          fieldType: draft.fieldType,
          sectionKey: draft.sectionKey.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_') || 'details',
          description: draft.description,
          options,
          required: draft.required,
          searchable: draft.searchable,
          filterable: draft.filterable,
          sortOrder: draft.sortOrder,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to save field.');
      setOpen(false);
      setDraft(EMPTY);
      await refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save field.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (field: DynamicFieldDefinition) => {
    if (field.definition_source !== 'custom') return;
    setDeleting(field.id);
    setError(null);
    try {
      const response = await fetch('/api/platform/fields', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: field.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to remove field.');
      await refresh();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Unable to remove field.');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div><h2 className="text-sm font-semibold text-zinc-950">Business fields</h2><p className="mt-1 text-xs text-zinc-500">Template fields give you a starting point. Add your own fields for the exact data your business needs.</p></div>
        <button type="button" onClick={startCreate} className="button-secondary button-sm"><Plus className="h-3.5 w-3.5" /> Add field</button>
      </div>

      {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <div className="divide-y divide-zinc-100">
          {fields.map((field) => {
            const custom = field.definition_source === 'custom';
            return (
              <div key={field.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate text-xs font-semibold text-zinc-800">{field.label}</span><span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[9px] text-zinc-500">{field.field_type}</span>{field.is_required && <span className="text-[9px] font-semibold text-rose-600">Required</span>}</div><div className="mt-0.5 truncate font-mono text-[9px] text-zinc-400">{field.section_key} · {field.field_key}</div></div>
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${custom ? 'bg-blue-50 text-blue-700' : 'bg-zinc-100 text-zinc-500'}`}>{custom ? 'Custom' : 'Template'}</span>
                {custom && <><button type="button" onClick={() => startEdit(field)} className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800" aria-label={`Edit ${field.label}`}><Pencil className="h-3.5 w-3.5" /></button><button type="button" onClick={() => void remove(field)} disabled={deleting === field.id} className="rounded p-1.5 text-zinc-400 hover:bg-rose-50 hover:text-rose-700" aria-label={`Remove ${field.label}`}>{deleting === field.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}</button></>}
              </div>
            );
          })}
          {fields.length === 0 && <div className="p-6 text-center text-xs text-zinc-500">No business fields configured.</div>}
        </div>
      </div>

      {open && (
        <div className="rounded-lg border border-zinc-300 bg-zinc-50/60 p-4">
          <div className="mb-4 flex items-center justify-between"><div><div className="text-xs font-semibold text-zinc-900">{draft.id ? 'Edit custom field' : 'New custom field'}</div><div className="mt-0.5 text-[10px] text-zinc-500">Custom fields are preserved when you change business templates.</div></div><button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-zinc-400 hover:bg-white"><X className="h-4 w-4" /></button></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Label<input value={draft.label} onChange={(event) => setDraft((value) => ({ ...value, label: event.target.value }))} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-xs font-normal normal-case tracking-normal text-zinc-900" placeholder="e.g. Referral Doctor" /></label>
            <label className="space-y-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Type<select value={draft.fieldType} onChange={(event) => setDraft((value) => ({ ...value, fieldType: event.target.value }))} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-xs font-normal normal-case tracking-normal">{FIELD_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="space-y-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Section<input value={draft.sectionKey} onChange={(event) => setDraft((value) => ({ ...value, sectionKey: event.target.value }))} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-xs font-mono font-normal normal-case tracking-normal" placeholder="details" /></label>
            <label className="space-y-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Order<input type="number" value={draft.sortOrder} onChange={(event) => setDraft((value) => ({ ...value, sortOrder: Number(event.target.value) || 0 }))} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-xs font-mono font-normal normal-case tracking-normal" /></label>
            <label className="space-y-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 sm:col-span-2">Description<input value={draft.description} onChange={(event) => setDraft((value) => ({ ...value, description: event.target.value }))} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-xs font-normal normal-case tracking-normal" placeholder="Optional helper text" /></label>
            {(draft.fieldType === 'single_select' || draft.fieldType === 'multi_select') && <label className="space-y-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 sm:col-span-2">Options<input value={draft.optionsText} onChange={(event) => setDraft((value) => ({ ...value, optionsText: event.target.value }))} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-xs font-normal normal-case tracking-normal" placeholder="Option A, Option B, Option C" /></label>}
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-zinc-600"><label className="flex items-center gap-2"><input type="checkbox" checked={draft.required} onChange={(event) => setDraft((value) => ({ ...value, required: event.target.checked }))} /> Required</label><label className="flex items-center gap-2"><input type="checkbox" checked={draft.searchable} onChange={(event) => setDraft((value) => ({ ...value, searchable: event.target.checked }))} /> Searchable</label><label className="flex items-center gap-2"><input type="checkbox" checked={draft.filterable} onChange={(event) => setDraft((value) => ({ ...value, filterable: event.target.checked }))} /> Filterable</label></div>
          <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setOpen(false)} className="button-secondary button-sm">Cancel</button><button type="button" onClick={() => void save()} disabled={saving} className="button-primary button-sm">{saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save field</button></div>
        </div>
      )}
    </section>
  );
}
