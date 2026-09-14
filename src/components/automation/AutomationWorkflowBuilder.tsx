'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  FlaskConical,
  Loader2,
  Plus,
  Power,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import WorkflowCanvas from './WorkflowCanvas';
import {
  runtimeWorkflowToGraph,
  validateWorkflowGraph,
  workflowGraphToRuntime,
} from '@/lib/automation/workflow-graph';

export type AutomationWorkflow = {
  id: string;
  name: string;
  trigger_key: string;
  conditions: Record<string, unknown>;
  actions: Array<Record<string, unknown>>;
  is_enabled: boolean;
  sort_order: number;
  latest_run?: { status: string; created_at: string; error?: string | null } | null;
};

type ActionType = 'assign' | 'set_priority' | 'set_state' | 'set_lifecycle' | 'add_tag' | 'remove_tag' | 'set_next_action';

type BuilderAction = {
  id: string;
  type: ActionType;
  value: string;
  minutes: number;
};

type BuilderState = {
  id: string | null;
  name: string;
  trigger: string;
  provider: string;
  priority: string;
  state: string;
  hasLead: string;
  lifecycle: string;
  actions: BuilderAction[];
  enabled: boolean;
};

type TestConversation = { id: string; customer_name?: string | null; provider?: string | null };
type TestResult = {
  matched: boolean;
  writes_performed: boolean;
  trigger?: { key: string; valid_for_conversation_events: boolean };
  conditions: Array<{ key: string; expected: unknown; actual: unknown; matched: boolean }>;
  actions: Array<{ index: number; label: string; would_execute: boolean }>;
};

type Props = {
  workflow: AutomationWorkflow | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  onDeleted: (id: string) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
};

const CONVERSATION_TRIGGERS = new Set([
  'message_received',
  'reply_sent',
  'state_changed',
  'assigned',
  'priority_changed',
  'lifecycle_changed',
]);

const TRIGGER_GROUPS = [
  {
    label: 'Inbox',
    options: [
      ['message_received', 'Message received'],
      ['reply_sent', 'Reply sent'],
      ['state_changed', 'Conversation state changed'],
      ['assigned', 'Conversation assigned'],
      ['priority_changed', 'Priority changed'],
      ['lifecycle_changed', 'Lifecycle changed'],
    ],
  },
  {
    label: 'Opportunity',
    options: [
      ['opportunity.created', 'Opportunity created'],
      ['opportunity.updated', 'Opportunity updated'],
      ['opportunity.stage_changed', 'Opportunity stage changed'],
      ['opportunity.assigned', 'Opportunity assigned'],
      ['opportunity.won', 'Opportunity won'],
      ['opportunity.lost', 'Opportunity lost'],
    ],
  },
  {
    label: 'Proposal & documents',
    options: [
      ['proposal.created', 'Proposal created'],
      ['proposal.updated', 'Proposal updated'],
      ['document.created', 'Document created'],
      ['document.updated', 'Document updated'],
    ],
  },
  {
    label: 'Operations',
    options: [
      ['work_item.created', 'Work item created'],
      ['work_item.updated', 'Work item updated'],
      ['case.created', 'Case created'],
      ['case.updated', 'Case updated'],
    ],
  },
  { label: 'Advanced', options: [['*', 'Any supported event']] },
] as const;

const DEFAULT_BUILDER: BuilderState = {
  id: null,
  name: '',
  trigger: 'message_received',
  provider: '',
  priority: '',
  state: '',
  hasLead: '',
  lifecycle: '',
  actions: [{ id: 'action-1', type: 'assign', value: 'least_open', minutes: 60 }],
  enabled: true,
};

function uniqueActionId(index = 0) {
  return `action-${Date.now()}-${index}`;
}

function defaultValue(type: ActionType) {
  if (type === 'assign') return 'least_open';
  if (type === 'set_priority') return 'high';
  if (type === 'set_state') return 'waiting';
  if (type === 'set_lifecycle') return 'qualified';
  return '';
}

function actionFromRecord(action: Record<string, unknown>, index: number): BuilderAction {
  const valid: ActionType[] = ['assign', 'set_priority', 'set_state', 'set_lifecycle', 'add_tag', 'remove_tag', 'set_next_action'];
  const rawType = String(action.type || 'assign');
  const type = valid.includes(rawType as ActionType) ? rawType as ActionType : 'set_priority';
  const value = type === 'assign'
    ? String(action.strategy || action.user_id || 'least_open')
    : String(action.value || defaultValue(type));
  return { id: uniqueActionId(index), type, value, minutes: Number(action.minutes || 60) };
}

