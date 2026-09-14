import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';

const DownloadRequest = z.object({
  lead_id: uuidSchema,
  storage_path: z.string().trim().min(1).max(500),
});

export async function POST(req: NextRequest) {
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

  const parsed = DownloadRequest.safeParse(body);
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
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(storagePath, 300);
  if (error || !data?.signedUrl) {
    console.error('Signed document download URL creation failed:', error?.message);
    return NextResponse.json({ error: 'Document is unavailable.' }, { status: 404 });
  }

  return NextResponse.json({ url: data.signedUrl, expires_in: 300 });
}
