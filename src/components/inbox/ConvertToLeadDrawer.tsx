'use client';

import React, { useState, useEffect } from 'react';
import { useDialog } from '@/lib/useDialog';
import { useApp } from '@/lib/store';
import {
  X,
  UserCheck,
  MapPin,
  Calendar,
  DollarSign,
  Users,
  AlertCircle,
  Loader2,
  Sparkles,
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
  const [detectedLocationLabel, setDetectedLocationLabel] = useState<string | null>(null);
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

  // Initialize form state when conversation changes
  useEffect(() => {
    if (conversation && isOpen) {
      setCustomerName(conversation.customer_name || 'Traveler');
      const fallbackPhone = conversation.customer_phone?.startsWith(`${conversation.provider}:`) ? '' : (conversation.customer_phone || '');
      setCustomerPhone(initialPhone || fallbackPhone);
      setCustomerEmail(conversation.customer_email || '');

      const profile = (conversation.metadata as Record<string, unknown> | undefined)?.customer_profile as Record<string, unknown> | undefined;
      const detectedCity = typeof profile?.city === 'string' ? profile.city : '';
      const detectedCountry = typeof profile?.country === 'string' ? profile.country : '';
      setCustomerCity(detectedCity);
      setCustomerCountry(detectedCountry);
      if (detectedCity || detectedCountry) {
        setDetectedLocationLabel([detectedCity, detectedCountry].filter(Boolean).join(', '));
      } else {
        setDetectedLocationLabel(null);
      }

      setDestination('');
      setTravelDates('');
      setBudgetRange('$2,000 - $3,500');
      setPaxAdults(2);
      setPaxChildren(0);
      setPriority('normal');
      setAssignedTo(conversation.assigned_to || (currentUser.role === 'agent' ? currentUser.id : ''));
      setNotes(conversation.last_message_preview ? `Inquiry snippet: "${conversation.last_message_preview}"` : '');
      setError(null);
    }
  }, [conversation, isOpen, currentUser, initialPhone]);

  if (!isOpen || !conversation) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to convert conversation to lead.');
      }

      showToast(`Lead created for ${data.lead.customer_name} (${data.lead.destination})!`, 'success');
      onConverted(data.lead);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Conversion failed. Try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeAgents = allProfiles.filter((p) => p.is_active && (p.role === 'agent' || p.role === 'manager' || p.role === 'admin'));

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="convert-drawer-title">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-zinc-950/40 backdrop-blur-[2px] transition-opacity animate-in fade-in"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
        <div className="w-screen max-w-lg border-l border-zinc-200 bg-white shadow-xl transition-all animate-in slide-in-from-right duration-200">
          <form onSubmit={handleSubmit} className="flex h-full flex-col">
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-700">
                  <UserCheck className="h-4 w-4" />
                </span>
                <div>
                  <h2 id="convert-drawer-title" className="text-sm font-semibold text-zinc-950">
                    Convert to Sales Lead
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Turn this {conversation.provider} chat into an active CRM lead with attached history.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
                aria-label="Close drawer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Error Banner */}
            {error && (
              <div className="mx-6 mt-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Drawer Body Form */}
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5 text-xs">
              {/* Customer Info Section */}
              <div className="space-y-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                  Traveler Contact
                </div>
                <div>
                  <label htmlFor="drawer-customer-name" className="mb-1 block font-semibold text-zinc-800">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="drawer-customer-name"
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-950 focus:border-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-950"
                    placeholder="e.g. Liam Smith"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="drawer-customer-phone" className="mb-1 flex items-center justify-between font-semibold text-zinc-800">
                      <span>Phone Number</span>
                      {initialPhone && (
                        <span className="rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                          From chat
                        </span>
                      )}
                    </label>
                    <input
                      id="drawer-customer-phone"
                      type="text"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className={`h-9 w-full font-mono rounded-md border ${initialPhone ? 'border-emerald-400 bg-emerald-50/20' : 'border-zinc-200 bg-white'} px-3 text-xs font-medium text-zinc-950 focus:border-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-950`}
                      placeholder="+1 555 0192"
                    />
                  </div>
                  <div>
                    <label htmlFor="drawer-customer-email" className="mb-1 block font-semibold text-zinc-800">
                      Email Address
                    </label>
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

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="drawer-customer-city" className="mb-1 flex items-center justify-between font-semibold text-zinc-800">
                      <span>City / Town</span>
                      {detectedLocationLabel && customerCity && (
                        <span className="rounded bg-zinc-100 border border-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700">
                          Detected
                        </span>
                      )}
                    </label>
                    <input
                      id="drawer-customer-city"
                      type="text"
                      value={customerCity}
                      onChange={(e) => setCustomerCity(e.target.value)}
                      className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-950 focus:border-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-950"
                      placeholder="e.g. Kathmandu, Austin"
                    />
                  </div>
                  <div>
                    <label htmlFor="drawer-customer-country" className="mb-1 flex items-center justify-between font-semibold text-zinc-800">
                      <span>Country</span>
                      {detectedLocationLabel && customerCountry && (
                        <span className="rounded bg-zinc-100 border border-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700">
                          Detected
                        </span>
                      )}
                    </label>
                    <input
                      id="drawer-customer-country"
                      type="text"
                      value={customerCountry}
                      onChange={(e) => setCustomerCountry(e.target.value)}
                      className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-950 focus:border-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-950"
                      placeholder="e.g. Nepal, USA, India"
                    />
                  </div>
                </div>
              </div>

              {/* Trip Requirements Section */}
              <div className="space-y-3 pt-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                  Trip Details
                </div>

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
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      className="h-9 w-full rounded-md border border-zinc-200 bg-white pl-8 pr-3 text-xs font-medium text-zinc-950 focus:border-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-950"
                      placeholder="e.g. Japan Cherry Blossom, Maldives, Swiss Alps"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="drawer-travel-dates" className="mb-1 block font-semibold text-zinc-800">
                      Travel Dates
                    </label>
                    <div className="relative">
                      <Calendar className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
                      <input
                        id="drawer-travel-dates"
                        type="text"
                        value={travelDates}
                        onChange={(e) => setTravelDates(e.target.value)}
                        className="h-9 w-full rounded-md border border-zinc-200 bg-white pl-8 pr-3 text-xs font-medium text-zinc-950 focus:border-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-950"
                        placeholder="Oct 2026 / Flexible"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="drawer-budget" className="mb-1 block font-semibold text-zinc-800">
                      Budget Range
                    </label>
                    <div className="relative">
                      <DollarSign className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
                      <input
                        id="drawer-budget"
                        type="text"
                        value={budgetRange}
                        onChange={(e) => setBudgetRange(e.target.value)}
                        className="h-9 w-full rounded-md border border-zinc-200 bg-white pl-8 pr-3 text-xs font-medium text-zinc-950 focus:border-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-950"
                        placeholder="$3,000 - $5,000"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="drawer-adults" className="mb-1 block font-semibold text-zinc-800">
                      Adults
                    </label>
                    <input
                      id="drawer-adults"
                      type="number"
                      min={1}
                      max={50}
                      value={paxAdults}
                      onChange={(e) => setPaxAdults(Number(e.target.value))}
                      className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-950 focus:border-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-950"
                    />
                  </div>
                  <div>
                    <label htmlFor="drawer-children" className="mb-1 block font-semibold text-zinc-800">
                      Children
                    </label>
                    <input
                      id="drawer-children"
                      type="number"
                      min={0}
                      max={30}
                      value={paxChildren}
                      onChange={(e) => setPaxChildren(Number(e.target.value))}
                      className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-950 focus:border-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-950"
                    />
                  </div>
                  <div>
                    <label htmlFor="drawer-priority" className="mb-1 block font-semibold text-zinc-800">
                      Priority
                    </label>
                    <select
                      id="drawer-priority"
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as any)}
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

              {/* Assignment & Notes Section */}
              <div className="space-y-3 pt-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                  Routing & Notes
                </div>

                <div>
                  <label htmlFor="drawer-assign-to" className="mb-1 block font-semibold text-zinc-800">
                    Assign To Travel Agent
                  </label>
                  <select
                    id="drawer-assign-to"
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-950 focus:border-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-950"
                  >
                    <option value="">Unassigned (Queue / Pool)</option>
                    {activeAgents.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.full_name || profile.email} ({profile.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="drawer-notes" className="mb-1 block font-medium text-zinc-700">
                    Internal Lead Notes
                  </label>
                  <textarea
                    id="drawer-notes"
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full rounded-md border border-zinc-200 bg-white p-3 text-xs text-zinc-900 focus:border-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-950"
                    placeholder="Customer preferences, budget context, urgency notes..."
                  />
                </div>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="flex items-center justify-between border-t border-zinc-200 bg-zinc-50 px-6 py-3.5">
              <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                <span>Chat history will attach to the new lead.</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="rounded-md border border-zinc-200 bg-white px-3.5 py-2 text-xs font-medium text-zinc-700 shadow-2xs hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 rounded-md bg-zinc-950 px-4 py-2 text-xs font-medium text-white shadow-2xs hover:bg-zinc-800 disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Create Lead
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
