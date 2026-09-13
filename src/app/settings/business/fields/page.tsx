'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, LockKeyhole, Plus, Trash2 } from 'lucide-react';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';

type FieldRow = {
  id: string;
  field_key: string;
  label: string;
  field_type: string;
  section_key: string;
  description: string | null;
  options: unknown[];
  is_required: boolean;
  is_searchable: boolean;
  is_filterable: boolean;
  is_active: boolean;
  sort_order: number;
  definition_source: 'template' | 'custom';
};

const TYPES = [
  ['text', 'Short text'], ['textarea', 'Long text'], ['number', 'Number'], ['currency', 'Currency'],
  ['date', 'Date'], ['datetime', 'Date & time'], ['boolean', 'Yes / No'], ['single_select', 'Single select'],
  ['multi_select', 'Multi select'], ['phone', 'Phone'], ['email', 'Email'], ['url', 'URL'],
  ['country', 'Country'], ['city', 'City'], ['address', 'Address'], ['percentage', 'Percentage'], ['rating', 'Rating'],
] as const;

function toKey(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 70);
}

export default function BusinessFieldsPage() {
  const { config, refresh: refreshWorkspace, term } = useWorkspace();
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [fieldKey, setFieldKey] = useState('');
  const [fieldType, setFieldType] = useState('text');
  const [sectionKey, setSectionKey] = useState('details');
  const [description, setDescription] = useState('');
  const [optionsText, setOptionsText] = useState('');
  const [required, setRequired] = useState(false);
  const [searchable, setSearchable] = useState(false);
  const [filterable, setFilterable] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/platform/fields', { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Unable to load fields.');
      setFields((payload?.fields || []) as FieldRow[]);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load fields.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const result = new Map<string, FieldRow[]>();
    for (const field of fields.filter((item) => item.is_active)) {
      const group = result.get(field.section_key) || [];
      group.push(field);
      result.set(field.section_key, group);
    }
    return Array.from(result.entries());
  }, [fields]);

  const selectType = fieldType === 'single_select' || fieldType === 'multi_select';

  async function createField(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const options = optionsText.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
      const response = await fetch('/api/platform/fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label,
          fieldKey: fieldKey || toKey(label),
          fieldType,
          sectionKey: toKey(sectionKey) || 'details',
          description,
          options,
          required,
          searchable,
          filterable,
          sortOrder: fields.length * 10 + 100,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Unable to create field.');
      setLabel('');
      setFieldKey('');
      setDescription('');
      setOptionsText('');
      setRequired(false);
      setSearchable(false);
      setFilterable(false);
      setMessage('Custom field added. It is now available in new lead intake.');
      await Promise.all([load(), refreshWorkspace()]);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create field.');
    } finally {
      setSaving(false);
    }
  }

  async function removeField(field: FieldRow) {
    if (field.definition_source !== 'custom') return;
    if (!window.confirm(`Remove “${field.label}” from future forms? Existing stored values will be preserved.`)) return;
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/platform/fields', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: field.id }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Unable to remove field.');
      setMessage('Field removed from future forms. Existing data was preserved.');
      await Promise.all([load(), refreshWorkspace()]);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Unable to remove field.');
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-7 pb-12">
      <header className="flex flex-col gap-4 border-b border-zinc-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/settings/business" className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900">
            <ArrowLeft className="h-3.5 w-3.5" /> Business setup
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">{term('lead', 'Lead')} fields</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
            Template fields define the business starting point. Add your own fields without changing code; custom fields survive future template changes.
          </p>
        </div>
        <div className="text-right text-xs text-zinc-500">
          <div className="font-semibold text-zinc-800">{config.workspace.name}</div>
          <div>{fields.filter((field) => field.is_active).length} active fields</div>
        </div>
      </header>

      {(error || message) && (
        <div role={error ? 'alert' : 'status'} className={`rounded-md border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
          {error || message}
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-zinc-950">Current schema</h2>
              <p className="mt-1 text-xs text-zinc-500">Fields are grouped exactly as they will appear in intake.</p>
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-40 items-center justify-center border-y border-zinc-200 text-sm text-zinc-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading fields…</div>
          ) : grouped.length === 0 ? (
            <div className="border-y border-zinc-200 py-10 text-center text-sm text-zinc-500">No active fields yet.</div>
          ) : (
            <div className="space-y-6">
              {grouped.map(([section, sectionFields]) => (
                <div key={section}>
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">{section.replaceAll('_', ' ')}</div>
                  <div className="divide-y divide-zinc-100 border-y border-zinc-200">
                    {sectionFields.map((field) => (
                      <div key={field.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-medium text-zinc-900">{field.label}</span>
                            {field.is_required && <span className="text-[10px] font-semibold uppercase tracking-wide text-red-600">Required</span>}
                            <span className="font-mono text-[10px] text-zinc-400">{field.field_key}</span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                            <span>{field.field_type.replaceAll('_', ' ')}</span>
                            {field.is_searchable && <span>· searchable</span>}
                            {field.is_filterable && <span>· filterable</span>}
                            {field.description && <span className="truncate">· {field.description}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {field.definition_source === 'template' ? (
                            <span className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-medium text-zinc-500"><LockKeyhole className="h-3 w-3" /> Template</span>
                          ) : (
                            <button type="button" onClick={() => void removeField(field)} className="rounded-md p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${field.label}`}><Trash2 className="h-3.5 w-3.5" /></button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="lg:border-l lg:border-zinc-200 lg:pl-7">
          <div className="sticky top-4">
            <h2 className="text-sm font-semibold text-zinc-950">Add custom field</h2>
            <p className="mt-1 text-xs leading-5 text-zinc-500">Use business language your team already understands.</p>

            <form onSubmit={createField} className="mt-5 space-y-4">
              <label className="block text-[11px] font-medium text-zinc-600">Label
                <input required value={label} onChange={(event) => { setLabel(event.target.value); if (!fieldKey) setFieldKey(toKey(event.target.value)); }} placeholder="e.g. Referral Doctor" className="mt-1 h-10 w-full rounded-md border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-400" />
              </label>
              <label className="block text-[11px] font-medium text-zinc-600">Field key
                <input required value={fieldKey} onChange={(event) => setFieldKey(toKey(event.target.value))} className="mt-1 h-10 w-full rounded-md border border-zinc-200 px-3 font-mono text-xs outline-none focus:border-zinc-400" />
              </label>
              <label className="block text-[11px] font-medium text-zinc-600">Type
                <select value={fieldType} onChange={(event) => setFieldType(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-zinc-200 bg-white px-2 text-sm">
                  {TYPES.map(([value, title]) => <option key={value} value={value}>{title}</option>)}
                </select>
              </label>
              <label className="block text-[11px] font-medium text-zinc-600">Section
                <input required value={sectionKey} onChange={(event) => setSectionKey(event.target.value)} placeholder="details" className="mt-1 h-10 w-full rounded-md border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-400" />
              </label>
              <label className="block text-[11px] font-medium text-zinc-600">Description
                <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional helper text" className="mt-1 h-10 w-full rounded-md border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-400" />
              </label>
              {selectType && (
                <label className="block text-[11px] font-medium text-zinc-600">Options
                  <textarea required value={optionsText} onChange={(event) => setOptionsText(event.target.value)} rows={4} placeholder={'Option one\nOption two\nOption three'} className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400" />
                  <span className="mt-1 block text-[10px] text-zinc-400">One per line or comma-separated.</span>
                </label>
              )}
              <div className="space-y-2 border-t border-zinc-100 pt-4 text-xs text-zinc-600">
                <label className="flex items-center gap-2"><input type="checkbox" checked={required} onChange={(event) => setRequired(event.target.checked)} /> Required on intake</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={searchable} onChange={(event) => setSearchable(event.target.checked)} /> Searchable</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={filterable} onChange={(event) => setFilterable(event.target.checked)} /> Filterable</label>
              </div>
              <button type="submit" disabled={saving} className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-zinc-950 px-4 text-xs font-semibold text-white disabled:bg-zinc-400">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add field
              </button>
            </form>
          </div>
        </aside>
      </div>
    </div>
  );
}
