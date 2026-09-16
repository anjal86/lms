'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Plus, Route, Save, ShieldAlert, UsersRound } from 'lucide-react';
import { useApp } from '@/lib/store';

type TeamMemberRef = { user_id: string; is_active: boolean };
type Team = {
  id: string;
  team_key: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  members?: TeamMemberRef[] | null;
};
type Agent = {
  id: string;
  full_name: string;
  email?: string;
  role: string;
  status?: string;
  is_active?: boolean;
  accepting_leads?: boolean;
  max_capacity?: number | null;
};
type Draft = {
  id: string | null;
  name: string;
  team_key: string;
  description: string;
  is_active: boolean;
  member_ids: string[];
};

const EMPTY_DRAFT: Draft = { id: null, name: '', team_key: '', description: '', is_active: true, member_ids: [] };

function keyFromName(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
}

export default function RoutingTeamsPage() {
  const { currentUser, showToast } = useApp();
  const canManage = currentUser.role === 'admin' || currentUser.role === 'manager';
  const [teams, setTeams] = useState<Team[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [teamResponse, memberResponse] = await Promise.all([
        fetch('/api/routing/teams', { cache: 'no-store' }),
        fetch('/api/team/members', { cache: 'no-store' }),
      ]);
      const teamPayload = await teamResponse.json().catch(() => ({}));
      const memberPayload = await memberResponse.json().catch(() => ({}));
      if (!teamResponse.ok) throw new Error(teamPayload.error || 'Unable to load routing teams.');
      if (!memberResponse.ok) throw new Error(memberPayload.error || 'Unable to load team members.');
      setTeams(Array.isArray(teamPayload.teams) ? teamPayload.teams : []);
      const profiles = Array.isArray(memberPayload.members) ? memberPayload.members : Array.isArray(memberPayload.profiles) ? memberPayload.profiles : [];
      setAgents((profiles as Agent[]).filter((profile) => profile.role === 'agent' && profile.is_active !== false));
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to load routing teams.', 'error');
    } finally {
      setLoading(false);
    }
  }, [canManage, showToast]);

  useEffect(() => { void load(); }, [load]);

  const selectedTeam = useMemo(() => teams.find((team) => team.id === selectedId) || null, [selectedId, teams]);

  useEffect(() => {
    if (!selectedTeam) return;
    setDraft({
      id: selectedTeam.id,
      name: selectedTeam.name,
      team_key: selectedTeam.team_key,
      description: selectedTeam.description || '',
      is_active: selectedTeam.is_active,
      member_ids: (selectedTeam.members || []).filter((member) => member.is_active).map((member) => member.user_id),
    });
  }, [selectedTeam]);

  const newTeam = () => {
    setSelectedId(null);
    setDraft(EMPTY_DRAFT);
  };

  const save = async () => {
    if (!draft.name.trim() || !draft.team_key.trim()) {
      showToast('Team name and key are required.', 'error');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/routing/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to save routing team.');
      const nextTeams = Array.isArray(payload.teams) ? payload.teams as Team[] : teams;
      setTeams(nextTeams);
      const nextId = String(payload.team_id || draft.id || '');
      setSelectedId(nextId || null);
      showToast('Routing team saved.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to save routing team.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleMember = (id: string) => {
    setDraft((current) => ({
      ...current,
      member_ids: current.member_ids.includes(id)
        ? current.member_ids.filter((memberId) => memberId !== id)
        : [...current.member_ids, id],
    }));
  };

  if (!canManage) {
    return <div className="mx-auto max-w-xl px-6 py-20 text-center"><ShieldAlert className="mx-auto h-7 w-7 text-zinc-400" /><h1 className="mt-3 text-lg font-semibold">Manager access required</h1><p className="mt-1 text-sm text-zinc-500">Only managers can configure shared Inbox routing teams.</p></div>;
  }

  return <div className="app-page max-w-6xl">
    <header className="page-header">
      <div><p className="page-eyebrow">Operations</p><h1 className="page-title">Routing teams</h1><p className="page-description">Create real Inbox queues such as Sales, Support or Operations and define which agents are eligible for each queue.</p></div>
      <div className="page-actions"><Link href="/settings/service-levels" className="button-secondary"><ArrowLeft className="h-4 w-4" /> Service levels</Link><button type="button" onClick={newTeam} className="button-primary"><Plus className="h-4 w-4" /> New team</button></div>
    </header>

    <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <section className="surface-flat overflow-hidden">
        <div className="panel-header"><div><h2 className="section-heading">Conversation queues</h2><p className="section-description">{teams.length} configured</p></div></div>
        {loading ? <div className="flex items-center justify-center gap-2 py-16 text-xs text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading teams…</div> : teams.length === 0 ? <div className="px-5 py-14 text-center"><UsersRound className="mx-auto h-6 w-6 text-zinc-300" /><div className="mt-2 text-sm font-semibold text-zinc-700">No routing teams yet</div><p className="mt-1 text-xs text-zinc-400">Create Sales, Support or another operational queue.</p></div> : <div className="divide-y divide-zinc-100">{teams.map((team) => <button key={team.id} type="button" onClick={() => setSelectedId(team.id)} className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${selectedId === team.id ? 'bg-blue-50' : 'hover:bg-zinc-50'}`}><span className={`flex h-8 w-8 items-center justify-center rounded-lg ${selectedId === team.id ? 'bg-blue-100 text-blue-700' : 'bg-zinc-100 text-zinc-500'}`}><UsersRound className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-zinc-900">{team.name}</span><span className="mt-0.5 block text-[10px] text-zinc-400">{(team.members || []).filter((member) => member.is_active).length} agents · {team.is_active ? 'Active' : 'Paused'}</span></span></button>)}</div>}
      </section>

      <section className="surface-flat p-5">
        <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><Route className="h-4 w-4 text-blue-600" /><h2 className="section-heading">{draft.id ? 'Edit routing team' : 'New routing team'}</h2></div><p className="section-description mt-1">When a conversation is routed to this team, only the selected agents are eligible for assignment.</p></div><button type="button" onClick={() => void save()} disabled={saving || loading} className="button-primary">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save team</button></div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-semibold text-zinc-700">Team name<input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value, team_key: current.id ? current.team_key : keyFromName(event.target.value) }))} placeholder="Sales" className="field mt-1.5" /></label>
          <label className="text-xs font-semibold text-zinc-700">Team key<input value={draft.team_key} onChange={(event) => setDraft((current) => ({ ...current, team_key: keyFromName(event.target.value) }))} placeholder="sales" className="field mt-1.5 font-mono" /><span className="mt-1 block text-[10px] font-normal text-zinc-400">Stable routing identifier used by automations and conversations.</span></label>
        </div>
        <label className="mt-4 block text-xs font-semibold text-zinc-700">Description<textarea value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} rows={2} placeholder="Handles new customer inquiries and commercial follow-up." className="field mt-1.5 min-h-16 resize-y" /></label>
        <label className="mt-4 flex items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-zinc-50/70 px-3 py-3 text-sm font-medium text-zinc-800"><span><span className="block">Active queue</span><span className="text-xs font-normal text-zinc-500">Paused teams remain in history but cannot receive new routed conversations.</span></span><input type="checkbox" checked={draft.is_active} onChange={(event) => setDraft((current) => ({ ...current, is_active: event.target.checked }))} /></label>

        <div className="mt-6 border-t border-zinc-100 pt-5"><div className="flex items-center justify-between gap-3"><div><h3 className="text-xs font-semibold text-zinc-900">Eligible agents</h3><p className="mt-1 text-[11px] text-zinc-500">Capacity, availability and accepting-work status are still checked at assignment time.</p></div><span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-semibold text-zinc-600">{draft.member_ids.length} selected</span></div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">{agents.map((agent) => { const selected = draft.member_ids.includes(agent.id); return <button key={agent.id} type="button" onClick={() => toggleMember(agent.id)} className={`flex min-h-14 items-center gap-3 rounded-lg border px-3 text-left transition ${selected ? 'border-blue-200 bg-blue-50' : 'border-zinc-200 bg-white hover:bg-zinc-50'}`}><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${selected ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-600'}`}>{agent.full_name.split(/\s+/).slice(0,2).map((part) => part[0]?.toUpperCase()).join('')}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-zinc-900">{agent.full_name}</span><span className="mt-0.5 block truncate text-[10px] text-zinc-500">{agent.status || 'unknown'} · capacity {agent.max_capacity || 25}{agent.accepting_leads === false ? ' · not accepting' : ''}</span></span><input type="checkbox" readOnly checked={selected} tabIndex={-1} aria-hidden="true" /></button>; })}{agents.length === 0 && <div className="col-span-full rounded-lg border border-dashed border-zinc-200 px-4 py-8 text-center text-xs text-zinc-400">No active agents are available in this workspace.</div>}</div>
        </div>
      </section>
    </div>
  </div>;
}
