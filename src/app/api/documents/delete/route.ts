import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';

const DeleteRequest = z.object({
  lead_id: uuidSchema,
  storage_path: z.string().trim().min(1).max(500),
});

export async function DELETE(req: NextRequest) {
  const bucket = process.env.DOCUMENTS_BUCKET || 'travel-documents';
  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = DeleteRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid document request.' }, { status: 400 });
  }

  const { lead_id: leadId, storage_path: storagePath } = parsed.data;
  if (!storagePath.startsWith(`${leadId}/`)) {
    return NextResponse.json({ error: 'Document path does not belong to this lead.' }, { status: 400 });
  }

  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('id')
    .eq('id', leadId)
    .maybeSingle();
  if (leadError || !lead) {
    return NextResponse.json({ error: 'Lead not found or access denied.' }, { status: 404 });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(bucket).remove([storagePath]);
  if (error) {
    console.error('Private document deletion failed:', error.message);
    return NextResponse.json({ error: 'Unable to delete document.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
