'use client';

import React, { useEffect } from 'react';
import { useApp } from '@/lib/store';
import {
  BarChart3,
  Trophy,
  Clock,
  Target,
  TrendingUp,
} from 'lucide-react';

export default function AnalyticsPage() {
  const { allLeads, allProfiles, activities } = useApp();

  useEffect(() => {
    document.title = 'Analytics & Performance — Wanderlust CRM';
  }, []);

  const totalLeads = allLeads.length;
  const wonLeads = allLeads.filter((l) => l.stage === 'won');
  const lostLeads = allLeads.filter((l) => l.stage === 'lost');
  const closedLeadsCount = wonLeads.length + lostLeads.length;
  const winRate = closedLeadsCount > 0 ? Math.round((wonLeads.length / closedLeadsCount) * 100) : 0;
  const totalWonValue = wonLeads.reduce((sum, l) => sum + (l.won_deal_value || 0), 0);

  const leadsWithFrt = allLeads.filter((l) => l.first_response_time_seconds != null);
  const avgFrtSeconds =
    leadsWithFrt.length > 0
      ? Math.round(
          leadsWithFrt.reduce((sum, l) => sum + (l.first_response_time_seconds || 0), 0) /
            leadsWithFrt.length
        )
      : 720;
  const avgFrtMinutes = Math.round(avgFrtSeconds / 60);

  const breachedCount = allLeads.filter((l) => l.is_first_response_breached).length;
  const slaComplianceRate =
    totalLeads > 0 ? Math.round(((totalLeads - breachedCount) / totalLeads) * 100) : 100;

  const agents = allProfiles.filter((p) => p.role === 'agent');

  const leaderboard = agents
    .map((agent) => {
      const agentLeads = allLeads.filter((l) => l.assigned_to === agent.id);
      const agentWon = agentLeads.filter((l) => l.stage === 'won');
      const agentLost = agentLeads.filter((l) => l.stage === 'lost');
      const agentClosed = agentWon.length + agentLost.length;
      const rate = agentClosed > 0 ? Math.round((agentWon.length / agentClosed) * 100) : 0;
      const revenue = agentWon.reduce((sum, l) => sum + (l.won_deal_value || 0), 0);

      const agentFrtLeads = agentLeads.filter((l) => l.first_response_time_seconds != null);
      const agentAvgFrt =
        agentFrtLeads.length > 0
          ? Math.round(
              agentFrtLeads.reduce((s, l) => s + (l.first_response_time_seconds || 0), 0) /
                agentFrtLeads.length /
                60
            )
          : 12;

      const agentBreaches = agentLeads.filter((l) => l.is_first_response_breached).length;
      const agentActivities = activities.filter((a) => a.agent_id === agent.id).length;

      return {
        ...agent,
        totalAssigned: agentLeads.length,
        wonCount: agentWon.length,
        winRate: rate,
        revenue,
        avgFrtMinutes: agentAvgFrt,
        breaches: agentBreaches,
        activityCount: agentActivities,
      };
    })
    .sort((a, b) => b.wonCount - a.wonCount || a.avgFrtMinutes - b.avgFrtMinutes);

  return (
    <div className="space-y-4 max-w-6xl mx-auto text-xs">
      {/* Title */}
      <div>
        <h1 className="text-base font-semibold text-zinc-900 tracking-tight flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-zinc-500" />
          Employee Performance & SLA Metrics
        </h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          Response velocity, conversion rates, and consultant leaderboards
        </p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-white p-3 rounded-lg border border-zinc-200 shadow-2xs">
          <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-tight">Win Rate</div>
          <div className="text-xl font-mono font-medium text-zinc-900 mt-1">{winRate}%</div>
          <div className="text-[11px] text-zinc-500 mt-0.5">{wonLeads.length} won / {closedLeadsCount} closed</div>
        </div>

        <div className="bg-white p-3 rounded-lg border border-zinc-200 shadow-2xs">
          <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-tight">Avg Response (FRT)</div>
          <div className="text-xl font-mono font-medium text-zinc-900 mt-1">{avgFrtMinutes}m</div>
          <div className="text-[11px] text-zinc-500 mt-0.5">Target: &lt;30m limit</div>
        </div>

        <div className="bg-white p-3 rounded-lg border border-zinc-200 shadow-2xs">
          <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-tight">SLA Compliance</div>
          <div className="text-xl font-mono font-medium text-zinc-900 mt-1">{slaComplianceRate}%</div>
          <div className="text-[11px] text-zinc-500 mt-0.5">{breachedCount} breaches recorded</div>
        </div>

        <div className="bg-white p-3 rounded-lg border border-zinc-200 shadow-2xs">
          <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-tight">Converted Revenue</div>
          <div className="text-xl font-mono font-medium text-emerald-700 mt-1">
            ${totalWonValue.toLocaleString()}
          </div>
          <div className="text-[11px] text-zinc-500 mt-0.5">Gross confirmed packages</div>
        </div>
      </div>

      {/* Leaderboard Table */}
      <div className="bg-white rounded-lg border border-zinc-200 shadow-2xs overflow-hidden">
        <div className="px-3 py-2 border-b border-zinc-200/80 bg-zinc-50/50 flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-tight text-zinc-600">
            Consultant Productivity Leaderboard
          </span>
          <span className="text-[11px] font-mono text-zinc-400">rank by won deals</span>
        </div>

        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-zinc-50/70 border-b border-zinc-200 text-zinc-500 uppercase tracking-tight text-[10px] font-medium">
              <th className="py-2 px-3 font-mono">Rank</th>
              <th className="py-2 px-3">Consultant</th>
              <th className="py-2 px-3">Specialty</th>
              <th className="py-2 px-3 text-center">Active Leads</th>
              <th className="py-2 px-3 text-center">Won</th>
              <th className="py-2 px-3 text-center">Win Rate</th>
              <th className="py-2 px-3 text-center">Avg FRT</th>
              <th className="py-2 px-3 text-center">Breaches</th>
              <th className="py-2 px-3 text-right">Revenue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 font-sans">
            {leaderboard.map((agent, index) => (
              <tr key={agent.id} className="hover:bg-zinc-50/80 transition">
                <td className="py-2 px-3 font-mono text-[11px] text-zinc-400">
                  #{index + 1}
                </td>
                <td className="py-2 px-3 font-medium text-zinc-900">
                  <div className="flex items-center gap-2">
                    <img src={agent.avatar_url} alt={agent.full_name} className="w-4 h-4 rounded-full object-cover" />
                    <span>{agent.full_name}</span>
                  </div>
                </td>
                <td className="py-2 px-3 text-zinc-500 text-[11px]">
                  {agent.destination_tags.slice(0, 2).join(', ')}
                </td>
                <td className="py-2 px-3 text-center font-mono text-[11px] text-zinc-700">
                  {agent.totalAssigned}/{agent.max_capacity}
                </td>
                <td className="py-2 px-3 text-center font-mono text-[11px] font-medium text-emerald-700">
                  {agent.wonCount}
                </td>
                <td className="py-2 px-3 text-center font-mono text-[11px] text-zinc-800">
                  {agent.winRate}%
                </td>
                <td className="py-2 px-3 text-center font-mono text-[11px] text-zinc-700">
                  {agent.avgFrtMinutes}m
                </td>
                <td className="py-2 px-3 text-center font-mono text-[11px]">
                  {agent.breaches > 0 ? (
                    <span className="text-red-700 font-medium">{agent.breaches}</span>
                  ) : (
                    <span className="text-zinc-300">0</span>
                  )}
                </td>
                <td className="py-2 px-3 text-right font-mono text-[11px] font-medium text-zinc-900">
                  ${agent.revenue.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
