import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { decryptIntegrationSecret, decryptSecretPayload } from '@/lib/integrations/secrets';
import { metaFetchJson } from '@/lib/integrations/meta-http';
import { whatsappBridgeRequest } from '@/lib/integrations/whatsapp-baileys';

export type SupportedSendProvider = 'facebook' | 'instagram' | 'whatsapp';

export class ChannelDeliveryError extends Error {
  status: number;
  code: string;

  constructor(message: string, options: { status?: number; code?: string } = {}) {
    super(message);
    this.name = 'ChannelDeliveryError';
    this.status = options.status ?? 502;
    this.code = options.code ?? 'provider_delivery_failed';
  }
}

type SendTextInput = {
  provider: string;
  connectionId: string | null;
  externalThreadId: string | null;
  externalContactId: string | null;
  body: string;
};

type SendAttachmentInput = {
  provider: string;
  connectionId: string | null;
  externalThreadId: string | null;
  externalContactId: string | null;
  attachment: {
    url: string;
    fileName: string;
    mimeType: string;
    storagePath?: string;
  };
};

type ConnectionConfig = {
  transport?: string;
  instance_id?: string;
  pages?: Array<{
    id?: string;
    instagram_business_account?: { id?: string };
  }>;
  whatsapp_business_accounts?: Array<{
    id?: string;
    phone_numbers?: Array<{ id?: string }>;
  }>;
};

function providerAccountId(externalThreadId: string | null) {
  return externalThreadId?.split(':')[0]?.trim() || null;
}

async function connectionMaterial(connectionId: string) {
  const admin = createSupabaseAdminClient();
  const [{ data: connection, error: connectionError }, { data: secrets, error: secretError }] = await Promise.all([
    admin
      .from('integration_connections')
      .select('id,provider,status,config')
      .eq('id', connectionId)
      .maybeSingle(),
    admin
      .from('integration_secrets')
      .select('access_token,secret_payload,token_expires_at')
      .eq('connection_id', connectionId)
      .maybeSingle(),
  ]);

  if (connectionError || !connection) {
    throw new ChannelDeliveryError('The connected channel could not be loaded.', { status: 409, code: 'connection_missing' });
  }
  if (!['connected', 'active'].includes(connection.status)) {
    throw new ChannelDeliveryError('This channel is not connected.', { status: 409, code: 'connection_not_ready' });
  }

  const config = (connection.config || {}) as ConnectionConfig;
  const usesBaileys = connection.provider === 'whatsapp' && config.transport === 'baileys';
  if (!usesBaileys) {
    if (secretError || !secrets) {
      throw new ChannelDeliveryError('The channel credentials are unavailable.', { status: 409, code: 'credentials_missing' });
    }
    if (secrets.token_expires_at && new Date(secrets.token_expires_at).getTime() <= Date.now()) {
      throw new ChannelDeliveryError('The channel token has expired. Reconnect the channel.', { status: 409, code: 'token_expired' });
    }
  }

  return {
    connection,
    config,
    accessToken: secrets ? decryptIntegrationSecret(secrets.access_token) : null,
    secretPayload: secrets ? decryptSecretPayload(secrets.secret_payload || {}) as Record<string, unknown> : {},
  };
}

function pageAccessToken(
  secretPayload: Record<string, unknown>,
  config: ConnectionConfig,
  accountId: string | null,
  provider: 'facebook' | 'instagram'
) {
  const tokens = Array.isArray(secretPayload.page_access_tokens)
    ? secretPayload.page_access_tokens as Array<Record<string, unknown>>
    : [];

  let pageId = accountId;
  if (provider === 'instagram' && accountId) {
    pageId = config.pages?.find((page) => page.instagram_business_account?.id === accountId)?.id || accountId;
  }

  const match = tokens.find((entry) => String(entry.id || '') === pageId) || tokens[0];
  return typeof match?.access_token === 'string' ? match.access_token : null;
}

