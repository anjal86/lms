import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getApiActor } from '@/lib/auth/api-actor';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET = 'conversation-media';
const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  'image/jpeg','image/png','image/webp','image/gif',
  'video/mp4','video/quicktime','audio/mpeg','audio/mp4','audio/ogg','audio/webm',
  'application/pdf','text/plain','application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'attachment';
}

function attachmentKind(mimeType: string) {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'file';
}

async function loadConversation(actor: Awaited<ReturnType<typeof getApiActor>>, id: string) {
  if ('error' in actor) return null;
  const { data } = await actor.supabase
    .from('lead_conversations')
    .select('id,workspace_id')
    .eq('id', id)
    .eq('workspace_id', actor.profile.workspace_id)
    .maybeSingle();
  return data || null;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  const { id } = await context.params;
  const conversation = await loadConversation(actor, id);
  if (!conversation) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });

  const form = await request.formData().catch(() => null);
  const value = form?.get('file');
  if (!(value instanceof File)) return NextResponse.json({ error: 'Choose a file to attach.' }, { status: 400 });
  if (!value.size || value.size > MAX_BYTES) return NextResponse.json({ error: 'Attachments must be 15 MB or smaller.' }, { status: 400 });
  if (!ALLOWED_TYPES.has(value.type)) return NextResponse.json({ error: 'This file type is not supported.' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const fileName = safeName(value.name);
  const path = `${actor.profile.workspace_id}/${id}/${randomUUID()}-${fileName}`;
  const bytes = Buffer.from(await value.arrayBuffer());
  const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType: value.type,
    upsert: false,
  });
  if (uploadError) {
    console.error('Conversation attachment upload failed:', uploadError.message);
    return NextResponse.json({ error: 'Unable to upload attachment.' }, { status: 500 });
  }

  const { data: signed, error: signError } = await admin.storage.from(BUCKET).createSignedUrl(path, 15 * 60);
  if (signError || !signed?.signedUrl) {
    await admin.storage.from(BUCKET).remove([path]);
    return NextResponse.json({ error: 'Unable to prepare attachment.' }, { status: 500 });
  }

  return NextResponse.json({
    attachment: {
      storagePath: path,
      providerUrl: signed.signedUrl,
      url: `/api/conversations/${id}/attachments?path=${encodeURIComponent(path)}`,
      fileName: value.name,
      mimeType: value.type,
      size: value.size,
      kind: attachmentKind(value.type),
    },
  }, { status: 201 });
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  const { id } = await context.params;
  const conversation = await loadConversation(actor, id);
  if (!conversation) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });

  const path = new URL(request.url).searchParams.get('path') || '';
  const expectedPrefix = `${actor.profile.workspace_id}/${id}/`;
  if (!path.startsWith(expectedPrefix)) return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 });

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).download(path);
  if (error || !data) return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 });
  const contentType = data.type || 'application/octet-stream';
  return new Response(await data.arrayBuffer(), {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=300',
      'Content-Disposition': 'inline',
    },
  });
}
