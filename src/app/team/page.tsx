'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, UserPlus, Users } from 'lucide-react';
import { useApp } from '@/lib/store';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';
import type { AgentStatus, Profile, Role } from '@/lib/types';
import TeamMemberDrawer from '@/components/team/TeamMemberDrawer';
import InviteMemberModal from '@/components/team/InviteMemberModal';
import BulkReassignModal from '@/components/team/BulkReassignModal';
import EmployeeHealthModal from '@/components/team/EmployeeHealthModal';

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

function heartbeat(lastActiveAt: string | undefined, now: number | null) {
  if (!lastActiveAt || now === null) return 'No recent activity';
  const activeAt = new Date(lastActiveAt).getTime();
  if (!Number.isFinite(activeAt)) return 'No recent activity';
  const minutes = Math.floor(Math.max(0, now - activeAt) / 60_000);
  if (minutes < 5) return 'Active now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function statusDot(status: AgentStatus) {
  if (status === 'available') return 'status-dot-success';
  if (status === 'in_call') return 'status-dot-info';
  if (status === 'on_break') return 'status-dot-warning';
  return '';
}

export default function TeamPage() {
  const { allProfiles, allLeads, currentUser, getAgentMetrics, getAgentHealthScore } = useApp();
  const { config, term } = useWorkspace();
  const isTravel = config.workspace.business_type === 'travel' || config.workspace.template_key === 'travel';
  const leadPlural = term('lead_plural', 'Leads');
  const agentLabel = isTravel ? 'Consultant' : 'Agent';
  const agentLabelPlural = isTravel ? 'Consultants' : 'Agents';
  const [role, setRole] = useState<'ALL' | Role>('ALL');
  const [status, setStatus] = useState<'ALL' | AgentStatus>('ALL');
  const [query, setQuery] = useState('');
  const [selectedMember, setSelectedMember] = useState<Profile | null>(null);
  const [selectedHealthMember, setSelectedHealthMember] = useState<Profile | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [reassignSourceAgent, setReassignSourceAgent] = useState<Profile | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    document.title = `Team — ${config.workspace.name} CRM`;
    const update = () => setNow(Date.now());
    const initial = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 60_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [config.workspace.name]);

  const canManage = currentUser.role === 'admin' || currentUser.role === 'manager';
  const agents = allProfiles.filter((profile) => profile.role === 'agent');
  const activeLeads = allLeads.filter((lead) => !['won', 'lost', 'junk'].includes(lead.stage)).length;
  const totalCapacity = agents.reduce((sum, agent) => sum + agent.max_capacity, 0);
  const availableAgents = agents.filter((agent) => agent.is_active && agent.accepting_leads && agent.status === 'available').length;
  const healthScores = agents.map((agent) => getAgentHealthScore(agent.id));
  const averageHealth = healthScores.length
    ? Math.round(healthScores.reduce((sum, item) => sum + item.overall_score, 0) / healthScores.length)
    : 0;
  const needsAttention = healthScores.filter((item) => item.grade === 'attention_needed' || item.grade === 'burnout_risk').length;

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return allProfiles.filter((profile) => {
      if (role !== 'ALL' && profile.role !== role) return false;
      if (status !== 'ALL' && profile.status !== status) return false;
      if (!normalized) return true;
      return profile.full_name.toLowerCase().includes(normalized)
        || profile.email.toLowerCase().includes(normalized)
        || profile.employee_code?.toLowerCase().includes(normalized)
        || profile.destination_tags.some((tag) => tag.toLowerCase().includes(normalized));
    });
  }, [allProfiles, query, role, status]);

  const resetFilters = () => {
    setRole('ALL');
    setStatus('ALL');
    setQuery('');
  };

  return (
    <div className="app-page">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Team</p>
          <h1 className="page-title flex items-center gap-2"><Users className="h-5 w-5 text-zinc-400" /> People & workload</h1>
          <p className="page-description">See who is available, how much work they have, and where help is needed.</p>
        </div>
        {canManage && (
          <div className="page-actions">
            {currentUser.role === 'admin' && <Link href="/team/users" className="button-secondary">Manage logins</Link>}
            <button type="button" onClick={() => setInviteOpen(true)} className="button-primary"><UserPlus className="h-4 w-4" /> Add team member</button>
          </div>
        )}
      </header>

      <section className="metric-grid" aria-label="Team summary">
        <div className="metric"><div className="metric-label">Team members</div><div className="metric-value">{allProfiles.length}</div><div className="metric-hint">{agents.length} {agentLabelPlural.toLowerCase()}</div></div>
        <div className="metric"><div className="metric-label">Active workload</div><div className="metric-value">{activeLeads}/{totalCapacity}</div><div className="metric-hint">{totalCapacity ? Math.round((activeLeads / totalCapacity) * 100) : 0}% of {agentLabel.toLowerCase()} capacity</div></div>
        <div className="metric"><div className="metric-label">Available now</div><div className="metric-value">{availableAgents}</div><div className="metric-hint">{agentLabelPlural} accepting new {leadPlural.toLowerCase()}</div></div>
        <div className="metric"><div className="metric-label">Team health</div><div className="metric-value">{averageHealth || '—'}</div><div className="metric-hint">{needsAttention ? `${needsAttention} need attention` : 'No active health warnings'}</div></div>
      </section>

      <section className="surface-flat overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-1 overflow-x-auto">
            {[
              { id: 'ALL', label: 'All', count: allProfiles.length },
              { id: 'agent', label: agentLabelPlural, count: agents.length },
              { id: 'manager', label: 'Managers', count: allProfiles.filter((profile) => profile.role === 'manager').length },
              { id: 'admin', label: 'Admins', count: allProfiles.filter((profile) => profile.role === 'admin').length },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setRole(item.id as 'ALL' | Role)}
                className={`button-sm whitespace-nowrap rounded-app-sm border ${role === item.id ? 'border-zinc-950 bg-zinc-950 text-white' : 'border-transparent bg-transparent text-zinc-600 hover:bg-zinc-100'}`}
              >
                {item.label} <span className="font-mono text-[10px] opacity-70">{item.count}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} className="field pl-9" placeholder="Search name, email or specialty" />
            </div>
            <select value={status} onChange={(event) => setStatus(event.target.value as 'ALL' | AgentStatus)} className="select-field sm:w-40" aria-label="Filter by availability">
              <option value="ALL">All statuses</option><option value="available">Available</option><option value="in_call">In call</option><option value="on_break">On break</option><option value="offline">Offline</option>
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state"><Users className="h-5 w-5 text-zinc-300" /><h2 className="empty-state-title mt-3">No team members found</h2><p className="empty-state-description">Try another search or clear the current filters.</p><button type="button" onClick={resetFilters} className="button-secondary mt-4">Clear filters</button></div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table>
                <thead><tr><th>Team member</th><th>Role</th><th>Status</th><th>Workload</th><th>Health</th><th>Performance</th><th className="text-right">Actions</th></tr></thead>
                <tbody>
                  {filtered.map((member) => {
                    const metrics = getAgentMetrics(member.id);
                    const health = getAgentHealthScore(member.id);
                    return (
                      <tr key={member.id} className="cursor-pointer" onClick={() => setSelectedMember(member)}>
                        <td>
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[10px] font-bold text-zinc-600">{initials(member.full_name)}</span>
                            <div><div className="font-semibold text-zinc-900">{member.full_name}</div><div className="mt-0.5 text-[10px] text-zinc-400">{member.email} · {member.employee_code || 'No code'}</div></div>
                          </div>
                        </td>
                        <td><div className="text-xs font-medium capitalize text-zinc-700">{member.role === 'agent' ? agentLabel : member.role}</div><div className="mt-0.5 text-[10px] text-zinc-400">{member.destination_tags.slice(0, 2).join(' · ') || 'General'}</div></td>
                        <td><span className="status-line"><span className={`status-dot ${statusDot(member.status)}`} />{member.status.replace('_', ' ')}</span>{member.role === 'agent' && <div className="mt-1 text-[10px] text-zinc-400">{member.accepting_leads ? `Accepting new ${leadPlural.toLowerCase()}` : 'Routing paused'}</div>}</td>
                        <td><div className="font-mono text-[11px] font-semibold text-zinc-800">{metrics.activeLeads}/{member.max_capacity}</div><div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-zinc-100"><div className={`h-full ${metrics.capacityPct >= 90 ? 'bg-red-500' : metrics.capacityPct >= 70 ? 'bg-amber-500' : 'bg-zinc-700'}`} style={{ width: `${Math.min(metrics.capacityPct, 100)}%` }} /></div></td>
                        <td onClick={(event) => event.stopPropagation()}>{member.role === 'agent' ? <button type="button" onClick={() => setSelectedHealthMember(member)} className="button-ghost button-sm"><span className={`status-dot ${health.overall_score >= 80 ? 'status-dot-success' : health.overall_score >= 60 ? 'status-dot-warning' : 'status-dot-danger'}`} /><span className="font-mono">{health.overall_score}</span><span>{heartbeat(health.last_active_at, now)}</span></button> : <span className="text-zinc-400">—</span>}</td>
                        <td><div className="font-mono text-[11px] font-semibold text-zinc-800">{metrics.wonCount} won · {metrics.winRate}%</div><div className="mt-0.5 text-[10px] text-zinc-400">{metrics.activeLeads} active {leadPlural.toLowerCase()}</div></td>
                        <td onClick={(event) => event.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            {canManage && member.role === 'agent' && metrics.activeLeads > 0 && <button type="button" onClick={() => setReassignSourceAgent(member)} className="button-ghost button-sm">Reassign</button>}
                            <button type="button" onClick={() => setSelectedMember(member)} className="button-secondary button-sm">Open</button>
                            <Link href={`/team/${member.id}`} className="button-ghost button-sm">Full profile</Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-line md:hidden">
              {filtered.map((member) => {
                const metrics = getAgentMetrics(member.id);
                const health = getAgentHealthScore(member.id);
                return (
                  <article key={member.id} className="p-4" onClick={() => setSelectedMember(member)}>
                    <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[10px] font-bold text-zinc-600">{initials(member.full_name)}</span><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-zinc-900">{member.full_name}</div><div className="mt-1 flex items-center gap-2 text-xs text-zinc-500"><span className="capitalize">{member.role === 'agent' ? agentLabel : member.role}</span><span className="status-line"><span className={`status-dot ${statusDot(member.status)}`} />{member.status.replace('_', ' ')}</span></div></div></div>
                    <div className="mt-3 grid grid-cols-3 gap-3 border-t border-line pt-3"><div><div className="text-[10px] uppercase tracking-wide text-zinc-400">Workload</div><div className="mt-1 font-mono text-xs font-semibold text-zinc-800">{metrics.activeLeads}/{member.max_capacity}</div></div><div><div className="text-[10px] uppercase tracking-wide text-zinc-400">Won</div><div className="mt-1 font-mono text-xs font-semibold text-zinc-800">{metrics.wonCount}</div></div><div><div className="text-[10px] uppercase tracking-wide text-zinc-400">Health</div><div className="mt-1 font-mono text-xs font-semibold text-zinc-800">{member.role === 'agent' ? health.overall_score : '—'}</div></div></div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>

      {selectedMember && <TeamMemberDrawer member={selectedMember} isOpen onClose={() => setSelectedMember(null)} />}
      {inviteOpen && <InviteMemberModal isOpen onClose={() => setInviteOpen(false)} />}
      {reassignSourceAgent && <BulkReassignModal sourceAgent={reassignSourceAgent} isOpen onClose={() => setReassignSourceAgent(null)} />}
      {selectedHealthMember && <EmployeeHealthModal member={selectedHealthMember} isOpen onClose={() => setSelectedHealthMember(null)} />}
    </div>
  );
}
