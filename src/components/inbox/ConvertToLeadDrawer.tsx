'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, UserCheck, X } from 'lucide-react';
import AppOverlayPortal from '@/components/layout/AppOverlayPortal';
import { useDialog } from '@/lib/useDialog';
import { useApp } from '@/lib/store';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';
import type { DynamicFieldDefinition } from '@/lib/platform/types';

export type ConversationForConversion = {
  id: string;
  provider: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  last_message_preview?: string | null;
  assigned_to?: string | null;
  metadata?: Record<string, unknown> | null;
};

interface ConvertToLeadDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  conversation: ConversationForConversion | null;
  onConverted: (lead: { id: string; customer_name: string; destination: string }) => void;
  initialPhone?: string | null;
}

type FieldValue = string | number | boolean | string[] | null;

function defaultValue(field: DynamicFieldDefinition): FieldValue {
  if (field.default_value != null) {
    if (field.field_type === 'boolean') return Boolean(field.default_value);
    if (field.field_type === 'multi_select') return Array.isArray(field.default_value) ? field.default_value.map(String) : [];
    if (['number', 'currency', 'percentage', 'rating'].includes(field.field_type)) {
      const numeric = Number(field.default_value);
      return Number.isFinite(numeric) ? numeric : '';
    }
    return String(field.default_value);
  }
  if (field.field_type === 'boolean') return false;
  if (field.field_type === 'multi_select') return [];
  return '';
}

function locationSourceLabel(source: unknown, inferredFromText: unknown) {
  if (source === 'manual') return 'Manual';
  if (source === 'lead_form') return 'From form';
  if (source === 'existing_lead') return 'From CRM';
  if (source === 'meta_profile') return 'Meta profile';
  if (source === 'chat_heuristic' || inferredFromText === true) return 'From chat';
  return 'Detected';
}

function chatDetectedPhone(conversation: ConversationForConversion | null, initialPhone?: string | null) {
  const explicit = initialPhone?.trim();
  if (explicit) return explicit;
  const detected = conversation?.metadata?.detected_phone;
  return typeof detected === 'string' ? detected.trim() : '';
}

function DynamicControl({ field, value, onChange }: { field: DynamicFieldDefinition; value: FieldValue; onChange: (value: FieldValue) => void }) {
  const inputClass = 'h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-xs text-zinc-950 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-100';
  const options = Array.isArray(field.options) ? field.options.map(String) : [];

  if (field.field_type === 'textarea') {
    return <textarea rows={3} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} className={`${inputClass} h-auto min-h-20 resize-y py-2`} />;
  }
  if (field.field_type === 'single_select') {
    return <select value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} className={inputClass}><option value="">Select…</option>{options.map((option) => <option key={option} value={option}>{option.replaceAll('_', ' ')}</option>)}</select>;
  }
  if (field.field_type === 'multi_select') {
    const selected = Array.isArray(value) ? value : [];
    return <div className="flex flex-wrap gap-1.5 rounded-md border border-zinc-200 bg-white p-2">{options.map((option) => { const active = selected.includes(option); return <button key={option} type="button" aria-pressed={active} onClick={() => onChange(active ? selected.filter((item) => item !== option) : [...selected, option])} className={`rounded border px-2 py-1 text-[10px] font-medium ${active ? 'border-zinc-950 bg-zinc-950 text-white' : 'border-zinc-200 text-zinc-600'}`}>{option.replaceAll('_', ' ')}</button>; })}</div>;
  }
  if (field.field_type === 'boolean') {
    return <label className="flex h-9 items-center gap-2 rounded-md border border-zinc-200 px-3 text-xs text-zinc-700"><input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} /> Yes</label>;
  }

  const type = field.field_type === 'email' ? 'email'
    : field.field_type === 'phone' ? 'tel'
      : field.field_type === 'url' ? 'url'
        : field.field_type === 'date' ? 'date'
          : field.field_type === 'datetime' ? 'datetime-local'
            : ['number', 'currency', 'percentage', 'rating'].includes(field.field_type) ? 'number'
              : 'text';
  return <input type={type} value={typeof value === 'string' || typeof value === 'number' ? value : ''} onChange={(event) => onChange(type === 'number' ? (event.target.value === '' ? '' : Number(event.target.value)) : event.target.value)} className={inputClass} />;
}

