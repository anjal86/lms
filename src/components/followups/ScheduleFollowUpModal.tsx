'use client';

import { useState, type FormEvent } from 'react';
import { CalendarClock, Mail, MessageSquare, Phone, X } from 'lucide-react';
import { useApp } from '@/lib/store';
import { useDialog } from '@/lib/useDialog';
import type { FollowUpChannel } from '@/lib/types';

interface ScheduleFollowUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedLeadId?: string;
}

function localDateTime(hoursFromNow?: number) {
  const date = new Date();
  if (typeof hoursFromNow === 'number') {
    date.setTime(date.getTime() + hoursFromNow * 3_600_000);
  } else {
    date.setDate(date.getDate() + 1);
    date.setHours(10, 0, 0, 0);
  }
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function ScheduleFollowUpModal({ isOpen, onClose, preselectedLeadId }: ScheduleFollowUpModalProps) {
  const { allLeads, allProfiles, currentUser, createFollowUp, showToast } = useApp();
  useDialog({ isOpen, onClose });

  const [leadId, setLeadId] = useState(preselectedLeadId || allLeads[0]?.id || '');
  const [title, setTitle] = useState('');
  const [channel, setChannel] = useState<FollowUpChannel>('call');
  const [assignedTo, setAssignedTo] = useState(currentUser.id);
  const [notes, setNotes] = useState('');
  const [scheduledAt, setScheduledAt] = useState(() => localDateTime());

  if (!isOpen) return null;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!leadId || !scheduledAt) return;

    createFollowUp({
      lead_id: leadId,
      assigned_to: assignedTo,
      title: title.trim() || `${channel === 'call' ? 'Call' : channel === 'whatsapp' ? 'WhatsApp' : channel === 'email' ? 'Email' : 'Meeting'} follow-up`,
      scheduled_at: new Date(scheduledAt).toISOString(),
      channel,
      notes: notes.trim(),
    });

    showToast('Follow-up added', 'success');
    onClose();
  };

  const activeProfiles = allProfiles.filter((profile) => profile.is_active);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-zinc-950/25"
      role="dialog"
      aria-modal="true"
      aria-labelledby="schedule-followup-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside className="flex h-full w-full max-w-md flex-col border-l border-line bg-surface shadow-2xl">
        <header className="flex min-h-14 items-center justify-between gap-3 border-b border-line px-4">
          <div>
            <h2 id="schedule-followup-title" className="text-sm font-semibold text-zinc-900">Add follow-up</h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">Choose who, when, and how to contact them.</p>
          </div>
          <button type="button" onClick={onClose} className="button-ghost button-sm px-2" aria-label="Close follow-up drawer">
            <X className="h-4 w-4" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto p-4">
            <label className="block text-xs font-semibold text-zinc-700">
              Traveler
              <select
                value={leadId}
                onChange={(event) => {
                  const nextLeadId = event.target.value;
                  setLeadId(nextLeadId);
                  const selectedLead = allLeads.find((lead) => lead.id === nextLeadId);
                  if (selectedLead?.assigned_to) setAssignedTo(selectedLead.assigned_to);
                }}
                required
                className="select-field mt-1.5"
              >
                {allLeads.length === 0 && <option value="">No leads available</option>}
                {allLeads.map((lead) => (
                  <option key={lead.id} value={lead.id}>{lead.customer_name} · {lead.destination} · {lead.lead_code}</option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-semibold text-zinc-700">
              What needs to happen?
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="field mt-1.5"
                placeholder="Example: Confirm revised quote"
              />
            </label>

            <fieldset>
              <legend className="text-xs font-semibold text-zinc-700">Contact by</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {[
                  { id: 'call' as const, label: 'Call', icon: Phone },
                  { id: 'whatsapp' as const, label: 'WhatsApp', icon: MessageSquare },
                  { id: 'email' as const, label: 'Email', icon: Mail },
                  { id: 'meeting' as const, label: 'Meeting', icon: CalendarClock },
                ].map((option) => {
                  const Icon = option.icon;
                  const selected = channel === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setChannel(option.id)}
                      className={`flex min-h-10 items-center justify-center gap-2 rounded-app-sm border px-3 text-xs font-semibold transition ${
                        selected
                          ? 'border-zinc-950 bg-zinc-950 text-white'
                          : 'border-line-strong bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
                      }`}
                      aria-pressed={selected}
                    >
                      <Icon className="h-4 w-4" /> {option.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div>
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="follow-up-time" className="text-xs font-semibold text-zinc-700">When?</label>
                <div className="flex flex-wrap gap-1">
                  <button type="button" onClick={() => setScheduledAt(localDateTime(2))} className="button-ghost button-sm">+2h</button>
                  <button type="button" onClick={() => setScheduledAt(localDateTime(24))} className="button-ghost button-sm">Tomorrow</button>
                  <button type="button" onClick={() => setScheduledAt(localDateTime(72))} className="button-ghost button-sm">+3d</button>
                </div>
              </div>
              <input
                id="follow-up-time"
                type="datetime-local"
                required
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
                className="field mt-1.5 font-mono"
              />
            </div>

            {(currentUser.role === 'admin' || currentUser.role === 'manager') && (
              <label className="block text-xs font-semibold text-zinc-700">
                Owner
                <select value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)} className="select-field mt-1.5">
                  {activeProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name}</option>)}
                </select>
              </label>
            )}

            <label className="block text-xs font-semibold text-zinc-700">
              Notes
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="textarea-field mt-1.5 min-h-24"
                placeholder="Optional context for the next contact…"
              />
            </label>
          </div>

          <footer className="flex items-center justify-end gap-2 border-t border-line bg-surface-subtle p-4">
            <button type="button" onClick={onClose} className="button-secondary">Cancel</button>
            <button type="submit" className="button-primary" disabled={!leadId || !scheduledAt}>Add follow-up</button>
          </footer>
        </form>
      </aside>
    </div>
  );
}
