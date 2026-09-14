import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor, isManagement } from '@/lib/auth/api-actor';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DynamicField = {
  field_key: string;
  field_type: string;
  is_required: boolean;
  options: unknown;
  default_value: unknown;
};

const PatchSchema = z.object({
  customerName: z.string().trim().min(1).max(160).optional(),
  customerPhone: z.string().trim().max(64).optional(),
  customerEmail: z.union([z.literal(''), z.string().trim().email().max(254)]).optional(),
  customerCity: z.string().trim().max(120).optional(),
  customerCountry: z.string().trim().max(120).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  assignedTo: z.union([uuidSchema, z.literal(''), z.null()]).optional(),
  pipelineStageId: z.union([uuidSchema, z.null()]).optional(),
  customData: z.record(z.string(), z.unknown()).optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'No changes supplied.' });

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isEmptyValue(value: unknown) {
  return value == null || value === '' || (Array.isArray(value) && value.length === 0);
}

function normalizeDynamicValue(field: DynamicField, value: unknown) {
  if (isEmptyValue(value)) return null;
  if (['number', 'currency', 'percentage', 'rating'].includes(field.field_type)) {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) throw new Error(`${field.field_key} must be a number.`);
    return numeric;
  }
  if (field.field_type === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new Error(`${field.field_key} must be true or false.`);
  }
  if (field.field_type === 'multi_select') {
    if (!Array.isArray(value)) throw new Error(`${field.field_key} must contain a list.`);
    const normalized = value.map((item) => String(item).trim()).filter(Boolean).slice(0, 100);
    const options = Array.isArray(field.options) ? field.options.map(String) : [];
    if (options.length && normalized.some((item) => !options.includes(item))) {
      throw new Error(`${field.field_key} contains an unsupported option.`);
    }
    return normalized;
  }
  const text = String(value).trim().slice(0, field.field_type === 'textarea' ? 10000 : 1000);
  if (field.field_type === 'single_select') {
    const options = Array.isArray(field.options) ? field.options.map(String) : [];
    if (options.length && text && !options.includes(text)) throw new Error(`${field.field_key} contains an unsupported option.`);
  }
  return text || null;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  const { id } = await context.params;

  const { data, error } = await actor.supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .eq('workspace_id', actor.profile.workspace_id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Unable to load record.' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Record not found.' }, { status: 404 });
  return NextResponse.json({ lead: data }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  const { id } = await context.params;
  const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid changes.' }, { status: 400 });
  }

  try {
    const { data: existing, error: existingError } = await actor.supabase
      .from('leads')
      .select('id,assigned_to,custom_data,pipeline_id,stage')
      .eq('id', id)
      .eq('workspace_id', actor.profile.workspace_id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) return NextResponse.json({ error: 'Record not found.' }, { status: 404 });

    const patch: Record<string, unknown> = {};
    if (parsed.data.customerName !== undefined) patch.customer_name = parsed.data.customerName;
    if (parsed.data.customerPhone !== undefined) patch.customer_phone = parsed.data.customerPhone;
    if (parsed.data.customerEmail !== undefined) patch.customer_email = parsed.data.customerEmail || null;
    if (parsed.data.customerCity !== undefined) patch.customer_city = parsed.data.customerCity || null;
    if (parsed.data.customerCountry !== undefined) patch.customer_country = parsed.data.customerCountry || null;
    if (parsed.data.priority !== undefined) patch.priority = parsed.data.priority;

    if (parsed.data.assignedTo !== undefined) {
      if (!isManagement(actor.profile) && parsed.data.assignedTo !== actor.user.id) {
        return NextResponse.json({ error: 'Agents cannot reassign records to another user.' }, { status: 403 });
      }
      if (parsed.data.assignedTo) {
        const { data: assignee, error: assigneeError } = await actor.supabase
          .from('profiles')
          .select('id')
          .eq('id', parsed.data.assignedTo)
          .eq('workspace_id', actor.profile.workspace_id)
          .eq('role', 'agent')
          .eq('is_active', true)
          .maybeSingle();
        if (assigneeError) throw assigneeError;
        if (!assignee) return NextResponse.json({ error: 'Selected owner is not available.' }, { status: 400 });
      }
      patch.assigned_to = parsed.data.assignedTo || null;
      patch.assigned_by = actor.user.id;
      patch.assigned_at = parsed.data.assignedTo ? new Date().toISOString() : null;
    }

    if (parsed.data.customData) {
      const { data: fieldRows, error: fieldsError } = await actor.supabase
        .from('field_definitions')
        .select('field_key,field_type,is_required,options,default_value')
        .eq('workspace_id', actor.profile.workspace_id)
        .eq('entity_type', 'lead')
        .eq('is_active', true);
      if (fieldsError) throw fieldsError;
      const fields = (fieldRows || []) as DynamicField[];
      const byKey = new Map(fields.map((field) => [field.field_key, field]));
      const merged = { ...asRecord(existing.custom_data) };

      for (const [key, raw] of Object.entries(parsed.data.customData)) {
        const field = byKey.get(key);
        if (!field) return NextResponse.json({ error: `Unknown business field: ${key}` }, { status: 400 });
        const normalized = normalizeDynamicValue(field, raw);
        if (normalized == null) delete merged[key];
        else merged[key] = normalized;
      }

      for (const field of fields) {
        if (field.is_required && isEmptyValue(merged[field.field_key])) {
          return NextResponse.json({ error: `${field.field_key.replaceAll('_', ' ')} is required.` }, { status: 400 });
        }
      }
      patch.custom_data = merged;
    }

    if (parsed.data.pipelineStageId !== undefined) {
      if (!parsed.data.pipelineStageId) {
        patch.pipeline_stage_id = null;
      } else {
        const { data: stage, error: stageError } = await actor.supabase
          .from('pipeline_stages')
          .select('id,stage_type,pipelines!inner(id,workspace_id)')
          .eq('id', parsed.data.pipelineStageId)
          .eq('pipelines.workspace_id', actor.profile.workspace_id)
          .maybeSingle();
        if (stageError) throw stageError;
        if (!stage) return NextResponse.json({ error: 'Pipeline stage is not available in this workspace.' }, { status: 400 });
        patch.pipeline_stage_id = stage.id;
        const stageType = stage.stage_type;
        if (stageType === 'won') patch.stage = 'won';
        else if (stageType === 'lost') patch.stage = 'lost';
        else if (existing.stage === 'won' || existing.stage === 'lost') patch.stage = 'new';
      }
    }

    patch.updated_at = new Date().toISOString();
    const { data: updated, error: updateError } = await actor.supabase
      .from('leads')
      .update(patch)
      .eq('id', id)
      .eq('workspace_id', actor.profile.workspace_id)
      .select('*')
      .single();
    if (updateError) throw updateError;

    return NextResponse.json({ lead: updated }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Generic lead update failed:', error);
    return NextResponse.json({ error: 'Unable to update the record.' }, { status: 500 });
  }
}
