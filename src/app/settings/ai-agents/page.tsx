'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Bot,
  MessageSquare,
  Play,
  PlugZap,
  Plus,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import { useApp } from '@/lib/store';
import type { AiProviderPreset } from '@/lib/ai/provider-catalog';
import {
  DirtySaveBar,
  EmptyBlock,
  FieldLabel,
  InlineNotice,
  LoadingBlock,
  SearchField,
  SectionAnchorNav,
  SettingsPageHeader,
  SettingsSection,
  StatusBadge,
  ToggleRow,
  useUnsavedChangesGuard,
} from '@/components/settings/SettingsPrimitives';

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

type AiProvider = { id: string; name: string; provider: string; is_active: boolean; has_api_key: boolean };
type Connection = { id: string; provider: string; display_name?: string | null; external_account_id?: string | null; status: string };
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

const EDITOR_SECTIONS = [
  { id: 'identity', label: 'Identity' },
  { id: 'behavior', label: 'Behavior' },
  { id: 'channels', label: 'Channels' },
  { id: 'safety', label: 'Safety' },
  { id: 'test', label: 'Test' },
];

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

function comparable(draft: Draft) {
  return JSON.stringify({ ...draft, connection_ids: [...draft.connection_ids].sort() });
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
  const [baseline, setBaseline] = useState<Draft>(EMPTY_DRAFT);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testMessage, setTestMessage] = useState('Hi, can you tell me more about your service and what I should do next?');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);

  const dirty = useMemo(() => comparable(draft) !== comparable(baseline), [draft, baseline]);
  useUnsavedChangesGuard(dirty, 'You have unsaved AI agent changes. Leave without saving?');

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
      const rows = Array.isArray(connectionPayload.connections) ? connectionPayload.connections : Array.isArray(connectionPayload.items) ? connectionPayload.items : [];
      setConnections((rows as Connection[]).filter((row) => ['whatsapp', 'facebook', 'instagram'].includes(row.provider) && row.status !== 'disconnected'));
      setTeams((Array.isArray(teamPayload.teams) ? teamPayload.teams : []).filter((team: RoutingTeam) => team.is_active));

      const first = nextAgents[0];
      if (first) {
        const next = toDraft(first);
        setSelectedId(first.id);
        setDraft(next);
        setBaseline(next);
      } else {
        const provider = nextProviders[0];
        const preset = (Array.isArray(providerPayload.presets) ? providerPayload.presets : []).find((row: AiProviderPreset) => row.id === provider?.provider);
        const next = { ...EMPTY_DRAFT, provider_config_id: provider?.id || '', model: preset?.modelPlaceholder || EMPTY_DRAFT.model };
        setDraft(next);
        setBaseline(next);
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to load AI agent settings.', 'error');
    } finally {
      setLoading(false);
    }
  }, [canManage, showToast]);

  useEffect(() => { void load(); }, [load]);

  const selectedProvider = useMemo(() => providers.find((provider) => provider.id === draft.provider_config_id) || null, [providers, draft.provider_config_id]);
  const selectedPreset = useMemo(() => providerPresets.find((preset) => preset.id === selectedProvider?.provider) || null, [providerPresets, selectedProvider]);
  const visibleAgents = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return agents;
    return agents.filter((agent) => `${agent.name} ${agent.description || ''} ${agent.model}`.toLowerCase().includes(needle));
  }, [agents, query]);

  const confirmDiscard = () => !dirty || window.confirm('Discard unsaved changes?');

  const chooseAgent = (agent: Agent) => {
    if (!confirmDiscard()) return;
    const next = toDraft(agent);
    setSelectedId(agent.id);
    setDraft(next);
    setBaseline(next);
    setTestResult(null);
  };

  const newAgent = () => {
    if (!confirmDiscard()) return;
    const provider = providers[0];
    const preset = providerPresets.find((row) => row.id === provider?.provider);
    const next = { ...EMPTY_DRAFT, provider_config_id: provider?.id || '', model: preset?.modelPlaceholder || EMPTY_DRAFT.model };
    setSelectedId(null);
    setDraft(next);
    setBaseline(next);
    setTestResult(null);
  };

  const toggleConnection = (id: string) => setDraft((current) => ({
    ...current,
    connection_ids: current.connection_ids.includes(id) ? current.connection_ids.filter((value) => value !== id) : [...current.connection_ids, id],
  }));

  const chooseProvider = (id: string) => {
    const provider = providers.find((row) => row.id === id);
    const preset = providerPresets.find((row) => row.id === provider?.provider);
    setDraft((current) => ({ ...current, provider_config_id: id, model: preset?.modelPlaceholder || current.model }));
  };

  const save = async () => {
    if (!draft.name.trim()) { showToast('Give the AI agent a name.', 'error'); return; }
    if (!draft.model.trim()) { showToast('Choose a model before saving.', 'error'); return; }
    if (draft.confidence_threshold < 0 || draft.confidence_threshold > 1) { showToast('Confidence threshold must be between 0 and 1.', 'error'); return; }
    if (draft.response_delay_min_seconds < 0 || draft.response_delay_max_seconds < 0) { showToast('Response delays cannot be negative.', 'error'); return; }
    if (draft.response_delay_min_seconds > draft.response_delay_max_seconds) { showToast('Minimum response delay cannot exceed the maximum.', 'error'); return; }
    if (!draft.provider_config_id && !legacyMistralConfigured) { showToast('Choose an AI provider before saving.', 'error'); return; }

    setSaving(true);
    try {
      const response = await fetch('/api/settings/ai-agents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
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
      const next = toDraft(saved);
      setAgents((current) => [saved, ...current.filter((agent) => agent.id !== saved.id)]);
      setSelectedId(saved.id);
      setDraft(next);
      setBaseline(next);
      showToast('AI agent saved.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to save AI agent.', 'error');
    } finally { setSaving(false); }
  };

  const test = async () => {
    if (!draft.id) { showToast('Save the agent before testing it.', 'error'); return; }
    if (!testMessage.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const response = await fetch(`/api/settings/ai-agents/${draft.id}/test`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: testMessage }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Agent test failed.');
      setTestResult(payload.decision || null);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Agent test failed.', 'error');
    } finally { setTesting(false); }
  };

  if (!canManage) {
    return <div className="mx-auto max-w-xl py-20 text-center"><ShieldCheck className="mx-auto h-7 w-7 text-zinc-400" /><h1 className="mt-3 text-lg font-semibold">Manager access required</h1><p className="mt-1 text-sm text-zinc-500">Only workspace managers can configure customer-facing AI agents.</p></div>;
  }

  const noProviderAvailable = providers.length === 0 && !legacyMistralConfigured;

  return (
    <div className="app-page">
      <SettingsPageHeader
        eyebrow="Workspace intelligence"
        title="AI Agents"
        description="Build, test and safely operate customer-facing AI agents."
        actions={<button type="button" onClick={newAgent} className="button-primary"><Plus className="h-4 w-4" /> New agent</button>}
      />

      {noProviderAvailable && <InlineNotice tone="warning"><strong>No AI provider is configured.</strong> Add a provider before enabling an agent. <Link href="/ai/providers" className="font-semibold underline">Configure provider</Link>.</InlineNotice>}

      <div className="grid items-start gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-lg border border-zinc-200 bg-white xl:sticky xl:top-[calc(var(--header-height)+1.5rem)] xl:max-h-[calc(100vh-var(--header-height)-3rem)] xl:overflow-y-auto">
          <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-zinc-950">Agents</h2>
                <p className="mt-0.5 text-[11px] text-zinc-500">{agents.length} configured</p>
              </div>
              <StatusBadge>{agents.filter((agent) => agent.is_active).length} active</StatusBadge>
            </div>
            {agents.length > 0 && <div className="mt-3"><SearchField value={query} onChange={setQuery} placeholder="Search agents" ariaLabel="Search AI agents" /></div>}
          </div>

          {loading ? (
            <LoadingBlock label="Loading agents…" />
          ) : agents.length === 0 ? (
            <EmptyBlock icon={Bot} title="No AI agents yet" description="Create one, test it, then enable it for live channels." action={<button type="button" onClick={newAgent} className="button-secondary button-sm"><Plus className="h-3.5 w-3.5" /> Add agent</button>} />
          ) : visibleAgents.length === 0 ? (
            <div className="px-5 py-12 text-center text-xs text-zinc-500">No agents match “{query}”.</div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {visibleAgents.map((agent) => {
                const provider = providers.find((row) => row.id === agent.provider_config_id);
                const selected = selectedId === agent.id;
                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => chooseAgent(agent)}
                    aria-pressed={selected}
                    className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition ${selected ? 'bg-blue-50' : 'hover:bg-zinc-50'}`}
                  >
                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${selected ? 'border-blue-200 bg-white text-blue-700' : 'border-zinc-200 bg-zinc-50 text-zinc-500'}`} aria-hidden="true"><Bot className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-zinc-900">{agent.name}</span>
                      <span className="mt-1 flex flex-wrap gap-1.5">
                        <StatusBadge dot tone={agent.is_active ? 'success' : 'neutral'}>{agent.is_active ? 'Active' : 'Inactive'}</StatusBadge>
                        <StatusBadge>{agent.mode.replace('_', ' ')}</StatusBadge>
                      </span>
                      <span className="mt-1.5 block truncate text-[10px] text-zinc-400">{provider?.name || 'Legacy Mistral'} · {agent.model}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        <div className="min-w-0 space-y-4">
          <div className="rounded-lg border border-zinc-200 bg-white px-5 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold text-zinc-950">{draft.id ? draft.name || 'Agent configuration' : 'New AI agent'}</h2>
                  <StatusBadge dot tone={draft.is_active ? 'success' : 'neutral'}>{draft.is_active ? 'Active' : 'Inactive'}</StatusBadge>
                  {dirty && <StatusBadge tone="warning">Unsaved</StatusBadge>}
                </div>
                <p className="mt-1 text-xs leading-5 text-zinc-500">Start in Assist mode and test before allowing automatic replies.</p>
              </div>
            </div>
            <div className="mt-4"><SectionAnchorNav items={EDITOR_SECTIONS} label="On this page" /></div>
          </div>

          <SettingsSection id="identity" title="Identity & model" description="Name the agent and choose the provider/model used for responses." icon={Sparkles}>
            <div className="grid gap-4 md:grid-cols-2">
              <FieldLabel label="Agent name" required><input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Syourai AI Counsellor" className="field mt-1.5" /></FieldLabel>
              <FieldLabel label="Description"><input value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Handles initial counselling and qualification." className="field mt-1.5" /></FieldLabel>
              <FieldLabel label="AI provider" required={!legacyMistralConfigured}><select value={draft.provider_config_id} onChange={(event) => chooseProvider(event.target.value)} className="select-field mt-1.5"><option value="">{legacyMistralConfigured ? 'Server Mistral · legacy' : 'Select provider…'}</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></FieldLabel>
              <FieldLabel label="Model ID" required hint="Use the exact model ID from your provider."><input value={draft.model} onChange={(event) => setDraft((current) => ({ ...current, model: event.target.value }))} placeholder={selectedPreset?.modelPlaceholder || 'provider-model-id'} className="field mt-1.5 font-mono text-xs" /></FieldLabel>
            </div>
          </SettingsSection>

          <SettingsSection id="behavior" title="Behavior" description="Define instructions, operating mode, tone and language behavior." icon={Bot}>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
              <FieldLabel label="Instructions" hint="Define role, boundaries, facts it may use, promises it must never make, and when to hand off."><textarea value={draft.instructions} onChange={(event) => setDraft((current) => ({ ...current, instructions: event.target.value }))} rows={10} className="textarea-field mt-1.5 min-h-56 text-sm leading-6" /></FieldLabel>
              <div className="space-y-4">
                <FieldLabel label="Operating mode" hint={MODE_HELP[draft.mode]}><select value={draft.mode} onChange={(event) => setDraft((current) => ({ ...current, mode: event.target.value as Agent['mode'] }))} className="select-field mt-1.5"><option value="off">Off</option><option value="assist">Assist · Draft only</option><option value="auto">Auto reply</option><option value="auto_handoff">Auto + handoff</option></select></FieldLabel>
                <FieldLabel label="Tone"><input value={draft.tone} onChange={(event) => setDraft((current) => ({ ...current, tone: event.target.value }))} className="field mt-1.5" /></FieldLabel>
                <FieldLabel label="Languages" hint="Comma separated. “auto” follows the customer."><input value={draft.languagesText} onChange={(event) => setDraft((current) => ({ ...current, languagesText: event.target.value }))} placeholder="auto, Nepali, English" className="field mt-1.5" /></FieldLabel>
              </div>
            </div>
          </SettingsSection>

          <SettingsSection id="channels" title="Channels" description="Bind channel accounts to this agent. One live account should map to one active agent." icon={PlugZap}>
            {connections.length === 0 ? (
              <EmptyBlock icon={MessageSquare} title="No connected channels" description="Connect WhatsApp, Facebook or Instagram before enabling live AI." />
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {connections.map((connection) => {
                  const active = draft.connection_ids.includes(connection.id);
                  return (
                    <button
                      key={connection.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleConnection(connection.id)}
                      className={`flex min-h-16 items-center gap-3 rounded-lg border px-3.5 text-left transition ${active ? 'border-blue-200 bg-blue-50' : 'border-zinc-200 hover:bg-zinc-50'}`}
                    >
                      <MessageSquare className={`h-4 w-4 shrink-0 ${active ? 'text-blue-700' : 'text-zinc-400'}`} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-zinc-900">{connection.display_name || connection.external_account_id || connection.provider}</span>
                        <span className="mt-0.5 block text-[10px] capitalize text-zinc-500">{connection.provider} · {connection.status}</span>
                      </span>
                      <StatusBadge tone={active ? 'info' : 'neutral'}>{active ? 'Assigned' : 'Available'}</StatusBadge>
                    </button>
                  );
                })}
              </div>
            )}
          </SettingsSection>

          <SettingsSection id="safety" title="Safety & handoff" description="Control confidence, timing and when a human should take over." icon={UsersRound}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <FieldLabel label="Confidence threshold" hint="0 means permissive; 1 means very strict."><input type="number" min="0" max="1" step="0.05" value={draft.confidence_threshold} onChange={(event) => setDraft((current) => ({ ...current, confidence_threshold: Number(event.target.value) }))} className="field mt-1.5" /></FieldLabel>
              <FieldLabel label="Minimum delay · sec"><input type="number" min="0" max="120" value={draft.response_delay_min_seconds} onChange={(event) => setDraft((current) => ({ ...current, response_delay_min_seconds: Number(event.target.value) }))} className="field mt-1.5" /></FieldLabel>
              <FieldLabel label="Maximum delay · sec"><input type="number" min="0" max="180" value={draft.response_delay_max_seconds} onChange={(event) => setDraft((current) => ({ ...current, response_delay_max_seconds: Number(event.target.value) }))} className="field mt-1.5" /></FieldLabel>
              <FieldLabel label="Handoff team"><select value={draft.handoff_team_key} onChange={(event) => setDraft((current) => ({ ...current, handoff_team_key: event.target.value }))} className="select-field mt-1.5"><option value="">Unassigned queue</option>{teams.map((team) => <option key={team.team_key} value={team.team_key}>{team.name}</option>)}</select></FieldLabel>
            </div>
            <div className="mt-4"><FieldLabel label="Handoff keywords" hint="Comma separated. Matching a customer message routes to a human before the LLM improvises."><input value={draft.handoffKeywordsText} onChange={(event) => setDraft((current) => ({ ...current, handoffKeywordsText: event.target.value }))} className="field mt-1.5" /></FieldLabel></div>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              <ToggleRow checked={draft.is_active} onChange={(checked) => setDraft((current) => ({ ...current, is_active: checked }))} title="Agent active" description="Allows the agent to participate in live work. Mode still controls draft versus send." />
              <ToggleRow checked={draft.allow_when_human_assigned} onChange={(checked) => setDraft((current) => ({ ...current, allow_when_human_assigned: checked }))} title="Allow AI on human-owned conversations" description="Keep off unless AI and staff should intentionally share an owned conversation." />
            </div>
          </SettingsSection>

          <SettingsSection id="test" title="Test agent" description="Run the saved configuration without sending anything to a real customer." icon={Play} actions={<button type="button" onClick={() => void test()} disabled={testing || !draft.id || dirty} className="button-secondary">{testing ? 'Testing…' : 'Run test'}</button>}>
            {!draft.id ? <InlineNotice tone="neutral">Save this agent before testing it.</InlineNotice> : dirty ? <InlineNotice tone="warning">Save your changes before running a test so the result matches the configuration you see here.</InlineNotice> : null}
            <textarea value={testMessage} onChange={(event) => setTestMessage(event.target.value)} rows={3} aria-label="Test customer message" className="textarea-field mt-3 min-h-20" />
            {testResult && <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4"><div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-zinc-900"><Bot className="h-4 w-4" aria-hidden="true" /> Decision <StatusBadge tone="info">{String(testResult.action || 'unknown')}</StatusBadge><span className="font-normal text-zinc-400">confidence {Number(testResult.confidence || 0).toFixed(2)}</span></div>{testResult.reply ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-700">{String(testResult.reply)}</p> : null}{testResult.handoff_reason ? <p className="mt-3 text-xs text-amber-700">Handoff: {String(testResult.handoff_reason)}</p> : null}</div>}
          </SettingsSection>

          <DirtySaveBar dirty={dirty} saving={saving} onSave={() => void save()} onDiscard={() => setDraft(baseline)} label="Save agent" />
        </div>
      </div>
    </div>
  );
}
