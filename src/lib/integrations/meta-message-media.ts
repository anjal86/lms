import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { decryptIntegrationSecret, decryptSecretPayload } from '@/lib/integrations/secrets';
import { metaFetchJson } from '@/lib/integrations/meta-http';

type MetaRecord = Record<string, unknown>;

type ResolveMetaMessageMediaInput = {
  provider: 'facebook' | 'instagram';
  connectionId: string;
  externalThreadId: string | null;
  messageId: string;
};

function record(value: unknown): MetaRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as MetaRecord : {};
}

function accountIdFromThread(externalThreadId: string | null) {
  return externalThreadId?.split(':')[0]?.trim() || null;
}

export async function resolveMetaMessageMedia(input: ResolveMetaMessageMediaInput) {
  const admin = createSupabaseAdminClient();
  const [{ data: connection }, { data: secrets }] = await Promise.all([
    admin
      .from('integration_connections')
      .select('id,status,config')
      .eq('id', input.connectionId)
      .maybeSingle(),
    admin
      .from('integration_secrets')
      .select('access_token,secret_payload,token_expires_at')
      .eq('connection_id', input.connectionId)
      .maybeSingle(),
  ]);

  if (!connection || !secrets || !['connected', 'active', 'token_expiring'].includes(connection.status)) return null;
  if (secrets.token_expires_at && new Date(secrets.token_expires_at).getTime() <= Date.now()) return null;

  const accountId = accountIdFromThread(input.externalThreadId);
  if (!accountId) return null;

  const config = record(connection.config);
  const pages = Array.isArray(config.pages) ? config.pages.filter((item): item is MetaRecord => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : [];
  const payload = decryptSecretPayload(secrets.secret_payload || {}) as MetaRecord;
  const pageTokens = Array.isArray(payload.page_access_tokens)
    ? payload.page_access_tokens.filter((item): item is MetaRecord => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : [];

  let pageId = accountId;
  if (input.provider === 'instagram') {
    const ownerPage = pages.find((page) => String(record(page.instagram_business_account).id || '') === accountId);
    if (ownerPage?.id) pageId = String(ownerPage.id);
  }

  const pageToken = pageTokens.find((item) => String(item.id || '') === pageId)?.access_token;
  const token = typeof pageToken === 'string' ? pageToken : decryptIntegrationSecret(secrets.access_token);
  if (!token) return null;

  const version = process.env.META_GRAPH_VERSION?.trim() || 'v26.0';
  const endpoint = new URL(`https://graph.facebook.com/${version}/${encodeURIComponent(input.messageId)}`);
  endpoint.searchParams.set('fields', 'attachments{id,mime_type,name,size,image_data,video_data,file_url}');
  endpoint.searchParams.set('access_token', token);

  const { response, data } = await metaFetchJson<MetaRecord>(endpoint.toString());
  if (!response.ok) return null;

  const attachments = record(data.attachments);
  const first = Array.isArray(attachments.data)
    ? attachments.data.find((item): item is MetaRecord => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : null;
  if (!first) return null;

  const imageData = record(first.image_data);
  const videoData = record(first.video_data);
  const url = typeof imageData.url === 'string'
    ? imageData.url
    : typeof videoData.url === 'string'
      ? videoData.url
      : typeof first.file_url === 'string'
        ? first.file_url
        : null;
  if (!url) return null;

  return {
    url,
    mimeType: typeof first.mime_type === 'string' ? first.mime_type : null,
    fileName: typeof first.name === 'string' ? first.name : null,
  };
}
