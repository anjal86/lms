'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  KeyRound,
  Loader2,
  MessageSquare,
  Play,
  PlugZap,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import { useApp } from '@/lib/store';
import type { AiProviderPreset } from '@/lib/ai/provider-catalog';

type AgentConnectionRef = { connection_id: string; is_enabled: boolean };
type Agent = {
  id: string;
  name: string;
  description?: string | null;
  provider?: string | null;
  provider_config_id?: string | null;
  model: string;
  instructions: string;
  tone: string;
  languages: string[];
  mode: 'off' | 'assist' | 'auto' | 'auto_handoff';
  is_active: boolean;
  temperature: number | string;
  confidence_threshold: number | string;
  response_delay_min_seconds: number;
  response_delay_max_seconds: number;
  handoff_team_key?: string | null;
  handoff_keywords: string[];
  allow_when_human_assigned: boolean;
  connections?: AgentConnectionRef[] | null;
};

type AiProvider = {
  id: string;
  name: string;
  provider: string;
  is_active: boolean;
  has_api_key: boolean;
};

type Connection = {
  id: string;
  provider: string;
  display_name?: string | null;
  external_account_id?: string | null;
  status: string;
};

type RoutingTeam = { team_key: string; name: string; is_active: boolean };

type Draft = {
  id: string | null;
  name: string;
  description: string;
  provider_config_id: string;
  model: string;
  instructions: string;
  tone: string;
  languagesText: string;
  mode: Agent['mode'];
  is_active: boolean;
  temperature: number;
  confidence_threshold: number;
  response_delay_min_seconds: number;
  response_delay_max_seconds: number;
  handoff_team_key: string;
  handoffKeywordsText: string;
  allow_when_human_assigned: boolean;
  connection_ids: string[];
};

const EMPTY_DRAFT: Draft = {
  id: null,
  name: '',
  description: '',
  provider_config_id: '',
  model: 'mistral-medium-latest',
  instructions: 'Answer accurately and concisely using only the CRM context provided. Ask a short clarifying question when essential information is missing.',
  tone: 'professional and friendly',
  languagesText: 'auto',
  mode: 'assist',
  is_active: false,
  temperature: 0.3,
  confidence_threshold: 0.65,
  response_delay_min_seconds: 2,
  response_delay_max_seconds: 8,
  handoff_team_key: '',
  handoffKeywordsText: 'human, person, manager, complaint, refund',
  allow_when_human_assigned: false,
  connection_ids: [],
};

const MODE_HELP: Record<Agent['mode'], string> = {
  off: 'Disabled. The agent never processes live messages.',
  assist: 'Creates a draft for staff but never sends automatically.',
  auto: 'Replies automatically when the AI chooses reply.',
  auto_handoff: 'Replies automatically, but hands off when confidence is low or the request needs a human.',
};

function csv(value: string) {
  return Array.from(new Set(value.split(',').map((part) => part.trim()).filter(Boolean)));
}

function toDraft(agent: Agent): Draft {
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description || '',
    provider_config_id: agent.provider_config_id || '',
    model: agent.model,
    instructions: agent.instructions || '',
    tone: agent.tone || 'professional and friendly',
    languagesText: (agent.languages || ['auto']).join(', '),
    mode: agent.mode,
    is_active: agent.is_active,
    temperature: Number(agent.temperature) || 0.3,
    confidence_threshold: Number(agent.confidence_threshold) || 0.65,
    response_delay_min_seconds: agent.response_delay_min_seconds ?? 2,
    response_delay_max_seconds: agent.response_delay_max_seconds ?? 8,
    handoff_team_key: agent.handoff_team_key || '',
    handoffKeywordsText: (agent.handoff_keywords || []).join(', '),
    allow_when_human_assigned: agent.allow_when_human_assigned === true,
    connection_ids: (agent.connections || []).filter((row) => row.is_enabled).map((row) => row.connection_id),
  };
}