export default function ConvertToLeadDrawer({ isOpen, onClose, conversation, onConverted, initialPhone }: ConvertToLeadDrawerProps) {
  useDialog({ isOpen, onClose });
  const { allProfiles, currentUser, showToast } = useApp();
  const { config, term } = useWorkspace();

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerCity, setCustomerCity] = useState('');
  const [customerCountry, setCustomerCountry] = useState('');
  const [locationSource, setLocationSource] = useState<string | null>(null);
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [assignedTo, setAssignedTo] = useState('');
  const [notes, setNotes] = useState('');
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fields = useMemo(() => config.fields.filter((field) => field.entity_type === 'lead' && field.is_active).sort((a, b) => a.sort_order - b.sort_order), [config.fields]);
  const sections = useMemo(() => {
    const grouped = new Map<string, DynamicFieldDefinition[]>();
    for (const field of fields) grouped.set(field.section_key, [...(grouped.get(field.section_key) || []), field]);
    return Array.from(grouped.entries());
  }, [fields]);
  const leadLabel = term('lead', 'Lead');
  const contactLabel = term('contact', 'Contact');
  const detectedPhone = useMemo(() => chatDetectedPhone(conversation, initialPhone), [conversation, initialPhone]);

  useEffect(() => {
    if (!conversation || !isOpen) return;
    const fallbackPhone = conversation.customer_phone?.startsWith(`${conversation.provider}:`) ? '' : (conversation.customer_phone || '');
    const profile = (conversation.metadata || {}).customer_profile as Record<string, unknown> | undefined;
    const detectedCity = typeof profile?.city === 'string' ? profile.city : '';
    const detectedCountry = typeof profile?.country === 'string' ? profile.country : '';

    setCustomerName(conversation.customer_name || contactLabel);
    setCustomerPhone(detectedPhone || fallbackPhone);
    setCustomerEmail(conversation.customer_email || '');
    setCustomerCity(detectedCity);
    setCustomerCountry(detectedCountry);
    setLocationSource(detectedCity || detectedCountry ? locationSourceLabel(profile?.locationSource, profile?.inferredFromText) : null);
    setPriority('normal');
    setAssignedTo(conversation.assigned_to || (currentUser.role === 'agent' ? currentUser.id : ''));
    setNotes(conversation.last_message_preview ? `Conversation context: “${conversation.last_message_preview}”` : '');
    setValues(Object.fromEntries(fields.map((field) => [field.field_key, defaultValue(field)])));
    setError(null);
  }, [contactLabel, conversation, currentUser.id, currentUser.role, detectedPhone, fields, isOpen]);

  if (!isOpen || !conversation) return null;

  const activeAgents = allProfiles.filter((profile) => profile.is_active && (currentUser.role === 'agent' ? profile.id === currentUser.id : ['agent', 'manager', 'admin'].includes(profile.role)));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    for (const field of fields) {
      const value = values[field.field_key];
      const empty = value == null || value === '' || (Array.isArray(value) && value.length === 0);
      if (field.is_required && empty) {
        setError(`${field.label} is required.`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/conversations/${conversation.id}/convert-to-lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customerName.trim() || contactLabel,
          customerPhone: customerPhone.trim(),
          customerEmail: customerEmail.trim(),
          customerCity: customerCity.trim(),
          customerCountry: customerCountry.trim(),
          priority,
          assignedTo: assignedTo || null,
          notes: notes.trim(),
          customData: values,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Failed to create ${leadLabel.toLowerCase()}.`);
      if (!data.lead?.id) throw new Error('Conversion returned an incomplete CRM record.');

      showToast(`${leadLabel} created for ${data.lead.customer_name}.`, 'success');
      onConverted({ ...data.lead, destination: data.lead.destination || 'Not specified' });
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Conversion failed. Try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppOverlayPortal>
      <div className="fixed inset-0 z-[80] overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="convert-drawer-title" aria-busy={isSubmitting}>
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-[2px]" onClick={isSubmitting ? undefined : onClose} aria-hidden="true" />
        <div className="fixed inset-y-0 right-0 flex h-dvh w-full max-w-full sm:pl-10">
          <div className="h-dvh w-full max-w-xl border-l border-zinc-200 bg-white shadow-xl">
            <form onSubmit={submit} className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
                <div className="flex min-w-0 items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50"><UserCheck className="h-4 w-4" /></span><div><h2 id="convert-drawer-title" className="text-sm font-semibold text-zinc-950">{term('convert', `Convert to ${leadLabel}`)}</h2><p className="mt-0.5 text-xs text-zinc-500">Attach this {conversation.provider} history and capture {config.workspace.name} fields.</p></div></div>
                <button type="button" onClick={onClose} disabled={isSubmitting} className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100" aria-label="Close conversion drawer"><X className="h-4 w-4" /></button>
              </div>

              {error && <div role="alert" className="mx-5 mt-4 flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}

              <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5 text-xs">
                <section className="space-y-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">{contactLabel} details</div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 font-semibold text-zinc-700">Name *<input required value={customerName} onChange={(event) => setCustomerName(event.target.value)} className="h-9 w-full rounded-md border border-zinc-200 px-3 font-normal" /></label>
                    <label className="space-y-1 font-semibold text-zinc-700">Phone{detectedPhone && <span className="ml-2 text-[9px] font-medium text-emerald-700">From chat</span>}<input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} className="h-9 w-full rounded-md border border-zinc-200 px-3 font-mono font-normal" /></label>
                    <label className="space-y-1 font-semibold text-zinc-700">Email<input type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} className="h-9 w-full rounded-md border border-zinc-200 px-3 font-normal" /></label>
                    <label className="space-y-1 font-semibold text-zinc-700">City{locationSource && customerCity && <span className="ml-2 text-[9px] font-medium text-zinc-400">{locationSource}</span>}<input value={customerCity} onChange={(event) => setCustomerCity(event.target.value)} className="h-9 w-full rounded-md border border-zinc-200 px-3 font-normal" /></label>
                    <label className="space-y-1 font-semibold text-zinc-700">Country<input value={customerCountry} onChange={(event) => setCustomerCountry(event.target.value)} className="h-9 w-full rounded-md border border-zinc-200 px-3 font-normal" /></label>
                    <label className="space-y-1 font-semibold text-zinc-700">Priority<select value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 font-normal"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
                  </div>
                </section>

                {sections.map(([section, sectionFields]) => <section key={section} className="space-y-3 border-t border-zinc-100 pt-5"><div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">{section.replaceAll('_', ' ')}</div><div className="grid gap-3 sm:grid-cols-2">{sectionFields.map((field) => <label key={field.id} className={`space-y-1 font-semibold text-zinc-700 ${field.field_type === 'textarea' || field.field_type === 'multi_select' ? 'sm:col-span-2' : ''}`}>{field.label}{field.is_required && <span className="text-red-500"> *</span>}{field.description && <span className="ml-2 text-[9px] font-normal text-zinc-400">{field.description}</span>}<DynamicControl field={field} value={values[field.field_key] ?? defaultValue(field)} onChange={(value) => setValues((current) => ({ ...current, [field.field_key]: value }))} /></label>)}</div></section>)}

                <section className="space-y-3 border-t border-zinc-100 pt-5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Ownership & context</div>
                  <label className="space-y-1 font-semibold text-zinc-700">Owner<select value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 font-normal"><option value="">Unassigned / automatic</option>{activeAgents.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name}</option>)}</select></label>
                  <label className="space-y-1 font-semibold text-zinc-700">Internal notes<textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} className="w-full rounded-md border border-zinc-200 p-3 font-normal" /></label>
                </section>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-zinc-200 bg-zinc-50 px-5 py-4">
                <span className="text-[10px] text-zinc-500">{fields.length} business field{fields.length === 1 ? '' : 's'} · {config.workspace.business_type.replaceAll('_', ' ')}</span>
                <div className="flex gap-2"><button type="button" onClick={onClose} disabled={isSubmitting} className="button-secondary">Cancel</button><button type="submit" disabled={isSubmitting} className="button-primary">{isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />} Create {leadLabel}</button></div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </AppOverlayPortal>
  );
}