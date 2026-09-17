import { createHash, randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor } from '@/lib/auth/api-actor';
import { normalizeChatwootMessage } from '@/lib/integrations/chatwoot-adapter';
import { createChatwootAttachmentMessage, createChatwootMessage } from '@/lib/integrations/chatwoot-client';
import { resolveActiveChatwootRuntime } from '@/lib/integrations/chatwoot-runtime';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { ChannelDeliveryError, sendChannelAttachment, sendChannelText } from '@/lib/integrations/channel-sender';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AttachmentSchema = z.object({
  storagePath: z.string().trim().min(8).max(1000),
  fileName: z.string().trim().min(1).max(240),
  mimeType: z.string().trim().min(3).max(160),
  size: z.number().int().positive().max(15 * 1024 * 1024),
});

type ActiveAttachment = z.infer<typeof AttachmentSchema>;

const OutboundMessageSchema = z.object({
  body: z.string().trim().max(4000).default(''),
  direction: z.enum(['outbound', 'internal']).default('outbound'),
  clientRequestId: z.string().trim().min(8).max(160).optional(),
  attachment: AttachmentSchema.optional(),
}).superRefine((value, ctx) => {
  if (!value.body && !value.attachment) ctx.addIssue({ code: 'custom', path: ['body'], message: 'Message body cannot be empty.' });
  if (value.direction === 'internal' && value.attachment) ctx.addIssue({ code: 'custom', path: ['attachment'], message: 'Internal note attachments are not supported yet.' });
  if (value.attachment && value.body) ctx.addIssue({ code: 'custom', path: ['body'], message: 'Send the text and attachment separately.' });
});

const MESSAGE_SELECT = `
  id,
  conversation_id,
  lead_id,
  connection_id,
  provider,
  external_message_id,
  provider_message_id,
  direction,
  message_type,
  body,
  metadata,
  delivery_status,
  client_request_id,
  failure_code,
  failure_message,
  delivered_at,
  read_at,
  sent_at,
  created_by,
  created_at,
  author_profile:profiles!lead_messages_created_by_fkey(id, full_name, avatar_url, role)
`;

function messageType(mimeType: string) {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'file';
}

function attachmentLabel(attachment: ActiveAttachment) {
  const type = messageType(attachment.mimeType);
  if (type === 'image') return '[Photo]';
  if (type === 'video') return '[Video]';
  if (type === 'audio') return '[Voice message]';
  return `[File:${attachment.fileName}]`;
}

function chatwootRequestHash(direction: 'outbound' | 'internal', body: string, attachment?: ActiveAttachment) {
  return createHash('sha256')
    .update(JSON.stringify({
      direction,
      body,
      attachment: attachment ? {
        storagePath: attachment.storagePath,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        size: attachment.size,
      } : null,
    }))
    .digest('hex');
}

