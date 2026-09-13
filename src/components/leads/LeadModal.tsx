'use client';

import React, { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Loader2, Plus, X } from 'lucide-react';
import { useApp } from '@/lib/store';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';
import type { DynamicFieldDefinition } from '@/lib/platform/types';
import { useDialog } from '@/lib/useDialog';

interface LeadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type FieldValue = string | number | boolean | string[] | null;

function optionStrings(field: DynamicFieldDefinition) {
  return Array.isArray(field.options)
    ? field.options.map((option) => String(option)).filter(Boolean)
    : [];
}

function defaultFieldValue(field: DynamicFieldDefinition): FieldValue {
  if (field.default_value != null) {
    if (field.field_type === 'multi_select') {
      return Array.isArray(field.default_value) ? field.default_value.map(String) : [];
    }
    if (field.field_type === 'boolean') return Boolean(field.default_value);
    if (['number', 'currency', 'percentage', 'rating'].includes(field.field_type)) {
      const value = Number(field.default_value);
      return Number.isFinite(value) ? value : '';
    }
    return String(field.default_value);
  }

  if (field.field_type === 'boolean') return false;
  if (field.field_type === 'multi_select') return [];
  return '';
}

function inputType(fieldType: string) {
  if (fieldType === 'email') return 'email';
  if (fieldType === 'phone') return 'tel';
  if (fieldType === 'url') return 'url';
  if (fieldType === 'date') return 'date';
  if (fieldType === 'datetime') return 'datetime-local';
  if (['number', 'currency', 'percentage', 'rating'].includes(fieldType)) return 'number';
  return 'text';
}

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: DynamicFieldDefinition;
  value: FieldValue;
  onChange: (value: FieldValue) => void;
}) {
  const options = optionStrings(field);
  const base = 'w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100';

  if (field.field_type === 'textarea') {
    return (
      <textarea
        rows={3}
        required={field.is_required}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        className={`${base} min-h-20 resize-y py-2`}
      />
    );
  }

  if (field.field_type === 'single_select') {
    return (
      <select
        required={field.is_required}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        className={`${base} h-10`}
      >
        <option value="">Select…</option>
        {options.map((option) => <option key={option} value={option}>{option.replaceAll('_', ' ')}</option>)}
      </select>
    );
  }

  if (field.field_type === 'multi_select') {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div className="flex flex-wrap gap-1.5 rounded-md border border-zinc-200 bg-white p-2">
        {options.length === 0 && <span className="text-xs text-zinc-400">No options configured</span>}
        {options.map((option) => {
          const active = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(active ? selected.filter((item) => item !== option) : [...selected, option])}
              className={`rounded-md border px-2 py-1 text-[11px] font-medium transition ${active ? 'border-zinc-950 bg-zinc-950 text-white' : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'}`}
            >
              {option.replaceAll('_', ' ')}
            </button>
          );
        })}
      </div>
    );
  }

  if (field.field_type === 'boolean') {
    return (
      <label className="flex min-h-10 items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-700">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
          className="h-4 w-4 rounded border-zinc-300"
        />
        Yes
      </label>
    );
  }

  return (
    <input
      type={inputType(field.field_type)}
      required={field.is_required}
      value={typeof value === 'number' || typeof value === 'string' ? value : ''}
      onChange={(event) => {
        if (['number', 'currency', 'percentage', 'rating'].includes(field.field_type)) {
          onChange(event.target.value === '' ? '' : Number(event.target.value));
        } else {
          onChange(event.target.value);
        }
      }}
      step={field.field_type === 'currency' || field.field_type === 'percentage' ? '0.01' : undefined}
      min={field.field_type === 'rating' ? 0 : undefined}
      max={field.field_type === 'rating' ? 5 : field.field_type === 'percentage' ? 100 : undefined}
      className={`${base} h-10`}
    />
  );
}

