import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor, isManagement, type ApiActor } from '@/lib/auth/api-actor';
import { DEFAULT_TERMINOLOGY, type PipelineConfig, type WorkspaceConfig, type WorkspaceTerminology } from '@/lib/platform/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  templateKey: z.string().trim().min(1).max(50).regex(/^[a-z0-9_-]+$/).optional(),
  timezone: z.string().trim().min(1).max(100).optional(),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).optional(),
  locale: z.string().trim().min(2).max(35).optional(),
  terminology: z.record(z.string(), z.string().trim().min(1).max(80)).optional(),
  modules: z.record(z.string().regex(/^[a-z0-9_-]+$/), z.boolean()).optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'No configuration changes supplied.' });

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function terminology(value: unknown): WorkspaceTerminology {
  const raw = asRecord(value);
  const normalized: WorkspaceTerminology = { ...DEFAULT_TERMINOLOGY };
  for (const [key, item] of Object.entries(raw)) {
    if (typeof item === 'string' && item.trim()) normalized[key] = item.trim();
  }
  return normalized;
}

async function loadWorkspaceConfig(actor: ApiActor): Promise<WorkspaceConfig> {
  const workspaceId = actor.profile.workspace_id;
  const [workspaceResult, fieldsResult, modulesResult, pipelinesResult, templatesResult] = await Promise.all([
    actor.supabase
      .from('workspaces')
      .select('id,name,slug,business_type,template_key,timezone,currency,locale,terminology,settings')
      .eq('id', workspaceId)
      .single(),
    actor.supabase
      .from('field_definitions')
      .select('id,entity_type,field_key,label,field_type,section_key,description,options,validation,default_value,is_required,is_searchable,is_filterable,is_system,is_active,sort_order,definition_source')
      .eq('workspace_id', workspaceId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    actor.supabase
      .from('workspace_modules')
      .select('module_key,is_enabled,settings,sort_order')
      .eq('workspace_id', workspaceId)
      .order('sort_order', { ascending: true }),
    actor.supabase
      .from('pipelines')
      .select('id,pipeline_key,name,description,is_default,is_active,definition_source')
      .eq('workspace_id', workspaceId)
      .eq('is_active', true)
      .order('is_default', { ascending: false }),
    actor.supabase
      .from('business_templates')
      .select('key,name,business_type,description,terminology')
      .eq('is_active', true)
      .order('name', { ascending: true }),
  ]);

  if (workspaceResult.error || !workspaceResult.data) throw workspaceResult.error || new Error('Workspace not found.');
  if (fieldsResult.error) throw fieldsResult.error;
  if (modulesResult.error) throw modulesResult.error;
  if (pipelinesResult.error) throw pipelinesResult.error;
  if (templatesResult.error) throw templatesResult.error;

  const pipelineRows = pipelinesResult.data || [];
  const pipelineIds = pipelineRows.map((row) => row.id);
  let stageRows: Array<Record<string, unknown>> = [];
  if (pipelineIds.length > 0) {
    const stagesResult = await actor.supabase
      .from('pipeline_stages')
      .select('id,pipeline_id,stage_key,name,stage_type,probability,sort_order,color_token')
      .in('pipeline_id', pipelineIds)
      .order('sort_order', { ascending: true });
    if (stagesResult.error) throw stagesResult.error;
    stageRows = (stagesResult.data || []) as Array<Record<string, unknown>>;
  }

  const pipelines: PipelineConfig[] = pipelineRows.map((row) => ({
    id: row.id,
    pipeline_key: row.pipeline_key,
    name: row.name,
    description: row.description,
    is_default: Boolean(row.is_default),
    is_active: Boolean(row.is_active),
    definition_source: row.definition_source === 'custom' ? 'custom' : 'template',
    stages: stageRows
      .filter((stage) => stage.pipeline_id === row.id)
      .map((stage) => ({
        id: String(stage.id),
        stage_key: String(stage.stage_key),
        name: String(stage.name),
        stage_type: (stage.stage_type === 'won' || stage.stage_type === 'lost' ? stage.stage_type : 'open') as 'open' | 'won' | 'lost',
        probability: Number(stage.probability || 0),
        sort_order: Number(stage.sort_order || 100),
        color_token: String(stage.color_token || 'zinc'),
      })),
  }));

  const workspace = workspaceResult.data;
  return {
    workspace: {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      business_type: workspace.business_type,
      template_key: workspace.template_key,
      timezone: workspace.timezone,
      currency: workspace.currency,
      locale: workspace.locale,
      terminology: terminology(workspace.terminology),
      settings: asRecord(workspace.settings),
    },
    fields: (fieldsResult.data || []).map((field) => ({
      ...field,
      definition_source: field.definition_source === 'custom' ? 'custom' : 'template',
      options: Array.isArray(field.options) ? field.options : [],
      validation: asRecord(field.validation),
    })),
    modules: (modulesResult.data || []).map((moduleRow) => ({
      module_key: moduleRow.module_key,
      is_enabled: Boolean(moduleRow.is_enabled),
      settings: asRecord(moduleRow.settings),
      sort_order: Number(moduleRow.sort_order || 100),
    })),
    pipelines,
    templates: (templatesResult.data || []).map((template) => ({
      key: template.key,
      name: template.name,
      business_type: template.business_type,
      description: template.description,
      terminology: terminology(template.terminology),
    })),
  } as WorkspaceConfig;
}

export async function GET(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  try {
    const config = await loadWorkspaceConfig(actor);
    return NextResponse.json(config, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Unable to load workspace configuration:', error);
    return NextResponse.json({ error: 'Unable to load workspace configuration.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!isManagement(actor.profile)) {
    return NextResponse.json({ error: 'Only managers can configure the business workspace.' }, { status: 403 });
  }

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid configuration.' }, { status: 400 });
  }

  try {
    if (parsed.data.templateKey) {
      const { error } = await actor.supabase.rpc('apply_business_template', {
        p_workspace_id: actor.profile.workspace_id,
        p_template_key: parsed.data.templateKey,
      });
      if (error) throw error;

      const { error: repairError } = await actor.supabase.rpc('repair_workspace_pipeline_assignments', {
        p_workspace_id: actor.profile.workspace_id,
      });
      if (repairError) throw repairError;
    }

    const workspacePatch: Record<string, unknown> = {};
    if (parsed.data.name) workspacePatch.name = parsed.data.name;
    if (parsed.data.timezone) workspacePatch.timezone = parsed.data.timezone;
    if (parsed.data.currency) workspacePatch.currency = parsed.data.currency;
    if (parsed.data.locale) workspacePatch.locale = parsed.data.locale;

    if (parsed.data.terminology) {
      const { data: current, error: readError } = await actor.supabase
        .from('workspaces')
        .select('terminology')
        .eq('id', actor.profile.workspace_id)
        .single();
      if (readError) throw readError;
      workspacePatch.terminology = {
        ...asRecord(current?.terminology),
        ...parsed.data.terminology,
      };
    }

    if (Object.keys(workspacePatch).length > 0) {
      const { error } = await actor.supabase
        .from('workspaces')
        .update(workspacePatch)
        .eq('id', actor.profile.workspace_id);
      if (error) throw error;
    }

    if (parsed.data.modules) {
      for (const [moduleKey, isEnabled] of Object.entries(parsed.data.modules)) {
        const { error } = await actor.supabase
          .from('workspace_modules')
          .upsert({
            workspace_id: actor.profile.workspace_id,
            module_key: moduleKey,
            is_enabled: isEnabled,
          }, { onConflict: 'workspace_id,module_key' });
        if (error) throw error;
      }
    }

    return NextResponse.json(await loadWorkspaceConfig(actor), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Unable to update workspace configuration:', error);
    return NextResponse.json({ error: 'Unable to update workspace configuration.' }, { status: 500 });
  }
}
