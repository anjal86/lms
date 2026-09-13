import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor } from '@/lib/auth/api-actor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ConvertSchema = z.object({
  customerName: z.string().trim().min(1).max(160).optional(),
  customerPhone: z.string().trim().max(64).optional(),
  customerEmail: z.string().trim().email().optional().or(z.literal('')),
  customerCity: z.string().trim().max(120).optional().or(z.literal('')),
  customerCountry: z.string().trim().max(120).optional().or(z.literal('')),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  assignedTo: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(5000).optional().or(z.literal('')),
  customData: z.record(z.string(), z.unknown()).default({}),
});

type DynamicField = {
  field_key: string;
  field_type: string;
  is_required: boolean;
  options: unknown;
  default_value: unknown;
};

type ConversionResult = {
  lead?: { id: string; customer_name: string; [key: string]: unknown };
  conversation_id?: string;
  already_converted?: boolean;
};

function isEmptyValue(value: unknown) {
  return value == null || value === '' || (Array.isArray(value) && value.length === 0);
}

function normalizeValue(field: DynamicField, value: unknown) {
  if (isEmptyValue(value)) return field.default_value ?? null;
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
    if (options.length && normalized.some((item) => !options.includes(item))) throw new Error(`${field.field_key} contains an unsupported option.`);
    return normalized;
  }
  const text = String(value).trim().slice(0, field.field_type === 'textarea' ? 10000 : 1000);
  if (field.field_type === 'single_select') {
    const options = Array.isArray(field.options) ? field.options.map(String) : [];
    if (options.length && text && !options.includes(text)) throw new Error(`${field.field_key} contains an unsupported option.`);
  }
  return text || null;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  const { id: conversationId } = await context.params;
  const parsed = ConvertSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Validation failed.' }, { status: 400 });
  }

  try {
    const { data: fields, error: fieldsError } = await actor.supabase
      .from('field_definitions')
      .select('field_key,field_type,is_required,options,default_value')
      .eq('workspace_id', actor.profile.workspace_id)
      .eq('entity_type', 'lead')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (fieldsError) throw fieldsError;

    const fieldRows = (fields || []) as DynamicField[];
    const byKey = new Map(fieldRows.map((field) => [field.field_key, field]));
    const supplied = parsed.data.customData || {};
    const normalized: Record<string, unknown> = {};

    for (const key of Object.keys(supplied)) {
      if (!byKey.has(key)) return NextResponse.json({ error: `Unknown business field: ${key}` }, { status: 400 });
    }

    for (const field of fieldRows) {
      const value = normalizeValue(field, supplied[field.field_key]);
      if (field.is_required && isEmptyValue(value)) {
        return NextResponse.json({ error: `${field.field_key.replaceAll('_', ' ')} is required.` }, { status: 400 });
      }
      if (!isEmptyValue(value)) normalized[field.field_key] = value;
    }

    const { data, error } = await actor.supabase.rpc('convert_conversation_to_business_lead', {
      p_conversation_id: conversationId,
      p_customer_name: parsed.data.customerName || null,
      p_customer_phone: parsed.data.customerPhone || null,
      p_customer_email: parsed.data.customerEmail || null,
      p_customer_city: parsed.data.customerCity || null,
      p_customer_country: parsed.data.customerCountry || null,
      p_priority: parsed.data.priority,
      p_assigned_to: parsed.data.assignedTo ?? null,
      p_notes: parsed.data.notes || null,
      p_custom_data: normalized,
    });

    if (error) {
      console.error('Conversation conversion failed:', error.message);
      if (error.code === '42501') return NextResponse.json({ error: 'You do not have access to convert this conversation.' }, { status: 403 });
      if (error.code === 'P0002') return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
      if (error.code === '22023') return NextResponse.json({ error: error.message }, { status: 400 });
      throw error;
    }

    const result = (data || {}) as ConversionResult;
    if (!result.lead?.id) return NextResponse.json({ error: 'Conversion did not return a CRM record.' }, { status: 500 });

    return NextResponse.json({
      lead: result.lead,
      conversationId: result.conversation_id || conversationId,
      workspaceUrl: `/leads/${result.lead.id}/workspace`,
      alreadyConverted: Boolean(result.already_converted),
    }, { status: result.already_converted ? 200 : 201 });
  } catch (error) {
    console.error('Workspace conversation conversion failed:', error);
    return NextResponse.json({ error: 'Failed to convert conversation into the CRM.' }, { status: 500 });
  }
}
