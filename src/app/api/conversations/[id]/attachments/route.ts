import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getApiActor } from '@/lib/auth/api-actor';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { resolveMetaMessageMedia } from '@/lib/integrations/meta-message-media';
import { fetchWhatsappBridgeMedia } from '@/lib/integrations/whatsapp-baileys';

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

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {};
}

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
    .select('id,workspace_id,provider,connection_id,external_thread_id')
    .eq('id', id)
    .eq('workspace_id', actor.profile.workspace_id)
    .maybeSingle();
  return data || null;
}

function storageUnavailable(message?: string) {
  if (message) console.error('Conversation attachment storage unavailable:', message);
  return NextResponse.json(
    { error: 'Attachment storage is unavailable. Start the Supabase Storage service and try again.' },
    { status: 503 }
  );
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

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (error) {
    return storageUnavailable(error instanceof Error ? error.message : 'Missing service-role configuration.');
  }

  const { data: bucket, error: bucketError } = await admin.storage.getBucket(BUCKET);
  if (bucketError || !bucket) return storageUnavailable(bucketError?.message || `Bucket ${BUCKET} is missing.`);

  const fileName = safeName(value.name);
  const path = `${actor.profile.workspace_id}/${id}/${randomUUID()}-${fileName}`;
  const bytes = await value.arrayBuffer();
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
    if (signError) console.error('Conversation attachment signing failed:', signError.message);
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

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (error) {
    return storageUnavailable(error instanceof Error ? error.message : 'Missing service-role configuration.');
  }

  try {
    const { data } = await admin.storage.from(BUCKET).download(path);
    if (data) {
      const contentType = data.type || 'application/octet-stream';
      return new Response(await data.arrayBuffer(), {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'private, max-age=300',
          'Content-Disposition': 'inline',
        },
      });
    }
  } catch {
    // The staging object may already be released after provider accepted the message.
  }

  if (conversation.provider === 'whatsapp' && conversation.connection_id) {
    const { data: recentMessages } = await admin
      .from('lead_messages')
      .select('provider_message_id,external_message_id,metadata,sent_at')
      .eq('conversation_id', id)
      .order('sent_at', { ascending: false })
      .limit(100);

    const storedMessage = (recentMessages || []).find((message) => record(message.metadata).storage_path === path);
    const messageId = storedMessage?.external_message_id || storedMessage?.provider_message_id;
    if (messageId) {
      try {
        const media = await fetchWhatsappBridgeMedia(conversation.connection_id, messageId);
        if (media && media.buffer.length > 0) {
          const metadata = record(storedMessage?.metadata);
          const contentType = media.contentType || (typeof metadata.mime_type === 'string' ? metadata.mime_type : 'application/octet-stream');
          return new Response(Uint8Array.from(media.buffer), {
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'private, max-age=300',
              'Content-Disposition': 'inline',
            },
          });
        }
      } catch (waErr) {
        console.warn('Unable to stream media from WhatsApp bridge:', waErr);
      }
    }
    return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 });
  }

  if ((conversation.provider !== 'facebook' && conversation.provider !== 'instagram') || !conversation.connection_id) {
    return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 });
  }

  const { data: recentMessages } = await admin
    .from('lead_messages')
    .select('provider_message_id,external_message_id,metadata,sent_at')
    .eq('conversation_id', id)
    .eq('direction', 'outbound')
    .order('sent_at', { ascending: false })
    .limit(100);

  const storedMessage = (recentMessages || []).find((message) => record(message.metadata).storage_path === path);
  const providerMessageId = storedMessage?.provider_message_id || storedMessage?.external_message_id;
  if (!providerMessageId) return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 });

  try {
    const providerMedia = await resolveMetaMessageMedia({
      provider: conversation.provider,
      connectionId: conversation.connection_id,
      externalThreadId: conversation.external_thread_id,
      messageId: providerMessageId,
    });
    if (!providerMedia?.url) return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 });

    const providerResponse = await fetch(providerMedia.url, { redirect: 'follow', cache: 'no-store' });
    if (!providerResponse.ok) return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 });

    const metadata = record(storedMessage?.metadata);
    const contentType = providerResponse.headers.get('content-type')
      || providerMedia.mimeType
      || (typeof metadata.mime_type === 'string' ? metadata.mime_type : 'application/octet-stream');

    return new Response(await providerResponse.arrayBuffer(), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=300',
        'Content-Disposition': 'inline',
      },
    });
  } catch (error) {
    console.error('Unable to resolve released Meta attachment:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 });
  }
}
