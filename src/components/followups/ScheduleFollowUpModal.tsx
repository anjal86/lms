'use client';

import React, { useState } from 'react';
import { useApp } from '@/lib/store';
import { useDialog } from '@/lib/useDialog';
import { FollowUpChannel } from '@/lib/types';
import { X, CalendarClock, Phone, MessageSquare, Mail, Check } from 'lucide-react';

interface ScheduleFollowUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedLeadId?: string;
}

export default function ScheduleFollowUpModal({
  isOpen,
  onClose,
  preselectedLeadId,
}: ScheduleFollowUpModalProps) {
  const { allLeads, allProfiles, currentUser, createFollowUp, showToast } = useApp();
  useDialog(isOpen, onClose);

  const [leadId, setLeadId] = useState(preselectedLeadId || (allLeads[0]?.id || ''));
  const [title, setTitle] = useState('');
  const [channel, setChannel] = useState<FollowUpChannel>('call');
  const [assignedTo, setAssignedTo] = useState(currentUser.id);
  const [notes, setNotes] = useState('');

  // Default time: tomorrow 10:00 AM local
  const getDefaultDateTime = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    // Format for datetime-local input: YYYY-MM-DDTHH:mm
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [scheduledAt, setScheduledAt] = useState(getDefaultDateTime());

  if (!isOpen) return null;

  const setQuickTime = (hoursFromNow: number) => {
    const d = new Date(Date.now() + hoursFromNow * 3600000);
    const pad = (n: number) => String(n).padStart(2, '0');
    setScheduledAt(
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadId) return;

    createFollowUp({
      lead_id: leadId,
      assigned_to: assignedTo,
      title: title.trim() || `Follow-up on ${channel}`,
      scheduled_at: new Date(scheduledAt).toISOString(),
      channel,
      notes: notes.trim(),
    });

    showToast('Follow-up scheduled successfully', 'success');
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="schedule-followup-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-2xs p-4 animate-in fade-in duration-100"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-lg border border-zinc-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-11 px-4 border-b border-zinc-200 flex items-center justify-between bg-zinc-50/50">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-zinc-600" />
            <span id="schedule-followup-title" className="text-xs font-semibold text-zinc-900">Schedule Follow-Up Task</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1 rounded text-zinc-400 hover:text-zinc-600 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-3.5 text-xs">
          {/* Select Lead */}
          <div>
            <label className="block text-[11px] font-medium text-zinc-600 mb-1">
              Select Client / Lead <span className="text-red-500">*</span>
            </label>
            <select
              value={leadId}
              onChange={(e) => {
                setLeadId(e.target.value);
                const selLead = allLeads.find((l) => l.id === e.target.value);
                if (selLead?.assigned_to) setAssignedTo(selLead.assigned_to);
              }}
              required
              className="w-full bg-zinc-50 border border-zinc-200 rounded-md p-2 text-zinc-900 font-medium focus:outline-none"
            >
              {allLeads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.lead_code} — {l.customer_name} ({l.destination})
                </option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="block text-[11px] font-medium text-zinc-600 mb-1">
              Task Objective / Subject
            </label>
            <input
              type="text"
              placeholder="e.g. Discuss revised quote & flight options"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-md p-2 text-zinc-900 focus:outline-none"
            />
          </div>

          {/* Channel Selector */}
          <div>
            <label className="block text-[11px] font-medium text-zinc-600 mb-1">
              Communication Channel
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'call', label: 'Phone Call', icon: Phone },
                { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
                { id: 'email', label: 'Email', icon: Mail },
              ].map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => setChannel(ch.id as FollowUpChannel)}
                  className={`py-1.5 px-2 rounded-md border text-xs font-medium flex items-center justify-center gap-1.5 transition ${
                    channel === ch.id
                      ? 'bg-zinc-900 border-zinc-900 text-white shadow-2xs'
                      : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                  }`}
                >
                  <ch.icon className="w-3.5 h-3.5" />
                  <span>{ch.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Date & Time with quick chips */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-medium text-zinc-600">
                Scheduled Time <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-1 text-[10px] font-mono">
                <button
                  type="button"
                  onClick={() => setQuickTime(2)}
                  className="px-1.5 py-0.2 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded"
                >
                  +2h
                </button>
                <button
                  type="button"
                  onClick={() => setQuickTime(24)}
                  className="px-1.5 py-0.2 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded"
                >
                  Tomorrow
                </button>
                <button
                  type="button"
                  onClick={() => setQuickTime(72)}
                  className="px-1.5 py-0.2 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded"
                >
                  +3d
                </button>
              </div>
            </div>
            <input
              type="datetime-local"
              required
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-md p-2 text-zinc-900 font-mono text-xs focus:outline-none"
            />
          </div>

          {/* Assigned Consultant */}
          <div>
            <label className="block text-[11px] font-medium text-zinc-600 mb-1">
              Assignee
            </label>
            <select
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-md p-2 text-zinc-900 focus:outline-none"
            >
              {allProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name} ({p.role})
                </option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-medium text-zinc-600 mb-1">
              Notes (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="Any specific talking points, budget limits, or pending items..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-md p-2 text-zinc-900 focus:outline-none resize-none leading-relaxed"
            />
          </div>

          {/* Footer actions */}
          <div className="pt-2 border-t border-zinc-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md border border-zinc-200 text-zinc-700 hover:bg-zinc-50 font-medium transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-50 rounded-md font-medium shadow-2xs transition"
            >
              Schedule Task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
