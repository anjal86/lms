import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor, isManagement } from '@/lib/auth/api-actor';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const fieldTypes = [
  'text','textarea','number','currency','date','datetime','boolean','single_select',
  'multi_select','phone','email','url','country','city','user','relation','file',
  'address','percentage','rating',
] as const;

const FieldSchema = z.object({
  id: uuidSchema.optional(),
  label: z.string().trim().min(1).max(80),
  fieldKey: z.string().trim().max(80).regex(/^[a-z][a-z0-9_]*$/).optional(),
  fieldType: z.enum(fieldTypes),
  sectionKey: z.string().trim().min(1).max(80).regex(/^[a-z][a-z0-9_]*$/).default('details'),
  description: z.string().trim().max(240).optional().default(''),
  options: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
  required: z.boolean().default(false),
  searchable: z.boolean().default(false),
  filterable: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(10000).default(100),
});

const DeleteSchema = z.object({ id: uuidSchema });

function slugifyFieldKey(label: string) {
  const key = label
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 70);
  return key && /^[a-z]/.test(key) ? key : `field_${key || 'custom'}`;
}

async function requireManager(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor;
  if (!isManagement(actor.profile)) {
    return { error: NextResponse.json({ error: 'Only managers can configure business fields.' }, { status: 403 }) } as const;
  }
  return actor;
}

export async function GET(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  const { data, error } = await actor.supabase
    .from('field_definitions')
    .select('id,entity_type,field_key,label,field_type,section_key,description,options,validation,default_value,is_required,is_searchable,is_filterable,is_system,is_active,sort_order,definition_source')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('entity_type', 'lead')
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Unable to load custom fields:', error.message);
    return NextResponse.json({ error: 'Unable to load business fields.' }, { status: 500 });
  }
  return NextResponse.json({ fields: data || [] }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const actor = await requireManager(request);
  if ('error' in actor) return actor.error;

  const parsed = FieldSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid field configuration.' }, { status: 400 });
  }

  const input = parsed.data;
  const fieldKey = input.fieldKey || slugifyFieldKey(input.label);
  const needsOptions = input.fieldType === 'single_select' || input.fieldType === 'multi_select';
  if (needsOptions && input.options.length === 0) {
    return NextResponse.json({ error: 'Select fields need at least one option.' }, { status: 400 });
  }

  const { data, error } = await actor.supabase
    .from('field_definitions')
    .insert({
      workspace_id: actor.profile.workspace_id,
      entity_type: 'lead',
      field_key: fieldKey,
      label: input.label,
      field_type: input.fieldType,
      section_key: input.sectionKey,
      description: input.description || null,
      options: needsOptions ? input.options : [],
      is_required: input.required,
      is_searchable: input.searchable,
      is_filterable: input.filterable,
      is_system: false,
      is_active: true,
      sort_order: input.sortOrder,
      definition_source: 'custom',
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: `A field with key “${fieldKey}” already exists.` }, { status: 409 });
    }
    console.error('Unable to create custom field:', error.message);
    return NextResponse.json({ error: 'Unable to create the custom field.' }, { status: 500 });
  }

  return NextResponse.json({ field: data }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request: Request) {
  const actor = await requireManager(request);
  if ('error' in actor) return actor.error;

  const parsed = FieldSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !parsed.data.id) {
    return NextResponse.json({ error: parsed.success ? 'Field ID is required.' : parsed.error.issues[0]?.message || 'Invalid field configuration.' }, { status: 400 });
  }
  const input = parsed.data;
  const needsOptions = input.fieldType === 'single_select' || input.fieldType === 'multi_select';
  if (needsOptions && input.options.length === 0) {
    return NextResponse.json({ error: 'Select fields need at least one option.' }, { status: 400 });
  }

  const { data: existing, error: existingError } = await actor.supabase
    .from('field_definitions')
    .select('id,definition_source,field_key')
    .eq('id', input.id)
    .eq('workspace_id', actor.profile.workspace_id)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing) return NextResponse.json({ error: 'Field not found.' }, { status: 404 });
  if (existing.definition_source !== 'custom') {
    return NextResponse.json({ error: 'Template fields are managed by the active business model. Add a custom field instead.' }, { status: 409 });
  }

  const { data, error } = await actor.supabase
    .from('field_definitions')
    .update({
      label: input.label,
      field_type: input.fieldType,
      section_key: input.sectionKey,
      description: input.description || null,
      options: needsOptions ? input.options : [],
      is_required: input.required,
      is_searchable: input.searchable,
      is_filterable: input.filterable,
      sort_order: input.sortOrder,
    })
    .eq('id', input.id)
    .eq('workspace_id', actor.profile.workspace_id)
    .select('*')
    .single();

  if (error) {
    console.error('Unable to update custom field:', error.message);
    return NextResponse.json({ error: 'Unable to update the custom field.' }, { status: 500 });
  }
  return NextResponse.json({ field: data }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(request: Request) {
  const actor = await requireManager(request);
  if ('error' in actor) return actor.error;

  const parsed = DeleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Valid field ID is required.' }, { status: 400 });

  const { data: existing, error: existingError } = await actor.supabase
    .from('field_definitions')
    .select('id,definition_source')
    .eq('id', parsed.data.id)
    .eq('workspace_id', actor.profile.workspace_id)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing) return NextResponse.json({ error: 'Field not found.' }, { status: 404 });
  if (existing.definition_source !== 'custom') {
    return NextResponse.json({ error: 'Template fields cannot be deleted individually.' }, { status: 409 });
  }

  // Soft-disable so historical custom_data remains interpretable and recoverable.
  const { error } = await actor.supabase
    .from('field_definitions')
    .update({ is_active: false })
    .eq('id', parsed.data.id)
    .eq('workspace_id', actor.profile.workspace_id);
  if (error) {
    console.error('Unable to disable custom field:', error.message);
    return NextResponse.json({ error: 'Unable to remove the custom field.' }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
}