function requireProviderIdentifiers(input: { externalThreadId: string | null; externalContactId: string | null }) {
  const accountId = providerAccountId(input.externalThreadId);
  if (!accountId || !input.externalContactId) {
    throw new ChannelDeliveryError('This conversation is missing its provider contact identifiers.', {
      status: 409,
      code: 'provider_identifiers_missing',
    });
  }
  return accountId;
}

async function sendFacebookOrInstagram(
  provider: 'facebook' | 'instagram',
  input: SendTextInput,
  material: Awaited<ReturnType<typeof connectionMaterial>>
) {
  const accountId = requireProviderIdentifiers(input);
  const token = pageAccessToken(material.secretPayload, material.config, accountId, provider) || material.accessToken;
  if (!token) {
    throw new ChannelDeliveryError('No provider access token is available.', { status: 409, code: 'credentials_missing' });
  }

  const version = process.env.META_GRAPH_VERSION?.trim() || 'v26.0';
  const endpoint = provider === 'facebook'
    ? `https://graph.facebook.com/${version}/me/messages`
    : `https://graph.facebook.com/${version}/${accountId}/messages`;

    const safeText = input.body.length > 1980 ? `${input.body.slice(0, 1970)}…` : input.body;
    const { response, data } = await metaFetchJson<Record<string, unknown>>(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        recipient: { id: input.externalContactId },
        message: { text: safeText },
      }),
    });

  if (!response.ok) {
    const providerError = data.error as Record<string, unknown> | undefined;
    const code = String(providerError?.code || '');
    const rawMessage = typeof providerError?.message === 'string' ? providerError.message : `${provider} rejected the message.`;
    const isWindowClosed = code === '10' || rawMessage.includes('outside of allowed window');
    const channelName = provider === 'facebook' ? 'Facebook Messenger' : 'Instagram';
    const message = isWindowClosed
      ? `The 24-hour messaging window has closed on ${channelName}. Meta allows standard replies only within 24 hours of the customer's last message. The traveler must message again before a reply can be delivered.`
      : rawMessage;

    throw new ChannelDeliveryError(
      message,
      { status: response.status === 429 ? 429 : 502, code: isWindowClosed ? 'meta_window_closed' : (code || 'meta_send_failed') }
    );
  }

  const externalMessageId = String(data.message_id || data.id || '');
  if (!externalMessageId) {
    throw new ChannelDeliveryError(`${provider} accepted the request without returning a message ID.`, {
      code: 'provider_message_id_missing',
    });
  }

  return { externalMessageId, provider };
}

