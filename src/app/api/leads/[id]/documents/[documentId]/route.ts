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

export async function PATCH(request: Request, context: Context) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  const { id, documentId } = await context.params;
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: 'Invalid opportunity id.' }, { status: 400 });

  const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid document update.' }, { status: 400 });

  const input = parsed.data;
  const patch: Record<string, unknown> = {};
  if (input.lifecycleStatus !== undefined) patch.lifecycle_status = input.lifecycleStatus;
  if (input.documentType !== undefined) { patch.document_type = input.documentType; patch.category = input.documentType; }
  if (input.title !== undefined) patch.title = input.title;
  if (input.ownerId !== undefined) patch.owner_id = input.ownerId;
  if (input.expiresAt !== undefined) patch.expires_at = input.expiresAt;
  if (input.notes !== undefined) patch.notes = input.notes || null;
  if (input.rejectionReason !== undefined) patch.rejection_reason = input.rejectionReason || null;

  const { data, error } = await actor.supabase
    .from('lead_documents')
    .update(patch)
    .eq('lead_id', id)
    .eq('id', documentId)
    .select('*')
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Unable to update document.' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Document not found or unavailable.' }, { status: 404 });
  return NextResponse.json({ document: data });
}

export async function DELETE(request: Request, context: Context) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  const { id, documentId } = await context.params;
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: 'Invalid opportunity id.' }, { status: 400 });

  const { error } = await actor.supabase.from('lead_documents').delete().eq('lead_id', id).eq('id', documentId);
  if (error) return NextResponse.json({ error: 'Unable to delete document.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
