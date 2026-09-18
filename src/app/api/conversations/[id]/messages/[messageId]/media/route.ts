import { NextResponse } from 'next/server';
import { getApiActor } from '@/lib/auth/api-actor';
import { fetchWhatsappBridgeMediaResult } from '@/lib/integrations/whatsapp-baileys';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'attachment';
}

function mimeExtension(mimeType: string) {
  const mime = mimeType.toLowerCase();
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('quicktime')) return 'mov';
  if (mime.includes('ogg') || mime.includes('opus')) return 'ogg';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('pdf')) return 'pdf';
  return 'bin';
}

function mediaErrorResponse(status: number, error: string, code: string | null, terminal: boolean) {
  return NextResponse.json({
    status: terminal ? 'unavailable' : 'retryable',
    error,
    code,
    terminal,
  }, { status });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; messageId: string }> }
) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  const { id: conversationId, messageId } = await context.params;
  const { data: message, error: messageError } = await actor.supabase
    .from('lead_messages')
    .select('id,conversation_id,connection_id,provider,external_message_id,message_type,metadata')
    .eq('id', messageId)
    .eq('conversation_id', conversationId)
    .maybeSingle();

  if (messageError || !message) {
    return NextResponse.json({ error: 'Message not found.' }, { status: 404 });
  }
  if (message.provider !== 'whatsapp' || !message.connection_id || !message.external_message_id) {
    return NextResponse.json({ error: 'This message is not backed by a linked WhatsApp account.' }, { status: 400 });
  }

  const metadata = record(message.metadata);
  const storedUrl = typeof metadata.attachment_url === 'string' && metadata.attachment_url.trim()
    ? metadata.attachment_url.trim()
    : null;
  if (storedUrl) {
    return NextResponse.json({
      status: 'ready',
      url: storedUrl,
      mimeType: typeof metadata.mime_type === 'string' ? metadata.mime_type : null,
      fileName: typeof metadata.file_name === 'string' ? metadata.file_name : null,
    });
  }

  if (metadata.media_recovery_state === 'unavailable') {
    return mediaErrorResponse(
      410,
      'Media no longer available from linked WhatsApp.',
      typeof metadata.media_retry_code === 'string' ? metadata.media_retry_code : 'whatsapp_media_unavailable',
      true
    );
  }

  const envelope = record(metadata.whatsapp_media_envelope);
  const hasEnvelope = Object.keys(envelope).length > 0;
  const result = await fetchWhatsappBridgeMediaResult(
    message.connection_id,
    message.external_message_id,
    hasEnvelope ? envelope : null
  );

  const admin = createSupabaseAdminClient();
  if (!result.ok) {
    const missingEnvelope = result.code === 'media_envelope_missing' && !hasEnvelope;
    const terminal = result.terminal && !missingEnvelope;
    const nextMetadata: Record<string, unknown> = {
      ...metadata,
      media_recovery_state: terminal ? 'unavailable' : 'retryable',
      media_retry_error: missingEnvelope
        ? 'WhatsApp media metadata needs to be refreshed from chat history.'
        : result.error,
      media_retry_code: missingEnvelope ? 'media_metadata_refresh_required' : result.code,
      media_retry_updated_at: new Date().toISOString(),
    };

    await admin
      .from('lead_messages')
      .update({ metadata: nextMetadata })
      .eq('id', message.id)
      .eq('conversation_id', conversationId);

    if (missingEnvelope) {
      return mediaErrorResponse(
        409,
        'Refresh this chat history once, then tap the attachment again.',
        'media_metadata_refresh_required',
        false
      );
    }

    return mediaErrorResponse(
      terminal ? 410 : result.status >= 400 && result.status < 600 ? result.status : 502,
      terminal ? 'Media no longer available from linked WhatsApp.' : result.error,
      result.code,
      terminal
    );
  }

  const originalMime = typeof metadata.mime_type === 'string' ? metadata.mime_type : '';
  const resolvedMime = result.contentType && result.contentType !== 'application/octet-stream'
    ? result.contentType
    : originalMime || 'application/octet-stream';
  const originalFileName = typeof metadata.file_name === 'string' ? metadata.file_name : '';
  const fallbackName = `whatsapp-${message.message_type || 'media'}-${message.external_message_id.slice(-8)}.${mimeExtension(resolvedMime)}`;
  const fileName = safeName(originalFileName || fallbackName);
  const storagePath = `${actor.profile.workspace_id}/${conversationId}/whatsapp-${message.id}-${fileName}`;

  const { error: uploadError } = await admin.storage
    .from('conversation-media')
    .upload(storagePath, result.buffer, {
      contentType: resolvedMime,
      upsert: true,
    });

  if (uploadError) {
    console.error('Lazy WhatsApp media storage upload failed:', uploadError.message);
    return NextResponse.json({ error: 'Unable to cache the WhatsApp attachment.' }, { status: 500 });
  }

  const attachmentUrl = `/api/conversations/${conversationId}/attachments?path=${encodeURIComponent(storagePath)}`;
  const nextMetadata: Record<string, unknown> = {
    ...metadata,
    storage_path: storagePath,
    attachment_url: attachmentUrl,
    preview_url: resolvedMime.startsWith('image/') ? attachmentUrl : null,
    file_name: fileName,
    mime_type: resolvedMime,
    size: result.buffer.length,
    media_retrieved_at: new Date().toISOString(),
    media_recovery_state: 'stored',
    media_retry_error: null,
    media_retry_code: null,
  };

  const { error: updateError } = await admin
    .from('lead_messages')
    .update({ metadata: nextMetadata })
    .eq('id', message.id)
    .eq('conversation_id', conversationId);

  if (updateError) {
    console.error('Lazy WhatsApp media metadata update failed:', updateError.message);
  }

  return NextResponse.json({
    status: 'ready',
    url: attachmentUrl,
    mimeType: resolvedMime,
    fileName,
  });
}
