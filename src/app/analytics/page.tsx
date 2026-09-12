'use client';

import { useEffect, useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import { useApp } from '@/lib/store';

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

export default function AnalyticsPage() {
  const { allLeads, allProfiles, activities, formatCurrency } = useApp();

  useEffect(() => {
    document.title = 'Performance — Wanderlust CRM';
  }, []);

  const metrics = useMemo(() => {
    const won = allLeads.filter((lead) => lead.stage === 'won');
    const lost = allLeads.filter((lead) => lead.stage === 'lost');
    const closed = won.length + lost.length;
    const firstResponses = allLeads.filter((lead) => lead.first_response_time_seconds != null);
    const averageResponseSeconds = firstResponses.length
      ? Math.round(firstResponses.reduce((sum, lead) => sum + (lead.first_response_time_seconds || 0), 0) / firstResponses.length)
      : 0;
    const breached = allLeads.filter((lead) => lead.is_first_response_breached).length;

    return {
      winRate: closed ? Math.round((won.length / closed) * 100) : 0,
      wonCount: won.length,
      closedCount: closed,
      averageResponseMinutes: Math.round(averageResponseSeconds / 60),
      responseOnTime: allLeads.length ? Math.round(((allLeads.length - breached) / allLeads.length) * 100) : 100,
      lateReplies: breached,
      wonValue: won.reduce((sum, lead) => sum + Number(lead.package_sale_price || lead.won_deal_value || 0), 0),
    };
  }, [allLeads]);

  const leaderboard = useMemo(() => allProfiles
    .filter((profile) => profile.role === 'agent' && profile.is_active)
    .map((agent) => {
      const agentLeads = allLeads.filter((lead) => lead.assigned_to === agent.id);
      const active = agentLeads.filter((lead) => !['won', 'lost', 'junk'].includes(lead.stage));
      const won = agentLeads.filter((lead) => lead.stage === 'won');
      const lost = agentLeads.filter((lead) => lead.stage === 'lost');
      const closed = won.length + lost.length;
      const responseLeads = agentLeads.filter((lead) => lead.first_response_time_seconds != null);
      const averageResponse = responseLeads.length
        ? Math.round(responseLeads.reduce((sum, lead) => sum + (lead.first_response_time_seconds || 0), 0) / responseLeads.length / 60)
        : null;

      return {
        ...agent,
        activeCount: active.length,
        wonCount: won.length,
        winRate: closed ? Math.round((won.length / closed) * 100) : 0,
        averageResponse,
        lateReplies: agentLeads.filter((lead) => lead.is_first_response_breached).length,
        wonValue: won.reduce((sum, lead) => sum + Number(lead.package_sale_price || lead.won_deal_value || 0), 0),
        activityCount: activities.filter((activity) => activity.agent_id === agent.id).length,
      };
    })
    .sort((a, b) => b.wonCount - a.wonCount || (a.averageResponse ?? Number.MAX_SAFE_INTEGER) - (b.averageResponse ?? Number.MAX_SAFE_INTEGER)), [activities, allLeads, allProfiles]);

  return (
    <div className="app-page">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Insights</p>
          <h1 className="page-title flex items-center gap-2"><BarChart3 className="h-5 w-5 text-zinc-400" /> Team performance</h1>
          <p className="page-description">A simple view of conversion, response speed, and each consultant’s active workload.</p>
        </div>
      </header>

      <section className="metric-grid" aria-label="Performance summary">
        <div className="metric"><div className="metric-label">Win rate</div><div className="metric-value">{metrics.winRate}%</div><div className="metric-hint">{metrics.wonCount} won from {metrics.closedCount} closed</div></div>
        <div className="metric"><div className="metric-label">Average first reply</div><div className="metric-value">{metrics.averageResponseMinutes}m</div><div className="metric-hint">Across leads with a recorded first response</div></div>
        <div className="metric"><div className="metric-label">Replies on time</div><div className="metric-value">{metrics.responseOnTime}%</div><div className="metric-hint">{metrics.lateReplies} late first replies</div></div>
        <div className="metric"><div className="metric-label">Won value</div><div className="metric-value">{formatCurrency(metrics.wonValue)}</div><div className="metric-hint">Confirmed package value</div></div>
      </section>

      <section className="surface-flat overflow-hidden">
        <div className="panel-header">
          <div><h2 className="section-heading">Consultants</h2><p className="section-description">Ordered by won deals, then response speed.</p></div>
        </div>

        {leaderboard.length === 0 ? (
          <div className="empty-state"><BarChart3 className="h-5 w-5 text-zinc-300" /><h2 className="empty-state-title mt-3">No consultant data yet</h2><p className="empty-state-description">Performance appears after leads are assigned and worked.</p></div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table>
                <thead><tr><th className="w-16">Rank</th><th>Consultant</th><th>Active</th><th>Won</th><th>Win rate</th><th>Avg reply</th><th>Late replies</th><th className="text-right">Won value</th></tr></thead>
                <tbody>
                  {leaderboard.map((agent, index) => (
                    <tr key={agent.id}>
                      <td className="font-mono text-[11px] text-zinc-400">#{index + 1}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[9px] font-bold text-zinc-600">{initials(agent.full_name)}</span>
                          <div><div className="font-semibold text-zinc-900">{agent.full_name}</div><div className="mt-0.5 text-[10px] text-zinc-400">{agent.destination_tags.slice(0, 2).join(' · ') || 'General'}</div></div>
                        </div>
                      </td>
                      <td className="font-mono text-[11px]">{agent.activeCount}/{agent.max_capacity}</td>
                      <td className="font-mono text-[11px] font-semibold text-zinc-900">{agent.wonCount}</td>
                      <td className="font-mono text-[11px]">{agent.winRate}%</td>
                      <td className="font-mono text-[11px]">{agent.averageResponse == null ? '—' : `${agent.averageResponse}m`}</td>
                      <td><span className="status-line"><span className={`status-dot ${agent.lateReplies ? 'status-dot-danger' : 'status-dot-success'}`} />{agent.lateReplies}</span></td>
                      <td className="text-right font-mono text-[11px] font-semibold text-zinc-900">{formatCurrency(agent.wonValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-line md:hidden">
              {leaderboard.map((agent, index) => (
                <article key={agent.id} className="p-4">
                  <div className="flex items-center gap-3"><span className="font-mono text-[10px] text-zinc-400">#{index + 1}</span><span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-[10px] font-bold text-zinc-600">{initials(agent.full_name)}</span><div><div className="text-sm font-semibold text-zinc-900">{agent.full_name}</div><div className="mt-0.5 text-[11px] text-zinc-500">{agent.activeCount} active · {agent.wonCount} won</div></div></div>
                  <div className="mt-3 grid grid-cols-3 gap-3 border-t border-line pt-3">
                    <div><div className="text-[10px] uppercase tracking-wide text-zinc-400">Win rate</div><div className="mt-1 font-mono text-xs font-semibold text-zinc-800">{agent.winRate}%</div></div>
                    <div><div className="text-[10px] uppercase tracking-wide text-zinc-400">Avg reply</div><div className="mt-1 font-mono text-xs font-semibold text-zinc-800">{agent.averageResponse == null ? '—' : `${agent.averageResponse}m`}</div></div>
                    <div><div className="text-[10px] uppercase tracking-wide text-zinc-400">Won value</div><div className="mt-1 truncate font-mono text-xs font-semibold text-zinc-800">{formatCurrency(agent.wonValue)}</div></div>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
