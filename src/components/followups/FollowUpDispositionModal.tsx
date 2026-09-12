'use client';

import React, { useState } from 'react';
import { useApp } from '@/lib/store';
import { useDialog } from '@/lib/useDialog';
import { FollowUp, Lead, FollowUpDispositionType } from '@/lib/types';
import {
  Phone,
  PhoneOff,
  ThumbsUp,
  FileEdit,
  Clock,
  UserX,
  CheckCircle2,
  X,
  MessageSquare,
  Calendar,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';

interface FollowUpDispositionModalProps {
  followUp: FollowUp | null;
  lead?: Lead | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function FollowUpDispositionModal({
  followUp,
  lead,
  isOpen,
  onClose,
}: FollowUpDispositionModalProps) {
  useDialog({ isOpen, onClose });

  const { executeFollowUpDisposition, formatAppDate } = useApp();

  const [outcome, setOutcome] = useState<FollowUpDispositionType>('no_answer');
  const [notes, setNotes] = useState('');
  const [customCallbackTime, setCustomCallbackTime] = useState('');
  const [snoozePreset, setSnoozePreset] = useState<'3h' | '1d' | '3d' | '1w' | 'custom'>('3h');
  const [lostReason, setLostReason] = useState('Price Too High / Out of Budget');
  const [sendWhatsAppNudge, setSendWhatsAppNudge] = useState(true);

  if (!isOpen || !followUp) return null;

  const resolvedLead = lead || followUp.lead;

  // Calculate default callback time based on outcome and preset
  const getCalculatedCallbackIso = (): string | undefined => {
    const now = Date.now();
    if (outcome === 'no_answer') {
      if (snoozePreset === '3h') return new Date(now + 3 * 3600000).toISOString();
      if (snoozePreset === '1d') return new Date(now + 24 * 3600000).toISOString();
      if (snoozePreset === 'custom' && customCallbackTime) {
        return new Date(customCallbackTime).toISOString();
      }
      return new Date(now + 3 * 3600000).toISOString();
    }
    if (outcome === 'engaged_interested') {
      return new Date(now + 2 * 86400000).toISOString(); // +2 days
    }
    if (outcome === 'quote_revision') {
      return new Date(now + 24 * 3600000).toISOString(); // +1 day
    }
    if (outcome === 'snooze') {
      if (snoozePreset === '1d') return new Date(now + 24 * 3600000).toISOString();
      if (snoozePreset === '3d') return new Date(now + 3 * 86400000).toISOString();
      if (snoozePreset === '1w') return new Date(now + 7 * 86400000).toISOString();
      if (snoozePreset === 'custom' && customCallbackTime) {
        return new Date(customCallbackTime).toISOString();
      }
      return new Date(now + 3 * 86400000).toISOString();
    }
    return undefined;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const callbackIso = getCalculatedCallbackIso();

    executeFollowUpDisposition(followUp.lead_id, followUp.id, {
      followUpId: followUp.id,
      outcome,
      notes: notes.trim(),
      callback_at: callbackIso,
      auto_whatsapp: sendWhatsAppNudge && outcome === 'no_answer',
      lost_reason: outcome === 'lost' ? lostReason : undefined,
    });

    // If WhatsApp nudge is requested and phone exists, open wa.me
    if (outcome === 'no_answer' && sendWhatsAppNudge && resolvedLead?.customer_phone) {
      const cleanPhone = resolvedLead.customer_phone.replace(/[^0-9]/g, '');
      const msg = encodeURIComponent(
        `Hi ${resolvedLead.customer_name}, I just tried calling you regarding your inquiry for ${resolvedLead.destination}. Please let me know when you are free to connect, or reply here on WhatsApp!`
      );
      window.open(`https://wa.me/${cleanPhone}?text=${msg}`, '_blank');
    }

    onClose();
  };

  const dispositionOptions: Array<{
    id: FollowUpDispositionType;
    label: string;
    desc: string;
    icon: any;
    dotColor: string;
  }> = [
    {
      id: 'no_answer',
      label: 'No Answer / Ringing',
      desc: 'Auto-retries callback in 3 hours & sends WhatsApp follow-up',
      icon: PhoneOff,
      dotColor: 'bg-amber-500',
    },
    {
      id: 'engaged_interested',
      label: 'Engaged & Interested',
      desc: 'Positive conversation. Schedules quote review in +2 days',
      icon: ThumbsUp,
      dotColor: 'bg-emerald-500',
    },
    {
      id: 'quote_revision',
      label: 'Quote Revision Requested',
      desc: 'Traveler requested date or hotel tweaks. Sets negotiation stage',
      icon: FileEdit,
      dotColor: 'bg-blue-500',
    },
    {
      id: 'snooze',
      label: 'Snooze / Reschedule',
      desc: 'Traveler asked to call back at a later scheduled date',
      icon: Clock,
      dotColor: 'bg-zinc-400',
    },
    {
      id: 'lost',
      label: 'Dropped Out / Lost',
      desc: 'Traveler cancelled trip or booked with another agency',
      icon: UserX,
      dotColor: 'bg-red-500',
    },
    {
      id: 'completed',
      label: 'Complete (No Next Step)',
      desc: 'Close this specific task without scheduling an automatic next task',
      icon: CheckCircle2,
      dotColor: 'bg-zinc-300',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-xs p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="disposition-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-white rounded-lg border border-zinc-200 shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/70">
          <div>
            <h2 id="disposition-modal-title" className="text-sm font-semibold text-zinc-900 tracking-tight flex items-center gap-2">
              <Phone className="w-4 h-4 text-zinc-500" />
              <span>Log Follow-Up Disposition</span>
            </h2>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Select the interaction outcome to automate the next client callback
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close disposition modal"
            className="p-1 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition min-h-[28px] min-w-[28px] flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Lead Context Bar */}
        {resolvedLead && (
          <div className="px-4 py-2 bg-zinc-100/60 border-b border-zinc-200 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2 truncate">
              <span className="font-semibold text-zinc-900 truncate">{resolvedLead.customer_name}</span>
              <span className="font-mono text-[10px] text-zinc-500">({resolvedLead.lead_code})</span>
              <span className="text-zinc-400">•</span>
              <span className="text-zinc-600 truncate">{resolvedLead.destination}</span>
            </div>
            <span className="font-mono text-zinc-700 text-[11px] shrink-0">{resolvedLead.customer_phone}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Outcome Grid */}
          <div>
            <label className="block text-[11px] font-medium text-zinc-600 mb-1.5 uppercase tracking-wider">
              Call & Contact Outcome
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {dispositionOptions.map((opt) => {
                const Icon = opt.icon;
                const isSelected = outcome === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setOutcome(opt.id);
                      if (opt.id === 'no_answer') setSnoozePreset('3h');
                      if (opt.id === 'snooze') setSnoozePreset('1d');
                    }}
                    className={`text-left p-2.5 rounded-md border text-xs transition flex items-start gap-2.5 ${
                      isSelected
                        ? 'border-zinc-900 bg-zinc-900 text-white shadow-2xs'
                        : 'border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-800'
                    }`}
                  >
                    <div
                      className={`w-6 h-6 rounded flex items-center justify-center shrink-0 border mt-0.5 ${
                        isSelected
                          ? 'bg-zinc-800 border-zinc-700 text-zinc-100'
                          : 'bg-zinc-100 border-zinc-200 text-zinc-600'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-[11px] flex items-center gap-1.5 leading-tight">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${opt.dotColor}`} />
                        <span className="truncate">{opt.label}</span>
                      </div>
                      <p
                        className={`text-[10px] mt-0.5 leading-tight line-clamp-2 ${
                          isSelected ? 'text-zinc-300' : 'text-zinc-500'
                        }`}
                      >
                        {opt.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Conditional Options: No Answer */}
          {outcome === 'no_answer' && (
            <div className="p-3 bg-amber-50/50 rounded-md border border-amber-200/80 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-amber-900 text-[11px] flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-700" />
                  Auto-Schedule Next Retry
                </span>
                <div className="flex gap-1">
                  {(['3h', '1d', 'custom'] as const).map((pr) => (
                    <button
                      key={pr}
                      type="button"
                      onClick={() => setSnoozePreset(pr)}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium transition ${
                        snoozePreset === pr
                          ? 'bg-amber-800 text-white'
                          : 'bg-white border border-amber-200 text-amber-800 hover:bg-amber-100/50'
                      }`}
                    >
                      {pr === '3h' ? '+3 Hours' : pr === '1d' ? '+1 Day' : 'Custom'}
                    </button>
                  ))}
                </div>
              </div>

              {snoozePreset === 'custom' && (
                <input
                  type="datetime-local"
                  value={customCallbackTime}
                  onChange={(e) => setCustomCallbackTime(e.target.value)}
                  aria-label="Custom callback date and time"
                  className="w-full text-xs px-2 py-1 bg-white border border-amber-300 rounded font-mono"
                />
              )}

              <label className="flex items-center gap-2 cursor-pointer pt-1 border-t border-amber-200/60 text-amber-950">
                <input
                  type="checkbox"
                  checked={sendWhatsAppNudge}
                  onChange={(e) => setSendWhatsAppNudge(e.target.checked)}
                  className="rounded border-amber-300 text-zinc-900 focus:ring-zinc-900"
                />
                <span className="text-[11px]">
                  Send 1-Click WhatsApp "Tried Calling You" Nudge to {resolvedLead?.customer_name}
                </span>
              </label>
            </div>
          )}

          {/* Conditional Options: Snooze */}
          {outcome === 'snooze' && (
            <div className="p-3 bg-zinc-50 rounded-md border border-zinc-200 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium text-zinc-800 text-[11px]">Reschedule Callback For</span>
                <div className="flex gap-1">
                  {(['1d', '3d', '1w', 'custom'] as const).map((pr) => (
                    <button
                      key={pr}
                      type="button"
                      onClick={() => setSnoozePreset(pr)}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium transition ${
                        snoozePreset === pr
                          ? 'bg-zinc-900 text-white'
                          : 'bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                      }`}
                    >
                      {pr === '1d' ? '+1d' : pr === '3d' ? '+3d' : pr === '1w' ? '+1w' : 'Custom'}
                    </button>
                  ))}
                </div>
              </div>

              {snoozePreset === 'custom' && (
                <input
                  type="datetime-local"
                  value={customCallbackTime}
                  onChange={(e) => setCustomCallbackTime(e.target.value)}
                  aria-label="Custom callback date and time"
                  className="w-full text-xs px-2 py-1 bg-white border border-zinc-200 rounded font-mono"
                />
              )}
            </div>
          )}

          {/* Conditional Options: Lost */}
          {outcome === 'lost' && (
            <div className="p-3 bg-red-50/60 rounded-md border border-red-200/80 space-y-2 text-xs">
              <label className="block text-[11px] font-medium text-red-900">
                Reason Inquiry Dropped Out
              </label>
              <select
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value)}
                aria-label="Reason inquiry was lost"
                className="w-full text-xs px-2 py-1.5 bg-white border border-red-200 rounded font-sans text-zinc-800"
              >
                <option value="Price Too High / Out of Budget">Price Too High / Out of Budget</option>
                <option value="Booked with Competitor Agency">Booked with Competitor Agency</option>
                <option value="Trip Postponed / Personal Reasons">Trip Postponed / Personal Reasons</option>
                <option value="Visa Rejected / Passport Issues">Visa Rejected / Passport Issues</option>
                <option value="Unresponsive / Ghosted">Unresponsive / Ghosted after multiple calls</option>
                <option value="Other / Non-Viable Dates">Other / Non-Viable Dates</option>
              </select>
            </div>
          )}

          {/* Notes Input */}
          <div>
            <label className="block text-[11px] font-medium text-zinc-600 mb-1">
              Call Summary & Observations
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Client requested 2 connecting rooms instead of 1 suite; prefers morning flight BOM-DPS."
              className="w-full text-xs px-2.5 py-1.5 border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-950"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-2 border-t border-zinc-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md border border-zinc-200 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3.5 py-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 text-zinc-50 text-xs font-medium shadow-2xs transition flex items-center gap-1.5"
            >
              <span>Submit Disposition</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