function workflowToBuilder(workflow: AutomationWorkflow | null): BuilderState {
  if (!workflow) return { ...DEFAULT_BUILDER, actions: [{ id: uniqueActionId(), type: 'assign', value: 'least_open', minutes: 60 }] };
  return {
    id: workflow.id,
    name: workflow.name,
    trigger: workflow.trigger_key,
    provider: typeof workflow.conditions.provider === 'string' ? workflow.conditions.provider : '',
    priority: typeof workflow.conditions.priority === 'string' ? workflow.conditions.priority : '',
    state: typeof workflow.conditions.workflow_state === 'string' ? workflow.conditions.workflow_state : '',
    hasLead: typeof workflow.conditions.has_lead === 'boolean' ? String(workflow.conditions.has_lead) : '',
    lifecycle: typeof workflow.conditions.lifecycle_key === 'string' ? workflow.conditions.lifecycle_key : '',
    actions: workflow.actions.length ? workflow.actions.map(actionFromRecord) : [{ id: uniqueActionId(), type: 'set_priority', value: 'high', minutes: 60 }],
    enabled: workflow.is_enabled,
  };
}

function buildConditions(builder: BuilderState) {
  const conditions: Record<string, unknown> = {};
  if (builder.provider) conditions.provider = builder.provider;
  if (builder.priority) conditions.priority = builder.priority;
  if (builder.state) conditions.workflow_state = builder.state;
  if (builder.hasLead !== '') conditions.has_lead = builder.hasLead === 'true';
  if (builder.lifecycle) conditions.lifecycle_key = builder.lifecycle;
  return conditions;
}

function buildActions(builder: BuilderState) {
  return builder.actions.map((action) => {
    if (action.type === 'assign') return { type: 'assign', strategy: action.value };
    if (action.type === 'set_priority') return { type: 'set_priority', value: action.value };
    if (action.type === 'set_lifecycle') return { type: 'set_lifecycle', value: action.value };
    if (action.type === 'add_tag' || action.type === 'remove_tag') return { type: action.type, value: action.value.trim() };
    if (action.type === 'set_next_action') return { type: 'set_next_action', minutes: Math.max(1, Math.min(43200, action.minutes || 60)) };
    return action.value === 'snoozed'
      ? { type: 'set_state', value: 'snoozed', minutes: Math.max(1, Math.min(10080, action.minutes || 60)) }
      : { type: 'set_state', value: action.value };
  });
}

function isBusinessTrigger(trigger: string) {
  return trigger.includes('.');
}

function triggerLabel(trigger: string) {
  for (const group of TRIGGER_GROUPS) {
    const match = group.options.find(([value]) => value === trigger);
    if (match) return match[1];
  }
  return trigger.replaceAll('_', ' ').replaceAll('.', ' · ');
}

function actionTitle(action: BuilderAction) {
  if (action.type === 'assign') return 'Assign conversation';
  if (action.type === 'set_priority') return 'Set priority';
  if (action.type === 'set_state') return 'Set conversation state';
  if (action.type === 'set_lifecycle') return 'Set lifecycle';
  if (action.type === 'add_tag') return 'Add contact tag';
  if (action.type === 'remove_tag') return 'Remove contact tag';
  return 'Schedule next action';
}

function InspectorHeading({ eyebrow, title, help }: { eyebrow: string; title: string; help: string }) {
  return <div className="border-b border-zinc-100 pb-3"><div className="text-[9px] font-bold uppercase tracking-[0.14em] text-zinc-400">{eyebrow}</div><h3 className="mt-1 text-sm font-semibold text-zinc-950">{title}</h3><p className="mt-1 text-[11px] leading-4 text-zinc-500">{help}</p></div>;
}

