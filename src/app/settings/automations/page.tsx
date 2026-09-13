'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Plus, Power, Sparkles, Trash2, Zap } from 'lucide-react';
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

type ActionType = 'set_priority' | 'set_state' | 'assign';

const TRIGGERS = [
  ['message_received', 'Message received'],
  ['reply_sent', 'Reply sent'],
  ['state_changed', 'Conversation state changed'],
  ['assigned', 'Conversation assigned'],
  ['priority_changed', 'Priority changed'],
  ['lifecycle_changed', 'Lifecycle changed'],
  ['*', 'Any conversation event'],
] as const;

export default function AutomationsPage() {
  const { currentUser, showToast } = useApp();
  const canManage = currentUser.role === 'admin' || currentUser.role === 'manager';
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState('message_received');
  const [provider, setProvider] = useState('');
  const [conditionPriority, setConditionPriority] = useState('');
  const [conditionState, setConditionState] = useState('');
  const [actionType, setActionType] = useState<ActionType>('assign');
  const [actionValue, setActionValue] = useState('least_open');
  const [snoozeMinutes, setSnoozeMinutes] = useState(60);

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

  useEffect(() => { void load(); }, [load]);

  const updateActionDefaults = (type: ActionType) => {
    setActionType(type);
    if (type === 'assign') setActionValue('least_open');
    if (type === 'set_priority') setActionValue('high');
    if (type === 'set_state') setActionValue('waiting');
  };

  const createWorkflow = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    const conditions: Record<string, unknown> = {};
    if (provider) conditions.provider = provider;
    if (conditionPriority) conditions.priority = conditionPriority;
    if (conditionState) conditions.workflow_state = conditionState;

    const action: Record<string, unknown> = { type: actionType };
    if (actionType === 'assign') action.strategy = actionValue;
    else action.value = actionValue;
    if (actionType === 'set_state' && actionValue === 'snoozed') action.minutes = snoozeMinutes;

    setSaving(true);
    try {
      const response = await fetch('/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), trigger_key: trigger, conditions, actions: [action], is_enabled: true }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to create automation.');
      setName('');
      showToast('Automation created.', 'success');
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to create automation.', 'error');
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
    return <div className="mx-auto max-w-xl px-5 py-16 text-center"><AlertCircle className="mx-auto h-7 w-7 text-zinc-400" /><h1 className="mt-3 text-lg font-semibold">Manager access required</h1><p className="mt-1 text-sm text-zinc-500">Conversation automations can change assignment and workflow state, so only managers can configure them.</p></div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div><div className="flex items-center gap-2 text-base font-semibold text-zinc-950"><Zap className="h-4 w-4" /> Conversation Automations</div><p className="mt-1 text-xs text-zinc-500">Trigger operational actions from real Inbox events. Rules execute once per event with idempotency protection.</p></div>
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-700">Event-driven</div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[370px_1fr]">
        <form onSubmit={createWorkflow} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold"><Plus className="h-4 w-4" /> New rule</div>
          <div className="mt-4 space-y-3">
            <label className="block text-xs font-medium text-zinc-700">Name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Route new WhatsApp messages" className="mt-1 h-9 w-full rounded-md border border-zinc-200 px-3 text-xs outline-none focus:border-zinc-400" /></label>
            <label className="block text-xs font-medium text-zinc-700">When<select value={trigger} onChange={(event) => setTrigger(event.target.value)} className="select-field mt-1 h-9 w-full text-xs">{TRIGGERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>

            <div className="rounded-lg border border-zinc-200 bg-zinc-50/70 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Optional conditions</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                <select value={provider} onChange={(event) => setProvider(event.target.value)} className="select-field h-9 text-xs"><option value="">Any channel</option><option value="facebook">Facebook</option><option value="instagram">Instagram</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="website">Website</option></select>
                <select value={conditionPriority} onChange={(event) => setConditionPriority(event.target.value)} className="select-field h-9 text-xs"><option value="">Any priority</option><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select>
                <select value={conditionState} onChange={(event) => setConditionState(event.target.value)} className="select-field h-9 text-xs"><option value="">Any state</option><option value="open">Open</option><option value="waiting">Waiting</option><option value="snoozed">Snoozed</option><option value="closed">Closed</option></select>
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-zinc-50/70 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Then</div>
              <select value={actionType} onChange={(event) => updateActionDefaults(event.target.value as ActionType)} className="select-field mt-2 h-9 w-full text-xs"><option value="assign">Assign conversation</option><option value="set_priority">Set priority</option><option value="set_state">Set conversation state</option></select>
              {actionType === 'assign' && <select value={actionValue} onChange={(event) => setActionValue(event.target.value)} className="select-field mt-2 h-9 w-full text-xs"><option value="least_open">Least open conversations</option><option value="round_robin">Round robin</option><option value="conversion_weighted">Conversion weighted</option></select>}
              {actionType === 'set_priority' && <select value={actionValue} onChange={(event) => setActionValue(event.target.value)} className="select-field mt-2 h-9 w-full text-xs"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select>}
              {actionType === 'set_state' && <><select value={actionValue} onChange={(event) => setActionValue(event.target.value)} className="select-field mt-2 h-9 w-full text-xs"><option value="open">Open</option><option value="waiting">Waiting</option><option value="snoozed">Snoozed</option><option value="closed">Closed</option></select>{actionValue === 'snoozed' && <label className="mt-2 block text-[11px] text-zinc-500">Snooze minutes<input type="number" min={1} max={10080} value={snoozeMinutes} onChange={(event) => setSnoozeMinutes(Number(event.target.value))} className="mt-1 h-9 w-full rounded-md border border-zinc-200 px-3 text-xs" /></label>}</>}
            </div>
          </div>
          <button disabled={saving || !name.trim()} className="button-primary mt-4 w-full">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Create automation</button>
        </form>

        <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3"><div className="text-sm font-semibold">Rules</div><span className="font-mono text-[10px] text-zinc-400">{workflows.length}</span></div>
          {loading ? <div className="flex items-center justify-center gap-2 py-12 text-xs text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading rules…</div> : workflows.length === 0 ? <div className="px-6 py-14 text-center"><Zap className="mx-auto h-6 w-6 text-zinc-300" /><p className="mt-2 text-sm font-medium text-zinc-700">No automations yet</p><p className="mt-1 text-xs text-zinc-400">Create your first routing or state rule from the builder.</p></div> : <div className="divide-y divide-zinc-100">{workflows.map((workflow) => <div key={workflow.id} className="p-4"><div className="flex items-start gap-3"><button type="button" onClick={() => void toggle(workflow)} className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${workflow.is_enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-zinc-200 bg-zinc-50 text-zinc-400'}`} aria-label={workflow.is_enabled ? 'Disable automation' : 'Enable automation'}><Power className="h-3.5 w-3.5" /></button><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-zinc-900">{workflow.name}</span><span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] font-medium text-zinc-500">{workflow.trigger_key.replaceAll('_', ' ')}</span></div><div className="mt-1 text-[11px] text-zinc-500">{Object.keys(workflow.conditions || {}).length ? `${Object.keys(workflow.conditions).length} condition${Object.keys(workflow.conditions).length === 1 ? '' : 's'} · ` : ''}{workflow.actions.length} action{workflow.actions.length === 1 ? '' : 's'}</div>{workflow.latest_run && <div className={`mt-2 inline-flex items-center gap-1 text-[10px] ${workflow.latest_run.status === 'failed' ? 'text-red-600' : 'text-emerald-600'}`}>{workflow.latest_run.status === 'failed' ? <AlertCircle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />} Last run: {workflow.latest_run.status}</div>}</div><button type="button" onClick={() => void remove(workflow)} className="rounded p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600" aria-label="Delete automation"><Trash2 className="h-3.5 w-3.5" /></button></div></div>)}</div>}
        </section>
      </div>
    </div>
  );
}
