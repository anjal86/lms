'use client';

import React, { useMemo, useState } from 'react';
import { AlertOctagon, X } from 'lucide-react';
import type { Lead } from '@/lib/types';
import { useApp } from '@/lib/store';
import { useDialog } from '@/lib/useDialog';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';

interface LostDealModalProps {
  lead: Lead;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const GENERIC_REASONS = [
  'Budget / pricing mismatch',
  'Chose a competitor',
  'Timing changed or postponed',
  'No response after follow-ups',
  'Not qualified / requirements not fit',
  'Availability or delivery constraint',
  'Other / custom reason',
];

const TRAVEL_REASONS = [
  'Budget mismatch',
  'Booked with competitor',
  'Trip postponed or cancelled',
  'No response after follow-ups',
  'Visa or passport issue',
  'Flight or supplier cost increased',
  'Other / custom reason',
];

export default function LostDealModal({ lead, isOpen, onClose, onSuccess }: LostDealModalProps) {
  const { updateLeadStage, agencySettings, showToast } = useApp();
  const { config, term } = useWorkspace();
  useDialog(isOpen, onClose);

  const isTravel = config.workspace.business_type === 'travel' || config.workspace.template_key === 'travel';
  const leadLabel = term('lead', 'Lead');
  const dealLabel = term('deal', 'Opportunity');
  const defaultReasons = isTravel ? TRAVEL_REASONS : GENERIC_REASONS;
  const availableReasons = useMemo(
    () => agencySettings.custom_lost_reasons?.length > 0 ? agencySettings.custom_lost_reasons : defaultReasons,
    [agencySettings.custom_lost_reasons, defaultReasons],
  );

  const [lostReason, setLostReason] = useState(() => availableReasons[0] || 'Other / custom reason');
  const [competitorName, setCompetitorName] = useState('');
  const [lostNotes, setLostNotes] = useState('');

  if (!isOpen) return null;

  const isCompetitorReason = /competitor/i.test(lostReason);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const notes = [
      isCompetitorReason && competitorName.trim() ? `Competitor: ${competitorName.trim()}` : '',
      lostNotes.trim(),
    ].filter(Boolean).join('. ');

    updateLeadStage(lead.id, 'lost', lostReason, notes);
    showToast(`${leadLabel} marked lost: ${lead.customer_name}`, 'warning');
    onSuccess?.();
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lost-deal-title"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-4 backdrop-blur-2xs animate-in fade-in duration-100"
    >
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-zinc-200 bg-white text-xs shadow-xl animate-in zoom-in-95 duration-100">
        <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50/60 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600"><AlertOctagon className="h-4 w-4" /></div>
            <div>
              <h3 id="lost-deal-title" className="font-semibold text-zinc-950">Mark {dealLabel.toLowerCase()} as lost</h3>
              <p className="mt-0.5 text-[11px] text-zinc-500">{lead.lead_code} · {lead.customer_name}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20"><X className="h-4 w-4" /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 p-4">
            <div className="rounded-lg border border-zinc-200 bg-zinc-50/70 p-3">
              <div className="text-[11px] font-semibold text-zinc-900">{lead.customer_name}</div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-zinc-500">
                <span>Stage: <strong className="font-medium text-zinc-700">{String(lead.stage).replaceAll('_', ' ')}</strong></span>
                {isTravel && lead.destination ? <span>Destination: <strong className="font-medium text-zinc-700">{lead.destination}</strong></span> : null}
                {isTravel && lead.duration_days ? <span>Duration: <strong className="font-medium text-zinc-700">{lead.duration_days} days</strong></span> : null}
              </div>
            </div>

            <label className="block text-[11px] font-semibold text-zinc-700">Primary loss reason
              <select value={lostReason} onChange={(event) => setLostReason(event.target.value)} aria-label="Primary loss reason" className="select-field mt-1.5 w-full text-xs">
                {availableReasons.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
              </select>
              <span className="mt-1.5 block text-[10px] font-normal leading-4 text-zinc-400">This reason feeds conversion and loss reporting so managers can see why opportunities are dropping.</span>
            </label>

            {isCompetitorReason && <label className="block text-[11px] font-semibold text-zinc-700">Competitor / alternative chosen
              <input type="text" value={competitorName} onChange={(event) => setCompetitorName(event.target.value)} placeholder="Name, offer or relevant detail" className="field mt-1.5 text-xs" />
            </label>}

            <label className="block text-[11px] font-semibold text-zinc-700">Notes
              <textarea rows={3} value={lostNotes} onChange={(event) => setLostNotes(event.target.value)} placeholder="Key objection, customer feedback, or a future revival date…" className="field mt-1.5 min-h-20 resize-y text-xs leading-relaxed" />
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50/70 px-4 py-3">
            <button type="button" onClick={onClose} className="button-secondary">Cancel</button>
            <button type="submit" className="inline-flex min-h-10 items-center justify-center rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white transition hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/30">Mark lost</button>
          </div>
        </form>
      </div>
    </div>
  );
}
