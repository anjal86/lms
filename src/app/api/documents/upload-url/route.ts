import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';

const UploadRequest = z.object({
  lead_id: uuidSchema,
  file_name: z.string().trim().min(1).max(180),
  content_type: z.enum(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  size_bytes: z.number().int().positive().max(10 * 1024 * 1024),
});

function safeFileName(name: string) {
  const cleaned = name
    .normalize('NFKC')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(-120);
  return cleaned || 'document';
}

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

  const parsed = UploadRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid document request.' }, { status: 400 });
  }

  const { lead_id: leadId, file_name: fileName, content_type: contentType, size_bytes: sizeBytes } = parsed.data;
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('id')
    .eq('id', leadId)
    .maybeSingle();

  if (leadError || !lead) {
    return NextResponse.json({ error: 'Lead not found or access denied.' }, { status: 404 });
  }

  const path = `${leadId}/${authData.user.id}/${randomUUID()}-${safeFileName(fileName)}`;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(path, { upsert: false });

  if (error || !data) {
    console.error('Signed document upload URL creation failed:', error?.message);
    return NextResponse.json(
      { error: 'Document storage is unavailable. Verify the private Storage bucket is configured.' },
      { status: 503 }
    );
  }

  return NextResponse.json({
    bucket,
    path,
    token: data.token,
    signed_url: data.signedUrl,
    content_type: contentType,
    size_bytes: sizeBytes,
  });
}