function positiveInteger(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

async function findExistingRequest(conversationId: string, clientRequestId: string) {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from('lead_messages')
    .select(MESSAGE_SELECT)
    .eq('conversation_id', conversationId)
    .eq('client_request_id', clientRequestId)
    .maybeSingle();
  return data || null;
}

async function updateConversationAndLead(input: {
  conversationId: string;
  leadId: string | null;
  actorId: string;
  provider: string;
  body: string;
  direction: 'outbound' | 'internal';
  externalMessageId?: string | null;
  now: string;
}) {
  const admin = createSupabaseAdminClient();
  await admin
    .from('lead_conversations')
    .update({
      last_message_at: input.now,
      inbox_activity_at: input.now,
      last_message_preview: input.direction === 'internal' ? `[Note] ${input.body.slice(0, 160)}` : input.body.slice(0, 180),
      status: 'open',
      ...(input.direction === 'outbound' ? { needs_reply: false, last_outbound_at: input.now } : {}),
    })
    .eq('id', input.conversationId);

  if (!input.leadId) return;

  await admin.from('activity_logs').insert({
    lead_id: input.leadId,
    agent_id: input.actorId,
    activity_type: input.direction === 'internal'
      ? 'note'
      : input.provider === 'whatsapp'
        ? 'whatsapp'
        : input.provider === 'email'
          ? 'email'
          : 'system',
    title: input.direction === 'internal' ? 'Internal Note' : `Replied via ${input.provider}`,
    notes: input.body,
    metadata: {
      conversation_id: input.conversationId,
      external_message_id: input.externalMessageId || null,
      direction: input.direction,
    },
  });

  await admin
    .from('leads')
    .update({
      last_contacted_at: input.now,
      last_activity_type: input.provider === 'whatsapp' ? 'whatsapp' : input.provider === 'email' ? 'email' : 'system',
    })
    .eq('id', input.leadId);
}

async function markChatwootRequestFailed(input: {
  requestId: string;
  workspaceId: string;
  conversationId: string;
  error: string;
}) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from('chatwoot_outbound_requests')
    .update({
      status: 'failed',
      last_error: input.error.slice(0, 2000),
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.requestId)
    .eq('workspace_id', input.workspaceId)
    .eq('conversation_id', input.conversationId);
  if (error) console.error('Unable to mark Chatwoot outbound request failed:', error.message);
}

async function sendActiveChatwootMessage(input: {
  workspaceId: string;
  conversationId: string;
  leadId: string | null;
  actorId: string;
  provider: string;
  clientRequestId: string;
  body: string;
  direction: 'outbound' | 'internal';
  accountId: number;
  chatwootConversationId: number;
  attachment?: ActiveAttachment;
}) {
  const admin = createSupabaseAdminClient();
  const requestHash = chatwootRequestHash(input.direction, input.body, input.attachment);
  const { data: claimData, error: claimError } = await admin.rpc('claim_chatwoot_outbound_request', {
    p_workspace_id: input.workspaceId,
    p_conversation_id: input.conversationId,
    p_client_request_id: input.clientRequestId,
    p_request_hash: requestHash,
    p_direction: input.direction,
  });

  if (claimError) {
    const status = claimError.code === '22023' ? 409 : 500;
    console.error('Chatwoot outbound idempotency claim failed:', claimError.message);
    return NextResponse.json({
      error: status === 409
        ? 'This idempotency key was already used for a different message.'
        : 'Unable to claim Chatwoot outbound request.',
    }, { status });
  }

  const claim = (Array.isArray(claimData) ? claimData[0] : claimData) as {
    request_id?: string;
    should_process?: boolean;
    request_status?: string;
    existing_message_id?: number | string | null;
    existing_sent_at?: string | null;
  } | null;

  if (!claim?.request_id) {
    return NextResponse.json({ error: 'Unable to claim Chatwoot outbound request.' }, { status: 500 });
  }

  const previewBody = input.attachment ? attachmentLabel(input.attachment) : input.body;
  const previewType = input.direction === 'internal'
    ? 'internal_note'
    : input.attachment
      ? messageType(input.attachment.mimeType)
      : 'text';

  if (!claim.should_process) {
    const existingMessageId = positiveInteger(claim.existing_message_id);
    if (claim.request_status === 'sent' && existingMessageId) {
      const sentAt = claim.existing_sent_at || new Date().toISOString();
      return NextResponse.json({
        message: {
          id: `chatwoot-message:${existingMessageId}`,
          conversation_id: input.conversationId,
          direction: input.direction,
          message_type: previewType,
          body: previewBody,
          metadata: {
            chatwoot_message_id: existingMessageId,
            chatwoot_private: input.direction === 'internal',
            ...(input.attachment ? {
              file_name: input.attachment.fileName,
              mime_type: input.attachment.mimeType,
              size: input.attachment.size,
            } : {}),
          },
          delivery_status: 'sent',
          failure_message: null,
          sent_at: sentAt,
          created_at: sentAt,
          author_profile: null,
        },
        duplicate: true,
        source: 'chatwoot',
      }, { status: 200 });
    }

    return NextResponse.json({
      pending: true,
      duplicate: true,
      source: 'chatwoot',
    }, { status: 202 });
  }

  let rawMessage: Record<string, unknown>;
  try {
    if (input.attachment) {
      const { data: file, error: downloadError } = await admin.storage
        .from('conversation-media')
        .download(input.attachment.storagePath);
      if (downloadError || !file) {
        throw new Error(downloadError?.message || 'Unable to load staged Chatwoot attachment.');
      }
      rawMessage = await createChatwootAttachmentMessage({
        accountId: input.accountId,
        conversationId: input.chatwootConversationId,
        file,
        fileName: input.attachment.fileName,
      });
    } else {
      rawMessage = await createChatwootMessage({
        accountId: input.accountId,
        conversationId: input.chatwootConversationId,
        content: input.body,
        private: input.direction === 'internal',
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Chatwoot delivery failed.';
    await markChatwootRequestFailed({
      requestId: claim.request_id,
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      error: message,
    });
    console.error('Active Chatwoot send failed:', error);
    return NextResponse.json({ error: 'Unable to send through Chatwoot.' }, { status: 502 });
  }

  const chatwootMessageId = positiveInteger(rawMessage.id);
  if (!chatwootMessageId) {
    console.error('Chatwoot accepted an outbound request but returned no message ID. Leaving the request in processing state to prevent a duplicate retry.');
    return NextResponse.json({ error: 'Chatwoot accepted the message but returned an invalid response. Refresh the conversation before retrying.' }, { status: 502 });
  }

  const message = normalizeChatwootMessage(rawMessage, input.conversationId);
  const sentAt = message.sent_at || new Date().toISOString();
  const { error: finalizeError } = await admin
    .from('chatwoot_outbound_requests')
    .update({
      status: 'sent',
      chatwoot_message_id: chatwootMessageId,
      sent_at: sentAt,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', claim.request_id)
    .eq('workspace_id', input.workspaceId)
    .eq('conversation_id', input.conversationId);

  if (finalizeError) {
    // The provider already accepted the message. Never mark this failed or a retry
    // could send the same customer message twice. The processing row remains a
    // temporary duplicate-send guard while the operator refreshes the thread.
    console.error('Chatwoot message sent but idempotency finalization failed:', finalizeError.message);
  }

  if (input.attachment) {
    const { error: releaseError } = await admin.storage
      .from('conversation-media')
      .remove([input.attachment.storagePath]);
    if (releaseError) console.warn('Unable to release staged Chatwoot attachment:', releaseError.message);
  }

  await updateConversationAndLead({
    conversationId: input.conversationId,
    leadId: input.leadId,
    actorId: input.actorId,
    provider: input.provider,
    body: previewBody,
    direction: input.direction,
    externalMessageId: String(chatwootMessageId),
    now: sentAt,
  });

  return NextResponse.json({
    message,
    source: 'chatwoot',
  }, { status: 201 });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  const { id: conversationId } = await context.params;
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = OutboundMessageSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid message.', details: parsed.error.flatten() }, { status: 400 });
  }

  const { data: conversation, error: convError } = await actor.supabase
    .from('lead_conversations')
    .select('id,workspace_id,lead_id,provider,connection_id,external_thread_id,external_contact_id,status')
    .eq('id', conversationId)
    .maybeSingle();

  if (convError || !conversation) {
    return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  }

  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const clientRequestId = parsed.data.clientRequestId || request.headers.get('idempotency-key')?.trim() || randomUUID();
  if (clientRequestId.length > 160) {
    return NextResponse.json({ error: 'Idempotency key is too long.' }, { status: 400 });
  }

  let chatwootRuntime = null;
  try {
    chatwootRuntime = await resolveActiveChatwootRuntime(actor.profile.workspace_id, conversation.id);
  } catch (error) {
    console.error('Active Chatwoot send runtime resolution failed:', error);
    return NextResponse.json({ error: 'Unable to resolve Chatwoot delivery path.' }, { status: 502 });
  }

  if (chatwootRuntime) {
    if (parsed.data.attachment) {
      const expectedPrefix = `${actor.profile.workspace_id}/${conversation.id}/`;
      if (!parsed.data.attachment.storagePath.startsWith(expectedPrefix)) {
        return NextResponse.json({ error: 'Attachment does not belong to this conversation.' }, { status: 400 });
      }
    }

    return sendActiveChatwootMessage({
      workspaceId: actor.profile.workspace_id,
      conversationId: conversation.id,
      leadId: conversation.lead_id || null,
      actorId: actor.user.id,
      provider: conversation.provider,
      clientRequestId,
      body: parsed.data.body,
      direction: parsed.data.direction,
      accountId: chatwootRuntime.accountId,
      chatwootConversationId: chatwootRuntime.conversationId,
      attachment: parsed.data.attachment,
    });
  }

  const existing = await findExistingRequest(conversationId, clientRequestId);
  if (existing) return NextResponse.json({ message: existing, duplicate: true }, { status: 200 });

  if (parsed.data.direction === 'internal') {
    const { data: message, error } = await admin
      .from('lead_messages')
      .insert({
        conversation_id: conversation.id,
        lead_id: conversation.lead_id || null,
        connection_id: conversation.connection_id || null,
        provider: conversation.provider,
        direction: 'internal',
        message_type: 'internal_note',
        body: parsed.data.body,
        metadata: {},
        delivery_status: 'sent',
        client_request_id: clientRequestId,
        created_by: actor.user.id,
        sent_at: now,
      })
      .select(MESSAGE_SELECT)
      .single();

    if (error) {
      if (error.code === '23505') {
        const duplicate = await findExistingRequest(conversationId, clientRequestId);
        if (duplicate) return NextResponse.json({ message: duplicate, duplicate: true }, { status: 200 });
      }
      console.error('Failed to save internal note:', error.message);
      return NextResponse.json({ error: 'Unable to save note.' }, { status: 500 });
    }

    await updateConversationAndLead({
      conversationId: conversation.id,
      leadId: conversation.lead_id,
      actorId: actor.user.id,
      provider: conversation.provider,
      body: parsed.data.body,
      direction: 'internal',
      now,
    });

    return NextResponse.json({ message }, { status: 201 });
  }

  let providerAttachmentUrl: string | null = null;
  let attachmentMetadata: Record<string, unknown> = { sent_via: 'travel_lms' };
  let outboundBody = parsed.data.body;
  let outboundType = 'text';

  if (parsed.data.attachment) {
    const expectedPrefix = `${actor.profile.workspace_id}/${conversation.id}/`;
    if (!parsed.data.attachment.storagePath.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: 'Attachment does not belong to this conversation.' }, { status: 400 });
    }
    const { data: signed, error: signError } = await admin.storage.from('conversation-media').createSignedUrl(parsed.data.attachment.storagePath, 15 * 60);
    if (signError || !signed?.signedUrl) return NextResponse.json({ error: 'Unable to prepare attachment for delivery.' }, { status: 500 });
    providerAttachmentUrl = signed.signedUrl;
    outboundType = messageType(parsed.data.attachment.mimeType);
    outboundBody = `[${outboundType === 'image' ? 'Photo' : outboundType === 'audio' ? 'Voice message' : outboundType === 'video' ? 'Video' : `File:${parsed.data.attachment.fileName}`}]`;
    attachmentMetadata = {
      sent_via: 'travel_lms',
      media_source: 'staging',
      storage_path: parsed.data.attachment.storagePath,
      attachment_url: `/api/conversations/${conversation.id}/attachments?path=${encodeURIComponent(parsed.data.attachment.storagePath)}`,
      file_name: parsed.data.attachment.fileName,
      mime_type: parsed.data.attachment.mimeType,
      size: parsed.data.attachment.size,
    };
  }

  const { data: pending, error: pendingError } = await admin
    .from('lead_messages')
    .insert({
      conversation_id: conversation.id,
      lead_id: conversation.lead_id || null,
      connection_id: conversation.connection_id || null,
      provider: conversation.provider,
      direction: 'outbound',
      message_type: outboundType,
      body: outboundBody,
      metadata: attachmentMetadata,
      delivery_status: 'sending',
      client_request_id: clientRequestId,
      created_by: actor.user.id,
      sent_at: now,
    })
    .select('id')
    .single();

  if (pendingError || !pending) {
    if (pendingError?.code === '23505') {
      const duplicate = await findExistingRequest(conversationId, clientRequestId);
      if (duplicate) return NextResponse.json({ message: duplicate, duplicate: true }, { status: 200 });
    }
    console.error('Failed to claim outbound message:', pendingError?.message);
    return NextResponse.json({ error: 'Unable to queue message.' }, { status: 500 });
  }

  try {
    const delivered = parsed.data.attachment && providerAttachmentUrl
      ? await sendChannelAttachment({
          provider: conversation.provider,
          connectionId: conversation.connection_id,
          externalThreadId: conversation.external_thread_id,
          externalContactId: conversation.external_contact_id,
          attachment: {
            url: providerAttachmentUrl,
            fileName: parsed.data.attachment.fileName,
            mimeType: parsed.data.attachment.mimeType,
            storagePath: parsed.data.attachment.storagePath,
          },
        })
      : await sendChannelText({
          provider: conversation.provider,
          connectionId: conversation.connection_id,
          externalThreadId: conversation.external_thread_id,
          externalContactId: conversation.external_contact_id,
          body: parsed.data.body,
        });

    const { data: finalizedId, error: finalizeError } = await admin.rpc('finalize_outbound_message', {
      p_message_id: pending.id,
      p_external_message_id: delivered.externalMessageId,
      p_sent_at: now,
    });
    if (finalizeError) throw finalizeError;

    const messageId = String(finalizedId || pending.id);
    let finalizedMetadata = attachmentMetadata;

    if (parsed.data.attachment && (conversation.provider === 'facebook' || conversation.provider === 'instagram')) {
      const { error: releaseError } = await admin.storage
        .from('conversation-media')
        .remove([parsed.data.attachment.storagePath]);
      if (releaseError) {
        console.warn('Unable to release staged Meta attachment:', releaseError.message);
      } else {
        finalizedMetadata = {
          ...attachmentMetadata,
          media_source: 'provider',
          staging_released_at: new Date().toISOString(),
        };
      }
    }

    await admin
      .from('lead_messages')
      .update({
        provider_message_id: delivered.externalMessageId,
        delivery_status: 'sent',
        failure_code: null,
        failure_message: null,
        metadata: finalizedMetadata,
      })
      .eq('id', messageId);

    const { data: message, error: messageError } = await admin
      .from('lead_messages')
      .select(MESSAGE_SELECT)
      .eq('id', messageId)
      .single();
    if (messageError) throw messageError;

    await updateConversationAndLead({
      conversationId: conversation.id,
      leadId: conversation.lead_id,
      actorId: actor.user.id,
      provider: conversation.provider,
      body: parsed.data.attachment ? `${parsed.data.attachment.fileName}` : parsed.data.body,
      direction: 'outbound',
      externalMessageId: delivered.externalMessageId,
      now,
    });

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    const deliveryError = error instanceof ChannelDeliveryError
      ? error
      : new ChannelDeliveryError(error instanceof Error ? error.message : 'Provider delivery failed.');

    await admin
      .from('lead_messages')
      .update({
        delivery_status: 'failed',
        failure_code: deliveryError.code,
        failure_message: deliveryError.message.slice(0, 1000),
        metadata: { ...attachmentMetadata, delivery_error: deliveryError.message },
      })
      .eq('id', pending.id);

    const failedMessage = await findExistingRequest(conversationId, clientRequestId);
    return NextResponse.json(
      { error: deliveryError.message, code: deliveryError.code, message: failedMessage },
      { status: deliveryError.status }
    );
  }
}
