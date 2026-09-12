import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { decryptIntegrationSecret, decryptSecretPayload } from '@/lib/integrations/secrets';
import { metaFetchJson } from '@/lib/integrations/meta-http';

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

type ConnectionConfig = {
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
  if (secretError || !secrets) {
    throw new ChannelDeliveryError('The channel credentials are unavailable.', { status: 409, code: 'credentials_missing' });
  }
  if (secrets.token_expires_at && new Date(secrets.token_expires_at).getTime() <= Date.now()) {
    throw new ChannelDeliveryError('The channel token has expired. Reconnect the channel.', { status: 409, code: 'token_expired' });
  }

  return {
    connection,
    config: (connection.config || {}) as ConnectionConfig,
    accessToken: decryptIntegrationSecret(secrets.access_token),
    secretPayload: decryptSecretPayload(secrets.secret_payload || {}) as Record<string, unknown>,
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

async function sendFacebookOrInstagram(
  provider: 'facebook' | 'instagram',
  input: SendTextInput,
  material: Awaited<ReturnType<typeof connectionMaterial>>
) {
  const accountId = providerAccountId(input.externalThreadId);
  if (!accountId || !input.externalContactId) {
    throw new ChannelDeliveryError('This conversation is missing its provider contact identifiers.', {
      status: 409,
      code: 'provider_identifiers_missing',
    });
  }

  const token = pageAccessToken(material.secretPayload, material.config, accountId, provider) || material.accessToken;
  if (!token) {
    throw new ChannelDeliveryError('No provider access token is available.', { status: 409, code: 'credentials_missing' });
  }

  const version = process.env.META_GRAPH_VERSION?.trim() || 'v26.0';
  const endpoint = provider === 'facebook'
    ? `https://graph.facebook.com/${version}/me/messages`
    : `https://graph.facebook.com/${version}/${accountId}/messages`;

  const { response, data } = await metaFetchJson<Record<string, unknown>>(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      recipient: { id: input.externalContactId },
      message: { text: input.body },
    }),
  });

  if (!response.ok) {
    const providerError = data.error as Record<string, unknown> | undefined;
    throw new ChannelDeliveryError(
      typeof providerError?.message === 'string' ? providerError.message : `${provider} rejected the message.`,
      { status: response.status === 429 ? 429 : 502, code: String(providerError?.code || 'meta_send_failed') }
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

export async function sendChannelText(input: SendTextInput) {
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

  const material = await connectionMaterial(input.connectionId);
  if (input.provider === 'facebook' || input.provider === 'instagram') {
    return sendFacebookOrInstagram(input.provider, input, material);
  }
  return sendWhatsApp(input, material);
}
