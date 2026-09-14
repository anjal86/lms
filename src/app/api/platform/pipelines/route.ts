import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor, isManagement } from '@/lib/auth/api-actor';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const StageSchema = z.object({
  key: z.string().trim().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/),
  name: z.string().trim().min(1).max(80),
  type: z.enum(['open', 'won', 'lost']).default('open'),
  probability: z.number().int().min(0).max(100).default(0),
  order: z.number().int().min(0).max(10000),
  color: z.string().trim().min(1).max(30).regex(/^[a-z0-9_-]+$/).default('zinc'),
});

const SaveSchema = z.object({
  pipelineId: uuidSchema,
  name: z.string().trim().min(1).max(100),
  stages: z.array(StageSchema).min(2).max(30),
}).superRefine((value, ctx) => {
  const keys = new Set<string>();
  for (const stage of value.stages) {
    if (keys.has(stage.key)) ctx.addIssue({ code: 'custom', message: `Duplicate stage key: ${stage.key}` });
    keys.add(stage.key);
  }
  if (!value.stages.some((stage) => stage.type === 'open')) {
    ctx.addIssue({ code: 'custom', message: 'A pipeline needs at least one open stage.' });
  }
});

export async function PATCH(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!isManagement(actor.profile)) {
    return NextResponse.json({ error: 'Only managers can configure pipelines.' }, { status: 403 });
  }

  const parsed = SaveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid pipeline.' }, { status: 400 });
  }

  const { pipelineId, name, stages } = parsed.data;
  const { data: pipeline, error: pipelineError } = await actor.supabase
    .from('pipelines')
    .select('id')
    .eq('id', pipelineId)
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('entity_type', 'lead')
    .eq('is_active', true)
    .maybeSingle();

  if (pipelineError) {
    console.error('Pipeline lookup failed:', pipelineError.message);
    return NextResponse.json({ error: 'Unable to validate pipeline.' }, { status: 500 });
  }
  if (!pipeline) return NextResponse.json({ error: 'Pipeline not found.' }, { status: 404 });

  const { error } = await actor.supabase.rpc('save_workspace_pipeline', {
    p_pipeline_id: pipelineId,
    p_name: name,
    p_stages: stages,
  });

  if (error) {
    console.error('Pipeline save failed:', error.message);
    if (error.code === '42501') return NextResponse.json({ error: 'You are not allowed to configure this pipeline.' }, { status: 403 });
    if (error.code === '22023') return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: 'Unable to save pipeline.' }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
}