async function sendFacebookOrInstagramAttachment(
  provider: 'facebook' | 'instagram',
  input: SendAttachmentInput,
  material: Awaited<ReturnType<typeof connectionMaterial>>
) {
  const accountId = requireProviderIdentifiers(input);
  const token = pageAccessToken(material.secretPayload, material.config, accountId, provider) || material.accessToken;
  if (!token) {
    throw new ChannelDeliveryError('No provider access token is available.', { status: 409, code: 'credentials_missing' });
  }

  const type = input.attachment.mimeType.startsWith('image/')
    ? 'image'
    : input.attachment.mimeType.startsWith('video/')
      ? 'video'
      : input.attachment.mimeType.startsWith('audio/')
        ? 'audio'
        : 'file';
  const version = process.env.META_GRAPH_VERSION?.trim() || 'v26.0';
  const endpoint = provider === 'facebook'
    ? `https://graph.facebook.com/${version}/me/messages`
    : `https://graph.facebook.com/${version}/${accountId}/messages`;

  let fileBuffer: ArrayBuffer | null = null;
  if (input.attachment.storagePath) {
    try {
      const admin = createSupabaseAdminClient();
      const { data: blob } = await admin.storage.from('conversation-media').download(input.attachment.storagePath);
      if (blob) fileBuffer = await blob.arrayBuffer();
    } catch (e) {
      console.warn('Failed to load attachment buffer from storage for Facebook:', e);
    }
  }

  let response: Response;
  let data: Record<string, unknown>;

  if (provider === 'facebook' && fileBuffer) {
    const formData = new FormData();
    formData.append('recipient', JSON.stringify({ id: input.externalContactId }));
    formData.append('message', JSON.stringify({
      attachment: {
        type,
        payload: { is_reusable: true },
      },
    }));
    const blob = new Blob([fileBuffer], { type: input.attachment.mimeType });
    formData.append('filedata', blob, input.attachment.fileName);

    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });
    data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  } else {
    const result = await metaFetchJson<Record<string, unknown>>(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        recipient: { id: input.externalContactId },
        message: {
          attachment: {
            type,
            payload: { url: input.attachment.url, is_reusable: true },
          },
        },
      }),
    });
    response = result.response;
    data = result.data;
  }

  if (!response.ok) {
    const providerError = data.error as Record<string, unknown> | undefined;
    const code = String(providerError?.code || '');
    const rawMessage = typeof providerError?.message === 'string' ? providerError.message : `${provider} rejected the attachment.`;
    const isWindowClosed = code === '10' || rawMessage.includes('outside of allowed window');
    const isRobotsError = rawMessage.includes('robots.txt') || rawMessage.includes('does not allow downloading');
    const channelName = provider === 'facebook' ? 'Facebook Messenger' : 'Instagram';
    const message = isWindowClosed
      ? `The 24-hour messaging window has closed on ${channelName}. Meta allows standard attachments only within 24 hours of the customer's last message. The traveler must message again before an attachment can be delivered.`
      : isRobotsError
        ? `Meta crawler could not fetch the attachment URL. Ensure the media file is accessible or uploaded directly.`
        : rawMessage;

    throw new ChannelDeliveryError(
      message,
      { status: response.status === 429 ? 429 : 502, code: isWindowClosed ? 'meta_window_closed' : (code || 'meta_attachment_send_failed') }
    );
  }

  const externalMessageId = String(data.message_id || data.id || '');
  if (!externalMessageId) throw new ChannelDeliveryError(`${provider} accepted the attachment without returning a message ID.`);
  return { externalMessageId, provider };
}

function whatsappRecipient(input: { externalContactId: string | null }) {
  const recipient = String(input.externalContactId || '').replace(/\D/g, '');
  if (!recipient) {
    throw new ChannelDeliveryError('This WhatsApp conversation is missing the traveler number.', {
      status: 409,
      code: 'provider_identifiers_missing',
    });
  }
  return recipient;
}

async function sendBaileysWhatsApp(
  input: SendTextInput,
  material: Awaited<ReturnType<typeof connectionMaterial>>
) {
  const recipient = whatsappRecipient(input);
  try {
    const result = await whatsappBridgeRequest<{ messageId?: string }>(
      `/instances/${material.connection.id}/messages/text`,
      {
        method: 'POST',
        body: JSON.stringify({ to: recipient, text: input.body }),
      }
    );
    const externalMessageId = String(result.messageId || '');
    if (!externalMessageId) throw new Error('WhatsApp linked device returned no message ID.');
    return { externalMessageId, provider: 'whatsapp' as const };
  } catch (error) {
    throw new ChannelDeliveryError(error instanceof Error ? error.message : 'WhatsApp linked-device delivery failed.', {
      status: 502,
      code: 'baileys_send_failed',
    });
  }
}

