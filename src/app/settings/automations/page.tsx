'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Loader2,
  Plus,
  Power,
  Save,
  Sparkles,
  Trash2,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { useApp } from '@/lib/store';

type Workflow = {
  id: string;
  name: string;
  trigger_key: string;
  conditions: Record<string, unknown>;
  actions: Array<Record<string, unknown>>;
  is_enabled: boolean;
  sort_order: number;
  latest_run?: { status: string; created_at: string; error?: string | null } | null;
};

type ActionType = 'assign' | 'set_priority' | 'set_state';
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
  actions: BuilderAction[];
  enabled: boolean;
};

const TRIGGERS = [
  ['message_received', 'Message received'],
  ['reply_sent', 'Reply sent'],
  ['state_changed', 'Conversation state changed'],
  ['assigned', 'Conversation assigned'],
  ['priority_changed', 'Priority changed'],
  ['lifecycle_changed', 'Lifecycle changed'],
  ['*', 'Any conversation event'],
] as const;

const DEFAULT_BUILDER: BuilderState = {
  id: null,
  name: '',
  trigger: 'message_received',
  provider: '',
  priority: '',
  state: '',
  hasLead: '',
  actions: [{ id: 'action-1', type: 'assign', value: 'least_open', minutes: 60 }],
  enabled: true,
};

function triggerLabel(value: string) {
  return TRIGGERS.find(([key]) => key === value)?.[1] || value.replaceAll('_', ' ');
}

function actionLabel(action: Record<string, unknown>) {
  const type = String(action.type || 'action');
  if (type === 'assign') {
    const strategy = String(action.strategy || 'least_open').replaceAll('_', ' ');
    return `Assign conversation · ${strategy}`;
  }
  if (type === 'set_priority') return `Set priority · ${String(action.value || 'normal')}`;
  if (type === 'set_state') {
    const state = String(action.value || 'open');
    return state === 'snoozed' ? `Snooze · ${Number(action.minutes || 60)} min` : `Set state · ${state}`;
  }
  return type.replaceAll('_', ' ');
}

function actionFromRecord(action: Record<string, unknown>, index: number): BuilderAction {
  const type = ['assign', 'set_priority', 'set_state'].includes(String(action.type)) ? String(action.type) as ActionType : 'assign';
  const value = type === 'assign' ? String(action.strategy || 'least_open') : String(action.value || (type === 'set_priority' ? 'high' : 'waiting'));
  return { id: `action-${Date.now()}-${index}`, type, value, minutes: Number(action.minutes || 60) };
}

function workflowToBuilder(workflow: Workflow): BuilderState {
  return {
    id: workflow.id,
    name: workflow.name,
    trigger: workflow.trigger_key,
    provider: typeof workflow.conditions.provider === 'string' ? workflow.conditions.provider : '',
    priority: typeof workflow.conditions.priority === 'string' ? workflow.conditions.priority : '',
    state: typeof workflow.conditions.workflow_state === 'string' ? workflow.conditions.workflow_state : '',
    hasLead: typeof workflow.conditions.has_lead === 'boolean' ? String(workflow.conditions.has_lead) : '',
    actions: workflow.actions.length ? workflow.actions.map(actionFromRecord) : [{ id: `action-${Date.now()}`, type: 'assign', value: 'least_open', minutes: 60 }],
    enabled: workflow.is_enabled,
  };
}

function conditionSummary(workflow: Workflow) {
  const values: string[] = [];
  if (workflow.conditions.provider) values.push(`Channel = ${String(workflow.conditions.provider)}`);
  if (workflow.conditions.priority) values.push(`Priority = ${String(workflow.conditions.priority)}`);
  if (workflow.conditions.workflow_state) values.push(`State = ${String(workflow.conditions.workflow_state)}`);
  if (typeof workflow.conditions.has_lead === 'boolean') values.push(workflow.conditions.has_lead ? 'Has CRM record' : 'No CRM record');
  return values;
}

