'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CopyPlus,
  Loader2,
  Plus,
  Power,
  XCircle,
  Zap,
} from 'lucide-react';
import type { AutomationWorkflow } from '@/components/automation/AutomationWorkflowBuilder';
import { WORKFLOW_TEMPLATES } from '@/lib/automation/workflow-templates';
import { useApp } from '@/lib/store';

type AutomationRun = {
  workflow_id: string;
  workflow_name: string;
  status: string;
  created_at: string;
  error?: string | null;
};

function triggerLabel(value: string) {
  if (value === '*') return 'Any supported event';
  return value.replaceAll('_', ' ').replaceAll('.', ' · ');
}

function actionLabel(action: Record<string, unknown>) {
  const type = String(action.type || 'action');
  if (type === 'assign') return `Assign · ${String(action.user_id || action.strategy || 'least_open').replaceAll('_', ' ')}`;
  if (type === 'set_priority') return `Priority · ${String(action.value || 'normal')}`;
  if (type === 'set_state') return String(action.value) === 'snoozed' ? `Snooze · ${Number(action.minutes || 60)} min` : `State · ${String(action.value || 'open')}`;
  if (type === 'set_lifecycle') return `Lifecycle · ${String(action.value || 'new')}`;
  if (type === 'add_tag') return `Add tag · ${String(action.value || '')}`;
  if (type === 'remove_tag') return `Remove tag · ${String(action.value || '')}`;
  if (type === 'set_next_action') return `Next action · ${Number(action.minutes || 60)} min`;
  return type.replaceAll('_', ' ');
}

function conditionSummary(workflow: AutomationWorkflow) {
  const values: string[] = [];
  if (workflow.conditions.provider) values.push(`Channel = ${String(workflow.conditions.provider)}`);
  if (workflow.conditions.priority) values.push(`Priority = ${String(workflow.conditions.priority)}`);
  if (workflow.conditions.workflow_state) values.push(`State = ${String(workflow.conditions.workflow_state)}`);
  if (workflow.conditions.lifecycle_key) values.push(`Lifecycle = ${String(workflow.conditions.lifecycle_key)}`);
  if (typeof workflow.conditions.has_lead === 'boolean') values.push(workflow.conditions.has_lead ? 'Has opportunity' : 'No opportunity');
  return values;
}

function runTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown time' : date.toLocaleString();
}