async function sendBaileysWhatsAppAttachment(
  input: SendAttachmentInput,
  material: Awaited<ReturnType<typeof connectionMaterial>>
) {
  const recipient = whatsappRecipient(input);
  if (!input.attachment.storagePath) {
    throw new ChannelDeliveryError('The attachment staging file is unavailable.', {
      status: 409,
      code: 'attachment_staging_missing',
    });
  }

  const admin = createSupabaseAdminClient();
  const { data: blob, error } = await admin.storage.from('conversation-media').download(input.attachment.storagePath);
  if (error || !blob) {
    throw new ChannelDeliveryError('Unable to load the attachment for WhatsApp delivery.', {
      status: 409,
      code: 'attachment_staging_missing',
    });
  }
  const buffer = Buffer.from(await blob.arrayBuffer());
  try {
    const result = await whatsappBridgeRequest<{ messageId?: string }>(
      `/instances/${material.connection.id}/messages/media`,
      {
        method: 'POST',
        body: JSON.stringify({
          to: recipient,
          fileName: input.attachment.fileName,
          mimeType: input.attachment.mimeType,
          dataBase64: buffer.toString('base64'),
        }),
      }
    );
    const externalMessageId = String(result.messageId || '');
    if (!externalMessageId) throw new Error('WhatsApp linked device returned no message ID.');
    return { externalMessageId, provider: 'whatsapp' as const };
  } catch (sendError) {
    throw new ChannelDeliveryError(sendError instanceof Error ? sendError.message : 'WhatsApp attachment delivery failed.', {
      status: 502,
      code: 'baileys_attachment_send_failed',
    });
  }
}

function whatsappSender(material: Awaited<ReturnType<typeof connectionMaterial>>, input: { externalThreadId: string | null }) {
  const wabaId = providerAccountId(input.externalThreadId);
  const account = material.config.whatsapp_business_accounts?.find((item) => item.id === wabaId)
    || material.config.whatsapp_business_accounts?.[0];
  const phoneNumberId = account?.phone_numbers?.find((item) => item.id)?.id;
  if (!phoneNumberId) {
    throw new ChannelDeliveryError('No WhatsApp sender phone number is configured.', {
      status: 409,
      code: 'whatsapp_sender_missing',
    });
  }
  return phoneNumberId;
}

async function sendWhatsApp(input: SendTextInput, material: Awaited<ReturnType<typeof connectionMaterial>>) {
  if (!input.externalContactId) {
    throw new ChannelDeliveryError('This WhatsApp conversation is missing the traveler number.', {
      status: 409,
      code: 'provider_identifiers_missing',
    });
  }
  if (!material.accessToken) {
    throw new ChannelDeliveryError('No WhatsApp access token is available.', { status: 409, code: 'credentials_missing' });
  }

  const phoneNumberId = whatsappSender(material, input);
  const version = process.env.META_GRAPH_VERSION?.trim() || 'v26.0';
  const endpoint = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
  const recipient = input.externalContactId.replace(/^\+/, '');
  const { response, data } = await metaFetchJson<Record<string, unknown>>(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${material.accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: 'text',
      text: { body: input.body, preview_url: false },
    }),
  });

  if (!response.ok) {
    const providerError = data.error as Record<string, unknown> | undefined;
    throw new ChannelDeliveryError(
      typeof providerError?.message === 'string' ? providerError.message : 'WhatsApp rejected the message.',
      { status: response.status === 429 ? 429 : 502, code: String(providerError?.code || 'whatsapp_send_failed') }
    );
  }

  const messages = Array.isArray(data.messages) ? data.messages as Array<Record<string, unknown>> : [];
  const externalMessageId = String(messages[0]?.id || '');
  if (!externalMessageId) {
    throw new ChannelDeliveryError('WhatsApp accepted the request without returning a message ID.', {
      code: 'provider_message_id_missing',
    });
  }

  return { externalMessageId, provider: 'whatsapp' as const };
}

