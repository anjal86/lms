'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useApp } from '@/lib/store';
import { Profile, Role, AgentStatus } from '@/lib/types';
import TeamMemberDrawer from '@/components/team/TeamMemberDrawer';
import InviteMemberModal from '@/components/team/InviteMemberModal';
import BulkReassignModal from '@/components/team/BulkReassignModal';
import EmployeeHealthModal from '@/components/team/EmployeeHealthModal';
import {
  Users,
  Search,
  UserPlus,
  Table as TableIcon,
  LayoutGrid,
  MapPin,
  Clock,
  TrendingUp,
  Trophy,
  ArrowRight,
  Shield,
  Briefcase,
  SlidersHorizontal,
  ExternalLink,
  Activity,
  Sparkles,
  Zap,
} from 'lucide-react';

export default function TeamPage() {
  useEffect(() => {
    document.title = 'Team Roster & Workload — Wanderlust CRM';
  }, []);

  const { allProfiles, allLeads, currentUser, getAgentMetrics, getAgentIncentiveProfile, getAgentHealthScore } = useApp();

  const [selectedRole, setSelectedRole] = useState<'ALL' | Role>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<'ALL' | AgentStatus>('ALL');
  const [selectedDestination, setSelectedDestination] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  const [selectedMember, setSelectedMember] = useState<Profile | null>(null);
  const [selectedHealthMember, setSelectedHealthMember] = useState<Profile | null>(null);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [reassignSourceAgent, setReassignSourceAgent] = useState<Profile | null>(null);

  // Agency metrics
  const totalAgents = allProfiles.filter((p) => p.role === 'agent');
  const availableAgentsCount = allProfiles.filter(
    (p) => p.status === 'available' && p.is_active && p.accepting_leads
  ).length;

  const totalActiveLeads = allLeads.filter((l) => l.stage !== 'won' && l.stage !== 'lost').length;
  const totalMaxCapacity = totalAgents.reduce((sum, a) => sum + a.max_capacity, 0);
  const totalAgencyCapacityPct =
    totalMaxCapacity > 0 ? Math.round((totalActiveLeads / totalMaxCapacity) * 100) : 0;

  // Team health metrics (0-100 accountability index)
  const agentHealthScores = totalAgents.map((a) => getAgentHealthScore(a.id));
  const avgTeamHealth =
    agentHealthScores.length > 0
      ? Math.round(
          agentHealthScores.reduce((sum, h) => sum + h.overall_score, 0) /
            agentHealthScores.length
        )
      : 85;
  const atRiskCount = agentHealthScores.filter(
    (h) => h.grade === 'attention_needed' || h.grade === 'burnout_risk'
  ).length;

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

  const handleResetFilters = () => {
    setSelectedRole('ALL');
    setSelectedStatus('ALL');
    setSelectedDestination('ALL');
    setSearchQuery('');
  };

  const allDestinations = Array.from(
    new Set(allProfiles.flatMap((p) => p.destination_tags))
  ).filter(Boolean);

  const filteredProfiles = allProfiles.filter((p) => {
    if (selectedRole !== 'ALL' && p.role !== selectedRole) return false;
    if (selectedStatus !== 'ALL' && p.status !== selectedStatus) return false;
    if (selectedDestination !== 'ALL' && !p.destination_tags.includes(selectedDestination))
      return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        p.full_name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        (p.employee_code && p.employee_code.toLowerCase().includes(q)) ||
        p.destination_tags.some((tag) => tag.toLowerCase().includes(q));
      if (!match) return false;
    }

    return true;
  });

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

  const canManage = currentUser.role === 'admin' || currentUser.role === 'manager';

  return (
    <div className="space-y-4 max-w-7xl mx-auto text-xs">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-lg border border-zinc-200 shadow-2xs">
        <div>
          <h1 className="text-base font-semibold text-zinc-900 tracking-tight flex items-center gap-2">
            <Users className="w-4 h-4 text-zinc-500" />
            Team Directory & Workload Capacity
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Consultant profiles, live routing statuses, destination tags, and pipeline limits
          </p>
        </div>

        {canManage && (
          <button
            onClick={() => setIsInviteModalOpen(true)}
            className="px-3 py-1.5 rounded-md bg-zinc-900 text-white font-medium hover:bg-zinc-800 transition flex items-center gap-1.5 shadow-2xs shrink-0 self-start sm:self-auto"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Add Team Member</span>
          </button>
        )}
      </div>

      {/* KPI Bar (Linear / Attio style) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 bg-white p-3 rounded-lg border border-zinc-200 shadow-2xs">
        <div className="px-2">
          <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-tight">
            Total Staff
          </div>
          <div className="text-lg font-mono font-medium text-zinc-900 mt-0.5">
            {allProfiles.length} members
          </div>
          <div className="text-[11px] text-zinc-500 mt-0.5">
            {totalAgents.length} travel consultants
          </div>
        </div>

        <div className="px-2 border-l border-zinc-100">
          <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-tight">
            Agency Workload
          </div>
          <div className="text-lg font-mono font-medium text-zinc-900 mt-0.5">
            {totalActiveLeads} / {totalMaxCapacity} leads
          </div>
          <div className="text-[11px] text-zinc-500 mt-0.5">
            {totalAgencyCapacityPct}% capacity utilization
          </div>
        </div>

        <div className="px-2 border-l border-zinc-100">
          <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-tight">
            Routing Availability
          </div>
          <div className="text-lg font-mono font-medium text-emerald-700 mt-0.5">
            {availableAgentsCount} available
          </div>
          <div className="text-[11px] text-zinc-500 mt-0.5">Taking new round-robin leads</div>
        </div>

        <div className="px-2 border-l border-zinc-100">
          <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-tight">
            Team Health Index
          </div>
          <div className="text-lg font-mono font-medium text-zinc-900 mt-0.5 flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                avgTeamHealth >= 80
                  ? 'bg-emerald-500'
                  : avgTeamHealth >= 65
                  ? 'bg-blue-500'
                  : avgTeamHealth >= 50
                  ? 'bg-amber-500'
                  : 'bg-red-500'
              }`}
            />
            <span>{avgTeamHealth} / 100</span>
          </div>
          <div className="text-[11px] text-zinc-500 mt-0.5">
            {atRiskCount > 0 ? (
              <span className="text-amber-600 font-medium font-mono">{atRiskCount} need attention</span>
            ) : (
              <span className="text-emerald-700 font-medium">All agents healthy</span>
            )}
          </div>
        </div>

        <div className="px-2 border-l border-zinc-100">
          <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-tight">
            Avg Team FRT
          </div>
          <div className="text-lg font-mono font-medium text-zinc-900 mt-0.5">14 mins</div>
          <div className="text-[11px] text-zinc-500 mt-0.5">Target limit: &lt;30m</div>
        </div>
      </div>

      {/* Filters & Controls */}
      <div className="bg-white rounded-lg border border-zinc-200 shadow-2xs p-2.5 flex flex-col md:flex-row md:items-center justify-between gap-2.5">
        {/* Role Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 text-xs">
          {[
            { id: 'ALL', label: 'All Staff', count: allProfiles.length },
            { id: 'agent', label: 'Consultants', count: totalAgents.length },
            {
              id: 'manager',
              label: 'Managers',
              count: allProfiles.filter((p) => p.role === 'manager').length,
            },
            {
              id: 'admin',
              label: 'Admins',
              count: allProfiles.filter((p) => p.role === 'admin').length,
            },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedRole(tab.id as any)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${
                selectedRole === tab.id
                  ? 'bg-zinc-900 text-zinc-50 shadow-2xs'
                  : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`font-mono text-[10px] px-1 py-0.2 rounded ${
                  selectedRole === tab.id ? 'bg-zinc-800 text-zinc-200' : 'bg-zinc-100 text-zinc-500'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search, Status, Destination, View Switcher */}
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 sm:w-52">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search team..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-8 pr-2.5 py-1 border border-zinc-200 rounded-md bg-zinc-50/50 focus:bg-white focus:outline-none"
            />
          </div>

          {/* Status filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value as any)}
            className="text-xs px-2 py-1 border border-zinc-200 rounded-md bg-white text-zinc-700"
          >
            <option value="ALL">All Statuses</option>
            <option value="available">🟢 Available</option>
            <option value="in_call">🔵 In Call</option>
            <option value="on_break">🟡 On Break</option>
            <option value="offline">⚪ Offline</option>
          </select>

          {/* Destination filter */}
          <select
            value={selectedDestination}
            onChange={(e) => setSelectedDestination(e.target.value)}
            className="text-xs px-2 py-1 border border-zinc-200 rounded-md bg-white text-zinc-700"
          >
            <option value="ALL">All Destinations</option>
            {allDestinations.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          {/* View Switcher */}
          <div className="flex bg-zinc-100 p-0.5 rounded-md border border-zinc-200">
            <button
              onClick={() => setViewMode('table')}
              className={`p-1 rounded text-xs transition ${
                viewMode === 'table' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-500 hover:text-zinc-900'
              }`}
              title="Table View"
            >
              <TableIcon className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1 rounded text-xs transition ${
                viewMode === 'grid' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-500 hover:text-zinc-900'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {viewMode === 'table' ? (
        /* High-Density Linear-Style Data Grid */
        <div className="bg-white rounded-lg border border-zinc-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-zinc-50/70 border-b border-zinc-200 text-zinc-500 uppercase tracking-tight text-[10px] font-medium">
                  <th className="py-2 px-3 font-mono">ID</th>
                  <th className="py-2 px-3">Team Member</th>
                  <th className="py-2 px-3">Role & Dept</th>
                  <th className="py-2 px-3">Specializations</th>
                  <th className="py-2 px-3">Live Status</th>
                  <th className="py-2 px-3">Workload / Cap</th>
                  <th className="py-2 px-3">Health & Heartbeat</th>
                  <th className="py-2 px-3">Performance</th>
                  <th className="py-2 px-3">Incentive Tier</th>
                  <th className="py-2 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 font-sans">
                {filteredProfiles.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-zinc-400">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <Users className="w-5 h-5 text-zinc-300 stroke-[1.5]" />
                        <div className="text-xs font-semibold text-zinc-700">No team members found</div>
                        <p className="text-[11px] text-zinc-400 max-w-xs">
                          No staff or consultants match your active role, status, or search query.
                        </p>
                        <button
                          type="button"
                          onClick={handleResetFilters}
                          className="mt-1 px-3 py-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-medium text-xs transition shadow-2xs"
                        >
                          Clear all filters & search
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredProfiles.map((member) => {
                    const metrics = getAgentMetrics(member.id);
                    const incentive = getAgentIncentiveProfile(member.id);
                    const health = getAgentHealthScore(member.id);
                    const heartbeat = getHeartbeat(health.last_active_at);

                    return (
                      <tr
                        key={member.id}
                        onClick={() => setSelectedMember(member)}
                        className="hover:bg-zinc-50/80 transition cursor-pointer group"
                      >
                        {/* Employee Code */}
                        <td className="py-2 px-3 font-mono text-[11px] text-zinc-400">
                          {member.employee_code || 'EMP-000'}
                        </td>

                        {/* Member Identity */}
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2.5">
                            <img
                              src={member.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
                              alt={member.full_name}
                              className="w-7 h-7 rounded-full object-cover border border-zinc-200"
                            />
                            <div>
                              <div className="font-medium text-zinc-900 leading-tight">
                                {member.full_name}
                              </div>
                              <div className="text-[10px] text-zinc-500 font-mono">
                                {member.email}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Role */}
                        <td className="py-2 px-3">
                          <span className="font-medium text-zinc-700 capitalize">
                            {member.role === 'agent' ? 'Consultant' : member.role}
                          </span>
                          <div className="text-[10px] text-zinc-400">
                            {member.office_location || 'HQ'}
                          </div>
                        </td>

                        {/* Specialization Tags */}
                        <td className="py-2 px-3">
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {member.destination_tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="px-1.5 py-0.2 rounded bg-zinc-100 text-zinc-700 text-[10px] font-medium"
                              >
                                {tag}
                              </span>
                            ))}
                            {member.destination_tags.length > 3 && (
                              <span className="text-[10px] text-zinc-400 font-mono">
                                +{member.destination_tags.length - 3}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Status & Routing */}
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-1.5 font-medium text-zinc-800">
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${getStatusDotColor(
                                member.status
                              )}`}
                            />
                            <span className="capitalize">{member.status.replace('_', ' ')}</span>
                          </div>
                          {member.role === 'agent' && (
                            <div className="text-[10px] font-mono mt-0.5">
                              {member.accepting_leads ? (
                                <span className="text-emerald-700">Routing On</span>
                              ) : (
                                <span className="text-zinc-400">Routing Off</span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Workload Capacity */}
                        <td className="py-2 px-3">
                          <div className="flex items-center justify-between text-[11px] mb-1">
                            <span className="font-mono text-zinc-800 font-medium">
                              {metrics.activeLeads} / {member.max_capacity}
                            </span>
                            <span className="font-mono text-[10px] text-zinc-400">
                              {metrics.capacityPct}%
                            </span>
                          </div>
                          <div className="w-24 bg-zinc-200 h-1.5 rounded-full overflow-hidden">
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
                        </td>

                        {/* Health & Heartbeat */}
                        <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                          {member.role === 'agent' ? (
                            <div>
                              <button
                                onClick={() => setSelectedHealthMember(member)}
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50 transition text-[11px] shadow-2xs"
                                title="Inspect Health Score Breakdown & Recommendations"
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    health.overall_score >= 85
                                      ? 'bg-emerald-500'
                                      : health.overall_score >= 70
                                      ? 'bg-blue-500'
                                      : health.overall_score >= 50
                                      ? 'bg-amber-500'
                                      : 'bg-red-500'
                                  }`}
                                />
                                <span className="font-mono font-medium text-zinc-900">{health.overall_score}</span>
                                <span className="text-[10px] text-zinc-400 capitalize">
                                  {health.grade === 'attention_needed'
                                    ? 'attention'
                                    : health.grade === 'burnout_risk'
                                    ? 'risk'
                                    : health.grade}
                                </span>
                              </button>
                              <div
                                suppressHydrationWarning
                                className="text-[10px] font-mono text-zinc-400 mt-0.5 flex items-center gap-1"
                              >
                                <Activity className="w-2.5 h-2.5 text-zinc-400" />
                                <span>{heartbeat.text}</span>
                              </div>
                            </div>
                          ) : (
                            <span className="text-zinc-400 font-mono text-[11px]">—</span>
                          )}
                        </td>

                        {/* Performance Score */}
                        <td className="py-2 px-3 font-mono text-[11px]">
                          <div className="text-zinc-900 font-medium">
                            {metrics.wonCount} won{' '}
                            <span className="text-[10px] text-zinc-400 font-sans">
                              ({metrics.winRate}%)
                            </span>
                          </div>
                          <div className="text-[10px] text-emerald-700">
                            +${metrics.grossProfit.toLocaleString()} profit
                          </div>
                        </td>

                        {/* Incentive Tier */}
                        <td className="py-2 px-3">
                          {member.role === 'agent' ? (
                            <div>
                              <span className="font-medium text-zinc-800 text-[11px]">
                                {incentive.currentTier.name}
                              </span>
                              <div className="text-[10px] font-mono text-zinc-400">
                                ${incentive.accruedCommission.toFixed(0)} accrued
                              </div>
                            </div>
                          ) : (
                            <span className="text-zinc-400 font-mono text-[11px]">—</span>
                          )}
                        </td>

                        {/* Quick Actions */}
                        <td className="py-2 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {canManage && metrics.activeLeads > 0 && (
                              <button
                                onClick={() => setReassignSourceAgent(member)}
                                title="Bulk offload leads"
                                className="px-2 py-1 rounded text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 font-medium text-[10px] transition"
                              >
                                Offload
                              </button>
                            )}

                            {member.role === 'agent' && (
                              <button
                                onClick={() => setSelectedHealthMember(member)}
                                title="Inspect Health & Accountability"
                                className="px-2 py-1 rounded text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 font-medium text-[10px] transition flex items-center gap-1"
                              >
                                <Activity className="w-3 h-3 text-zinc-500" />
                                <span>Health</span>
                              </button>
                            )}

                            <button
                              onClick={() => setSelectedMember(member)}
                              className="px-2 py-1 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-medium text-[11px] transition"
                            >
                              Profile
                            </button>

                            <Link
                              href={`/team/${member.id}`}
                              title="Open Standalone Page"
                              className="p-1 rounded text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 transition"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : filteredProfiles.length === 0 ? (
        <div className="bg-white rounded-lg border border-zinc-200 p-12 text-center text-zinc-400 shadow-2xs">
          <div className="flex flex-col items-center justify-center space-y-2">
            <Users className="w-6 h-6 text-zinc-300 stroke-[1.5]" />
            <div className="text-xs font-semibold text-zinc-700">No team members found</div>
            <p className="text-[11px] text-zinc-400 max-w-xs">
              No staff or consultants match your active role, status, or search query.
            </p>
            <button
              type="button"
              onClick={handleResetFilters}
              className="mt-1 px-3 py-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-medium text-xs transition shadow-2xs"
            >
              Clear all filters & search
            </button>
          </div>
        </div>
      ) : (
        /* Compact Grid View */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredProfiles.map((member) => {
            const metrics = getAgentMetrics(member.id);
            const incentive = getAgentIncentiveProfile(member.id);
            const health = getAgentHealthScore(member.id);
            const heartbeat = getHeartbeat(health.last_active_at);

            return (
              <div
                key={member.id}
                onClick={() => setSelectedMember(member)}
                className="bg-white rounded-lg p-3.5 border border-zinc-200 shadow-2xs hover:border-zinc-300 transition cursor-pointer flex flex-col justify-between space-y-3"
              >
                {/* Card Top */}
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="relative">
                        <img
                          src={member.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
                          alt={member.full_name}
                          className="w-10 h-10 rounded-full object-cover border border-zinc-200"
                        />
                        <span
                          className={`w-2.5 h-2.5 rounded-full border border-white absolute bottom-0 right-0 ${getStatusDotColor(
                            member.status
                          )}`}
                        />
                      </div>
                      <div>
                        <div className="font-semibold text-zinc-900 text-xs flex items-center gap-1.5">
                          <span>{member.full_name}</span>
                          <span className="text-[10px] font-mono text-zinc-400">
                            {member.employee_code}
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-500 capitalize">
                          {member.role === 'agent' ? 'Travel Consultant' : member.role} •{' '}
                          {member.office_location || 'HQ'}
                        </div>
                      </div>
                    </div>

                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 capitalize">
                      {member.status.replace('_', ' ')}
                    </span>
                  </div>

                  {/* Destination tags */}
                  <div className="flex flex-wrap gap-1 mt-3">
                    {member.destination_tags.slice(0, 4).map((tag) => (
                      <span
                        key={tag}
                        className="px-1.5 py-0.2 rounded bg-zinc-100 text-zinc-700 text-[10px] font-medium"
                      >
                        {tag}
                      </span>
                    ))}
                    {member.destination_tags.length > 4 && (
                      <span className="text-[10px] text-zinc-400 font-mono">
                        +{member.destination_tags.length - 4}
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Bottom: Capacity, Health & Performance */}
                <div className="pt-3 border-t border-zinc-100 space-y-2">
                  {/* Capacity Bar */}
                  <div>
                    <div className="flex items-center justify-between text-[10px] mb-1 font-mono">
                      <span className="text-zinc-500">Pipeline Load</span>
                      <span className="font-medium text-zinc-900">
                        {metrics.activeLeads} / {member.max_capacity} ({metrics.capacityPct}%)
                      </span>
                    </div>
                    <div className="w-full bg-zinc-100 h-1.5 rounded-full overflow-hidden">
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

                  {/* Health Pill & Live Heartbeat (for agents) */}
                  {member.role === 'agent' && (
                    <div className="flex items-center justify-between pt-1 border-t border-zinc-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedHealthMember(member);
                        }}
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50 transition text-[11px] shadow-2xs"
                        title="Inspect Health Breakdown & Recommendations"
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            health.overall_score >= 85
                              ? 'bg-emerald-500'
                              : health.overall_score >= 70
                              ? 'bg-blue-500'
                              : health.overall_score >= 50
                              ? 'bg-amber-500'
                              : 'bg-red-500'
                          }`}
                        />
                        <span className="font-mono font-medium text-zinc-900">{health.overall_score}/100</span>
                        <span className="text-[10px] text-zinc-500 capitalize">{health.grade.replace('_', ' ')}</span>
                      </button>

                      <div suppressHydrationWarning className="text-[10px] font-mono text-zinc-400 flex items-center gap-1">
                        <Activity className="w-3 h-3 text-zinc-400" />
                        <span>{heartbeat.text}</span>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[11px] pt-1 text-zinc-600">
                    <span className="font-mono">
                      {metrics.wonCount} won ({metrics.winRate}%)
                    </span>
                    <span className="font-mono text-emerald-700 font-medium">
                      +${metrics.grossProfit.toLocaleString()} profit
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Slide-over Inspection Drawer */}
      {selectedMember && (
        <TeamMemberDrawer
          member={selectedMember}
          isOpen={!!selectedMember}
          onClose={() => setSelectedMember(null)}
        />
      )}

      {/* Add / Invite Member Modal */}
      {isInviteModalOpen && (
        <InviteMemberModal
          isOpen={isInviteModalOpen}
          onClose={() => setIsInviteModalOpen(false)}
        />
      )}

      {/* Bulk Reassign Modal */}
      {reassignSourceAgent && (
        <BulkReassignModal
          sourceAgent={reassignSourceAgent}
          isOpen={!!reassignSourceAgent}
          onClose={() => setReassignSourceAgent(null)}
        />
      )}

      {/* Employee Health & Accountability Modal */}
      {selectedHealthMember && (
        <EmployeeHealthModal
          member={selectedHealthMember}
          isOpen={!!selectedHealthMember}
          onClose={() => setSelectedHealthMember(null)}
        />
      )}
    </div>
  );
}
