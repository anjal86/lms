import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { decryptIntegrationSecret, decryptSecretPayload } from '@/lib/integrations/secrets';

export type MetaSyncResult = {
  success: boolean;
  pagesCount: number;
  conversationsCount: number;
  messagesCount: number;
  errors: string[];
};

export async function syncMetaConversations(options?: {
  connectionId?: string;
  pageId?: string;
}): Promise<MetaSyncResult> {
  const admin = createSupabaseAdminClient();
  const errors: string[] = [];
  let totalConversations = 0;
  let totalMessages = 0;
  let pagesCount = 0;

  // 1. Fetch active Meta connections
  let connQuery = admin
    .from('integration_connections')
    .select('id, provider, display_name, external_account_id, config, status')
    .in('status', ['connected', 'active'])
    .in('provider', ['facebook', 'instagram']);

  if (options?.connectionId) {
    connQuery = connQuery.eq('id', options.connectionId);
  }

  const { data: connections, error: connError } = await connQuery;
  if (connError || !connections || connections.length === 0) {
    return {
      success: true,
      pagesCount: 0,
      conversationsCount: 0,
      messagesCount: 0,
      errors: connError ? [connError.message] : ['No connected Meta accounts found.'],
    };
  }

  const version = process.env.META_GRAPH_VERSION?.trim() || 'v26.0';

  for (const connection of connections) {
    const { data: secretRow } = await admin
      .from('integration_secrets')
      .select('access_token, secret_payload')
      .eq('connection_id', connection.id)
      .maybeSingle();

    if (!secretRow) continue;

    const payload = decryptSecretPayload(secretRow.secret_payload || {}) as Record<string, unknown>;
    const userToken = decryptIntegrationSecret(secretRow.access_token);
    const pageTokens = Array.isArray(payload.page_access_tokens)
      ? (payload.page_access_tokens as Array<{ id?: string; name?: string; access_token?: string }>)
      : [];

    const config = (connection.config || {}) as Record<string, unknown>;
    const pages = Array.isArray(config.pages)
      ? (config.pages as Array<{ id?: string; name?: string }>)
      : [];

    const pagesToSync = (pages.length > 0 ? pages : pageTokens).filter((p) => {
      if (!p.id) return false;
      if (options?.pageId && p.id !== options.pageId) return false;
      return true;
    });

    // Process pages concurrently in batches of 4
    for (let i = 0; i < pagesToSync.length; i += 4) {
      const batch = pagesToSync.slice(i, i + 4);
      await Promise.all(
        batch.map(async (page) => {
          if (!page.id) return;
          const storedPage = pageTokens.find((pt) => pt.id === page.id);
          const token = storedPage?.access_token || userToken;
          if (!token) return;

          pagesCount++;
          const pageId = page.id;
          const pageName = page.name || storedPage?.name || 'Facebook Page';

          try {
            const convUrl = new URL(`https://graph.facebook.com/${version}/${pageId}/conversations`);
            convUrl.searchParams.set(
              'fields',
              'id,updated_time,snippet,unread_count,participants,link,can_reply,is_subscribed,message_count,senders,scoped_thread_key,wallpaper,messages.limit(50){id,created_time,from,to,message,tags,attachments{id,mime_type,name,size,image_data,video_data,file_url}}'
            );
            convUrl.searchParams.set('limit', '50');
            convUrl.searchParams.set('access_token', token);

            const convResponse = await fetch(convUrl.toString(), { cache: 'no-store' });
            const convJson = await convResponse.json();

            if (!convResponse.ok || !Array.isArray(convJson.data)) {
              if (convJson?.error?.message) {
                errors.push(`Page ${pageName} (${pageId}): ${convJson.error.message}`);
              }
              return;
            }

            const fbConversations = convJson.data;

            for (const fbConv of fbConversations) {
              try {
                const participants = Array.isArray(fbConv.participants?.data)
                  ? fbConv.participants.data
                  : [];

                const customer = participants.find((p: { id?: string }) => String(p.id || '') !== pageId) || participants[0];
                const customerId = customer?.id ? String(customer.id) : null;
                if (!customerId) continue;

                const customerName = customer?.name || 'Messenger Traveler';
                const customerEmail = customer?.email || null;
                const threadId = `${pageId}:${customerId}`;
                const snippet = fbConv.snippet || (fbConv.messages?.data?.[0]?.message ?? null);
                const updatedTime = fbConv.updated_time
                  ? new Date(fbConv.updated_time).toISOString()
                  : new Date().toISOString();
                const unreadCount = Number(fbConv.unread_count) || 0;

                const fbMessages = Array.isArray(fbConv.messages?.data) ? fbConv.messages.data : [];

                // Resolve customer avatar, photos, and last customer message for 24h window
                let customerAvatarUrl: string | null = null;
                let lastCustomerMessageAt: string | null = null;
                let sharedPhotosCount = 0;
                let sharedFilesCount = 0;

                for (const m of fbMessages) {
                  const isCustMsg = String(m.from?.id || '') === customerId;
                  if (isCustMsg && !lastCustomerMessageAt && m.created_time) {
                    lastCustomerMessageAt = new Date(m.created_time).toISOString();
                  }

                  const attachList = Array.isArray(m.attachments?.data) ? m.attachments.data : [];
                  for (const att of attachList) {
                    const img = att.image_data as Record<string, unknown> | undefined;
                    if (img?.url || img?.preview_url) {
                      sharedPhotosCount++;
                      if (!customerAvatarUrl || isCustMsg) {
                        customerAvatarUrl = (img.preview_url || img.url) as string;
                      }
                    } else if (att.file_url) {
                      sharedFilesCount++;
                    }
                  }
                }

                if (!customerAvatarUrl && customerName) {
                  customerAvatarUrl = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(customerName)}&backgroundColor=0f172a,1e293b,1e1b4b,172554,064e3b&textColor=ffffff&fontWeight=600`;
                }

                const conversationMetadata = {
                  meta_page_id: pageId,
                  meta_page_name: pageName,
                  meta_link: fbConv.link ? `https://business.facebook.com${fbConv.link}` : null,
                  can_reply: fbConv.can_reply ?? true,
                  is_subscribed: fbConv.is_subscribed ?? true,
                  message_count: fbConv.message_count ?? fbMessages.length,
                  scoped_thread_key: fbConv.scoped_thread_key || fbConv.id,
                  customer_id: customerId,
                  customer_email: customerEmail,
                  last_customer_message_at: lastCustomerMessageAt,
                  shared_photos_count: sharedPhotosCount,
                  shared_files_count: sharedFilesCount,
                  synced_at: new Date().toISOString(),
                };

                const { data: existingConv } = await admin
                  .from('lead_conversations')
                  .select('id, lead_id, customer_name, customer_avatar_url')
                  .eq('provider', 'facebook')
                  .eq('external_thread_id', threadId)
                  .maybeSingle();

                let conversationId: string;

                if (existingConv) {
                  conversationId = existingConv.id;
                  await admin
                    .from('lead_conversations')
                    .update({
                      customer_name: customerName,
                      customer_phone: `facebook:${customerId}`,
                      customer_email: customerEmail || undefined,
                      customer_avatar_url: customerAvatarUrl || existingConv.customer_avatar_url,
                      last_message_preview: snippet,
                      last_message_at: updatedTime,
                      metadata: conversationMetadata,
                      updated_at: new Date().toISOString(),
                    })
                    .eq('id', conversationId);
                } else {
                  const { data: newConv, error: insertConvError } = await admin
                    .from('lead_conversations')
                    .insert({
                      provider: 'facebook',
                      connection_id: connection.id,
                      external_thread_id: threadId,
                      external_contact_id: customerId,
                      customer_name: customerName,
                      customer_phone: `facebook:${customerId}`,
                      customer_email: customerEmail,
                      customer_avatar_url: customerAvatarUrl,
                      last_message_preview: snippet,
                      status: 'open',
                      unread_count: unreadCount,
                      last_message_at: updatedTime,
                      metadata: conversationMetadata,
                    })
                    .select('id')
                    .single();

                  if (insertConvError) {
                    errors.push(`Failed to save conversation for ${customerName}: ${insertConvError.message}`);
                    continue;
                  }
                  conversationId = newConv.id;
                  totalConversations++;
                }

                // Process and bulk-upsert messages with rich attachments and Meta workflow tags
                const messagesToInsert = fbMessages
                  .filter((m: { id?: string }) => Boolean(m.id))
                  .map((fbMsg: {
                    id: string;
                    from?: { id?: string; name?: string };
                    to?: unknown;
                    created_time?: string;
                    message?: string;
                    tags?: { data?: Array<{ name?: string }> };
                    attachments?: { data?: Array<Record<string, unknown>> };
                  }) => {
                    const msgId = String(fbMsg.id);
                    const senderId = String(fbMsg.from?.id || '');
                    const isOutbound = senderId === pageId;
                    const sentAt = fbMsg.created_time ? new Date(fbMsg.created_time).toISOString() : updatedTime;
                    let body = typeof fbMsg.message === 'string' ? fbMsg.message.trim() : '';

                    let messageType: 'text' | 'image' | 'audio' | 'video' | 'file' | 'media' = 'text';
                    const attachList = Array.isArray(fbMsg.attachments?.data) ? fbMsg.attachments.data : [];
                    const attachData = attachList[0] as Record<string, unknown> | undefined;
                    const tagsList = Array.isArray(fbMsg.tags?.data)
                      ? fbMsg.tags.data.map((t) => t.name).filter(Boolean)
                      : [];

                    let attachmentUrl: string | null = null;
                    let previewUrl: string | null = null;
                    let fileName: string | null = null;
                    let fileSize: number | null = null;
                    let mimeType: string | null = null;

                    if (attachData) {
                      const imgData = attachData.image_data as Record<string, unknown> | undefined;
                      const videoData = attachData.video_data as Record<string, unknown> | undefined;
                      mimeType = typeof attachData.mime_type === 'string' ? attachData.mime_type : null;
                      fileName = typeof attachData.name === 'string' ? attachData.name : null;
                      fileSize = typeof attachData.size === 'number' ? attachData.size : null;

                      if (imgData?.url) {
                        messageType = 'image';
                        attachmentUrl = String(imgData.url);
                        previewUrl = String(imgData.preview_url || imgData.url);
                        if (!body) body = '[Photo]';
                      } else if (videoData?.url || (mimeType && mimeType.startsWith('video/'))) {
                        messageType = 'video';
                        attachmentUrl = String(videoData?.url || attachData.file_url || '');
                        previewUrl = attachmentUrl;
                        if (!body) body = '[Video]';
                      } else if ((mimeType && mimeType.startsWith('audio/')) || (fileName && fileName.includes('audioclip'))) {
                        messageType = 'audio';
                        attachmentUrl = String(attachData.file_url || '');
                        previewUrl = attachmentUrl;
                        if (!body) body = '[Voice message]';
                      } else if (attachData.file_url) {
                        messageType = 'file';
                        attachmentUrl = String(attachData.file_url);
                        if (!body) body = `[File: ${fileName || 'Attachment'}]`;
                      } else {
                        messageType = 'media';
                        if (!body) body = '[Media Attachment]';
                      }
                    }

                    return {
                      conversation_id: conversationId,
                      lead_id: existingConv?.lead_id || null,
                      connection_id: connection.id,
                      provider: 'facebook',
                      external_message_id: msgId,
                      direction: isOutbound ? 'outbound' : 'inbound',
                      message_type: messageType,
                      body: body || null,
                      sent_at: sentAt,
                      metadata: {
                        from: fbMsg.from,
                        to: fbMsg.to,
                        tags: tagsList,
                        attachments: fbMsg.attachments,
                        attachment_url: attachmentUrl,
                        preview_url: previewUrl,
                        file_name: fileName,
                        file_size: fileSize,
                        mime_type: mimeType,
                        sent_via: isOutbound ? 'meta_business_suite' : 'customer',
                        synced_from_history: true,
                      },
                    };
                  });

                if (messagesToInsert.length > 0) {
                  const { error: msgBulkError } = await admin
                    .from('lead_messages')
                    .upsert(messagesToInsert, { onConflict: 'provider,external_message_id', ignoreDuplicates: false });
                  if (msgBulkError) {
                    errors.push(`Failed to upsert messages for ${customerName}: ${msgBulkError.message}`);
                  } else {
                    totalMessages += messagesToInsert.length;
                  }
                }
              } catch (convErr) {
                errors.push(`Error in conversation ${fbConv.id}: ${convErr instanceof Error ? convErr.message : String(convErr)}`);
              }
            }
          } catch (pageErr) {
            errors.push(`Error syncing page ${pageName}: ${pageErr instanceof Error ? pageErr.message : String(pageErr)}`);
          }
        })
      );
    }
  }

  return {
    success: true,
    pagesCount,
    conversationsCount: totalConversations,
    messagesCount: totalMessages,
    errors,
  };
}
