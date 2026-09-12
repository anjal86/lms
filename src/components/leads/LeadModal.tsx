'use client';

import React, { useState } from 'react';
import { TravelType, Priority } from '@/lib/types';
import { useApp } from '@/lib/store';
import { useDialog } from '@/lib/useDialog';
import { X, Plus, Plane, MapPin } from 'lucide-react';

interface LeadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LeadModal({ isOpen, onClose }: LeadModalProps) {
  useDialog({ isOpen, onClose });

  const { addLead, allProfiles, agencySettings, currentUser } = useApp();

  const availableSources = agencySettings.custom_lead_sources?.length > 0
    ? agencySettings.custom_lead_sources
    : ['website', 'meta_ads', 'google_search', 'referral', 'walk_in', 'ota_partner'];

  const initialPhone = currentUser.user_preferences?.default_country_code
    ? `${currentUser.user_preferences.default_country_code} `
    : '+1 ';

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState(initialPhone);
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerCity, setCustomerCity] = useState('');
  const [destination, setDestination] = useState('Bali');
  const [travelDates, setTravelDates] = useState('');
  const [durationDays, setDurationDays] = useState(6);
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [travelType, setTravelType] = useState<TravelType>('honeymoon');
  const [budgetRange, setBudgetRange] = useState('$2,000 - $3,000');
  const [hotelCategory, setHotelCategory] = useState('4-star');
  const [flightRequired, setFlightRequired] = useState(true);
  const [visaRequired, setVisaRequired] = useState(false);
  const [source, setSource] = useState(availableSources[0] || 'website');
  const [priority, setPriority] = useState<Priority>('high');
  const [assignedTo, setAssignedTo] = useState('');
  const [notes, setNotes] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    addLead({
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_email: customerEmail,
      customer_city: customerCity,
      destination,
      travel_dates: travelDates || 'Flexible dates',
      duration_days: Number(durationDays),
      pax_adults: Number(adults),
      pax_children: Number(children),
      pax_infants: Number(infants),
      travel_type: travelType,
      budget_range: budgetRange,
      hotel_category: hotelCategory,
      flight_required: flightRequired,
      visa_required: visaRequired,
      source,
      priority,
      assigned_to: assignedTo || null,
      special_notes: notes,
    });

    onClose();
  };

  const agents = allProfiles.filter((p) => p.role === 'agent' && p.is_active);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-lead-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-2xs p-4 overflow-y-auto animate-in fade-in duration-100"
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-xl overflow-hidden border border-zinc-200 animate-in zoom-in-95 duration-100 my-6">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 bg-zinc-50/50">
          <div>
            <div id="new-lead-modal-title" className="text-xs font-semibold text-zinc-900">New Travel Lead Intake</div>
            <div className="text-[11px] text-zinc-500 mt-0.5">Captures requirements & starts SLA timer</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1 text-zinc-400 hover:text-zinc-600 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3.5 text-xs max-h-[80vh] overflow-y-auto">
          {/* Customer info */}
          <div>
            <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-tight mb-1.5">
              Customer Details
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <input
                  type="text"
                  required
                  placeholder="Full Name *"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full text-xs border border-zinc-200 rounded p-1.5 bg-white text-zinc-800"
                />
              </div>
              <div>
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  required
                  placeholder="WhatsApp / Phone *"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full text-xs font-mono border border-zinc-200 rounded p-1.5 bg-white text-zinc-800"
                />
              </div>
              <div>
                <input
                  type="email"
                  placeholder="Email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full text-xs border border-zinc-200 rounded p-1.5 bg-white text-zinc-800"
                />
              </div>
              <div>
                <input
                  type="text"
                  placeholder="City / Region"
                  value={customerCity}
                  onChange={(e) => setCustomerCity(e.target.value)}
                  className="w-full text-xs border border-zinc-200 rounded p-1.5 bg-white text-zinc-800"
                />
              </div>
            </div>
          </div>

          {/* Trip Details */}
          <div className="pt-2 border-t border-zinc-100">
            <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-tight mb-1.5">
              Trip Details
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <input
                  type="text"
                  required
                  placeholder="Destination *"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  className="w-full text-xs border border-zinc-200 rounded p-1.5 bg-white text-zinc-800 font-medium"
                />
              </div>
              <div>
                <input
                  type="text"
                  placeholder="Dates (e.g. Nov 10-17)"
                  value={travelDates}
                  onChange={(e) => setTravelDates(e.target.value)}
                  className="w-full text-xs border border-zinc-200 rounded p-1.5 bg-white text-zinc-800"
                />
              </div>
              <div>
                <input
                  type="text"
                  placeholder="Budget (e.g. $2k-$3k)"
                  value={budgetRange}
                  onChange={(e) => setBudgetRange(e.target.value)}
                  className="w-full text-xs font-mono border border-zinc-200 rounded p-1.5 bg-white text-zinc-800"
                />
              </div>
            </div>

            {/* Travelers */}
            <div className="grid grid-cols-3 gap-2 mt-2 bg-zinc-50 p-2 rounded border border-zinc-200 font-mono text-xs">
              <div>
                <span className="text-[10px] text-zinc-500 font-sans block mb-0.5">Adults</span>
                <input
                  type="number"
                  min="1"
                  value={adults}
                  onChange={(e) => setAdults(Number(e.target.value))}
                  className="w-full border border-zinc-200 rounded p-1 bg-white"
                />
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 font-sans block mb-0.5">Children</span>
                <input
                  type="number"
                  min="0"
                  value={children}
                  onChange={(e) => setChildren(Number(e.target.value))}
                  className="w-full border border-zinc-200 rounded p-1 bg-white"
                />
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 font-sans block mb-0.5">Infants</span>
                <input
                  type="number"
                  min="0"
                  value={infants}
                  onChange={(e) => setInfants(Number(e.target.value))}
                  className="w-full border border-zinc-200 rounded p-1 bg-white"
                />
              </div>
            </div>
          </div>

          {/* Preferences & Assignment */}
          <div className="pt-2 border-t border-zinc-100">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] text-zinc-500 mb-0.5">Style</label>
                <select
                  value={travelType}
                  onChange={(e) => setTravelType(e.target.value as TravelType)}
                  className="w-full border border-zinc-200 rounded p-1.5 bg-white text-zinc-800"
                >
                  <option value="honeymoon">Honeymoon</option>
                  <option value="family">Family</option>
                  <option value="luxury">Luxury</option>
                  <option value="adventure">Adventure</option>
                  <option value="corporate">Corporate</option>
                  <option value="budget">Budget</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-zinc-500 mb-0.5">Source</label>
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="w-full border border-zinc-200 rounded p-1.5 bg-white text-zinc-800"
                >
                  {availableSources.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, ' ').toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-zinc-500 mb-0.5">Routing</label>
                <select
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  className="w-full border border-zinc-200 rounded p-1.5 bg-white text-zinc-800"
                >
                  <option value="">Auto-Assign (Round-Robin)</option>
                  {agents.map((ag) => (
                    <option key={ag.id} value={ag.id}>
                      {ag.full_name} ({ag.destination_tags.slice(0, 2).join(', ')})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-4 mt-2 text-xs text-zinc-600">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={flightRequired}
                  onChange={(e) => setFlightRequired(e.target.checked)}
                  className="rounded border-zinc-300 text-zinc-900 focus:ring-0 w-3.5 h-3.5"
                />
                Flights
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={visaRequired}
                  onChange={(e) => setVisaRequired(e.target.checked)}
                  className="rounded border-zinc-300 text-zinc-900 focus:ring-0 w-3.5 h-3.5"
                />
                Visa Assistance
              </label>
            </div>
          </div>

          <div>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Special requests or requirements..."
              className="w-full border border-zinc-200 rounded p-2 text-zinc-800 resize-none font-sans"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 rounded transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-3.5 py-1 text-xs font-medium text-white bg-zinc-900 hover:bg-black rounded shadow-2xs transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Lead</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
