import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor } from '@/lib/auth/api-actor';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PatchSchema = z.object({
  lifecycleStatus: z.enum(['requested', 'received', 'verified', 'rejected']).optional(),
  documentType: z.string().trim().min(1).max(120).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  ownerId: z.union([uuidSchema, z.null()]).optional(),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  rejectionReason: z.string().trim().max(2000).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'No changes supplied.' });

type Context = { params: Promise<{ id: string; documentId: string }> };

const ALLOWED_TRANSITIONS: Record<string, ReadonlySet<string>> = {
  requested: new Set(['received']),
  received: new Set(['verified', 'rejected']),
  verified: new Set(),
  rejected: new Set(['received']),
};

export async function PATCH(request: Request, context: Context) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  const { id, documentId } = await context.params;
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: 'Invalid opportunity id.' }, { status: 400 });

  const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid document update.' }, { status: 400 });
  const input = parsed.data;

  const { data: lead, error: leadError } = await actor.supabase
    .from('leads')
    .select('id')
    .eq('id', id)
    .eq('workspace_id', actor.profile.workspace_id)
    .maybeSingle();
  if (leadError) return NextResponse.json({ error: 'Unable to validate opportunity.' }, { status: 500 });
  if (!lead) return NextResponse.json({ error: 'Opportunity not found or unavailable.' }, { status: 404 });

  const { data: existing, error: existingError } = await actor.supabase
    .from('lead_documents')
    .select('*')
    .eq('lead_id', id)
    .eq('id', documentId)
    .maybeSingle();
  if (existingError) return NextResponse.json({ error: 'Unable to load document.' }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Document not found or unavailable.' }, { status: 404 });

  if (input.ownerId) {
    const { data: owner, error: ownerError } = await actor.supabase
      .from('profiles')
      .select('id')
      .eq('id', input.ownerId)
      .eq('workspace_id', actor.profile.workspace_id)
      .eq('is_active', true)
      .maybeSingle();
    if (ownerError) return NextResponse.json({ error: 'Unable to validate document owner.' }, { status: 500 });
    if (!owner) return NextResponse.json({ error: 'Document owner is not an active member of this workspace.' }, { status: 400 });
  }

  const currentStatus = String(existing.lifecycle_status || (existing.uploaded_at || existing.storage_path ? 'received' : 'requested'));
  const nextStatus = input.lifecycleStatus ?? currentStatus;
  if (input.lifecycleStatus && input.lifecycleStatus !== currentStatus) {
    const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? new Set<string>();
    if (!allowed.has(input.lifecycleStatus)) {
      return NextResponse.json({
        error: `Document cannot move from ${currentStatus} to ${input.lifecycleStatus}.`,
        code: 'INVALID_DOCUMENT_TRANSITION',
      }, { status: 409 });
    }
  }

  if (nextStatus === 'verified' && !existing.uploaded_at && !existing.storage_path) {
    return NextResponse.json({ error: 'Upload the document before verifying it.', code: 'DOCUMENT_FILE_REQUIRED' }, { status: 409 });
  }

  const rejectionReason = input.rejectionReason !== undefined ? input.rejectionReason : existing.rejection_reason;
  if (nextStatus === 'rejected' && !String(rejectionReason || '').trim()) {
    return NextResponse.json({ error: 'A rejection reason is required when rejecting a document.', code: 'REJECTION_REASON_REQUIRED' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (input.lifecycleStatus !== undefined) patch.lifecycle_status = input.lifecycleStatus;
  if (input.documentType !== undefined) { patch.document_type = input.documentType; patch.category = input.documentType; }
  if (input.title !== undefined) patch.title = input.title;
  if (input.ownerId !== undefined) patch.owner_id = input.ownerId;
  if (input.expiresAt !== undefined) patch.expires_at = input.expiresAt;
  if (input.notes !== undefined) patch.notes = input.notes || null;
  if (input.rejectionReason !== undefined) patch.rejection_reason = input.rejectionReason || null;
  if (input.lifecycleStatus === 'received' && currentStatus === 'rejected') patch.rejection_reason = null;
  if (input.lifecycleStatus === 'verified') patch.rejection_reason = null;

  const { data, error } = await actor.supabase
    .from('lead_documents')
    .update(patch)
    .eq('lead_id', id)
    .eq('id', documentId)
    .select('*')
    .maybeSingle();
  if (error) {
    if (error.code === '23514') return NextResponse.json({ error: error.message || 'Invalid document lifecycle change.' }, { status: 409 });
    console.error('Document update failed:', error.message);
    return NextResponse.json({ error: 'Unable to update document.' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Document not found or unavailable.' }, { status: 404 });
  return NextResponse.json({ document: data });
}

export async function DELETE(request: Request, context: Context) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  const { id, documentId } = await context.params;
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
    .delete()
    .eq('lead_id', id)
    .eq('id', documentId)
    .select('id')
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Unable to delete document.' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Document not found or unavailable.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