export default function AiAgentsPage() {
  const { currentUser, showToast } = useApp();
  const canManage = currentUser.role === 'admin' || currentUser.role === 'manager';
  const [agents, setAgents] = useState<Agent[]>([]);
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [providerPresets, setProviderPresets] = useState<AiProviderPreset[]>([]);
  const [legacyMistralConfigured, setLegacyMistralConfigured] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [teams, setTeams] = useState<RoutingTeam[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testMessage, setTestMessage] = useState('Hi, can you tell me more about your service and what I should do next?');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    if (!canManage) { setLoading(false); return; }
    setLoading(true);
    try {
      const [agentResponse, providerResponse, connectionResponse, teamResponse] = await Promise.all([
        fetch('/api/settings/ai-agents', { cache: 'no-store' }),
        fetch('/api/settings/ai-providers', { cache: 'no-store' }),
        fetch('/api/integrations/connections', { cache: 'no-store' }),
        fetch('/api/routing/teams', { cache: 'no-store' }),
      ]);
      const agentPayload = await agentResponse.json().catch(() => ({}));
      const providerPayload = await providerResponse.json().catch(() => ({}));
      const connectionPayload = await connectionResponse.json().catch(() => ({}));
      const teamPayload = await teamResponse.json().catch(() => ({}));
      if (!agentResponse.ok) throw new Error(agentPayload.error || 'Unable to load AI agents.');
      if (!providerResponse.ok) throw new Error(providerPayload.error || 'Unable to load AI providers.');

      const nextAgents = Array.isArray(agentPayload.agents) ? agentPayload.agents as Agent[] : [];
      const nextProviders = (Array.isArray(providerPayload.providers) ? providerPayload.providers : []) as AiProvider[];
      setAgents(nextAgents);
      setProviders(nextProviders.filter((provider) => provider.is_active));
      setProviderPresets(Array.isArray(providerPayload.presets) ? providerPayload.presets : []);
      setLegacyMistralConfigured(agentPayload.legacy_provider?.configured === true);

      const connectionRows = Array.isArray(connectionPayload.connections)
        ? connectionPayload.connections
        : Array.isArray(connectionPayload.items) ? connectionPayload.items : [];
      setConnections((connectionRows as Connection[]).filter((row) => ['whatsapp','facebook','instagram'].includes(row.provider) && row.status !== 'disconnected'));
      setTeams((Array.isArray(teamPayload.teams) ? teamPayload.teams : []).filter((team: RoutingTeam) => team.is_active));
      if (!selectedId && nextAgents[0]) {
        setSelectedId(nextAgents[0].id);
        setDraft(toDraft(nextAgents[0]));
      } else if (!selectedId && nextProviders[0]) {
        const preset = (Array.isArray(providerPayload.presets) ? providerPayload.presets : []).find((row: AiProviderPreset) => row.id === nextProviders[0].provider);
        setDraft((current) => ({ ...current, provider_config_id: nextProviders[0].id, model: preset?.modelPlaceholder || current.model }));
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to load AI agent settings.', 'error');
    } finally {
      setLoading(false);
    }
  }, [canManage, selectedId, showToast]);

  useEffect(() => { void load(); }, [load]);

  const selected = useMemo(() => agents.find((agent) => agent.id === selectedId) || null, [agents, selectedId]);
  const selectedProvider = useMemo(() => providers.find((provider) => provider.id === draft.provider_config_id) || null, [providers, draft.provider_config_id]);
  const selectedPreset = useMemo(() => providerPresets.find((preset) => preset.id === selectedProvider?.provider) || null, [providerPresets, selectedProvider]);

  const chooseAgent = (agent: Agent) => {
    setSelectedId(agent.id);
    setDraft(toDraft(agent));
    setTestResult(null);
  };

  const newAgent = () => {
    setSelectedId(null);
    const provider = providers[0];
    const preset = providerPresets.find((row) => row.id === provider?.provider);
    setDraft({ ...EMPTY_DRAFT, provider_config_id: provider?.id || '', model: preset?.modelPlaceholder || EMPTY_DRAFT.model });
    setTestResult(null);
  };

  const toggleConnection = (id: string) => {
    setDraft((current) => ({
      ...current,
      connection_ids: current.connection_ids.includes(id)
        ? current.connection_ids.filter((value) => value !== id)
        : [...current.connection_ids, id],
    }));
  };

  const chooseProvider = (id: string) => {
    const provider = providers.find((row) => row.id === id);
    const preset = providerPresets.find((row) => row.id === provider?.provider);
    setDraft((current) => ({ ...current, provider_config_id: id, model: preset?.modelPlaceholder || current.model }));
  };

  const save = async () => {
    if (!draft.name.trim()) { showToast('Give the AI agent a name.', 'error'); return; }
    setSaving(true);
    try {
      const response = await fetch('/api/settings/ai-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: draft.id,
          name: draft.name,
          description: draft.description || null,
          provider_config_id: draft.provider_config_id || null,
          model: draft.model,
          instructions: draft.instructions,
          tone: draft.tone,
          languages: csv(draft.languagesText).length ? csv(draft.languagesText) : ['auto'],
          mode: draft.mode,
          is_active: draft.is_active,
          temperature: draft.temperature,
          confidence_threshold: draft.confidence_threshold,
          response_delay_min_seconds: draft.response_delay_min_seconds,
          response_delay_max_seconds: draft.response_delay_max_seconds,
          handoff_team_key: draft.handoff_team_key || null,
          handoff_keywords: csv(draft.handoffKeywordsText),
          allow_when_human_assigned: draft.allow_when_human_assigned,
          connection_ids: draft.connection_ids,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to save AI agent.');
      const saved = payload.agent as Agent;
      setAgents((current) => [saved, ...current.filter((agent) => agent.id !== saved.id)]);
      setSelectedId(saved.id);
      setDraft(toDraft(saved));
      showToast('AI agent saved.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to save AI agent.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    if (!draft.id) { showToast('Save the agent before testing it.', 'error'); return; }
    if (!testMessage.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const response = await fetch(`/api/settings/ai-agents/${draft.id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: testMessage }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Agent test failed.');
      setTestResult(payload.decision || null);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Agent test failed.', 'error');
    } finally {
      setTesting(false);
    }
  };

  if (!canManage) {
    return <div className="mx-auto max-w-xl px-6 py-20 text-center"><ShieldCheck className="mx-auto h-7 w-7 text-zinc-400" /><h1 className="mt-3 text-lg font-semibold">Manager access required</h1><p className="mt-1 text-sm text-zinc-500">Only workspace managers can configure customer-facing AI agents.</p></div>;
  }

  const noProviderAvailable = providers.length === 0 && !legacyMistralConfigured;

  return <div className="app-page max-w-7xl space-y-5">
    <header className="page-header">
      <div><p className="page-eyebrow">Workspace intelligence</p><h1 className="page-title">AI Agents</h1><p className="page-description">Build customer-facing agents with your own LLM provider, then choose whether they draft, reply automatically, or hand off to staff.</p></div>
      <div className="page-actions"><Link href="/settings/workspace" className="button-secondary"><ArrowLeft className="h-4 w-4" /> Settings</Link><Link href="/settings/ai-providers" className="button-secondary"><KeyRound className="h-4 w-4" /> Providers</Link><button type="button" onClick={newAgent} className="button-primary"><Plus className="h-4 w-4" /> New agent</button></div>
    </header>

    {noProviderAvailable && <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div><div className="font-semibold">No AI provider is configured</div><p className="mt-0.5 text-xs text-amber-700">Add your OpenAI, Anthropic, Gemini, Mistral, OpenRouter, Groq, DeepSeek, xAI, Together, Fireworks, or custom-compatible key before activating an agent. <Link href="/settings/ai-providers" className="font-semibold underline">Configure provider</Link></p></div></div>}

    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="surface-flat overflow-hidden">
        <div className="panel-header"><div><h2 className="section-heading">Workspace agents</h2><p className="section-description">{agents.length} configured</p></div></div>
        {loading ? <div className="flex items-center justify-center gap-2 py-16 text-xs text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading agents…</div> : agents.length === 0 ? <div className="px-5 py-14 text-center"><Bot className="mx-auto h-7 w-7 text-zinc-300" /><div className="mt-2 text-sm font-semibold text-zinc-700">No AI agents yet</div><p className="mt-1 text-xs text-zinc-400">Create one and test it before enabling live replies.</p></div> : <div className="divide-y divide-zinc-100">{agents.map((agent) => { const provider = providers.find((row) => row.id === agent.provider_config_id); return <button key={agent.id} type="button" onClick={() => chooseAgent(agent)} className={`flex w-full items-start gap-3 px-4 py-3 text-left ${selectedId === agent.id ? 'bg-blue-50' : 'hover:bg-zinc-50'}`}><span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${selectedId === agent.id ? 'bg-blue-100 text-blue-700' : 'bg-zinc-100 text-zinc-500'}`}><Bot className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-zinc-900">{agent.name}</span><span className="mt-0.5 block text-[10px] capitalize text-zinc-500">{agent.mode.replace('_', ' ')} · {agent.is_active ? 'Active' : 'Inactive'}</span><span className="mt-1 block truncate text-[9px] text-zinc-400">{provider?.name || 'Legacy Mistral'} · <span className="font-mono">{agent.model}</span></span></span></button>; })}</div>}
      </aside>

      <main className="space-y-4">
        <section className="surface-flat p-5">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-blue-600" /><h2 className="section-heading">{draft.id ? 'Agent configuration' : 'New AI agent'}</h2></div><p className="section-description mt-1">Start in Assist mode. Enable automatic sending only after the Test Agent output matches your workflow.</p></div><button type="button" onClick={() => void save()} disabled={saving || loading} className="button-primary">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save agent</button></div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-semibold text-zinc-700">Agent name<input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Syourai AI Counsellor" className="field mt-1.5" /></label>
            <label className="text-xs font-semibold text-zinc-700">AI provider<select value={draft.provider_config_id} onChange={(event) => chooseProvider(event.target.value)} className="select-field mt-1.5"><option value="">{legacyMistralConfigured ? 'Server Mistral · legacy' : 'Select provider…'}</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-semibold text-zinc-700">Model ID<input value={draft.model} onChange={(event) => setDraft((current) => ({ ...current, model: event.target.value }))} placeholder={selectedPreset?.modelPlaceholder || 'provider-model-id'} className="field mt-1.5 font-mono text-xs" /><span className="mt-1 block text-[10px] font-normal text-zinc-400">Use the exact model ID from your provider.</span></label>
            <label className="text-xs font-semibold text-zinc-700">Description<input value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Handles initial counselling and qualification." className="field mt-1.5" /></label>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
            <label className="text-xs font-semibold text-zinc-700">Instructions<textarea value={draft.instructions} onChange={(event) => setDraft((current) => ({ ...current, instructions: event.target.value }))} rows={9} className="field mt-1.5 min-h-48 resize-y text-sm leading-6" placeholder="Explain the agent's role, what it may answer, what it must never promise, and when it should hand off." /></label>
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-zinc-700">Operating mode<select value={draft.mode} onChange={(event) => setDraft((current) => ({ ...current, mode: event.target.value as Agent['mode'] }))} className="select-field mt-1.5"><option value="off">Off</option><option value="assist">Assist · Draft only</option><option value="auto">Auto reply</option><option value="auto_handoff">Auto + handoff</option></select><span className="mt-1.5 block text-[10px] font-normal leading-4 text-zinc-500">{MODE_HELP[draft.mode]}</span></label>
              <label className="block text-xs font-semibold text-zinc-700">Tone<input value={draft.tone} onChange={(event) => setDraft((current) => ({ ...current, tone: event.target.value }))} className="field mt-1.5" /></label>
              <label className="block text-xs font-semibold text-zinc-700">Languages<input value={draft.languagesText} onChange={(event) => setDraft((current) => ({ ...current, languagesText: event.target.value }))} placeholder="auto, Nepali, English" className="field mt-1.5" /><span className="mt-1 block text-[10px] font-normal text-zinc-400">Comma separated. “auto” follows the customer.</span></label>
            </div>
          </div>
        </section>

        <section className="surface-flat p-5">
          <div className="flex items-center gap-2"><PlugZap className="h-4 w-4 text-blue-600" /><h2 className="section-heading">Channels</h2></div><p className="section-description mt-1">A channel account can belong to only one active workspace AI agent, preventing two bots from replying to the same conversation.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">{connections.map((connection) => { const active = draft.connection_ids.includes(connection.id); return <button key={connection.id} type="button" onClick={() => toggleConnection(connection.id)} className={`flex min-h-14 items-center gap-3 rounded-lg border px-3 text-left ${active ? 'border-blue-200 bg-blue-50' : 'border-zinc-200 hover:bg-zinc-50'}`}><MessageSquare className={`h-4 w-4 shrink-0 ${active ? 'text-blue-700' : 'text-zinc-400'}`} /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-zinc-900">{connection.display_name || connection.external_account_id || connection.provider}</span><span className="mt-0.5 block text-[10px] capitalize text-zinc-500">{connection.provider} · {connection.status}</span></span><input type="checkbox" checked={active} readOnly tabIndex={-1} aria-hidden="true" /></button>; })}{connections.length === 0 && <div className="col-span-full rounded-lg border border-dashed border-zinc-200 p-6 text-center text-xs text-zinc-400">Connect WhatsApp, Facebook or Instagram before enabling live AI.</div>}</div>
        </section>

        <section className="surface-flat p-5">
          <div className="flex items-center gap-2"><UsersRound className="h-4 w-4 text-blue-600" /><h2 className="section-heading">Safety & handoff</h2></div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-semibold text-zinc-700">Confidence threshold<input type="number" min="0" max="1" step="0.05" value={draft.confidence_threshold} onChange={(event) => setDraft((current) => ({ ...current, confidence_threshold: Number(event.target.value) }))} className="field mt-1.5" /></label>
            <label className="text-xs font-semibold text-zinc-700">Minimum delay · sec<input type="number" min="0" max="120" value={draft.response_delay_min_seconds} onChange={(event) => setDraft((current) => ({ ...current, response_delay_min_seconds: Number(event.target.value) }))} className="field mt-1.5" /></label>
            <label className="text-xs font-semibold text-zinc-700">Maximum delay · sec<input type="number" min="0" max="180" value={draft.response_delay_max_seconds} onChange={(event) => setDraft((current) => ({ ...current, response_delay_max_seconds: Number(event.target.value) }))} className="field mt-1.5" /></label>
            <label className="text-xs font-semibold text-zinc-700">Handoff team<select value={draft.handoff_team_key} onChange={(event) => setDraft((current) => ({ ...current, handoff_team_key: event.target.value }))} className="select-field mt-1.5"><option value="">Unassigned queue</option>{teams.map((team) => <option key={team.team_key} value={team.team_key}>{team.name}</option>)}</select></label>
          </div>
          <label className="mt-4 block text-xs font-semibold text-zinc-700">Handoff keywords<input value={draft.handoffKeywordsText} onChange={(event) => setDraft((current) => ({ ...current, handoffKeywordsText: event.target.value }))} className="field mt-1.5" /><span className="mt-1 block text-[10px] font-normal text-zinc-400">Comma separated. Matching a live customer message sends it to a human without asking the LLM to improvise.</span></label>
          <div className="mt-4 grid gap-2 sm:grid-cols-2"><label className="flex items-start gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3"><input type="checkbox" checked={draft.is_active} onChange={(event) => setDraft((current) => ({ ...current, is_active: event.target.checked }))} className="mt-0.5" /><span><span className="block text-xs font-semibold text-zinc-900">Agent active</span><span className="mt-0.5 block text-[10px] leading-4 text-zinc-500">The agent can be selected for live channel work. Mode still controls whether it drafts or sends.</span></span></label><label className="flex items-start gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3"><input type="checkbox" checked={draft.allow_when_human_assigned} onChange={(event) => setDraft((current) => ({ ...current, allow_when_human_assigned: event.target.checked }))} className="mt-0.5" /><span><span className="block text-xs font-semibold text-zinc-900">Allow AI on human-owned conversations</span><span className="mt-0.5 block text-[10px] leading-4 text-zinc-500">Keep this off unless you intentionally want AI and staff sharing the same owned conversation.</span></span></label></div>
        </section>

        <section className="surface-flat p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Play className="h-4 w-4 text-blue-600" /><h2 className="section-heading">Test Agent</h2></div><p className="section-description mt-1">Uses the saved provider and model configuration, but never sends anything to a real channel.</p></div><button type="button" onClick={() => void test()} disabled={testing || !draft.id} className="button-secondary">{testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run test</button></div>
          <textarea value={testMessage} onChange={(event) => setTestMessage(event.target.value)} rows={3} className="field mt-4 min-h-20 resize-y" />
          {testResult && <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4"><div className="flex items-center gap-2 text-xs font-semibold text-zinc-900"><Bot className="h-4 w-4" /> Decision: <span className="capitalize text-blue-700">{String(testResult.action || 'unknown')}</span><span className="font-normal text-zinc-400">confidence {Number(testResult.confidence || 0).toFixed(2)}</span></div>{testResult.reply ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-700">{String(testResult.reply)}</p> : null}{testResult.handoff_reason ? <p className="mt-3 text-xs text-amber-700">Handoff: {String(testResult.handoff_reason)}</p> : null}</div>}
        </section>
      </main>
    </div>
  </div>;
}
