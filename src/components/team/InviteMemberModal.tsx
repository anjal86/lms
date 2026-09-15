'use client';

import React, { useState } from 'react';
import { UserPlus, X } from 'lucide-react';
import type { AgentStatus, Role } from '@/lib/types';
import { useApp } from '@/lib/store';
import { useDialog } from '@/lib/useDialog';

interface InviteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const roleDescriptions: Record<Role, string> = {
  admin: 'Manage the workspace, team, connections and CRM settings.',
  manager: 'Manage daily operations, assignment, team activity and reports.',
  agent: 'Work assigned conversations, contacts and opportunities.',
};

export default function InviteMemberModal({ isOpen, onClose, onSuccess }: InviteMemberModalProps) {
  const { createProfile, showToast, currentUser } = useApp();
  useDialog(isOpen, onClose);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<Role>('agent');
  const [acceptingLeads, setAcceptingLeads] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const resetAndClose = () => {
    if (submitting) return;
    setFullName('');
    setEmail('');
    setPhone('');
    setRole('agent');
    setAcceptingLeads(true);
    setError('');
    onClose();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!fullName.trim() || !email.trim() || submitting) return;

    setSubmitting(true);
    setError('');
    try {
      const createdProfile = await createProfile({
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || undefined,
        role,
        destination_tags: [],
        max_capacity: 25,
        status: 'offline' as AgentStatus,
        is_active: true,
        accepting_leads: role === 'agent' ? acceptingLeads : false,
        languages: [],
        certifications: [],
      });

      if (!createdProfile) throw new Error('Unable to invite team member.');
      showToast(`Invitation sent to ${email.trim().toLowerCase()}`, 'success');
      onSuccess?.();
      setSubmitting(false);
      resetAndClose();
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : 'Unable to invite team member.');
      setSubmitting(false);
    }
  };

  const availableRoles: Array<{ value: Role; label: string }> = currentUser.role === 'admin'
    ? [
        { value: 'agent', label: 'Agent' },
        { value: 'manager', label: 'Manager' },
        { value: 'admin', label: 'Admin' },
      ]
    : [{ value: 'agent', label: 'Agent' }];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-member-title"
      onClick={(event) => { if (event.target === event.currentTarget) resetAndClose(); }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/35 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-zinc-100 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-950 text-white">
              <UserPlus className="h-4 w-4" />
            </div>
            <div>
              <h2 id="invite-member-title" className="text-sm font-semibold text-zinc-950">Invite team member</h2>
              <p className="mt-1 text-xs leading-5 text-zinc-500">They will only get access to this workspace.</p>
            </div>
          </div>
          <button type="button" onClick={resetAndClose} disabled={submitting} aria-label="Close" className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 p-5">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-zinc-700">Name</label>
              <input
                required
                autoFocus
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Full name"
                className="field"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-zinc-700">Work email</label>
              <input
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@company.com"
                className="field"
              />
              <p className="mt-1.5 text-[11px] leading-5 text-zinc-400">
                If they already use this CRM for another company, this workspace will simply be added to their account.
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-zinc-700">Workspace role</label>
              <div className="space-y-2">
                {availableRoles.map((item) => {
                  const selected = role === item.value;
                  return (
                    <button
                      type="button"
                      key={item.value}
                      onClick={() => setRole(item.value)}
                      className={`w-full rounded-xl border px-3.5 py-3 text-left transition ${selected ? 'border-zinc-950 bg-zinc-50 ring-1 ring-zinc-950' : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50/60'}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold text-zinc-900">{item.label}</span>
                        <span className={`h-3.5 w-3.5 rounded-full border ${selected ? 'border-[4px] border-zinc-950 bg-white' : 'border-zinc-300'}`} />
                      </div>
                      <p className="mt-1 text-[11px] leading-5 text-zinc-500">{roleDescriptions[item.value]}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-zinc-700">Phone <span className="font-normal text-zinc-400">optional</span></label>
              <input
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+977 98..."
                className="field"
              />
            </div>

            {role === 'agent' && (
              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-zinc-50/60 px-3.5 py-3">
                <span>
                  <span className="block text-xs font-semibold text-zinc-800">Accept new assignments</span>
                  <span className="mt-0.5 block text-[11px] text-zinc-500">Include this person in automatic routing.</span>
                </span>
                <input
                  type="checkbox"
                  checked={acceptingLeads}
                  onChange={(event) => setAcceptingLeads(event.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300"
                />
              </label>
            )}

            {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50/70 px-5 py-3.5">
            <button type="button" onClick={resetAndClose} disabled={submitting} className="button-secondary">Cancel</button>
            <button type="submit" disabled={submitting || !fullName.trim() || !email.trim()} className="button-primary disabled:cursor-not-allowed disabled:opacity-50">
              <UserPlus className="h-4 w-4" />
              {submitting ? 'Sending…' : 'Send invitation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