async function sendWhatsAppAttachment(input: SendAttachmentInput, material: Awaited<ReturnType<typeof connectionMaterial>>) {
  if (!input.externalContactId) {
    throw new ChannelDeliveryError('This WhatsApp conversation is missing the traveler number.', {
      status: 409,
      code: 'provider_identifiers_missing',
    });
  }
  if (!material.accessToken) {
    throw new ChannelDeliveryError('No WhatsApp access token is available.', { status: 409, code: 'credentials_missing' });
  }

  const phoneNumberId = whatsappSender(material, input);
  const version = process.env.META_GRAPH_VERSION?.trim() || 'v26.0';
  const endpoint = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
  const recipient = input.externalContactId.replace(/^\+/, '');
  const type = input.attachment.mimeType.startsWith('image/')
    ? 'image'
    : input.attachment.mimeType.startsWith('video/')
      ? 'video'
      : input.attachment.mimeType.startsWith('audio/')
        ? 'audio'
        : 'document';
  let uploadedMediaId: string | null = null;
  if (input.attachment.storagePath) {
    try {
      const admin = createSupabaseAdminClient();
      const { data: blob } = await admin.storage.from('conversation-media').download(input.attachment.storagePath);
      if (blob) {
        const fileBuffer = await blob.arrayBuffer();
        const formData = new FormData();
        formData.append('messaging_product', 'whatsapp');
        formData.append('file', new Blob([fileBuffer], { type: input.attachment.mimeType }), input.attachment.fileName);
        formData.append('type', input.attachment.mimeType);

        const uploadRes = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/media`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${material.accessToken}` },
          body: formData,
        });
        const uploadData = (await uploadRes.json().catch(() => ({}))) as Record<string, unknown>;
        if (uploadRes.ok && uploadData.id) {
          uploadedMediaId = String(uploadData.id);
        }
      }
    } catch (e) {
      console.warn('Failed to upload media directly to WhatsApp Media API:', e);
    }
  }

  const media = uploadedMediaId
    ? { id: uploadedMediaId, ...(type === 'document' ? { filename: input.attachment.fileName } : {}) }
    : type === 'document'
      ? { link: input.attachment.url, filename: input.attachment.fileName }
      : { link: input.attachment.url };

  const { response, data } = await metaFetchJson<Record<string, unknown>>(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${material.accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type,
      [type]: media,
    }),
  });

  if (!response.ok) {
    const providerError = data.error as Record<string, unknown> | undefined;
    throw new ChannelDeliveryError(
      typeof providerError?.message === 'string' ? providerError.message : 'WhatsApp rejected the attachment.',
      { status: response.status === 429 ? 429 : 502, code: String(providerError?.code || 'whatsapp_attachment_send_failed') }
    );
  }
  const messages = Array.isArray(data.messages) ? data.messages as Array<Record<string, unknown>> : [];
  const externalMessageId = String(messages[0]?.id || '');
  if (!externalMessageId) throw new ChannelDeliveryError('WhatsApp accepted the attachment without returning a message ID.');
  return { externalMessageId, provider: 'whatsapp' as const };
}

function validateProvider(input: { provider: string; connectionId: string | null }) {
  if (!input.connectionId) {
    throw new ChannelDeliveryError('This conversation is not attached to a connected channel.', {
      status: 409,
      code: 'connection_missing',
    });
  }
  if (!['facebook', 'instagram', 'whatsapp'].includes(input.provider)) {
    throw new ChannelDeliveryError(`Outbound ${input.provider} messaging is not configured.`, {
      status: 501,
      code: 'provider_not_implemented',
    });
  }
}

export async function sendChannelText(input: SendTextInput) {
  validateProvider(input);
  const material = await connectionMaterial(input.connectionId!);
  if (input.provider === 'facebook' || input.provider === 'instagram') {
    return sendFacebookOrInstagram(input.provider, input, material);
  }
  if (material.config.transport === 'baileys') return sendBaileysWhatsApp(input, material);
  return sendWhatsApp(input, material);
}

export async function sendChannelAttachment(input: SendAttachmentInput) {
  validateProvider(input);
  const material = await connectionMaterial(input.connectionId!);
  if (input.provider === 'facebook' || input.provider === 'instagram') {
    return sendFacebookOrInstagramAttachment(input.provider, input, material);
  }
  if (material.config.transport === 'baileys') return sendBaileysWhatsAppAttachment(input, material);
  return sendWhatsAppAttachment(input, material);
}
