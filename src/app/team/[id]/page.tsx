'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useApp } from '@/lib/store';
import { AgentStatus } from '@/lib/types';
import BulkReassignModal from '@/components/team/BulkReassignModal';
import SlaBadge from '@/components/leads/SlaBadge';
import {
  ArrowLeft,
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
  Users,
  Edit2,
  Check,
  Save,
  MessageSquare,
  Sparkles,
  Activity,
  Zap,
} from 'lucide-react';

export default function TeamMemberDetailPage() {
  const params = useParams();
  const memberId = params.id as string;

  const {
    allProfiles,
    allLeads,
    activities,
    currentUser,
    updateProfile,
    getAgentMetrics,
    getAgentIncentiveProfile,
    getAgentHealthScore,
    rebalanceOverdueFollowUps,
    toggleAgentAcceptingLeads,
    formatAppDate,
  } = useApp();

  const member = allProfiles.find((p) => p.id === memberId);
  const [isBulkReassignOpen, setIsBulkReassignOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'leads' | 'activities'>('leads');
  const [rebalanceFeedback, setRebalanceFeedback] = useState<string | null>(null);

  const getHeartbeat = (lastActiveAt?: string) => {
    if (!lastActiveAt) return { text: 'No activity', state: 'offline' };
    const d = new Date(lastActiveAt).getTime();
    if (isNaN(d)) return { text: 'Offline', state: 'offline' };
    const diffMs = Math.max(0, Date.now() - d);
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 5) return { text: 'Active now', state: 'active' };
    if (diffMins < 60) return { text: `${diffMins}m ago`, state: 'recent' };
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return { text: `${diffHours}h ago`, state: 'idle' };
    const diffDays = Math.floor(diffHours / 24);
    return { text: `${diffDays}d ago`, state: 'offline' };
  };

  if (!member) {
    return (
      <div className="max-w-4xl mx-auto p-12 text-center text-xs">
        <h2 className="text-base font-semibold text-zinc-800">Team Member Not Found</h2>
        <p className="text-zinc-500 mt-1">This profile may have been removed or does not exist.</p>
        <Link
          href="/team"
          className="inline-flex items-center gap-1.5 mt-4 px-3 py-1.5 bg-zinc-900 text-white rounded-md font-medium"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Team Directory
        </Link>
      </div>
    );
  }

  const metrics = getAgentMetrics(member.id);
  const incentive = getAgentIncentiveProfile(member.id);
  const health = getAgentHealthScore(member.id);
  const heartbeat = getHeartbeat(health.last_active_at);
  const assignedLeads = allLeads.filter((l) => l.assigned_to === member.id);
  const activeLeads = assignedLeads.filter((l) => l.stage !== 'won' && l.stage !== 'lost');
  const memberActivities = activities.filter((a) => a.agent_id === member.id);

  const canManage = currentUser.role === 'admin' || currentUser.role === 'manager' || currentUser.id === member.id;

  const handleRebalance = () => {
    const count = rebalanceOverdueFollowUps(member.id);
    if (count > 0) {
      setRebalanceFeedback(`Reassigned ${count} overdue callbacks to available agents.`);
    } else {
      setRebalanceFeedback('No overdue callbacks to reassign.');
    }
    setTimeout(() => setRebalanceFeedback(null), 4000);
  };

  const getStatusDotColor = (st: AgentStatus) => {
    switch (st) {
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
    <div className="max-w-6xl mx-auto space-y-4 text-xs">
      {/* Top Bar Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/team"
          className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-zinc-900 font-medium transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Team Directory</span>
        </Link>

        {currentUser.id === member.id ? (
          <Link
            href="/profile"
            className="px-3 py-1.5 rounded-md bg-zinc-900 text-white font-medium hover:bg-zinc-800 transition flex items-center gap-1.5 shadow-2xs"
          >
            <Edit2 className="w-3.5 h-3.5" />
            <span>Edit My Profile</span>
          </Link>
        ) : (
          canManage && activeLeads.length > 0 && (
            <button
              onClick={() => setIsBulkReassignOpen(true)}
              className="px-3 py-1.5 rounded-md border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 font-medium transition flex items-center gap-1.5"
            >
              <Users className="w-3.5 h-3.5 text-zinc-500" />
              <span>Bulk Offload Leads ({activeLeads.length})</span>
            </button>
          )
        )}
      </div>

      {/* Hero Profile Header */}
      <div className="bg-white rounded-lg border border-zinc-200 shadow-2xs p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="relative">
            <img
              src={member.avatar_url || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150'}
              alt={member.full_name}
              className="w-14 h-14 rounded-full object-cover border border-zinc-200 shadow-2xs"
            />
            <span
              className={`w-3.5 h-3.5 rounded-full border-2 border-white absolute bottom-0 right-0 ${getStatusDotColor(
                member.status
              )}`}
            />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-zinc-400 text-[11px]">
                {member.employee_code || 'EMP-001'}
              </span>
              <span className="text-zinc-300">•</span>
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-zinc-100 text-zinc-600 uppercase font-medium">
                {member.role === 'agent' ? 'Travel Consultant' : member.role}
              </span>
            </div>
            <h1 className="text-lg font-semibold text-zinc-900 tracking-tight mt-0.5">
              {member.full_name}
            </h1>
            <div className="flex items-center gap-2 text-zinc-500 font-mono text-[11px] mt-0.5">
              <span>{member.email}</span>
              {member.direct_extension && (
                <>
                  <span>•</span>
                  <span className="text-zinc-700 font-medium">{member.direct_extension}</span>
                </>
              )}
              <span>•</span>
              <span>{member.office_location || 'San Francisco HQ'}</span>
            </div>
          </div>
        </div>

        {/* Capacity & Routing */}
        <div className="flex items-center gap-3 border-t sm:border-t-0 pt-3 sm:pt-0 border-zinc-100">
          <div className="bg-zinc-50 p-2.5 rounded-md border border-zinc-200 min-w-[140px]">
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-zinc-500 font-medium text-[10px] uppercase">Workload</span>
              <span className="font-mono font-medium text-zinc-900">
                {metrics.activeLeads} / {member.max_capacity}
              </span>
            </div>
            <div className="w-full bg-zinc-200 h-1.5 rounded-full overflow-hidden">
              <div
                className={`h-full ${
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

          <div className="flex flex-col items-end gap-1">
            <span className="text-[11px] font-mono px-2 py-1 rounded bg-zinc-100 text-zinc-700 font-medium capitalize">
              {member.status.replace('_', ' ')}
            </span>
            {member.role === 'agent' && (
              <span className="text-[10px] font-mono text-zinc-400">
                {member.accepting_leads ? '✓ Routing Active' : '✕ Routing Paused'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 2-Column Dossier & Details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: Logistics & Specializations (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Destination Tags Card */}
          <div className="bg-white rounded-lg p-4 border border-zinc-200 shadow-2xs space-y-3">
            <h3 className="text-[10px] uppercase font-semibold text-zinc-400 tracking-tight flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-zinc-500" />
              <span>Destination Specializations</span>
            </h3>

            <div className="flex flex-wrap gap-1.5">
              {member.destination_tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded-md bg-zinc-100 border border-zinc-200/80 text-zinc-700 font-medium text-[11px]"
                >
                  {tag}
                </span>
              ))}
            </div>

            {member.bio && (
              <div className="pt-2 border-t border-zinc-100">
                <span className="text-[10px] uppercase font-semibold text-zinc-400 block mb-1">
                  Consultant Bio
                </span>
                <p className="text-zinc-700 leading-relaxed bg-zinc-50 p-2.5 rounded border border-zinc-200 italic">
                  "{member.bio}"
                </p>
              </div>
            )}
          </div>

          {/* Contact & Certifications */}
          <div className="bg-white rounded-lg p-4 border border-zinc-200 shadow-2xs space-y-3">
            <h3 className="text-[10px] uppercase font-semibold text-zinc-400 tracking-tight">
              Consultant Details
            </h3>

            <div className="space-y-2 text-zinc-700">
              <div className="flex justify-between py-1 border-b border-zinc-100">
                <span className="text-zinc-400">Direct Phone:</span>
                <span className="font-mono font-medium text-zinc-900">
                  {member.phone || 'None'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100">
                <span className="text-zinc-400">Extension:</span>
                <span className="font-mono font-medium text-zinc-900">
                  {member.direct_extension || 'N/A'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100">
                <span className="text-zinc-400">Location:</span>
                <span>{member.office_location || 'HQ'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100">
                <span className="text-zinc-400">Languages:</span>
                <span>{member.languages?.join(', ') || 'English'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-zinc-400">Member Since:</span>
                <span suppressHydrationWarning className="font-mono text-zinc-800">
                  {formatAppDate(member.created_at)}
                </span>
              </div>
            </div>

            {member.certifications && member.certifications.length > 0 && (
              <div className="pt-2 border-t border-zinc-100 space-y-1">
                <span className="text-[10px] uppercase font-semibold text-zinc-400 block mb-1">
                  Certifications
                </span>
                {member.certifications.map((cert) => (
                  <div
                    key={cert}
                    className="px-2 py-1 rounded bg-zinc-50 border border-zinc-200 text-zinc-700 text-[11px] flex items-center gap-1.5"
                  >
                    <Award className="w-3 h-3 text-amber-500" />
                    <span>{cert}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Scorecard, Assigned Leads & History (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Employee Health & Accountability Scorecard (for consultants) */}
          {member.role === 'agent' && (
            <div className="bg-white rounded-lg border border-zinc-200 shadow-2xs p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-zinc-100">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-zinc-800" />
                  <div>
                    <h3 className="font-semibold text-zinc-900 text-xs">
                      Consultant Health & Accountability Index
                    </h3>
                    <p className="text-[11px] text-zinc-500">
                      Algorithmic scoring of SLA, follow-up cadence, conversion and capacity
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-zinc-200 bg-zinc-50 shadow-2xs">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        health.overall_score >= 85
                          ? 'bg-emerald-500'
                          : health.overall_score >= 70
                          ? 'bg-blue-500'
                          : health.overall_score >= 50
                          ? 'bg-amber-500'
                          : 'bg-red-500'
                      }`}
                    />
                    <span className="font-mono font-semibold text-zinc-900 text-xs">
                      {health.overall_score} / 100
                    </span>
                    <span className="text-[10px] text-zinc-500 uppercase tracking-tight font-medium">
                      {health.grade === 'attention_needed'
                        ? 'Attention'
                        : health.grade === 'burnout_risk'
                        ? 'At Risk'
                        : health.grade}
                    </span>
                  </div>

                  <div
                    suppressHydrationWarning
                    className="text-[10px] font-mono text-zinc-400 flex items-center gap-1 bg-zinc-50 px-2 py-1 rounded border border-zinc-200"
                  >
                    <Clock className="w-3 h-3 text-zinc-400" />
                    <span>{heartbeat.text}</span>
                  </div>
                </div>
              </div>

              {/* 4 Pillars Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="p-2.5 rounded-md bg-zinc-50/70 border border-zinc-200">
                  <div className="text-[10px] uppercase font-medium text-zinc-500 flex items-center justify-between">
                    <span>SLA Compliance</span>
                    <span className="font-mono font-medium text-zinc-900">{health.sla_score}%</span>
                  </div>
                  <div className="w-full bg-zinc-200 h-1.5 rounded-full mt-1.5 overflow-hidden">
                    <div
                      className={`h-full ${
                        health.sla_score >= 80
                          ? 'bg-emerald-500'
                          : health.sla_score >= 60
                          ? 'bg-amber-500'
                          : 'bg-red-500'
                      }`}
                      style={{ width: `${health.sla_score}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-zinc-400 font-mono mt-1">
                    {metrics.avgFrtMinutes}m avg FRT
                  </div>
                </div>

                <div className="p-2.5 rounded-md bg-zinc-50/70 border border-zinc-200">
                  <div className="text-[10px] uppercase font-medium text-zinc-500 flex items-center justify-between">
                    <span>Follow-Up Cadence</span>
                    <span className="font-mono font-medium text-zinc-900">{health.followup_score}%</span>
                  </div>
                  <div className="w-full bg-zinc-200 h-1.5 rounded-full mt-1.5 overflow-hidden">
                    <div
                      className={`h-full ${
                        health.followup_score >= 80
                          ? 'bg-emerald-500'
                          : health.followup_score >= 60
                          ? 'bg-amber-500'
                          : 'bg-red-500'
                      }`}
                      style={{ width: `${health.followup_score}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-zinc-400 font-mono mt-1">
                    {health.overdue_tasks_count} overdue task{health.overdue_tasks_count === 1 ? '' : 's'}
                  </div>
                </div>

                <div className="p-2.5 rounded-md bg-zinc-50/70 border border-zinc-200">
                  <div className="text-[10px] uppercase font-medium text-zinc-500 flex items-center justify-between">
                    <span>Sales Velocity</span>
                    <span className="font-mono font-medium text-zinc-900">{health.conversion_score}%</span>
                  </div>
                  <div className="w-full bg-zinc-200 h-1.5 rounded-full mt-1.5 overflow-hidden">
                    <div
                      className={`h-full ${
                        health.conversion_score >= 70
                          ? 'bg-emerald-500'
                          : health.conversion_score >= 50
                          ? 'bg-amber-500'
                          : 'bg-zinc-500'
                      }`}
                      style={{ width: `${health.conversion_score}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-zinc-400 font-mono mt-1">
                    {metrics.winRate}% win rate
                  </div>
                </div>

                <div className="p-2.5 rounded-md bg-zinc-50/70 border border-zinc-200">
                  <div className="text-[10px] uppercase font-medium text-zinc-500 flex items-center justify-between">
                    <span>Pipeline Stress</span>
                    <span className="font-mono font-medium text-zinc-900">{health.workload_score}%</span>
                  </div>
                  <div className="w-full bg-zinc-200 h-1.5 rounded-full mt-1.5 overflow-hidden">
                    <div
                      className={`h-full ${
                        health.workload_score >= 80
                          ? 'bg-emerald-500'
                          : health.workload_score >= 60
                          ? 'bg-amber-500'
                          : 'bg-red-500'
                      }`}
                      style={{ width: `${health.workload_score}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-zinc-400 font-mono mt-1">
                    {metrics.capacityPct}% capacity load
                  </div>
                </div>
              </div>

              {/* Recommendations & 1-Click Rebalance */}
              <div className="pt-2 border-t border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="space-y-1 flex-1">
                  {health.recommendations.map((rec, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 text-[11px] text-zinc-600">
                      <span className="w-1 h-1 rounded-full bg-zinc-400 shrink-0" />
                      <span>{rec}</span>
                    </div>
                  ))}
                </div>

                {canManage && health.overdue_tasks_count > 0 && (
                  <button
                    onClick={handleRebalance}
                    className="px-2.5 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 text-white font-medium text-[11px] transition flex items-center gap-1.5 shrink-0 shadow-2xs"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span>Rebalance Overdue ({health.overdue_tasks_count})</span>
                  </button>
                )}
              </div>

              {rebalanceFeedback && (
                <div className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded font-mono">
                  {rebalanceFeedback}
                </div>
              )}
            </div>
          )}

          {/* Scorecard Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-white p-3 rounded-lg border border-zinc-200 shadow-2xs">
              <span className="text-[10px] text-zinc-400 uppercase tracking-tight block">Won Deals</span>
              <span className="text-base font-mono font-medium text-zinc-900 mt-0.5 block">
                {metrics.wonCount}{' '}
                <span className="text-[10px] text-zinc-400 font-sans">({metrics.winRate}%)</span>
              </span>
            </div>

            <div className="bg-white p-3 rounded-lg border border-zinc-200 shadow-2xs">
              <span className="text-[10px] text-zinc-400 uppercase tracking-tight block">Gross Profit</span>
              <span className="text-base font-mono font-medium text-emerald-700 mt-0.5 block">
                ${metrics.grossProfit.toLocaleString()}
              </span>
            </div>

            <div className="bg-white p-3 rounded-lg border border-zinc-200 shadow-2xs">
              <span className="text-[10px] text-zinc-400 uppercase tracking-tight block">Response Time</span>
              <span className="text-base font-mono font-medium text-zinc-900 mt-0.5 block">
                {metrics.avgFrtMinutes}m
              </span>
            </div>

            <div className="bg-white p-3 rounded-lg border border-zinc-200 shadow-2xs">
              <span className="text-[10px] text-zinc-400 uppercase tracking-tight block">Incentive Tier</span>
              <span className="text-base font-mono font-medium text-zinc-900 mt-0.5 block">
                {incentive.currentTier.name}
              </span>
            </div>
          </div>

          {/* Tab Selection: Leads vs Activities */}
          <div className="bg-white rounded-lg border border-zinc-200 shadow-2xs overflow-hidden">
            <div className="px-4 py-2 border-b border-zinc-200 flex items-center justify-between bg-zinc-50/50">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setActiveTab('leads')}
                  className={`py-1 text-xs font-medium border-b-2 transition -mb-2 ${
                    activeTab === 'leads'
                      ? 'border-zinc-900 text-zinc-900 font-semibold'
                      : 'border-transparent text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  Assigned Pipeline ({assignedLeads.length})
                </button>
                <button
                  onClick={() => setActiveTab('activities')}
                  className={`py-1 text-xs font-medium border-b-2 transition -mb-2 ${
                    activeTab === 'activities'
                      ? 'border-zinc-900 text-zinc-900 font-semibold'
                      : 'border-transparent text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  Activity Audit ({memberActivities.length})
                </button>
              </div>
            </div>

            <div className="p-4">
              {activeTab === 'leads' ? (
                assignedLeads.length === 0 ? (
                  <div className="py-8 text-center text-zinc-400 font-mono">
                    No active inquiries assigned.
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-100">
                    {assignedLeads.map((lead) => (
                      <div
                        key={lead.id}
                        className="py-2 flex items-center justify-between hover:bg-zinc-50/80 px-2 rounded transition"
                      >
                        <div className="min-w-0 flex-1 pr-3">
                          <div className="flex items-center gap-2 mb-0.5">
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
                            <span className="font-mono text-zinc-700">{lead.budget_range || '$2k'}</span>
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
                )
              ) : (
                memberActivities.length === 0 ? (
                  <div className="py-8 text-center text-zinc-400 font-mono">
                    No activity logs recorded yet.
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
                )
              )}
            </div>
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
    </div>
  );
}
