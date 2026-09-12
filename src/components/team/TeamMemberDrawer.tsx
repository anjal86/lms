'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Profile, AgentStatus, Role } from '@/lib/types';
import { useApp } from '@/lib/store';
import { useDialog } from '@/lib/useDialog';
import BulkReassignModal from './BulkReassignModal';
import EmployeeHealthModal from './EmployeeHealthModal';
import SlaBadge from '@/components/leads/SlaBadge';
import {
  X,
  Mail,
  Phone,
  MapPin,
  Globe,
  Award,
  Calendar,
  Clock,
  TrendingUp,
  Target,
  Trophy,
  ExternalLink,
  ShieldAlert,
  Users,
  Edit2,
  Check,
  Save,
  MessageSquare,
  Sparkles,
  UserCheck,
  Activity,
} from 'lucide-react';

interface TeamMemberDrawerProps {
  member: Profile;
  isOpen: boolean;
  onClose: () => void;
}

export default function TeamMemberDrawer({
  member,
  isOpen,
  onClose,
}: TeamMemberDrawerProps) {
  useDialog({ isOpen, onClose });

  const {
    allLeads,
    activities,
    currentUser,
    updateProfile,
    getAgentMetrics,
    getAgentIncentiveProfile,
    getAgentHealthScore,
    toggleAgentAcceptingLeads,
    formatAppDate,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'overview' | 'performance' | 'leads' | 'activities'>('overview');
  const [isEditing, setIsEditing] = useState(false);
  const [isBulkReassignOpen, setIsBulkReassignOpen] = useState(false);
  const [isHealthModalOpen, setIsHealthModalOpen] = useState(false);

  // Edit fields state
  const [editPhone, setEditPhone] = useState(member.phone || '');
  const [editExt, setEditExt] = useState(member.direct_extension || '');
  const [editLocation, setEditLocation] = useState(member.office_location || '');
  const [editBio, setEditBio] = useState(member.bio || '');
  const [editMaxCapacity, setEditMaxCapacity] = useState(member.max_capacity);
  const [editTags, setEditTags] = useState(member.destination_tags.join(', '));
  const [newTagInput, setNewTagInput] = useState('');

  if (!isOpen) return null;

  const metrics = getAgentMetrics(member.id);
  const incentiveProfile = getAgentIncentiveProfile(member.id);
  const health = getAgentHealthScore(member.id);

  const assignedLeads = allLeads.filter((l) => l.assigned_to === member.id);
  const activeLeads = assignedLeads.filter((l) => l.stage !== 'won' && l.stage !== 'lost');
  const memberActivities = activities.filter((a) => a.agent_id === member.id);

  const canManage = currentUser.role === 'admin' || currentUser.role === 'manager' || currentUser.id === member.id;

  const handleSaveProfile = () => {
    const parsedTags = editTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    updateProfile(member.id, {
      phone: editPhone.trim(),
      direct_extension: editExt.trim() || undefined,
      office_location: editLocation.trim() || undefined,
      bio: editBio.trim() || undefined,
      max_capacity: Number(editMaxCapacity) || 25,
      destination_tags: parsedTags.length > 0 ? parsedTags : member.destination_tags,
    });

    setIsEditing(false);
  };

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newTagInput.trim()) {
      e.preventDefault();
      const updated = Array.from(new Set([...member.destination_tags, newTagInput.trim()]));
      updateProfile(member.id, { destination_tags: updated });
      setNewTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const updated = member.destination_tags.filter((t) => t !== tagToRemove);
    updateProfile(member.id, { destination_tags: updated });
  };

  const handleStatusChange = (newStatus: AgentStatus) => {
    updateProfile(member.id, { status: newStatus });
  };

  const getStatusDotColor = (status: AgentStatus) => {
    switch (status) {
      case 'available':
        return 'bg-emerald-500';
      case 'in_call':
        return 'bg-blue-500';
      case 'on_break':
        return 'bg-amber-500';
      case 'offline':
        return 'bg-zinc-400';
      default:
        return 'bg-zinc-400';
    }
  };

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Profile and metrics for ${member.full_name}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
        className="fixed inset-0 z-40 flex justify-end bg-zinc-950/20 backdrop-blur-2xs animate-in fade-in duration-100"
      >
        <div className="w-full max-w-xl bg-white border-l border-zinc-200 shadow-2xl h-full flex flex-col animate-in slide-in-from-right duration-150 text-xs">
          {/* Top Header */}
          <div className="px-5 py-3 border-b border-zinc-200 flex items-center justify-between bg-zinc-50/60">
            <div className="flex items-center gap-2">
              <span className="font-mono text-zinc-400 font-medium text-[11px]">
                {member.employee_code || 'EMP-000'}
              </span>
              <span className="text-zinc-300">•</span>
              <span className="capitalize font-semibold text-zinc-700 text-[11px]">
                {member.role === 'agent' ? 'Travel Consultant' : member.role}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {member.role === 'agent' && (
                <button
                  type="button"
                  onClick={() => setIsHealthModalOpen(true)}
                  className="px-2.5 py-1 rounded-md border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 text-[11px] font-medium transition flex items-center gap-1.5 shadow-2xs"
                  title="Inspect Consultant Health & Accountability Index"
                >
                  <Activity className="w-3 h-3 text-zinc-600" />
                  <span>Health ({health.overall_score})</span>
                </button>
              )}

              {canManage && (
                <button
                  type="button"
                  onClick={() => setIsEditing(!isEditing)}
                  className={`px-2.5 py-1 rounded-md border text-[11px] font-medium transition flex items-center gap-1.5 ${
                    isEditing
                      ? 'bg-zinc-900 text-white border-zinc-900'
                      : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  <Edit2 className="w-3 h-3" />
                  <span>{isEditing ? 'Cancel Edit' : 'Edit Profile'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                aria-label="Close drawer"
                className="p-1 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Profile Identity Hero */}
          <div className="px-5 py-4 border-b border-zinc-200 bg-white">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <img
                    src={member.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
                    alt={member.full_name}
                    className="w-12 h-12 rounded-full object-cover border border-zinc-200 shadow-2xs"
                  />
                  <span
                    className={`w-3 h-3 rounded-full border-2 border-white absolute bottom-0 right-0 ${getStatusDotColor(
                      member.status
                    )}`}
                    title={`Status: ${member.status}`}
                  />
                </div>

                <div>
                  <h2 className="text-base font-semibold text-zinc-900 tracking-tight flex items-center gap-2">
                    {member.full_name}
                    {!member.is_active && (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-100 text-zinc-500">
                        Inactive
                      </span>
                    )}
                  </h2>
                  <div className="flex items-center gap-2 text-zinc-500 font-mono text-[11px] mt-0.5">
                    <Mail className="w-3 h-3 text-zinc-400" />
                    <span>{member.email}</span>
                    {member.direct_extension && (
                      <>
                        <span>•</span>
                        <span className="text-zinc-700">{member.direct_extension}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Status Selector */}
              <div className="flex flex-col items-end gap-1">
                <select
                  value={member.status}
                  onChange={(e) => handleStatusChange(e.target.value as AgentStatus)}
                  disabled={!canManage}
                  className="text-[11px] bg-zinc-50 border border-zinc-200 rounded px-2 py-1 text-zinc-800 font-medium focus:outline-none"
                >
                  <option value="available">🟢 Available</option>
                  <option value="in_call">🔵 In Client Call</option>
                  <option value="on_break">🟡 On Break</option>
                  <option value="offline">⚪ Offline</option>
                </select>

                {member.role === 'agent' && (
                  <button
                    onClick={() => toggleAgentAcceptingLeads(member.id)}
                    disabled={!canManage}
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded transition ${
                      member.accepting_leads
                        ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                        : 'text-zinc-500 bg-zinc-100 hover:bg-zinc-200'
                    }`}
                    title="Toggle auto-assign participation"
                  >
                    {member.accepting_leads ? '✓ Routing Active' : '✕ Routing Paused'}
                  </button>
                )}
              </div>
            </div>

            {/* Capacity Bar & Quick Stats */}
            <div className="mt-4 pt-3 border-t border-zinc-100 grid grid-cols-4 gap-2">
              <div className="col-span-2 bg-zinc-50 p-2.5 rounded border border-zinc-200">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-zinc-500 font-medium uppercase tracking-tight text-[10px]">
                    Workload Capacity
                  </span>
                  <span className="font-mono font-medium text-zinc-900">
                    {metrics.activeLeads} / {member.max_capacity} leads ({metrics.capacityPct}%)
                  </span>
                </div>
                <div className="w-full bg-zinc-200 h-1.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      metrics.capacityPct >= 90
                        ? 'bg-red-500'
                        : metrics.capacityPct >= 70
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${metrics.capacityPct}%` }}
                  />
                </div>
              </div>

              <div className="bg-zinc-50 p-2.5 rounded border border-zinc-200">
                <div className="text-[10px] text-zinc-500 font-medium uppercase tracking-tight">
                  Won Deals
                </div>
                <div className="text-sm font-mono font-medium text-zinc-900 mt-0.5">
                  {metrics.wonCount}{' '}
                  <span className="text-[10px] text-zinc-400 font-sans">({metrics.winRate}%)</span>
                </div>
              </div>

              <div className="bg-zinc-50 p-2.5 rounded border border-zinc-200">
                <div className="text-[10px] text-zinc-500 font-medium uppercase tracking-tight">
                  Gross Profit
                </div>
                <div className="text-sm font-mono font-medium text-emerald-700 mt-0.5">
                  ${metrics.grossProfit.toLocaleString()}
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="px-5 border-b border-zinc-200 flex items-center gap-2 bg-zinc-50/50">
            {[
              { id: 'overview', label: 'Overview & Profile' },
              { id: 'performance', label: 'Performance & Tier' },
              { id: 'leads', label: `Active Leads (${metrics.activeLeads})` },
              { id: 'activities', label: `Activities (${metrics.activityCount})` },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-2.5 px-2 text-xs font-medium border-b-2 transition -mb-px flex items-center gap-1.5 ${
                  activeTab === tab.id
                    ? 'border-zinc-900 text-zinc-900 font-semibold'
                    : 'border-transparent text-zinc-500 hover:text-zinc-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Drawer Body Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* 1. OVERVIEW TAB */}
            {activeTab === 'overview' && (
              <div className="space-y-4">
                {isEditing ? (
                  /* Edit Form */
                  <div className="bg-zinc-50 p-3.5 rounded-lg border border-zinc-200 space-y-3">
                    <div className="font-semibold text-zinc-900 text-xs">Edit Consultant Details</div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                          Phone Number
                        </label>
                        <input
                          type="text"
                          value={editPhone}
                          onChange={(e) => setEditPhone(e.target.value)}
                          className="w-full text-xs p-1.5 border border-zinc-200 rounded bg-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                          Extension
                        </label>
                        <input
                          type="text"
                          value={editExt}
                          onChange={(e) => setEditExt(e.target.value)}
                          placeholder="Ext. 104"
                          className="w-full text-xs p-1.5 border border-zinc-200 rounded bg-white font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                          Office Location
                        </label>
                        <input
                          type="text"
                          value={editLocation}
                          onChange={(e) => setEditLocation(e.target.value)}
                          className="w-full text-xs p-1.5 border border-zinc-200 rounded bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                          Max Active Capacity
                        </label>
                        <input
                          type="number"
                          value={editMaxCapacity}
                          onChange={(e) => setEditMaxCapacity(Number(e.target.value))}
                          className="w-full text-xs p-1.5 border border-zinc-200 rounded bg-white font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                        Destination Tags (comma separated)
                      </label>
                      <input
                        type="text"
                        value={editTags}
                        onChange={(e) => setEditTags(e.target.value)}
                        className="w-full text-xs p-1.5 border border-zinc-200 rounded bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-zinc-700 mb-1">Bio</label>
                      <textarea
                        rows={3}
                        value={editBio}
                        onChange={(e) => setEditBio(e.target.value)}
                        className="w-full text-xs p-2 border border-zinc-200 rounded bg-white resize-none"
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        onClick={() => setIsEditing(false)}
                        className="px-3 py-1 rounded border border-zinc-200 bg-white text-zinc-700"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveProfile}
                        className="px-3 py-1 rounded bg-zinc-900 text-white font-medium flex items-center gap-1"
                      >
                        <Save className="w-3 h-3" /> Save Changes
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Destination Tags */}
                    <div>
                      <div className="text-[10px] uppercase font-semibold text-zinc-400 mb-1.5 tracking-tight flex items-center justify-between">
                        <span>Destination Specializations</span>
                        <span className="font-mono text-zinc-500">
                          {member.destination_tags.length} regions
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {member.destination_tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-100 border border-zinc-200/80 text-zinc-700 font-medium text-[11px]"
                          >
                            <span>{tag}</span>
                            {canManage && (
                              <button
                                onClick={() => handleRemoveTag(tag)}
                                className="text-zinc-400 hover:text-zinc-700 rounded-full"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            )}
                          </span>
                        ))}

                        {canManage && (
                          <input
                            type="text"
                            placeholder="+ Add tag & Enter"
                            value={newTagInput}
                            onChange={(e) => setNewTagInput(e.target.value)}
                            onKeyDown={handleAddTag}
                            className="text-[11px] px-2 py-0.5 border border-dashed border-zinc-300 rounded-md bg-zinc-50/50 focus:bg-white focus:outline-none w-28"
                          />
                        )}
                      </div>
                    </div>

                    {/* Bio */}
                    {member.bio && (
                      <div className="pt-2 border-t border-zinc-100">
                        <div className="text-[10px] uppercase font-semibold text-zinc-400 mb-1 tracking-tight">
                          Consultant Bio & Focus
                        </div>
                        <p className="text-zinc-700 leading-relaxed bg-zinc-50/60 p-2.5 rounded-md border border-zinc-200">
                          {member.bio}
                        </p>
                      </div>
                    )}

                    {/* Key Details Grid */}
                    <div className="pt-2 border-t border-zinc-100 space-y-2">
                      <div className="text-[10px] uppercase font-semibold text-zinc-400 tracking-tight">
                        Contact & Logistics
                      </div>
                      <div className="grid grid-cols-2 gap-2 bg-zinc-50 p-3 rounded-lg border border-zinc-200">
                        <div>
                          <span className="text-[10px] text-zinc-400 block">Direct Phone</span>
                          <span className="font-mono text-zinc-800 font-medium">
                            {member.phone || 'None'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-400 block">Location</span>
                          <span className="text-zinc-800 font-medium">
                            {member.office_location || 'Remote'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-400 block">Languages</span>
                          <span className="text-zinc-800 font-medium">
                            {member.languages?.join(', ') || 'English'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-400 block">Member Since</span>
                          <span suppressHydrationWarning className="font-mono text-zinc-800">
                            {formatAppDate(member.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Certifications */}
                    {member.certifications && member.certifications.length > 0 && (
                      <div className="pt-2 border-t border-zinc-100">
                        <div className="text-[10px] uppercase font-semibold text-zinc-400 mb-1.5 tracking-tight flex items-center gap-1">
                          <Award className="w-3.5 h-3.5 text-zinc-500" />
                          <span>Industry Certifications</span>
                        </div>
                        <div className="space-y-1">
                          {member.certifications.map((cert) => (
                            <div
                              key={cert}
                              className="px-2.5 py-1 rounded bg-zinc-50 border border-zinc-200 text-zinc-700 text-[11px] flex items-center gap-1.5"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                              <span>{cert}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* 2. PERFORMANCE TAB */}
            {activeTab === 'performance' && (
              <div className="space-y-4">
                {/* Incentive Tier Card */}
                <div className="p-3.5 rounded-lg bg-zinc-900 text-zinc-100 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] text-zinc-400 uppercase tracking-tight">
                      Current Incentive Tier
                    </div>
                    <div className="text-base font-semibold text-white mt-0.5 flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-amber-400" />
                      <span>{incentiveProfile.currentTier.name}</span>
                    </div>
                    <div className="text-[11px] text-zinc-400 font-mono mt-0.5">
                      {incentiveProfile.currentTier.commission_pct_profit}% commission rate
                      {incentiveProfile.currentTier.milestone_bonus > 0 &&
                        ` + $${incentiveProfile.currentTier.milestone_bonus} milestone bonus`}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-[10px] text-zinc-400 uppercase tracking-tight">
                      Accrued Incentive
                    </div>
                    <div className="font-mono text-base font-medium text-emerald-400">
                      ${incentiveProfile.accruedCommission.toFixed(2)}
                    </div>
                    <div className="text-[10px] font-mono text-zinc-400">
                      ${incentiveProfile.paidCommission.toFixed(2)} paid
                    </div>
                  </div>
                </div>

                {/* Scorecard KPIs */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-zinc-50 p-3 rounded-lg border border-zinc-200">
                    <span className="text-[10px] text-zinc-400 uppercase tracking-tight block">
                      Total Revenue Booked
                    </span>
                    <span className="text-base font-mono font-medium text-zinc-900 mt-0.5 block">
                      ${metrics.revenue.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {metrics.wonCount} won / {metrics.totalAssigned} assigned
                    </span>
                  </div>

                  <div className="bg-zinc-50 p-3 rounded-lg border border-zinc-200">
                    <span className="text-[10px] text-zinc-400 uppercase tracking-tight block">
                      Gross Profit Margin
                    </span>
                    <span className="text-base font-mono font-medium text-emerald-700 mt-0.5 block">
                      ${metrics.grossProfit.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {metrics.revenue > 0
                        ? `${Math.round((metrics.grossProfit / metrics.revenue) * 100)}% avg margin`
                        : '0% margin'}
                    </span>
                  </div>

                  <div className="bg-zinc-50 p-3 rounded-lg border border-zinc-200">
                    <span className="text-[10px] text-zinc-400 uppercase tracking-tight block">
                      Avg Response Time (FRT)
                    </span>
                    <span className="text-base font-mono font-medium text-zinc-900 mt-0.5 block">
                      {metrics.avgFrtMinutes} mins
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">Target: &lt;30m limit</span>
                  </div>

                  <div className="bg-zinc-50 p-3 rounded-lg border border-zinc-200">
                    <span className="text-[10px] text-zinc-400 uppercase tracking-tight block">
                      SLA Breaches
                    </span>
                    <span
                      className={`text-base font-mono font-medium mt-0.5 block ${
                        metrics.breaches > 0 ? 'text-red-700' : 'text-emerald-700'
                      }`}
                    >
                      {metrics.breaches} breaches
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {metrics.breaches === 0 ? '100% compliant' : 'Attention needed'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* 3. ASSIGNED LEADS TAB */}
            {activeTab === 'leads' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-zinc-800">
                    Current Assigned Inquiries ({assignedLeads.length})
                  </span>
                  {activeLeads.length > 0 && canManage && (
                    <button
                      onClick={() => setIsBulkReassignOpen(true)}
                      className="text-xs text-zinc-600 hover:text-zinc-900 font-medium underline"
                    >
                      Offload all leads
                    </button>
                  )}
                </div>

                {assignedLeads.length === 0 ? (
                  <div className="py-8 text-center text-zinc-400 border border-dashed border-zinc-200 rounded-md font-mono">
                    No leads assigned
                  </div>
                ) : (
                  <div className="border border-zinc-200 rounded-lg overflow-hidden divide-y divide-zinc-100 bg-white">
                    {assignedLeads.map((lead) => (
                      <div
                        key={lead.id}
                        className="p-2.5 flex items-center justify-between hover:bg-zinc-50/80 transition"
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="font-mono text-[10px] text-zinc-400">
                              {lead.lead_code}
                            </span>
                            <span className="font-semibold text-zinc-900 truncate">
                              {lead.customer_name}
                            </span>
                            <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-zinc-100 text-zinc-600 capitalize">
                              {lead.stage.replace('_', ' ')}
                            </span>
                          </div>
                          <div className="text-[11px] text-zinc-500 flex items-center gap-1">
                            <span>{lead.destination}</span>
                            <span>•</span>
                            <span className="font-mono">{lead.budget_range || '$2k'}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <SlaBadge lead={lead} />
                          <Link
                            href={`/leads/${lead.id}`}
                            className="p-1 rounded text-zinc-400 hover:text-zinc-900 transition"
                            title="Inspect Lead"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 4. ACTIVITIES LOGS TAB */}
            {activeTab === 'activities' && (
              <div className="space-y-3">
                <div className="font-semibold text-zinc-800 text-xs">
                  Logged Interaction History ({memberActivities.length})
                </div>

                {memberActivities.length === 0 ? (
                  <div className="py-8 text-center text-zinc-400 border border-dashed border-zinc-200 rounded-md font-mono">
                    No activities recorded yet
                  </div>
                ) : (
                  <div className="space-y-2 relative before:absolute before:inset-0 before:left-3 before:w-0.5 before:bg-zinc-200">
                    {memberActivities.map((act) => (
                      <div key={act.id} className="flex items-start gap-2.5 relative z-10">
                        <div className="w-6 h-6 rounded-full bg-zinc-900 text-white flex items-center justify-center text-[10px] shrink-0">
                          {act.activity_type === 'call' ? (
                            <Phone className="w-3 h-3" />
                          ) : act.activity_type === 'whatsapp' ? (
                            <MessageSquare className="w-3 h-3" />
                          ) : (
                            <Sparkles className="w-3 h-3" />
                          )}
                        </div>

                        <div className="flex-1 bg-zinc-50 p-2.5 rounded-md border border-zinc-200">
                          <div className="flex items-center justify-between text-[11px] mb-0.5">
                            <span className="font-semibold text-zinc-900">{act.title}</span>
                            <span suppressHydrationWarning className="font-mono text-[10px] text-zinc-400">
                              {formatAppDate(act.created_at)}
                            </span>
                          </div>
                          {act.notes && (
                            <p className="text-zinc-600 text-[11px] leading-snug">{act.notes}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sticky Drawer Footer */}
          <div className="px-5 py-3 border-t border-zinc-200 bg-zinc-50 flex items-center justify-between">
            <div>
              {canManage && activeLeads.length > 0 && (
                <button
                  onClick={() => setIsBulkReassignOpen(true)}
                  className="px-2.5 py-1.5 rounded-md border border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-700 font-medium text-[11px] transition flex items-center gap-1.5"
                >
                  <Users className="w-3 h-3 text-zinc-500" />
                  <span>Bulk Offload Leads ({activeLeads.length})</span>
                </button>
              )}
            </div>

            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-md bg-zinc-900 text-white font-medium hover:bg-zinc-800 transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Bulk Reassign Modal */}
      {isBulkReassignOpen && (
        <BulkReassignModal
          sourceAgent={member}
          isOpen={isBulkReassignOpen}
          onClose={() => setIsBulkReassignOpen(false)}
        />
      )}

      {/* Employee Health & Accountability Modal */}
      {isHealthModalOpen && (
        <EmployeeHealthModal
          member={member}
          isOpen={isHealthModalOpen}
          onClose={() => setIsHealthModalOpen(false)}
        />
      )}
    </>
  );
}
