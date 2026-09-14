import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor } from '@/lib/auth/api-actor';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CreateSchema = z.object({
  documentType: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(200),
  ownerId: z.union([uuidSchema, z.null()]).optional(),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
});

type Context = { params: Promise<{ id: string }> };

async function validateOpportunityAndOwner(
  actor: Awaited<ReturnType<typeof getApiActor>> extends infer T ? Exclude<T, { error: NextResponse }> : never,
  leadId: string,
  ownerId: string | null,
) {
  const { data: lead, error: leadError } = await actor.supabase
    .from('leads')
    .select('id')
    .eq('id', leadId)
    .eq('workspace_id', actor.profile.workspace_id)
    .maybeSingle();
  if (leadError) return { response: NextResponse.json({ error: 'Unable to validate opportunity.' }, { status: 500 }) };
  if (!lead) return { response: NextResponse.json({ error: 'Opportunity not found or unavailable.' }, { status: 404 }) };

  if (ownerId) {
    const { data: owner, error: ownerError } = await actor.supabase
      .from('profiles')
      .select('id')
      .eq('id', ownerId)
      .eq('workspace_id', actor.profile.workspace_id)
      .eq('is_active', true)
      .maybeSingle();
    if (ownerError) return { response: NextResponse.json({ error: 'Unable to validate document owner.' }, { status: 500 }) };
    if (!owner) return { response: NextResponse.json({ error: 'Document owner is not an active member of this workspace.' }, { status: 400 }) };
  }

  return { response: null };
}

export async function GET(request: Request, context: Context) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  const { id } = await context.params;
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: 'Invalid opportunity id.' }, { status: 400 });

  const { data: lead, error: leadError } = await actor.supabase
    .from('leads')
    .select('id')
    .eq('id', id)
    .eq('workspace_id', actor.profile.workspace_id)
    .maybeSingle();
  if (leadError) return NextResponse.json({ error: 'Unable to validate opportunity.' }, { status: 500 });
  if (!lead) return NextResponse.json({ error: 'Opportunity not found or unavailable.' }, { status: 404 });

  const { data, error } = await actor.supabase
    .from('lead_documents')
    .select('id,lead_id,passenger_id,title,category,document_type,file_name,file_size,storage_path,uploaded_at,lifecycle_status,requested_at,received_at,verified_at,rejected_at,expires_at,owner_id,notes,rejection_reason,payload')
    .eq('lead_id', id)
    .order('requested_at', { ascending: false, nullsFirst: false });
  if (error) return NextResponse.json({ error: 'Unable to load documents.' }, { status: 500 });
  return NextResponse.json({ documents: data || [] }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request, context: Context) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  const { id } = await context.params;
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: 'Invalid opportunity id.' }, { status: 400 });

  const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid document request.' }, { status: 400 });

  const input = parsed.data;
  const ownerId = input.ownerId ?? actor.user.id;
  const validation = await validateOpportunityAndOwner(actor, id, ownerId);
  if (validation.response) return validation.response;

  const recordId = crypto.randomUUID();
  const { data, error } = await actor.supabase
    .from('lead_documents')
    .insert({
      lead_id: id,
      id: recordId,
      title: input.title,
      category: input.documentType,
      document_type: input.documentType,
      lifecycle_status: 'requested',
      requested_at: new Date().toISOString(),
      expires_at: input.expiresAt || null,
      owner_id: ownerId,
      notes: input.notes || null,
      payload: { id: recordId, title: input.title, category: input.documentType, lifecycle_status: 'requested' },
    })
    .select('*')
    .single();
  if (error) {
    if (error.code === '23514') return NextResponse.json({ error: error.message || 'Invalid document request.' }, { status: 400 });
    console.error('Document request create failed:', error.message);
    return NextResponse.json({ error: 'Unable to request document.' }, { status: 500 });
  }

  return NextResponse.json({ document: data }, { status: 201 });
}