export default function AutomationsPage() {
  const router = useRouter();
  const { currentUser, showToast } = useApp();
  const canManage = currentUser.role === 'admin' || currentUser.role === 'manager';
  const [workflows, setWorkflows] = useState<AutomationWorkflow[]>([]);
  const [recentRuns, setRecentRuns] = useState<AutomationRun[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/automations', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to load automations.');
      setWorkflows(payload.workflows || []);
      setRecentRuns(payload.recent_runs || []);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to load automations.', 'error');
    } finally {
      setLoading(false);
    }
  }, [canManage, showToast]);

  useEffect(() => { void load(); }, [load]);

  const stats = useMemo(() => {
    const enabled = workflows.filter((workflow) => workflow.is_enabled).length;
    const failures = workflows.filter((workflow) => workflow.latest_run?.status === 'failed').length;
    const successful = workflows.filter((workflow) => workflow.latest_run?.status === 'succeeded').length;
    return { enabled, failures, successful };
  }, [workflows]);

  const openNew = () => router.push('/settings/automations/editor');
  const openTemplate = (key: string) => router.push(`/settings/automations/editor?template=${encodeURIComponent(key)}`);
  const openEdit = (id: string) => router.push(`/settings/automations/editor?id=${encodeURIComponent(id)}`);

  const toggle = async (workflow: AutomationWorkflow) => {
    try {
      const response = await fetch(`/api/automations/${workflow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_enabled: !workflow.is_enabled }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to update automation.');
      setWorkflows((current) => current.map((item) => item.id === workflow.id ? { ...item, is_enabled: !item.is_enabled } : item));
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to update automation.', 'error');
    }
  };

  if (!canManage) {
    return <div className="mx-auto max-w-xl px-5 py-16 text-center"><AlertCircle className="mx-auto h-7 w-7 text-zinc-400" /><h1 className="mt-3 text-lg font-semibold">Manager access required</h1><p className="mt-1 text-sm text-zinc-500">Automations can change routing and workflow state, so only managers can configure them.</p></div>;
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-zinc-50/70">
      <header className="border-b border-zinc-200 bg-white px-4 py-4 md:px-6 xl:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-lg font-semibold tracking-tight text-zinc-950"><Zap className="h-4.5 w-4.5" /> Automations</div>
            <p className="mt-1 text-xs text-zinc-500">Manage workflow rules, templates and execution health across Inbox and CRM events.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/settings/workspace" className="button-secondary min-h-10"><ArrowLeft className="h-3.5 w-3.5" /> Settings</Link>
            <button type="button" onClick={openNew} className="button-primary min-h-10"><Plus className="h-3.5 w-3.5" /> Create workflow</button>
          </div>
        </div>
      </header>

      <div className="w-full space-y-5 p-4 md:p-6 xl:p-8">
        <section className="grid gap-px overflow-hidden border border-zinc-200 bg-zinc-200 sm:grid-cols-3">
          <div className="bg-white px-5 py-4"><div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">Enabled workflows</div><div className="mt-1 font-mono text-2xl font-semibold text-zinc-950">{stats.enabled}</div></div>
          <div className="bg-white px-5 py-4"><div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">Recent success</div><div className="mt-1 font-mono text-2xl font-semibold text-emerald-600">{stats.successful}</div></div>
          <div className="bg-white px-5 py-4"><div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">Needs attention</div><div className={`mt-1 font-mono text-2xl font-semibold ${stats.failures ? 'text-red-600' : 'text-zinc-950'}`}>{stats.failures}</div></div>
        </section>

        <section className="border border-zinc-200 bg-white p-4 md:p-5">
          <div className="flex items-start justify-between gap-3">
            <div><div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900"><CopyPlus className="h-3.5 w-3.5" /> Start from a template</div><p className="mt-1 text-[10px] text-zinc-500">Open a starter directly in the whiteboard, review it, then save and enable it when ready.</p></div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">{WORKFLOW_TEMPLATES.map((template) => <button key={template.key} type="button" onClick={() => openTemplate(template.key)} className="group min-h-28 border border-zinc-200 bg-zinc-50 p-4 text-left transition hover:border-zinc-400 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"><div className="flex items-start justify-between gap-3"><div className="text-xs font-semibold text-zinc-950">{template.name}</div><ChevronRight className="h-4 w-4 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-600" /></div><div className="mt-2 text-[10px] leading-4 text-zinc-500">{template.description}</div><div className="mt-3 text-[9px] font-bold uppercase tracking-[0.12em] text-blue-700">{triggerLabel(template.trigger)} · {template.actions.length} actions</div></button>)}</div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_420px]">
          <section className="min-w-0 overflow-hidden border border-zinc-200 bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-100 bg-zinc-50 px-4 py-3 md:px-5"><div><div className="text-xs font-semibold text-zinc-900">Workflows</div><p className="mt-0.5 text-[10px] text-zinc-500">Click any workflow to open its dedicated whiteboard.</p></div><div className="text-[10px] font-medium text-zinc-400">{workflows.length} total</div></div>
            <div className="grid grid-cols-[minmax(0,1fr)_110px] items-center border-b border-zinc-100 px-4 py-2.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-400 md:grid-cols-[minmax(0,1fr)_180px_160px_110px] md:px-5"><span>Workflow</span><span className="hidden md:block">Trigger</span><span className="hidden md:block">Last run</span><span className="text-right">Status</span></div>
            {loading ? <div className="flex items-center justify-center gap-2 py-20 text-xs text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading automations…</div> : workflows.length === 0 ? <div className="px-6 py-20 text-center"><Zap className="mx-auto h-7 w-7 text-zinc-300" /><div className="mt-2 text-sm font-semibold text-zinc-700">No workflows yet</div><p className="mt-1 text-xs text-zinc-400">Create your first automation in the visual whiteboard.</p><button type="button" onClick={openNew} className="button-primary mt-4 min-h-10"><Plus className="h-3.5 w-3.5" /> Create first workflow</button></div> : <div className="divide-y divide-zinc-100">{workflows.map((workflow) => {
              const conditions = conditionSummary(workflow);
              const failed = workflow.latest_run?.status === 'failed';
              return <div key={workflow.id} className="group grid grid-cols-[minmax(0,1fr)_110px] items-center gap-3 px-4 py-3 hover:bg-zinc-50 md:grid-cols-[minmax(0,1fr)_180px_160px_110px] md:px-5">
                <button type="button" onClick={() => openEdit(workflow.id)} className="min-h-11 min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"><div className="flex items-center gap-2"><span className="truncate text-sm font-semibold text-zinc-900">{workflow.name}</span>{workflow.actions.length > 1 && <span className="bg-blue-50 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-blue-700">{workflow.actions.length} steps</span>}</div><div className="mt-1 truncate text-[10px] text-zinc-400">{conditions.length ? conditions.join(' · ') : 'No conditions'} · {workflow.actions.map(actionLabel).join(' → ')}</div></button>
                <div className="hidden truncate text-[11px] font-medium capitalize text-zinc-600 md:block">{triggerLabel(workflow.trigger_key)}</div>
                <div className={`hidden text-[10px] md:block ${failed ? 'font-semibold text-red-600' : 'text-zinc-500'}`}>{workflow.latest_run ? `${workflow.latest_run.status} · ${new Date(workflow.latest_run.created_at).toLocaleDateString()}` : 'Never run'}</div>
                <div className="flex items-center justify-end gap-1"><button type="button" onClick={() => void toggle(workflow)} className={`flex min-h-10 items-center gap-1.5 rounded-md border px-2 text-[10px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 ${workflow.is_enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-zinc-200 bg-zinc-50 text-zinc-500'}`}><Power className="h-3 w-3" /> {workflow.is_enabled ? 'On' : 'Off'}</button><button type="button" onClick={() => openEdit(workflow.id)} className="flex h-10 w-10 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900" aria-label={`Edit ${workflow.name}`}><ChevronRight className="h-4 w-4" /></button></div>
              </div>;
            })}</div>}
          </section>

          <section className="overflow-hidden border border-zinc-200 bg-white" aria-label="Recent automation runs">
            <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50 px-4 py-3"><div><div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900"><Clock3 className="h-3.5 w-3.5" /> Recent activity</div><p className="mt-0.5 text-[10px] text-zinc-500">Latest workflow executions and failures.</p></div><button type="button" onClick={() => void load()} disabled={loading} className="button-secondary button-sm min-h-10">Refresh</button></div>
            {loading ? <div className="flex items-center justify-center gap-2 py-10 text-xs text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading runs…</div> : recentRuns.length === 0 ? <div className="px-4 py-12 text-center text-xs text-zinc-400">No automation runs yet.</div> : <div className="max-h-[680px] divide-y divide-zinc-100 overflow-y-auto">{recentRuns.slice(0, 20).map((run, index) => {
              const succeeded = run.status === 'succeeded';
              const failed = run.status === 'failed';
              return <div key={`${run.workflow_id}-${run.created_at}-${index}`} className="flex items-start gap-3 px-4 py-3"><div className="mt-0.5">{succeeded ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : failed ? <XCircle className="h-4 w-4 text-red-600" /> : <Clock3 className="h-4 w-4 text-zinc-400" />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="truncate text-xs font-semibold text-zinc-900">{run.workflow_name}</span><span className={`text-[9px] font-bold uppercase tracking-wide ${failed ? 'text-red-600' : succeeded ? 'text-emerald-700' : 'text-zinc-500'}`}>{run.status}</span></div><div className="mt-0.5 text-[10px] text-zinc-400">{runTime(run.created_at)}</div>{run.error && <div className="mt-1.5 border-l-2 border-red-200 pl-2 text-[10px] leading-4 text-red-700">{run.error}</div>}</div></div>;
            })}</div>}
          </section>
        </div>
      </div>
    </div>
  );
}