export default function LeadModal({ isOpen, onClose }: LeadModalProps) {
  useDialog({ isOpen, onClose });
  const router = useRouter();
  const { allProfiles, agencySettings, currentUser } = useApp();
  const { config, term } = useWorkspace();

  const availableSources = agencySettings.custom_lead_sources?.length > 0
    ? agencySettings.custom_lead_sources
    : ['website', 'meta_ads', 'google_ads', 'whatsapp', 'referral', 'walk_in', 'phone_call', 'other'];

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState(currentUser.user_preferences?.default_country_code ? `${currentUser.user_preferences.default_country_code} ` : '');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerCity, setCustomerCity] = useState('');
  const [customerCountry, setCustomerCountry] = useState('');
  const [source, setSource] = useState(availableSources[0] || 'website');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [assignedTo, setAssignedTo] = useState('');
  const [notes, setNotes] = useState('');
  const [fieldValues, setFieldValues] = useState<Record<string, FieldValue>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fields = useMemo(
    () => config.fields.filter((field) => field.entity_type === 'lead' && field.is_active).sort((a, b) => a.sort_order - b.sort_order),
    [config.fields]
  );

  const sections = useMemo(() => {
    const grouped = new Map<string, DynamicFieldDefinition[]>();
    for (const field of fields) {
      const current = grouped.get(field.section_key) || [];
      current.push(field);
      grouped.set(field.section_key, current);
    }
    return Array.from(grouped.entries());
  }, [fields]);

  const agents = allProfiles.filter((profile) => profile.role === 'agent' && profile.is_active);
  const leadLabel = term('lead', 'Lead');
  const contactLabel = term('contact', 'Contact');

  if (!isOpen) return null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    const customData: Record<string, FieldValue> = {};
    for (const field of fields) {
      const value = Object.prototype.hasOwnProperty.call(fieldValues, field.field_key)
        ? fieldValues[field.field_key]
        : defaultFieldValue(field);
      if (field.is_required && (value == null || value === '' || (Array.isArray(value) && value.length === 0))) {
        setSubmitError(`${field.label} is required.`);
        setSubmitting(false);
        return;
      }
      if (value !== '' && value != null && !(Array.isArray(value) && value.length === 0)) {
        customData[field.field_key] = value;
      }
    }

    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName,
          customerPhone,
          customerEmail,
          customerCity,
          customerCountry,
          source,
          priority,
          assignedTo: assignedTo || null,
          notes,
          customData,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || `Unable to create ${leadLabel.toLowerCase()}.`);
      const id = payload?.lead?.id;
      if (!id) throw new Error(`${leadLabel} was created without a record identifier.`);

      onClose();
      router.push(currentUser.role === 'agent' ? `/my-work/${id}` : `/leads/${id}/workspace`);
      router.refresh();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : `Unable to create ${leadLabel.toLowerCase()}.`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-lead-modal-title"
      onClick={(event) => event.target === event.currentTarget && !submitting && onClose()}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-zinc-950/45 p-4 backdrop-blur-[1px]"
    >
      <div className="my-6 w-full max-w-2xl overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4">
          <div className="min-w-0">
            <div id="new-lead-modal-title" className="text-sm font-semibold text-zinc-950">New {leadLabel}</div>
            <div className="mt-1 text-xs text-zinc-500">
              {config.workspace.name} · {config.templates.find((template) => template.key === config.workspace.template_key)?.name || config.workspace.business_type}
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={submitting} aria-label="Close dialog" className="rounded-md p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-40">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="max-h-[82vh] overflow-y-auto">
          <div className="space-y-6 p-5">
            {submitError && (
              <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {submitError}
              </div>
            )}

            <section>
              <div className="mb-3">
                <h3 className="text-xs font-semibold text-zinc-900">{contactLabel} details</h3>
                <p className="mt-0.5 text-[11px] text-zinc-500">Universal identity and contact information.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-[11px] font-medium text-zinc-600">Full name <span className="text-red-500">*</span>
                  <input required value={customerName} onChange={(event) => setCustomerName(event.target.value)} autoComplete="name" className="mt-1 h-10 w-full rounded-md border border-zinc-200 px-3 text-sm text-zinc-900 outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100" />
                </label>
                <label className="text-[11px] font-medium text-zinc-600">Phone / WhatsApp
                  <input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} type="tel" autoComplete="tel" className="mt-1 h-10 w-full rounded-md border border-zinc-200 px-3 font-mono text-sm text-zinc-900 outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100" />
                </label>
                <label className="text-[11px] font-medium text-zinc-600">Email
                  <input value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} type="email" autoComplete="email" className="mt-1 h-10 w-full rounded-md border border-zinc-200 px-3 text-sm text-zinc-900 outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100" />
                </label>
                <label className="text-[11px] font-medium text-zinc-600">City
                  <input value={customerCity} onChange={(event) => setCustomerCity(event.target.value)} autoComplete="address-level2" className="mt-1 h-10 w-full rounded-md border border-zinc-200 px-3 text-sm text-zinc-900 outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100" />
                </label>
                <label className="text-[11px] font-medium text-zinc-600 sm:col-span-2">Country
                  <input value={customerCountry} onChange={(event) => setCustomerCountry(event.target.value)} autoComplete="country-name" className="mt-1 h-10 w-full rounded-md border border-zinc-200 px-3 text-sm text-zinc-900 outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100" />
                </label>
              </div>
            </section>

            {sections.map(([sectionKey, sectionFields]) => (
              <section key={sectionKey} className="border-t border-zinc-100 pt-5">
                <div className="mb-3">
                  <h3 className="text-xs font-semibold text-zinc-900">{sectionKey.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())}</h3>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {sectionFields.map((field) => {
                    const value = Object.prototype.hasOwnProperty.call(fieldValues, field.field_key)
                      ? fieldValues[field.field_key]
                      : defaultFieldValue(field);
                    return (
                      <label key={field.id} className={`text-[11px] font-medium text-zinc-600 ${field.field_type === 'textarea' || field.field_type === 'multi_select' ? 'sm:col-span-2' : ''}`}>
                        <span className="flex items-center gap-1">{field.label}{field.is_required && <span className="text-red-500">*</span>}</span>
                        {field.description && <span className="mt-0.5 block font-normal leading-4 text-zinc-400">{field.description}</span>}
                        <span className="mt-1 block">
                          <FieldControl
                            field={field}
                            value={value}
                            onChange={(nextValue) => setFieldValues((current) => ({ ...current, [field.field_key]: nextValue }))}
                          />
                        </span>
                      </label>
                    );
                  })}
                </div>
              </section>
            ))}

            <section className="border-t border-zinc-100 pt-5">
              <div className="mb-3">
                <h3 className="text-xs font-semibold text-zinc-900">CRM routing</h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-[11px] font-medium text-zinc-600">Source
                  <select value={source} onChange={(event) => setSource(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-800">
                    {availableSources.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}
                  </select>
                </label>
                <label className="text-[11px] font-medium text-zinc-600">Priority
                  <select value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)} className="mt-1 h-10 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-800">
                    <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
                  </select>
                </label>
                <label className="text-[11px] font-medium text-zinc-600">Owner
                  <select value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)} disabled={currentUser.role === 'agent'} className="mt-1 h-10 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-800 disabled:bg-zinc-50">
                    <option value="">{currentUser.role === 'agent' ? currentUser.full_name : 'Auto-assign'}</option>
                    {currentUser.role !== 'agent' && agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.full_name}</option>)}
                  </select>
                </label>
              </div>
              <label className="mt-3 block text-[11px] font-medium text-zinc-600">Internal notes
                <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} className="mt-1 w-full resize-y rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400" placeholder="Context the team should know…" />
              </label>
            </section>
          </div>

          <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-zinc-200 bg-white/95 px-5 py-3 backdrop-blur">
            <div className="text-[11px] text-zinc-400">Fields adapt to {config.workspace.business_type.replaceAll('_', ' ')} configuration.</div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} disabled={submitting} className="h-9 rounded-md px-3 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 disabled:opacity-40">Cancel</button>
              <button type="submit" disabled={submitting} className="inline-flex h-9 items-center gap-2 rounded-md bg-zinc-950 px-4 text-xs font-semibold text-white hover:bg-black disabled:bg-zinc-400">
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Create {leadLabel}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