export default function AutomationsPage() {
  const { currentUser, showToast } = useApp();
  const canManage = currentUser.role === 'admin' || currentUser.role === 'manager';
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builder, setBuilder] = useState<BuilderState>(DEFAULT_BUILDER);

  const load = useCallback(async () => {
    if (!canManage) return;
    setLoading(true);
    try {
      const response = await fetch('/api/automations', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to load automations.');
      setWorkflows(payload.workflows || []);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to load automations.', 'error');
    } finally {
      setLoading(false);
    }
  }, [canManage, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const enabled = workflows.filter((workflow) => workflow.is_enabled).length;
    const failures = workflows.filter((workflow) => workflow.latest_run?.status === 'failed').length;
    const successful = workflows.filter((workflow) => workflow.latest_run?.status === 'succeeded').length;
    return { enabled, failures, successful };
  }, [workflows]);

  const openNew = () => {
    setBuilder({ ...DEFAULT_BUILDER, actions: [{ id: `action-${Date.now()}`, type: 'assign', value: 'least_open', minutes: 60 }] });
    setBuilderOpen(true);
  };

  const openEdit = (workflow: Workflow) => {
    setBuilder(workflowToBuilder(workflow));
    setBuilderOpen(true);
  };

  const closeBuilder = () => {
    if (saving) return;
    setBuilderOpen(false);
  };

  const changeActionType = (id: string, type: ActionType) => {
    setBuilder((current) => ({
      ...current,
      actions: current.actions.map((action) => action.id !== id ? action : {
        ...action,
        type,
        value: type === 'assign' ? 'least_open' : type === 'set_priority' ? 'high' : 'waiting',
        minutes: action.minutes || 60,
      }),
    }));
  };

  const updateAction = (id: string, patch: Partial<BuilderAction>) => {
    setBuilder((current) => ({ ...current, actions: current.actions.map((action) => action.id === id ? { ...action, ...patch } : action) }));
  };

  const addAction = () => {
    setBuilder((current) => ({
      ...current,
      actions: [...current.actions, { id: `action-${Date.now()}-${current.actions.length}`, type: 'set_priority', value: 'high', minutes: 60 }],
    }));
  };

  const removeAction = (id: string) => {
    setBuilder((current) => ({ ...current, actions: current.actions.length <= 1 ? current.actions : current.actions.filter((action) => action.id !== id) }));
  };

  const saveWorkflow = async () => {
    if (!builder.name.trim() || builder.actions.length === 0) return;
    const conditions: Record<string, unknown> = {};
    if (builder.provider) conditions.provider = builder.provider;
    if (builder.priority) conditions.priority = builder.priority;
    if (builder.state) conditions.workflow_state = builder.state;
    if (builder.hasLead !== '') conditions.has_lead = builder.hasLead === 'true';

    const actions = builder.actions.map((action) => {
      if (action.type === 'assign') return { type: 'assign', strategy: action.value };
      if (action.type === 'set_priority') return { type: 'set_priority', value: action.value };
      return action.value === 'snoozed'
        ? { type: 'set_state', value: 'snoozed', minutes: Math.max(1, Math.min(10080, action.minutes || 60)) }
        : { type: 'set_state', value: action.value };
    });

    setSaving(true);
    try {
      const endpoint = builder.id ? `/api/automations/${builder.id}` : '/api/automations';
      const response = await fetch(endpoint, {
        method: builder.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: builder.name.trim(),
          trigger_key: builder.trigger,
          conditions,
          actions,
          is_enabled: builder.enabled,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to save automation.');
      showToast(builder.id ? 'Automation updated.' : 'Automation created.', 'success');
      setBuilderOpen(false);
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to save automation.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (workflow: Workflow) => {
    const response = await fetch(`/api/automations/${workflow.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_enabled: !workflow.is_enabled }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      showToast(payload.error || 'Unable to update automation.', 'error');
      return;
    }
    setWorkflows((current) => current.map((item) => item.id === workflow.id ? { ...item, is_enabled: !item.is_enabled } : item));
  };

  const remove = async (workflow: Workflow) => {
    if (!window.confirm(`Delete “${workflow.name}”?`)) return;
    const response = await fetch(`/api/automations/${workflow.id}`, { method: 'DELETE' });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      showToast(payload.error || 'Unable to delete automation.', 'error');
      return;
    }
    setWorkflows((current) => current.filter((item) => item.id !== workflow.id));
  };

  if (!canManage) {
    return <div className="mx-auto max-w-xl px-5 py-16 text-center"><AlertCircle className="mx-auto h-7 w-7 text-zinc-400" /><h1 className="mt-3 text-lg font-semibold">Manager access required</h1><p className="mt-1 text-sm text-zinc-500">Automations can change routing and workflow state, so only managers can configure them.</p></div>;
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-zinc-50/60">
      <div className="border-b border-zinc-200 bg-white px-4 py-4 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-base font-semibold text-zinc-950"><Zap className="h-4 w-4" /> Automations</div>
            <p className="mt-1 text-xs text-zinc-500">Route and update conversations automatically from real Inbox events.</p>
          </div>
          <div className="flex items-center gap-2"><Link href="/inbox" className="button-secondary"><ArrowLeft className="h-3.5 w-3.5" /> Inbox</Link><button type="button" onClick={openNew} className="button-primary"><Plus className="h-3.5 w-3.5" /> Create workflow</button></div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl p-4 md:p-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="border-b border-zinc-200 bg-white px-4 py-3 sm:rounded-lg sm:border"><div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Enabled</div><div className="mt-1 font-mono text-xl font-semibold text-zinc-950">{stats.enabled}</div></div>
          <div className="border-b border-zinc-200 bg-white px-4 py-3 sm:rounded-lg sm:border"><div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Recent success</div><div className="mt-1 font-mono text-xl font-semibold text-emerald-600">{stats.successful}</div></div>
          <div className="border-b border-zinc-200 bg-white px-4 py-3 sm:rounded-lg sm:border"><div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Needs attention</div><div className={`mt-1 font-mono text-xl font-semibold ${stats.failures ? 'text-red-600' : 'text-zinc-950'}`}>{stats.failures}</div></div>
        </div>

        <section className="mt-5 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="grid grid-cols-[minmax(0,1fr)_110px] items-center border-b border-zinc-100 bg-zinc-50/80 px-4 py-2.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-400 sm:grid-cols-[minmax(0,1fr)_120px_150px_110px]"><span>Workflow</span><span className="hidden sm:block">Trigger</span><span className="hidden sm:block">Last run</span><span className="text-right">Status</span></div>
          {loading ? <div className="flex items-center justify-center gap-2 py-16 text-xs text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading automations…</div> : workflows.length === 0 ? <div className="px-6 py-16 text-center"><Zap className="mx-auto h-7 w-7 text-zinc-300" /><div className="mt-2 text-sm font-semibold text-zinc-700">No workflows yet</div><p className="mt-1 text-xs text-zinc-400">Create one to route, prioritize or change conversation state automatically.</p><button type="button" onClick={openNew} className="button-primary mt-4"><Plus className="h-3.5 w-3.5" /> Create first workflow</button></div> : <div className="divide-y divide-zinc-100">{workflows.map((workflow) => {
            const conditions = conditionSummary(workflow);
            const failed = workflow.latest_run?.status === 'failed';
            return <div key={workflow.id} className="group grid grid-cols-[minmax(0,1fr)_110px] items-center gap-3 px-4 py-3 hover:bg-zinc-50/70 sm:grid-cols-[minmax(0,1fr)_120px_150px_110px]">
              <button type="button" onClick={() => openEdit(workflow)} className="min-w-0 text-left"><div className="flex items-center gap-2"><span className="truncate text-sm font-semibold text-zinc-900">{workflow.name}</span>{workflow.actions.length > 1 && <span className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-blue-700">{workflow.actions.length} steps</span>}</div><div className="mt-1 truncate text-[10px] text-zinc-400">{conditions.length ? conditions.join(' · ') : 'No conditions'} · {workflow.actions.map(actionLabel).join(' → ')}</div></button>
              <div className="hidden text-[11px] font-medium capitalize text-zinc-600 sm:block">{triggerLabel(workflow.trigger_key)}</div>
              <div className={`hidden text-[10px] sm:block ${failed ? 'font-semibold text-red-600' : 'text-zinc-500'}`}>{workflow.latest_run ? `${workflow.latest_run.status} · ${new Date(workflow.latest_run.created_at).toLocaleDateString()}` : 'Never run'}</div>
              <div className="flex items-center justify-end gap-1"><button type="button" onClick={() => void toggle(workflow)} className={`flex h-8 items-center gap-1.5 rounded-md border px-2 text-[10px] font-semibold ${workflow.is_enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-zinc-200 bg-zinc-50 text-zinc-500'}`}><Power className="h-3 w-3" /> {workflow.is_enabled ? 'On' : 'Off'}</button><button type="button" onClick={() => openEdit(workflow)} className="rounded-md p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" aria-label="Edit workflow"><ChevronRight className="h-4 w-4" /></button></div>
            </div>;
          })}</div>}
        </section>
      </div>

      {builderOpen && <div className="fixed inset-0 z-50 flex justify-end bg-zinc-950/35" role="dialog" aria-modal="true" aria-label={builder.id ? 'Edit workflow' : 'Create workflow'} onClick={closeBuilder}><div className="flex h-full w-full max-w-2xl flex-col bg-zinc-50 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex min-h-16 items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 md:px-5"><div><div className="text-sm font-semibold text-zinc-950">{builder.id ? 'Edit workflow' : 'Create workflow'}</div><div className="mt-0.5 text-[11px] text-zinc-500">Build the flow from top to bottom. Each action runs in order.</div></div><div className="flex items-center gap-2"><button type="button" onClick={() => setBuilder((current) => ({ ...current, enabled: !current.enabled }))} className={`button-secondary button-sm ${builder.enabled ? 'text-emerald-700' : 'text-zinc-500'}`}><Power className="h-3.5 w-3.5" /> {builder.enabled ? 'Enabled' : 'Disabled'}</button><button type="button" disabled={saving || !builder.name.trim()} onClick={() => void saveWorkflow()} className="button-primary button-sm">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save</button><button type="button" onClick={closeBuilder} className="rounded-md p-2 text-zinc-400 hover:bg-zinc-100"><X className="h-4 w-4" /></button></div></div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto max-w-xl space-y-3">
            <label className="block"><span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Workflow name</span><input value={builder.name} onChange={(event) => setBuilder((current) => ({ ...current, name: event.target.value }))} placeholder="Route new WhatsApp enquiries" className="field mt-1.5 h-10 text-sm font-medium" /></label>

            <div className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><Zap className="h-3.5 w-3.5" /></span><div><div className="text-[9px] font-bold uppercase tracking-[0.14em] text-blue-600">When</div><div className="text-xs font-semibold text-zinc-900">Start this workflow</div></div></div><select value={builder.trigger} onChange={(event) => setBuilder((current) => ({ ...current, trigger: event.target.value }))} className="select-field mt-3 h-9 w-full text-xs">{TRIGGERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>

            <div className="flex justify-center"><ArrowDown className="h-4 w-4 text-zinc-300" /></div>

            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600"><CheckCircle2 className="h-3.5 w-3.5" /></span><div><div className="text-[9px] font-bold uppercase tracking-[0.14em] text-zinc-500">If</div><div className="text-xs font-semibold text-zinc-900">Optional conditions</div></div></div><div className="mt-3 grid gap-2 sm:grid-cols-2"><select value={builder.provider} onChange={(event) => setBuilder((current) => ({ ...current, provider: event.target.value }))} className="select-field h-9 text-xs"><option value="">Any channel</option><option value="facebook">Facebook</option><option value="instagram">Instagram</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="website">Website</option></select><select value={builder.priority} onChange={(event) => setBuilder((current) => ({ ...current, priority: event.target.value }))} className="select-field h-9 text-xs"><option value="">Any priority</option><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select><select value={builder.state} onChange={(event) => setBuilder((current) => ({ ...current, state: event.target.value }))} className="select-field h-9 text-xs"><option value="">Any state</option><option value="open">Open</option><option value="waiting">Waiting</option><option value="snoozed">Snoozed</option><option value="closed">Resolved</option></select><select value={builder.hasLead} onChange={(event) => setBuilder((current) => ({ ...current, hasLead: event.target.value }))} className="select-field h-9 text-xs"><option value="">Any CRM state</option><option value="true">Has CRM record</option><option value="false">No CRM record</option></select></div></div>

            <div className="flex justify-center"><ArrowDown className="h-4 w-4 text-zinc-300" /></div>

            <div className="space-y-3">{builder.actions.map((action, index) => <div key={action.id}><div className="rounded-xl border border-emerald-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><Sparkles className="h-3.5 w-3.5" /></span><div className="min-w-0 flex-1"><div className="text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-600">Then · Step {index + 1}</div><div className="text-xs font-semibold text-zinc-900">Run an action</div></div>{builder.actions.length > 1 && <button type="button" onClick={() => removeAction(action.id)} className="rounded-md p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>}</div><div className="mt-3 grid gap-2 sm:grid-cols-2"><select value={action.type} onChange={(event) => changeActionType(action.id, event.target.value as ActionType)} className="select-field h-9 text-xs"><option value="assign">Assign conversation</option><option value="set_priority">Set priority</option><option value="set_state">Set state</option></select>{action.type === 'assign' && <select value={action.value} onChange={(event) => updateAction(action.id, { value: event.target.value })} className="select-field h-9 text-xs"><option value="least_open">Least open conversations</option><option value="round_robin">Round robin</option><option value="conversion_weighted">Conversion weighted</option></select>}{action.type === 'set_priority' && <select value={action.value} onChange={(event) => updateAction(action.id, { value: event.target.value })} className="select-field h-9 text-xs"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select>}{action.type === 'set_state' && <select value={action.value} onChange={(event) => updateAction(action.id, { value: event.target.value })} className="select-field h-9 text-xs"><option value="open">Open</option><option value="waiting">Waiting</option><option value="snoozed">Snoozed</option><option value="closed">Resolved</option></select>}</div>{action.type === 'set_state' && action.value === 'snoozed' && <label className="mt-2 block text-[10px] font-medium text-zinc-500">Snooze minutes<input type="number" min={1} max={10080} value={action.minutes} onChange={(event) => updateAction(action.id, { minutes: Number(event.target.value) })} className="field mt-1 h-9 text-xs" /></label>}</div>{index < builder.actions.length - 1 && <div className="flex justify-center py-2"><ArrowDown className="h-4 w-4 text-zinc-300" /></div>}</div>)}</div>

            <button type="button" onClick={addAction} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-white px-3 py-3 text-xs font-semibold text-zinc-600 hover:border-zinc-400 hover:bg-zinc-50"><Plus className="h-3.5 w-3.5" /> Add action step</button>

            {builder.id && <button type="button" onClick={() => { const workflow = workflows.find((item) => item.id === builder.id); if (workflow) void remove(workflow).then(() => setBuilderOpen(false)); }} className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /> Delete workflow</button>}
          </div>
        </div>
      </div></div>}
    </div>
  );
}
