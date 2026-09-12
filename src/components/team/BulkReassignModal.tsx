'use client';

import React, { useState } from 'react';
import { Profile } from '@/lib/types';
import { useApp } from '@/lib/store';
import { useDialog } from '@/lib/useDialog';
import { X, ArrowRight, AlertTriangle, CheckCircle2, Users } from 'lucide-react';

interface BulkReassignModalProps {
  sourceAgent: Profile;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (reassignedCount: number) => void;
}

export default function BulkReassignModal({
  sourceAgent,
  isOpen,
  onClose,
  onSuccess,
}: BulkReassignModalProps) {
  const { allProfiles, allLeads, bulkReassignAgentLeads, currentUser, showToast } = useApp();
  useDialog(isOpen, onClose);

  const [targetAgentId, setTargetAgentId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successCount, setSuccessCount] = useState<number | null>(null);

  if (!isOpen) return null;

  const activeLeads = allLeads.filter(
    (l) => l.assigned_to === sourceAgent.id && l.stage !== 'won' && l.stage !== 'lost'
  );

  const eligibleTargetAgents = allProfiles.filter(
    (p) => p.id !== sourceAgent.id && p.role === 'agent' && p.is_active
  );

  const selectedTarget = allProfiles.find((p) => p.id === targetAgentId);

  const handleConfirmReassign = () => {
    if (!targetAgentId) return;
    setIsSubmitting(true);

    const count = bulkReassignAgentLeads(sourceAgent.id, targetAgentId);
    setSuccessCount(count);
    setIsSubmitting(false);

    showToast(`Successfully reassigned ${count} lead${count === 1 ? '' : 's'} to ${selectedTarget?.full_name}`, 'success');

    if (onSuccess) {
      onSuccess(count);
    }

    setTimeout(() => {
      onClose();
      setSuccessCount(null);
    }, 1200);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-reassign-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-2xs p-4 animate-in fade-in duration-100"
    >
      <div className="bg-white rounded-lg border border-zinc-200 shadow-xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-100 text-xs">
        {/* Header */}
        <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between bg-zinc-50/50">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-700">
              <Users className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 id="bulk-reassign-title" className="font-semibold text-zinc-900 tracking-tight">Bulk Reassign Leads</h3>
              <p className="text-[11px] text-zinc-500">
                Offload {sourceAgent.full_name}'s active inquiries
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

        {/* Content */}
        <div className="p-4 space-y-4">
          {successCount !== null ? (
            <div className="py-6 text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="font-medium text-zinc-900 text-sm">
                Successfully Transferred {successCount} Leads
              </div>
              <p className="text-zinc-500 text-[11px]">
                Inquiries have been reallocated to {selectedTarget?.full_name}.
              </p>
            </div>
          ) : (
            <>
              {/* Transfer Flow Visual */}
              <div className="grid grid-cols-5 items-center gap-2 bg-zinc-50 p-3 rounded-md border border-zinc-200">
                <div className="col-span-2 flex items-center gap-2 min-w-0">
                  <img
                    src={sourceAgent.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
                    alt={sourceAgent.full_name}
                    className="w-8 h-8 rounded-full object-cover border border-zinc-200 shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="font-medium text-zinc-900 truncate">{sourceAgent.full_name}</div>
                    <div className="text-[10px] text-zinc-500 font-mono">
                      {activeLeads.length} active leads
                    </div>
                  </div>
                </div>

                <div className="col-span-1 flex justify-center text-zinc-400">
                  <ArrowRight className="w-4 h-4" />
                </div>

                <div className="col-span-2 flex items-center gap-2 min-w-0">
                  {selectedTarget ? (
                    <>
                      <img
                        src={selectedTarget.avatar_url || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150'}
                        alt={selectedTarget.full_name}
                        className="w-8 h-8 rounded-full object-cover border border-zinc-200 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="font-medium text-zinc-900 truncate">
                          {selectedTarget.full_name}
                        </div>
                        <div className="text-[10px] text-zinc-500 font-mono">
                          {selectedTarget.current_load}/{selectedTarget.max_capacity} cap
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="border border-dashed border-zinc-300 rounded p-1.5 text-center text-zinc-400 text-[11px] w-full">
                      Select below
                    </div>
                  )}
                </div>
              </div>

              {/* Notice */}
              {activeLeads.length === 0 ? (
                <div className="p-3 rounded-md bg-zinc-50 border border-zinc-200 text-zinc-500 text-center">
                  This consultant currently has zero active leads in their pipeline.
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                      Target Travel Consultant
                    </label>
                    <select
                      value={targetAgentId}
                      onChange={(e) => setTargetAgentId(e.target.value)}
                      className="w-full text-xs border border-zinc-200 rounded-md p-2 bg-white focus:outline-none focus:border-zinc-400"
                    >
                      <option value="">Select consultant to receive leads...</option>
                      {eligibleTargetAgents.map((ag) => (
                        <option key={ag.id} value={ag.id}>
                          {ag.full_name} ({ag.destination_tags.slice(0, 3).join(', ')}) — Load:{' '}
                          {ag.current_load}/{ag.max_capacity}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Warning on capacity */}
                  {selectedTarget &&
                    selectedTarget.current_load + activeLeads.length > selectedTarget.max_capacity && (
                      <div className="flex items-start gap-2 p-2.5 rounded bg-amber-50 border border-amber-200/80 text-amber-800 text-[11px]">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <strong>Capacity Warning:</strong> Adding {activeLeads.length} leads will
                          put {selectedTarget.full_name} at{' '}
                          {selectedTarget.current_load + activeLeads.length}/
                          {selectedTarget.max_capacity} leads (over capacity limit).
                        </div>
                      </div>
                    )}

                  {/* Active leads list preview */}
                  <div>
                    <div className="text-[10px] font-semibold uppercase text-zinc-500 mb-1 tracking-tight">
                      Leads to be Reassigned ({activeLeads.length})
                    </div>
                    <div className="max-h-36 overflow-y-auto border border-zinc-200 rounded-md divide-y divide-zinc-100 bg-white">
                      {activeLeads.map((lead) => (
                        <div
                          key={lead.id}
                          className="px-2.5 py-1.5 flex items-center justify-between text-[11px]"
                        >
                          <div>
                            <span className="font-mono text-zinc-400 text-[10px] mr-1.5">
                              {lead.lead_code}
                            </span>
                            <span className="font-medium text-zinc-900">{lead.customer_name}</span>
                            <span className="text-zinc-500 text-[10px] ml-1">
                              • {lead.destination}
                            </span>
                          </div>
                          <span className="font-mono text-zinc-600 text-[10px] capitalize">
                            {lead.stage.replace('_', ' ')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {successCount === null && (
          <div className="px-4 py-2.5 bg-zinc-50/70 border-t border-zinc-200 flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-md border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 font-medium transition"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmReassign}
              disabled={!targetAgentId || activeLeads.length === 0 || isSubmitting}
              className="px-3.5 py-1.5 rounded-md bg-zinc-900 text-white font-medium hover:bg-zinc-800 disabled:opacity-40 transition flex items-center gap-1.5"
            >
              {isSubmitting ? 'Transferring...' : `Transfer ${activeLeads.length} Leads`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