export default function AutomationWorkflowBuilder({ workflow, onClose, onSaved, onDeleted, showToast }: Props) {
  const [builder, setBuilder] = useState<BuilderState>(() => workflowToBuilder(workflow));
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>('trigger');
  const [saving, setSaving] = useState(false);
  const [testConversations, setTestConversations] = useState<TestConversation[]>([]);
  const [testConversationId, setTestConversationId] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const businessTrigger = isBusinessTrigger(builder.trigger);
  const conversationDryRun = CONVERSATION_TRIGGERS.has(builder.trigger) || builder.trigger === '*';

  const runtimeDefinition = useMemo(() => ({
    trigger_key: builder.trigger,
    conditions: buildConditions(builder),
    actions: buildActions(builder),
  }), [builder]);
  const graph = useMemo(() => runtimeWorkflowToGraph(runtimeDefinition), [runtimeDefinition]);
  const graphValidation = useMemo(() => validateWorkflowGraph(graph), [graph]);

  const formIssues = useMemo(() => {
    const issues: string[] = [];
    if (!builder.name.trim()) issues.push('Workflow name is required.');
    if (!graphValidation.valid) issues.push(...graphValidation.issues.map((issue) => issue.message));
    for (const action of builder.actions) {
      if ((action.type === 'add_tag' || action.type === 'remove_tag') && !action.value.trim()) issues.push('Contact tag cannot be empty.');
      if (businessTrigger && action.type === 'assign') issues.push('Assignment strategy requires conversation context and cannot run from a CRM event.');
      if (businessTrigger && action.type === 'set_state') issues.push('Conversation state actions require an Inbox event.');
    }
    return [...new Set(issues)];
  }, [builder.actions, builder.name, businessTrigger, graphValidation]);

  const selectedActionIndex = useMemo(() => {
    const match = selectedNodeId?.match(/^action-(\d+)$/);
    return match ? Number(match[1]) - 1 : -1;
  }, [selectedNodeId]);
  const selectedAction = selectedActionIndex >= 0 ? builder.actions[selectedActionIndex] : null;

  useEffect(() => {
    if (!conversationDryRun) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch('/api/conversations?filter=open', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) return;
        const payload = await response.json();
        const rows = (payload.conversations || []) as TestConversation[];
        setTestConversations(rows.slice(0, 40));
        setTestConversationId((current) => current || rows[0]?.id || '');
      } catch (error) {
        if ((error as { name?: string })?.name !== 'AbortError') return;
      }
    })();
    return () => controller.abort();
  }, [conversationDryRun]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving && !testLoading) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, saving, testLoading]);

  const mutate = (updater: (current: BuilderState) => BuilderState) => {
    setTestResult(null);
    setBuilder(updater);
  };

  const changeTrigger = (trigger: string) => {
    mutate((current) => {
      const next = { ...current, trigger };
      if (isBusinessTrigger(trigger)) {
        next.provider = '';
        next.state = '';
        next.actions = current.actions.map((action) => action.type === 'assign' || action.type === 'set_state'
          ? { ...action, type: 'set_priority' as const, value: 'high' }
          : action);
      }
      return next;
    });
  };

  const updateAction = (index: number, patch: Partial<BuilderAction>) => {
    mutate((current) => ({
      ...current,
      actions: current.actions.map((action, actionIndex) => actionIndex === index ? { ...action, ...patch } : action),
    }));
  };

  const changeActionType = (index: number, type: ActionType) => updateAction(index, { type, value: defaultValue(type), minutes: 60 });

  const addAction = () => {
    const nextIndex = builder.actions.length;
    mutate((current) => ({
      ...current,
      actions: [...current.actions, { id: uniqueActionId(nextIndex), type: 'set_priority', value: 'high', minutes: 60 }],
    }));
    setSelectedNodeId(`action-${nextIndex + 1}`);
  };

  const removeAction = (index: number) => {
    if (builder.actions.length <= 1) return;
    mutate((current) => ({ ...current, actions: current.actions.filter((_, actionIndex) => actionIndex !== index) }));
    setSelectedNodeId('conditions');
  };

  const saveWorkflow = async () => {
    if (formIssues.length) return;
    setSaving(true);
    try {
      const definition = workflowGraphToRuntime(graph);
      const endpoint = builder.id ? `/api/automations/${builder.id}` : '/api/automations';
      const response = await fetch(endpoint, {
        method: builder.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: builder.name.trim(),
          ...definition,
          is_enabled: builder.enabled,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to save automation.');
      showToast(builder.id ? 'Automation updated.' : 'Automation created.', 'success');
      await onSaved();
      onClose();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to save automation.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const dryRun = async () => {
    if (!testConversationId || !conversationDryRun) return;
    setTestLoading(true);
    setTestResult(null);
    try {
      const response = await fetch('/api/automations/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: testConversationId, definition: workflowGraphToRuntime(graph) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to test workflow.');
      setTestResult(payload as TestResult);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to test workflow.', 'error');
    } finally {
      setTestLoading(false);
    }
  };

  const removeWorkflow = async () => {
    if (!builder.id || !window.confirm(`Delete “${builder.name}”?`)) return;
    const response = await fetch(`/api/automations/${builder.id}`, { method: 'DELETE' });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      showToast(payload.error || 'Unable to delete automation.', 'error');
      return;
    }
    onDeleted(builder.id);
    showToast('Automation deleted.', 'success');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/35" role="dialog" aria-modal="true" aria-labelledby="workflow-builder-title" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving && !testLoading) onClose(); }}>
      <div className="ml-auto flex h-full w-full max-w-6xl flex-col bg-zinc-50 shadow-2xl">
        <header className="flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 md:px-5">
          <div className="min-w-0">
            <div id="workflow-builder-title" className="truncate text-sm font-semibold text-zinc-950">{builder.id ? 'Edit workflow' : 'Create workflow'}</div>
            <div className="mt-0.5 text-[11px] text-zinc-500">Visual editor · executes as one linear transaction in the existing automation engine.</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => mutate((current) => ({ ...current, enabled: !current.enabled }))} className={`button-secondary button-sm min-h-10 ${builder.enabled ? 'text-emerald-700' : 'text-zinc-500'}`}><Power className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{builder.enabled ? 'Enabled' : 'Disabled'}</span></button>
            <button type="button" disabled={saving || formIssues.length > 0} onClick={() => void saveWorkflow()} className="button-primary button-sm min-h-10">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save</button>
            <button type="button" onClick={onClose} disabled={saving || testLoading} aria-label="Close workflow builder" className="flex h-10 w-10 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"><X className="h-4 w-4" /></button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto lg:overflow-hidden">
          <div className="grid min-h-full lg:h-full lg:grid-cols-[minmax(0,1fr)_360px]">
            <main className="min-w-0 p-4 md:p-5 lg:overflow-y-auto">
              <div className="mx-auto max-w-4xl">
                <label className="block"><span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Workflow name</span><input autoFocus value={builder.name} onChange={(event) => mutate((current) => ({ ...current, name: event.target.value }))} placeholder="Route high-priority enquiries" className="field mt-1.5 h-10 text-sm font-medium" /></label>

                {formIssues.length > 0 && builder.name.trim() && <div className="mt-3 flex items-start gap-2 border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] text-amber-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{formIssues[0]}</span></div>}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><div><div className="text-xs font-semibold text-zinc-900">Workflow map</div><div className="mt-0.5 text-[10px] text-zinc-500">Select a step to configure it. Dragging only changes your working view; execution order stays top-to-bottom.</div></div><button type="button" onClick={addAction} className="button-secondary button-sm min-h-10"><Plus className="h-3.5 w-3.5" /> Add action</button></div>
                <div className="mt-2"><WorkflowCanvas graph={graph} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} /></div>

                <section className="mt-4 border border-zinc-200 bg-white p-4" aria-label="Test workflow">
                  <div className="flex items-start gap-2"><FlaskConical className="mt-0.5 h-4 w-4 text-violet-600" /><div><h3 className="text-xs font-bold text-zinc-900">Dry-run workflow</h3><p className="mt-0.5 text-[10px] text-zinc-500">Performs zero writes. CRM-event workflows are validated by the real event engine and cannot be simulated with a conversation here.</p></div></div>
                  {conversationDryRun ? <><div className="mt-3 flex flex-col gap-2 sm:flex-row"><select aria-label="Conversation to test" value={testConversationId} onChange={(event) => { setTestConversationId(event.target.value); setTestResult(null); }} className="select-field h-10 min-w-0 flex-1 text-xs"><option value="">Choose an open conversation</option>{testConversations.map((conversation) => <option key={conversation.id} value={conversation.id}>{conversation.customer_name || 'Customer'} · {conversation.provider || 'channel'}</option>)}</select><button type="button" disabled={!testConversationId || testLoading || formIssues.length > 0} onClick={() => void dryRun()} className="button-secondary button-sm min-h-10">{testLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />} Test</button></div>{builder.trigger === '*' && <p className="mt-2 text-[10px] text-amber-700">Wildcard dry-run checks conversation context only; the saved workflow can also receive CRM business events.</p>}{testResult && <div className={`mt-3 border px-3 py-2.5 text-xs ${testResult.matched ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}><div className="font-bold text-zinc-900">{testResult.matched ? 'Conditions match — actions would run' : 'Conditions do not match'}</div><div className="mt-2 space-y-1">{testResult.conditions.map((condition) => <div key={condition.key} className="flex items-center justify-between gap-3"><span className="text-zinc-600">{condition.key.replaceAll('_', ' ')}</span><span className={condition.matched ? 'font-semibold text-emerald-700' : 'font-semibold text-amber-700'}>{String(condition.actual)} → {String(condition.expected)}</span></div>)}</div><div className="mt-2 border-t border-black/5 pt-2 text-zinc-600">{testResult.actions.map((action) => <div key={action.index}>{action.would_execute ? '→' : '–'} {action.label}</div>)}</div></div>}</> : <div className="mt-3 border border-zinc-200 bg-zinc-50 px-3 py-3 text-[11px] text-zinc-600">Dry-run is unavailable for <span className="font-semibold text-zinc-900">{triggerLabel(builder.trigger)}</span> because the current tester accepts conversation context only. The graph is still validated before save.</div>}
                </section>

                {builder.id && <button type="button" onClick={() => void removeWorkflow()} className="mt-6 flex min-h-11 w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"><Trash2 className="h-3.5 w-3.5" /> Delete workflow</button>}
              </div>
            </main>

            <aside className="border-t border-zinc-200 bg-white p-4 md:p-5 lg:overflow-y-auto lg:border-l lg:border-t-0" aria-label="Workflow step settings">
              {!selectedNodeId && <div className="py-10 text-center text-xs text-zinc-500">Select a workflow step to configure it.</div>}

              {selectedNodeId === 'trigger' && <div><InspectorHeading eyebrow="When" title={triggerLabel(builder.trigger)} help="Choose the event that starts this workflow. CRM events use the same automation executor as Inbox events." /><label className="mt-4 block"><span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Trigger event</span><select value={builder.trigger} onChange={(event) => changeTrigger(event.target.value)} className="select-field mt-1.5 h-10 w-full text-xs">{TRIGGER_GROUPS.map((group) => <optgroup key={group.label} label={group.label}>{group.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</optgroup>)}</select></label>{businessTrigger && <div className="mt-3 border-l-2 border-blue-300 bg-blue-50/60 px-3 py-2 text-[10px] leading-4 text-blue-800">This event runs from the CRM business-event pipeline. Conversation-only actions are hidden to prevent no-op or invalid workflows.</div>}</div>}

              {selectedNodeId === 'conditions' && <div><InspectorHeading eyebrow="If" title="Optional conditions" help={businessTrigger ? 'Filter by CRM data available on the business event.' : 'Filter the Inbox conversation before any action runs.'} /><div className="mt-4 space-y-3">{!businessTrigger && <><label className="block"><span className="text-[10px] font-semibold text-zinc-500">Channel</span><select value={builder.provider} onChange={(event) => mutate((current) => ({ ...current, provider: event.target.value }))} className="select-field mt-1 h-10 w-full text-xs"><option value="">Any channel</option><option value="facebook">Facebook</option><option value="instagram">Instagram</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="website">Website</option></select></label><label className="block"><span className="text-[10px] font-semibold text-zinc-500">Conversation state</span><select value={builder.state} onChange={(event) => mutate((current) => ({ ...current, state: event.target.value }))} className="select-field mt-1 h-10 w-full text-xs"><option value="">Any state</option><option value="open">Open</option><option value="waiting">Waiting</option><option value="snoozed">Snoozed</option><option value="closed">Resolved</option></select></label></>}
                <label className="block"><span className="text-[10px] font-semibold text-zinc-500">Priority</span><select value={builder.priority} onChange={(event) => mutate((current) => ({ ...current, priority: event.target.value }))} className="select-field mt-1 h-10 w-full text-xs"><option value="">Any priority</option><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
                <label className="block"><span className="text-[10px] font-semibold text-zinc-500">CRM record</span><select value={builder.hasLead} onChange={(event) => mutate((current) => ({ ...current, hasLead: event.target.value }))} className="select-field mt-1 h-10 w-full text-xs"><option value="">Any CRM state</option><option value="true">Has opportunity</option><option value="false">No opportunity</option></select></label>
                <label className="block"><span className="text-[10px] font-semibold text-zinc-500">Lifecycle</span><select value={builder.lifecycle} onChange={(event) => mutate((current) => ({ ...current, lifecycle: event.target.value }))} className="select-field mt-1 h-10 w-full text-xs"><option value="">Any lifecycle</option><option value="new">New</option><option value="qualified">Qualified</option><option value="opportunity">Opportunity</option><option value="customer">Customer</option><option value="lost">Lost</option></select></label>
                <button type="button" onClick={() => mutate((current) => ({ ...current, provider: '', priority: '', state: '', hasLead: '', lifecycle: '' }))} className="button-secondary button-sm min-h-10 w-full">Clear conditions</button>
              </div></div>}

              {selectedAction && <div><InspectorHeading eyebrow={`Then · Step ${selectedActionIndex + 1}`} title={actionTitle(selectedAction)} help="Actions execute in this visual order using the existing transaction-safe automation runtime." /><div className="mt-4 space-y-3"><label className="block"><span className="text-[10px] font-semibold text-zinc-500">Action</span><select value={selectedAction.type} onChange={(event) => changeActionType(selectedActionIndex, event.target.value as ActionType)} className="select-field mt-1 h-10 w-full text-xs"><option value="set_priority">Set priority</option><option value="set_lifecycle">Set lifecycle</option><option value="add_tag">Add contact tag</option><option value="remove_tag">Remove contact tag</option><option value="set_next_action">Schedule next action</option>{!businessTrigger && <><option value="assign">Assign conversation</option><option value="set_state">Set conversation state</option></>}</select></label>
                {selectedAction.type === 'assign' && <label className="block"><span className="text-[10px] font-semibold text-zinc-500">Assignment strategy</span><select value={selectedAction.value} onChange={(event) => updateAction(selectedActionIndex, { value: event.target.value })} className="select-field mt-1 h-10 w-full text-xs"><option value="least_open">Least open</option><option value="round_robin">Round robin</option><option value="conversion_weighted">Conversion weighted</option></select></label>}
                {selectedAction.type === 'set_priority' && <label className="block"><span className="text-[10px] font-semibold text-zinc-500">Priority</span><select value={selectedAction.value} onChange={(event) => updateAction(selectedActionIndex, { value: event.target.value })} className="select-field mt-1 h-10 w-full text-xs"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>}
                {selectedAction.type === 'set_state' && <><label className="block"><span className="text-[10px] font-semibold text-zinc-500">State</span><select value={selectedAction.value} onChange={(event) => updateAction(selectedActionIndex, { value: event.target.value })} className="select-field mt-1 h-10 w-full text-xs"><option value="open">Open</option><option value="waiting">Waiting</option><option value="snoozed">Snoozed</option><option value="closed">Resolved</option></select></label>{selectedAction.value === 'snoozed' && <label className="block"><span className="text-[10px] font-semibold text-zinc-500">Snooze minutes</span><input type="number" min={1} max={10080} value={selectedAction.minutes} onChange={(event) => updateAction(selectedActionIndex, { minutes: Number(event.target.value) })} className="field mt-1 h-10 text-xs" /></label>}</>}
                {selectedAction.type === 'set_lifecycle' && <label className="block"><span className="text-[10px] font-semibold text-zinc-500">Lifecycle</span><select value={selectedAction.value} onChange={(event) => updateAction(selectedActionIndex, { value: event.target.value })} className="select-field mt-1 h-10 w-full text-xs"><option value="new">New</option><option value="qualified">Qualified</option><option value="opportunity">Opportunity</option><option value="customer">Customer</option><option value="lost">Lost</option></select></label>}
                {(selectedAction.type === 'add_tag' || selectedAction.type === 'remove_tag') && <label className="block"><span className="text-[10px] font-semibold text-zinc-500">Contact tag</span><input value={selectedAction.value} onChange={(event) => updateAction(selectedActionIndex, { value: event.target.value })} placeholder="VIP" maxLength={80} className="field mt-1 h-10 text-xs" /></label>}
                {selectedAction.type === 'set_next_action' && <label className="block"><span className="text-[10px] font-semibold text-zinc-500">Minutes until next action</span><input type="number" min={1} max={43200} value={selectedAction.minutes} onChange={(event) => updateAction(selectedActionIndex, { minutes: Number(event.target.value) })} className="field mt-1 h-10 text-xs" /></label>}
                {builder.actions.length > 1 && <button type="button" onClick={() => removeAction(selectedActionIndex)} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-md text-xs font-semibold text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"><Trash2 className="h-3.5 w-3.5" /> Remove step</button>}
              </div></div>}
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
