'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, Loader2 } from 'lucide-react';
import AutomationWorkflowBuilder, { type AutomationWorkflow } from '@/components/automation/AutomationWorkflowBuilder';
import { getWorkflowTemplate } from '@/lib/automation/workflow-templates';
import { useApp } from '@/lib/store';

function templateWorkflow(key: string | null): AutomationWorkflow | null {
  const template = getWorkflowTemplate(key);
  if (!template) return null;
  return {
    id: '',
    name: template.name,
    trigger_key: template.trigger,
    conditions: template.conditions,
    actions: template.actions,
    is_enabled: false,
    sort_order: 100,
    latest_run: null,
  };
}

export default function AutomationEditorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentUser, showToast } = useApp();
  const canManage = currentUser.role === 'admin' || currentUser.role === 'manager';
  const workflowId = searchParams.get('id');
  const templateKey = searchParams.get('template');
  const [workflow, setWorkflow] = useState<AutomationWorkflow | null>(() => templateWorkflow(templateKey));
  const [loading, setLoading] = useState(Boolean(workflowId));
  const [loadError, setLoadError] = useState('');

  const leaveEditor = useCallback(() => router.push('/settings/automations'), [router]);

  useEffect(() => {
    if (!canManage || !workflowId) return;
    const controller = new AbortController();
    void (async () => {
      setLoading(true);
      setLoadError('');
      try {
        const response = await fetch('/api/automations', { cache: 'no-store', signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Unable to load automation.');
        const match = ((payload.workflows || []) as AutomationWorkflow[]).find((item) => item.id === workflowId);
        if (!match) throw new Error('Automation not found.');
        setWorkflow(match);
      } catch (error) {
        if ((error as { name?: string })?.name === 'AbortError') return;
        setLoadError(error instanceof Error ? error.message : 'Unable to load automation.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [canManage, workflowId]);

  if (!canManage) {
    return <div className="mx-auto max-w-xl px-5 py-16 text-center"><AlertCircle className="mx-auto h-7 w-7 text-zinc-400" /><h1 className="mt-3 text-lg font-semibold">Manager access required</h1><p className="mt-1 text-sm text-zinc-500">Only managers and administrators can edit automations.</p></div>;
  }

  if (loading) {
    return <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center gap-2 bg-zinc-50 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading workflow editor…</div>;
  }

  if (loadError) {
    return <div className="mx-auto max-w-xl px-5 py-16 text-center"><AlertCircle className="mx-auto h-7 w-7 text-red-500" /><h1 className="mt-3 text-lg font-semibold">Unable to open workflow</h1><p className="mt-1 text-sm text-zinc-500">{loadError}</p><button type="button" onClick={leaveEditor} className="button-primary mt-5 min-h-10">Back to automations</button></div>;
  }

  return (
    <div className="automation-editor-page min-h-[calc(100vh-4rem)] bg-zinc-50">
      <AutomationWorkflowBuilder
        workflow={workflow}
        onClose={leaveEditor}
        onSaved={() => undefined}
        onDeleted={() => undefined}
        showToast={showToast}
      />
      <style>{`
        .automation-editor-page [role="dialog"][aria-labelledby="workflow-builder-title"] > div {
          margin-left: 0 !important;
          max-width: none !important;
          width: 100% !important;
        }
        .automation-editor-page [role="dialog"][aria-labelledby="workflow-builder-title"] main > div {
          max-width: none !important;
        }
        @media (min-width: 1024px) {
          .automation-editor-page [aria-label="Visual workflow canvas"] {
            height: calc(100vh - 19rem) !important;
            min-height: 500px !important;
          }
        }
      `}</style>
    </div>
  );
}
