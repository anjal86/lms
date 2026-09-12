'use client';

import React, { useEffect, useState } from 'react';
import { useDialog } from '@/lib/useDialog';
import { useApp } from '@/lib/store';
import {
  AlertCircle,
  Calendar,
  DollarSign,
  Loader2,
  MapPin,
  Sparkles,
  UserCheck,
  X,
} from 'lucide-react';

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

function locationSourceLabel(source: unknown, inferredFromText: unknown) {
  if (source === 'manual') return 'Manual';
  if (source === 'lead_form') return 'From form';
  if (source === 'existing_lead') return 'From lead';
  if (source === 'meta_profile') return 'Meta profile';
  if (source === 'chat_heuristic' || inferredFromText === true) return 'From chat';
  return 'Detected';
}

export default function ConvertToLeadDrawer({
  isOpen,
  onClose,
  conversation,
  onConverted,
  initialPhone,
}: ConvertToLeadDrawerProps) {
  useDialog({ isOpen, onClose });
  const { allProfiles, currentUser, showToast } = useApp();

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerCity, setCustomerCity] = useState('');
  const [customerCountry, setCustomerCountry] = useState('');
  const [locationSource, setLocationSource] = useState<string | null>(null);
  const [destination, setDestination] = useState('');
  const [travelDates, setTravelDates] = useState('');
  const [budgetRange, setBudgetRange] = useState('$2,000 - $3,500');
  const [paxAdults, setPaxAdults] = useState(2);
  const [paxChildren, setPaxChildren] = useState(0);
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [assignedTo, setAssignedTo] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!conversation || !isOpen) return;

    setCustomerName(conversation.customer_name || 'Traveler');
    const fallbackPhone = conversation.customer_phone?.startsWith(`${conversation.provider}:`)
      ? ''
      : (conversation.customer_phone || '');
    setCustomerPhone(initialPhone || fallbackPhone);
    setCustomerEmail(conversation.customer_email || '');

    const profile = (conversation.metadata as Record<string, unknown> | undefined)?.customer_profile as Record<string, unknown> | undefined;
    const detectedCity = typeof profile?.city === 'string' ? profile.city : '';
    const detectedCountry = typeof profile?.country === 'string' ? profile.country : '';
    setCustomerCity(detectedCity);
    setCustomerCountry(detectedCountry);
    setLocationSource(
      detectedCity || detectedCountry
        ? locationSourceLabel(profile?.locationSource, profile?.inferredFromText)
        : null
    );

    setDestination('');
    setTravelDates('');
    setBudgetRange('$2,000 - $3,500');
    setPaxAdults(2);
    setPaxChildren(0);
    setPriority('normal');
    setAssignedTo(conversation.assigned_to || (currentUser.role === 'agent' ? currentUser.id : ''));
    setNotes(conversation.last_message_preview ? `Inquiry snippet: "${conversation.last_message_preview}"` : '');
    setError(null);
  }, [conversation, isOpen, currentUser.id, currentUser.role, initialPhone]);

  if (!isOpen || !conversation) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!destination.trim()) {
      setError('Please specify a travel destination.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/conversations/${conversation.id}/convert-to-lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customerName.trim() || 'Traveler',
          customerPhone: customerPhone.trim() || `${conversation.provider}:${conversation.id.slice(0, 8)}`,
          customerEmail: customerEmail.trim() || undefined,
          customerCity: customerCity.trim() || undefined,
          customerCountry: customerCountry.trim() || undefined,
          destination: destination.trim(),
          travelDates: travelDates.trim() || undefined,
          budgetRange: budgetRange.trim() || undefined,
          paxAdults: Number(paxAdults) || 2,
          paxChildren: Number(paxChildren) || 0,
          priority,
          assignedTo: assignedTo || null,
          notes: notes.trim() || undefined,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Failed to convert conversation to lead.');
      if (!data.lead?.id) throw new Error('Lead conversion returned an incomplete response.');

      showToast(`Lead created for ${data.lead.customer_name} (${data.lead.destination})!`, 'success');
      onConverted(data.lead);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Conversion failed. Try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeAgents = allProfiles.filter((profile) => {
    if (!profile.is_active) return false;
    if (currentUser.role === 'agent') return profile.id === currentUser.id;
    return profile.role === 'agent' || profile.role === 'manager' || profile.role === 'admin';
  });

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="convert-drawer-title"
      aria-describedby="convert-drawer-description"
      aria-busy={isSubmitting}
      tabIndex={-1}
    >
      <div
        className="fixed inset-0 bg-zinc-950/40 backdrop-blur-[2px] transition-opacity animate-in fade-in"
        onClick={isSubmitting ? undefined : onClose}
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 right-0 flex w-full max-w-full pl-0 sm:pl-10">
        <div className="w-full max-w-lg border-l border-zinc-200 bg-white shadow-xl transition-all animate-in slide-in-from-right duration-200">
          <form onSubmit={handleSubmit} className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-zinc-800">
                  <UserCheck className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h2 id="convert-drawer-title" className="text-sm font-semibold text-zinc-950">
                    Convert to Sales Lead
                  </h2>
                  <p id="convert-drawer-description" className="truncate text-xs text-zinc-500">
                    Create a CRM lead and attach this {conversation.provider} chat history.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 disabled:opacity-50"
                aria-label="Close conversion drawer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {error && (
              <div
                role="alert"
                aria-live="assertive"
                className="mx-4 mt-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700 sm:mx-6"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 text-xs sm:px-6">
              <div className="space-y-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Traveler Contact</div>
                <div>
                  <label htmlFor="drawer-customer-name" className="mb-1 block font-semibold text-zinc-800">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="drawer-customer-name"
                    type="text"
                    required
                    maxLength={120}
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-950 focus:border-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-950"
                    placeholder="e.g. Liam Smith"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="drawer-customer-phone" className="mb-1 flex items-center justify-between font-semibold text-zinc-800">
                      <span>Phone Number</span>
                      {initialPhone && (
                        <span className="rounded border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700">From chat</span>
                      )}
                    </label>
                    <input
                      id="drawer-customer-phone"
                      type="tel"
                      maxLength={60}
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className={`h-9 w-full rounded-md border px-3 font-mono text-xs font-medium text-zinc-950 focus:border-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-950 ${initialPhone ? 'border-zinc-300 bg-zinc-50' : 'border-zinc-200 bg-white'}`}
                      placeholder="+1 555 0192"
                    />
                  </div>
                  <div>
                    <label htmlFor="drawer-customer-email" className="mb-1 block font-semibold text-zinc-800">Email Address</label>
                    <input
                      id="drawer-customer-email"
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-950 focus:border-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-950"
                      placeholder="liam@example.com"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="drawer-customer-city" className="mb-1 flex items-center justify-between gap-2 font-semibold text-zinc-800">
                      <span>City / Town</span>
                      {locationSource && customerCity && <span className="rounded border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">{locationSource}</span>}
                    </label>
                    <input
                      id="drawer-customer-city"
                      type="text"
                      maxLength={120}
                      value={customerCity}
                      onChange={(e) => setCustomerCity(e.target.value)}
                      className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-950 focus:border-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-950"
                      placeholder="e.g. Kathmandu, Austin"
                    />
                  </div>
                  <div>
                    <label htmlFor="drawer-customer-country" className="mb-1 flex items-center justify-between gap-2 font-semibold text-zinc-800">
                      <span>Country</span>
                      {locationSource && customerCountry && <span className="rounded border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">{locationSource}</span>}
                    </label>
                    <input
                      id="drawer-customer-country"
                      type="text"
                      maxLength={120}
                      value={customerCountry}
                      onChange={(e) => setCustomerCountry(e.target.value)}
                      className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-950 focus:border-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-950"
                      placeholder="e.g. Nepal, Australia"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Trip Details</div>
                <div>
                  <label htmlFor="drawer-destination" className="mb-1 block font-semibold text-zinc-800">
                    Destination <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
                    <input
                      id="drawer-destination"
                      type="text"
                      required
                      maxLength={120}
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      className="h-9 w-full rounded-md border border-zinc-200 bg-white pl-8 pr-3 text-xs font-medium text-zinc-950 focus:border-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-950"
                      placeholder="e.g. Japan Cherry Blossom"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="drawer-travel-dates" className="mb-1 block font-semibold text-zinc-800">Travel Dates</label>
                    <div className="relative">
                      <Calendar className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
                      <input
                        id="drawer-travel-dates"
                        type="text"
                        maxLength={120}
                        value={travelDates}
                        onChange={(e) => setTravelDates(e.target.value)}
                        className="h-9 w-full rounded-md border border-zinc-200 bg-white pl-8 pr-3 text-xs font-medium text-zinc-950 focus:border-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-950"
                        placeholder="Oct 2026 / Flexible"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="drawer-budget" className="mb-1 block font-semibold text-zinc-800">Budget Range</label>
                    <div className="relative">
                      <DollarSign className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
                      <input
                        id="drawer-budget"
                        type="text"
                        maxLength={120}
                        value={budgetRange}
                        onChange={(e) => setBudgetRange(e.target.value)}
                        className="h-9 w-full rounded-md border border-zinc-200 bg-white pl-8 pr-3 text-xs font-medium text-zinc-950 focus:border-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-950"
                        placeholder="$3,000 - $5,000"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div>
                    <label htmlFor="drawer-adults" className="mb-1 block font-semibold text-zinc-800">Adults</label>
                    <input
                      id="drawer-adults"
                      type="number"
                      min={1}
                      max={100}
                      value={paxAdults}
                      onChange={(e) => setPaxAdults(Number(e.target.value))}
                      className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-950 focus:border-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-950"
                    />
                  </div>
                  <div>
                    <label htmlFor="drawer-children" className="mb-1 block font-semibold text-zinc-800">Children</label>
                    <input
                      id="drawer-children"
                      type="number"
                      min={0}
                      max={50}
                      value={paxChildren}
                      onChange={(e) => setPaxChildren(Number(e.target.value))}
                      className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-950 focus:border-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-950"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label htmlFor="drawer-priority" className="mb-1 block font-semibold text-zinc-800">Priority</label>
                    <select
                      id="drawer-priority"
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as 'low' | 'normal' | 'high' | 'urgent')}
                      className="h-9 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs font-semibold text-zinc-950 focus:border-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-950"
                    >
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Routing & Notes</div>
                <div>
                  <label htmlFor="drawer-assign-to" className="mb-1 block font-semibold text-zinc-800">Assign To Travel Agent</label>
                  <select
                    id="drawer-assign-to"
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    disabled={currentUser.role === 'agent'}
                    className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-950 focus:border-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-950 disabled:bg-zinc-50 disabled:text-zinc-600"
                  >
                    {currentUser.role !== 'agent' && <option value="">Unassigned (Queue / Pool)</option>}
                    {activeAgents.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.full_name || profile.email} ({profile.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="drawer-notes" className="mb-1 block font-medium text-zinc-700">Internal Lead Notes</label>
                  <textarea
                    id="drawer-notes"
                    rows={3}
                    maxLength={2000}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full rounded-md border border-zinc-200 bg-white p-3 text-xs text-zinc-900 focus:border-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-950"
                    placeholder="Customer preferences, budget context, urgency notes..."
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                <Sparkles className="h-3.5 w-3.5 text-zinc-500" />
                <span>Chat history will attach to the new lead.</span>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="rounded-md border border-zinc-200 bg-white px-3.5 py-2 text-xs font-medium text-zinc-700 shadow-2xs hover:bg-zinc-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 rounded-md bg-zinc-950 px-4 py-2 text-xs font-medium text-white shadow-2xs hover:bg-zinc-800 disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {isSubmitting ? 'Creating…' : 'Create Lead'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
