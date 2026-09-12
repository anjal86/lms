'use client';

import React, { useState } from 'react';
import { Lead } from '@/lib/types';
import { useApp } from '@/lib/store';
import { useDialog } from '@/lib/useDialog';
import { X, AlertOctagon, HelpCircle } from 'lucide-react';

interface LostDealModalProps {
  lead: Lead;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const LOST_REASONS = [
  { id: 'budget_too_high', label: 'Budget Mismatch (Customer expectations unrealistic)' },
  { id: 'competitor', label: 'Booked with Competitor (Price/package comparison)' },
  { id: 'dates_changed', label: 'Trip Postponed or Cancelled' },
  { id: 'no_response', label: 'Unresponsive after 3+ Follow-ups' },
  { id: 'visa_rejected', label: 'Visa Denied / Passport Issue' },
  { id: 'flight_surge', label: 'Flight Fares Surged beyond budget' },
  { id: 'other', label: 'Other / Custom Reason' },
];

export default function LostDealModal({
  lead,
  isOpen,
  onClose,
  onSuccess,
}: LostDealModalProps) {
  const { updateLeadStage, agencySettings, showToast } = useApp();
  useDialog(isOpen, onClose);

  const availableReasons = agencySettings.custom_lost_reasons?.length > 0
    ? agencySettings.custom_lost_reasons
    : [
        'Budget Mismatch (Customer expectations unrealistic)',
        'Booked with Competitor (Price/package comparison)',
        'Trip Postponed or Cancelled',
        'Unresponsive after 3+ Follow-ups',
        'Visa Denied / Passport Issue',
        'Flight Fares Surged beyond budget',
        'Other / Custom Reason',
      ];

  const [lostReason, setLostReason] = useState(availableReasons[0]);
  const [competitorName, setCompetitorName] = useState('');
  const [lostNotes, setLostNotes] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let combinedNotes = lostNotes.trim();
    if (lostReason === 'competitor' && competitorName.trim()) {
      combinedNotes = `Competitor: ${competitorName.trim()}. ${combinedNotes}`;
    }

    updateLeadStage(lead.id, 'lost', lostReason, combinedNotes);
    showToast(`Lead marked lost: ${lead.customer_name}`, 'warning');
    if (onSuccess) onSuccess();
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lost-deal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-2xs p-4 animate-in fade-in duration-100"
    >
      <div className="bg-white rounded-lg border border-zinc-200 shadow-xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-100 text-xs">
        {/* Header */}
        <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between bg-zinc-50/50">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-zinc-100 text-zinc-600 flex items-center justify-center">
              <AlertOctagon className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 id="lost-deal-title" className="font-semibold text-zinc-900 tracking-tight">
                Mark Inquiry as Lost
              </h3>
              <p className="text-[11px] text-zinc-500 font-mono">
                {lead.lead_code} • {lead.customer_name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="p-4 space-y-3.5">
            {/* Lead context banner */}
            <div className="bg-zinc-50 p-2.5 rounded-md border border-zinc-200 flex items-center justify-between text-[11px]">
              <div>
                <span className="text-zinc-500 block text-[10px] uppercase">Destination</span>
                <span className="font-medium text-zinc-900">{lead.destination}</span>
              </div>
              <div>
                <span className="text-zinc-500 block text-[10px] uppercase">Target Budget</span>
                <span className="font-mono font-medium text-zinc-900">
                  {lead.budget_range || '$2k'}
                </span>
              </div>
              <div>
                <span className="text-zinc-500 block text-[10px] uppercase">Duration</span>
                <span className="text-zinc-800">{lead.duration_days} days</span>
              </div>
            </div>

            {/* Primary Lost Reason */}
            <div>
              <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                Primary Loss Reason *
              </label>
              <select
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value)}
                aria-label="Primary loss reason"
                className="w-full text-xs p-2 border border-zinc-200 rounded-md bg-white text-zinc-800"
              >
                {availableReasons.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-zinc-400 mt-1">
                Feeds into agency conversion Pareto analytics for marketing optimization.
              </p>
            </div>

            {/* Competitor specification */}
            {lostReason === 'competitor' && (
              <div>
                <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                  Competitor Name / Lower Offer
                </label>
                <input
                  type="text"
                  value={competitorName}
                  onChange={(e) => setCompetitorName(e.target.value)}
                  placeholder="e.g. MakeMyTrip package $200 cheaper"
                  className="w-full text-xs p-2 border border-zinc-200 rounded-md bg-white text-zinc-800 focus:outline-none focus:border-zinc-400"
                />
              </div>
            )}

            {/* Debrief notes */}
            <div>
              <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                Debrief & Follow-up Notes
              </label>
              <textarea
                rows={3}
                value={lostNotes}
                onChange={(e) => setLostNotes(e.target.value)}
                placeholder="Key objections, customer feedback, or potential future revival timing..."
                className="w-full text-xs p-2 border border-zinc-200 rounded-md bg-white text-zinc-800 focus:outline-none focus:border-zinc-400 resize-none leading-relaxed"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 bg-zinc-50/70 border-t border-zinc-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 font-medium transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3.5 py-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-medium transition shadow-2xs"
            >
              Confirm Deal Closure (Lost)
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
