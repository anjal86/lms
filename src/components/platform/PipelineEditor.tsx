'use client';

import { useMemo, useState } from 'react';
import { GripVertical, Loader2, Plus, Trash2 } from 'lucide-react';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';
import type { PipelineConfig } from '@/lib/platform/types';

type StageDraft = {
  key: string;
  name: string;
  type: 'open' | 'won' | 'lost';
  probability: number;
  color: string;
};

function slugify(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 54);
  return normalized && /^[a-z]/.test(normalized) ? normalized : `stage_${normalized || Date.now()}`;
}

export default function PipelineEditor({ pipeline }: { pipeline: PipelineConfig | null }) {
  const { refresh } = useWorkspace();
  const initial = useMemo<StageDraft[]>(() => pipeline?.stages.map((stage) => ({ key: stage.stage_key, name: stage.name, type: stage.stage_type, probability: stage.probability, color: stage.color_token || 'zinc' })) || [], [pipeline]);
  const [name, setName] = useState(pipeline?.name || 'Sales Pipeline');
  const [stages, setStages] = useState<StageDraft[]>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!pipeline) return <section><h2 className="text-sm font-semibold text-zinc-950">Pipeline</h2><p className="mt-2 text-xs text-zinc-500">Apply a business template to create a pipeline.</p></section>;

  const addStage = () => {
    const label = `Stage ${stages.length + 1}`;
    let key = slugify(label);
    let suffix = 2;
    while (stages.some((stage) => stage.key === key)) key = `${slugify(label)}_${suffix++}`;
    setStages((current) => [...current, { key, name: label, type: 'open', probability: Math.min(90, current.length * 15), color: 'zinc' }]);
  };

  const updateStage = (index: number, patch: Partial<StageDraft>) => setStages((current) => current.map((stage, stageIndex) => stageIndex === index ? { ...stage, ...patch } : stage));
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= stages.length) return;
    setStages((current) => {
      const copy = [...current];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
  };

  const remove = (index: number) => {
    if (stages.length <= 2) return setError('Keep at least two pipeline stages.');
    setStages((current) => current.filter((_, stageIndex) => stageIndex !== index));
  };

  const save = async () => {
    if (!name.trim()) return setError('Pipeline name is required.');
    if (stages.length < 2) return setError('Keep at least two pipeline stages.');
    if (!stages.some((stage) => stage.type === 'open')) return setError('At least one stage must remain open.');
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/platform/pipelines', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipelineId: pipeline.id,
          name,
          stages: stages.map((stage, index) => ({ ...stage, order: (index + 1) * 10 })),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to save pipeline.');
      await refresh();
      setNotice('Pipeline saved. Existing records were kept in matching stages; removed stages were moved safely.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save pipeline.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h2 className="text-sm font-semibold text-zinc-950">Pipeline</h2><p className="mt-1 text-xs text-zinc-500">Rename stages, change outcomes and reorder the workflow without changing application code.</p></div>
        <button type="button" onClick={addStage} className="button-secondary button-sm"><Plus className="h-3.5 w-3.5" /> Add stage</button>
      </div>

      {(error || notice) && <div role={error ? 'alert' : 'status'} className={`rounded-md border px-3 py-2 text-xs ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{error || notice}</div>}

      <label className="block space-y-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Pipeline name<input value={name} onChange={(event) => setName(event.target.value)} className="h-9 w-full max-w-md rounded-md border border-zinc-200 bg-white px-3 text-xs font-normal normal-case tracking-normal text-zinc-900" /></label>

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <div className="hidden grid-cols-[34px_minmax(160px,1fr)_130px_100px_80px] gap-2 border-b border-zinc-100 bg-zinc-50 px-3 py-2 text-[9px] font-semibold uppercase tracking-wide text-zinc-400 sm:grid"><span /><span>Stage</span><span>Type</span><span>Probability</span><span /></div>
        <div className="divide-y divide-zinc-100">
          {stages.map((stage, index) => (
            <div key={stage.key} className="grid gap-2 p-3 sm:grid-cols-[34px_minmax(160px,1fr)_130px_100px_80px] sm:items-center">
              <div className="flex items-center gap-1 text-zinc-300"><GripVertical className="h-4 w-4" /><span className="font-mono text-[9px]">{index + 1}</span></div>
              <div><input value={stage.name} onChange={(event) => updateStage(index, { name: event.target.value })} className="h-8 w-full rounded border border-zinc-200 px-2 text-xs font-medium text-zinc-800" /><div className="mt-0.5 font-mono text-[8px] text-zinc-400">{stage.key}</div></div>
              <select value={stage.type} onChange={(event) => updateStage(index, { type: event.target.value as StageDraft['type'] })} className="h-8 rounded border border-zinc-200 bg-white px-2 text-xs"><option value="open">Open</option><option value="won">Won</option><option value="lost">Lost</option></select>
              <div className="flex items-center gap-1"><input type="number" min="0" max="100" value={stage.probability} onChange={(event) => updateStage(index, { probability: Math.max(0, Math.min(100, Number(event.target.value) || 0)) })} className="h-8 w-16 rounded border border-zinc-200 px-2 font-mono text-xs" /><span className="text-[10px] text-zinc-400">%</span></div>
              <div className="flex items-center justify-end gap-1"><button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="rounded px-1.5 py-1 text-[10px] text-zinc-500 hover:bg-zinc-100 disabled:opacity-30" aria-label={`Move ${stage.name} up`}>↑</button><button type="button" onClick={() => move(index, 1)} disabled={index === stages.length - 1} className="rounded px-1.5 py-1 text-[10px] text-zinc-500 hover:bg-zinc-100 disabled:opacity-30" aria-label={`Move ${stage.name} down`}>↓</button><button type="button" onClick={() => remove(index)} className="rounded p-1 text-zinc-400 hover:bg-rose-50 hover:text-rose-700" aria-label={`Remove ${stage.name}`}><Trash2 className="h-3.5 w-3.5" /></button></div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3"><span className="text-[10px] text-zinc-500">Editing a template pipeline makes this workspace’s pipeline custom. A future template change can still install a new default pipeline.</span><button type="button" onClick={() => void save()} disabled={saving} className="button-primary button-sm shrink-0">{saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save pipeline</button></div>
    </section>
  );
}
