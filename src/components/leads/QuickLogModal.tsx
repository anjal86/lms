'use client';

import React, { useState } from 'react';
import { Lead, ActivityType, FollowUpChannel } from '@/lib/types';
import { useApp } from '@/lib/store';
import { useDialog } from '@/lib/useDialog';
import { X, Phone, MessageSquare, Mail, Calendar, Check, UserCheck } from 'lucide-react';

interface QuickLogModalProps {
  lead: Lead;
  isOpen: boolean;
  onClose: () => void;
  initialType?: ActivityType;
}

export default function QuickLogModal({
  lead,
  isOpen,
  onClose,
  initialType = 'call',
}: QuickLogModalProps) {
  const { logActivity, showToast } = useApp();
  useDialog(isOpen, onClose);

  const [type, setType] = useState<ActivityType>(initialType);
  const [outcome, setOutcome] = useState('Interested');
  const [notes, setNotes] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('3');

  const [scheduleNext, setScheduleNext] = useState(true);
  const [nextChannel, setNextChannel] = useState<FollowUpChannel>('call');

  const getTomorrow10am = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  };

  const [nextDateTime, setNextDateTime] = useState(getTomorrow10am());

  if (!isOpen) return null;

  const setPresetTime = (hours: number) => {
    const d = new Date(Date.now() + hours * 3600000);
    setNextDateTime(d.toISOString().slice(0, 16));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const durationSec = durationMinutes ? parseInt(durationMinutes, 10) * 60 : undefined;

    logActivity({
      leadId: lead.id,
      type,
      title: `${type === 'call' ? 'Phone Call' : type === 'whatsapp' ? 'WhatsApp Chat' : 'Interaction'} with ${lead.customer_name}`,
      outcome,
      notes: notes || `Outcome: ${outcome}`,
      duration: durationSec,
      nextFollowUp: scheduleNext
        ? {
            scheduled_at: new Date(nextDateTime).toISOString(),
            channel: nextChannel,
            title: `Follow-up (${nextChannel}) with ${lead.customer_name}`,
            notes: `Next step regarding ${lead.destination}. Note: ${notes}`,
          }
        : undefined,
    });

    showToast(`Logged ${type} interaction for ${lead.customer_name}`, 'success');
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-log-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-2xs p-4 animate-in fade-in duration-100"
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden border border-zinc-200 animate-in zoom-in-95 duration-100">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 bg-zinc-50/50">
          <div>
            <div id="quick-log-title" className="text-xs font-semibold text-zinc-900">Log Interaction & Next Step</div>
            <div className="text-[11px] text-zinc-500 font-mono mt-0.5">
              {lead.customer_name} • {lead.destination} ({lead.lead_code})
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1 text-zinc-400 hover:text-zinc-600 rounded transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3 text-xs">
          {/* Channel selector */}
          <div>
            <label className="block text-[11px] font-medium text-zinc-500 uppercase tracking-tight mb-1.5">
              Channel
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { id: 'call', label: 'Call', icon: Phone },
                { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
                { id: 'email', label: 'Email', icon: Mail },
                { id: 'note', label: 'Note', icon: UserCheck },
              ].map((c) => {
                const Icon = c.icon;
                const isSelected = type === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setType(c.id as ActivityType)}
                    className={`flex items-center justify-center gap-1.5 py-1.5 rounded border text-xs font-medium transition ${
                      isSelected
                        ? 'bg-zinc-900 text-zinc-50 border-zinc-900 shadow-2xs'
                        : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    <span>{c.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Outcome & Duration */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-zinc-500 uppercase tracking-tight mb-1">
                Outcome
              </label>
              <select
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                className="w-full text-xs border border-zinc-200 rounded p-1.5 bg-white text-zinc-800 focus:outline-none"
              >
                <option value="Interested - Sent Itinerary">Interested</option>
                <option value="Call Back Later">Call Back Later</option>
                <option value="In Price Negotiation">In Negotiation</option>
                <option value="Did Not Answer">Did Not Answer</option>
                <option value="Busy / Voicemail">Left Voicemail</option>
                <option value="Budget Mismatch">Budget Mismatch</option>
                <option value="Lost to Competitor">Lost to Competitor</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-zinc-500 uppercase tracking-tight mb-1">
                Duration (min)
              </label>
              <input
                type="number"
                min="0"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                className="w-full text-xs font-mono border border-zinc-200 rounded p-1.5 bg-white text-zinc-800 focus:outline-none"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-medium text-zinc-500 uppercase tracking-tight mb-1">
              Discussion Notes
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Summary of discussion, traveler requests, hotel preferences..."
              className="w-full text-xs border border-zinc-200 rounded p-2 text-zinc-800 focus:outline-none resize-none font-sans"
            />
          </div>

          {/* Next follow up schedule */}
          <div className="pt-2 border-t border-zinc-100">
            <div className="flex items-center justify-between mb-1.5">
              <label className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={scheduleNext}
                  onChange={(e) => setScheduleNext(e.target.checked)}
                  className="rounded border-zinc-300 text-zinc-900 focus:ring-0 w-3.5 h-3.5"
                />
                Schedule Next Follow-Up
              </label>
              {scheduleNext && (
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setPresetTime(2)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-600 font-mono"
                  >
                    +2h
                  </button>
                  <button
                    type="button"
                    onClick={() => setPresetTime(24)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-600 font-mono"
                  >
                    Tomorrow
                  </button>
                  <button
                    type="button"
                    onClick={() => setPresetTime(72)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-600 font-mono"
                  >
                    +3d
                  </button>
                </div>
              )}
            </div>

            {scheduleNext && (
              <div className="grid grid-cols-2 gap-2 bg-zinc-50 p-2 rounded border border-zinc-200">
                <input
                  type="datetime-local"
                  value={nextDateTime}
                  onChange={(e) => setNextDateTime(e.target.value)}
                  className="text-xs font-mono border border-zinc-200 rounded p-1 bg-white text-zinc-800"
                />
                <select
                  value={nextChannel}
                  onChange={(e) => setNextChannel(e.target.value as FollowUpChannel)}
                  className="text-xs border border-zinc-200 rounded p-1 bg-white text-zinc-800"
                >
                  <option value="call">Phone Call</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">Email</option>
                </select>
              </div>
            )}
          </div>

          {/* Buttons */}
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
              className="px-3.5 py-1 text-xs font-medium text-white bg-zinc-900 hover:bg-black rounded shadow-2xs transition"
            >
              Save & Resolve SLA
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
