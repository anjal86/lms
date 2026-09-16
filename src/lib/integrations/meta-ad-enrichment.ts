import 'server-only';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { decryptIntegrationSecret, decryptSecretPayload } from '@/lib/integrations/secrets';
import { metaFetchJson } from '@/lib/integrations/meta-http';

type MetaAdJob = {
  id: string;
  workspace_id: string;
  registry_id: string;
  attempt_count: number;
  max_attempts: number;
};

type RegistryRow = {
  id: string;
  workspace_id: string;
  connection_id: string | null;
  provider: string;
  ad_id: string;
  source_id: string | null;
  ad_name: string | null;
  headline: string | null;
  body: string | null;
  media_type: string | null;
  media_url: string | null;
};

class MetaAdPermissionError extends Error {}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const normalized = text(value);
    if (normalized) return normalized;
  }
  return null;
}

function firstArrayText(value: unknown) {
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    const row = record(item);
    const candidate = firstText(row.text, row.name, row.value);
    if (candidate) return candidate;
  }
  return null;
}

function metaErrorMessage(data: unknown) {
  const root = record(data);
  const error = record(root.error);
  return firstText(error.message, root.message) || 'Meta request failed.';
}

function looksLikePermissionFailure(status: number, data: unknown) {
  if (![400, 401, 403, 404].includes(status)) return false;
  const root = record(data);
  const error = record(root.error);
  const code = Number(error.code || 0);
  const message = metaErrorMessage(data).toLowerCase();
  return [10, 100, 190, 200, 294].includes(code)
    || message.includes('permission')
    || message.includes('access token')
    || message.includes('does not have access')
    || message.includes('unsupported get request')
    || message.includes('object does not exist')
    || message.includes('cannot be loaded due to missing permissions');
}

async function resolveMetaAuthorization(workspaceId: string, connectionId: string | null) {
  if (!connectionId) throw new MetaAdPermissionError('The originating Meta connection is unavailable. Reconnect the account to enable automatic ad enrichment.');
  const admin = createSupabaseAdminClient();
  const { data: connection, error } = await admin
    .from('integration_connections')
    .select('id,workspace_id,config')
    .eq('workspace_id', workspaceId)
    .eq('id', connectionId)
    .maybeSingle();
  if (error) throw error;
  if (!connection) throw new MetaAdPermissionError('The originating Meta connection no longer exists.');

  const config = record(connection.config);
  const authorizationId = text(config.authorization_id) || connection.id;
  const [{ data: authorization }, { data: secret, error: secretError }] = await Promise.all([
    admin.from('integration_connections')
      .select('id,workspace_id,config,status')
      .eq('workspace_id', workspaceId)
      .eq('id', authorizationId)
      .maybeSingle(),
    admin.from('integration_secrets')
      .select('access_token,secret_payload')
      .eq('connection_id', authorizationId)
      .maybeSingle(),
  ]);
  if (secretError) throw secretError;
  if (!authorization || !secret?.access_token) {
    throw new MetaAdPermissionError('Meta authorization credentials are unavailable. Reconnect the Meta account.');
  }

  const accessToken = decryptIntegrationSecret(secret.access_token);
  if (!accessToken) throw new MetaAdPermissionError('Meta authorization token is unavailable. Reconnect the Meta account.');
  const authorizationConfig = record(authorization.config);
  const secretPayload = record(decryptSecretPayload(secret.secret_payload));
  return {
    accessToken,
    authorizationId,
    graphVersion: firstText(config.graph_version, authorizationConfig.graph_version) || 'v26.0',
    oauthUserId: firstText(secretPayload.oauth_user_id),
  };
}

async function graphObject(
  version: string,
  id: string,
  fields: string,
  accessToken: string,
) {
  const url = new URL(`https://graph.facebook.com/${version}/${encodeURIComponent(id)}`);
  url.searchParams.set('fields', fields);
  const { response, data } = await metaFetchJson<Record<string, unknown>>(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  }, { timeoutMs: 8_000, retries: 1 });
  if (!response.ok) {
    const message = metaErrorMessage(data);
    if (looksLikePermissionFailure(response.status, data)) throw new MetaAdPermissionError(message);
    throw new Error(message);
  }
  return record(data);
}

async function optionalGraphObject(
  version: string,
  id: string | null,
  fields: string,
  accessToken: string,
  warnings: string[],
) {
  if (!id) return null;
  try {
    return await graphObject(version, id, fields, accessToken);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(message);
    return null;
  }
}

function creativeContext(creative: Record<string, unknown> | null) {
  if (!creative) return {
    creativeId: null,
    headline: null,
    body: null,
    mediaUrl: null,
    ctaType: null,
    destinationUrl: null,
  };

  const story = record(creative.object_story_spec);
  const linkData = record(story.link_data);
  const videoData = record(story.video_data);
  const photoData = record(story.photo_data);
  const linkCta = record(linkData.call_to_action);
  const videoCta = record(videoData.call_to_action);
  const linkCtaValue = record(linkCta.value);
  const videoCtaValue = record(videoCta.value);
  const assetFeed = record(creative.asset_feed_spec);

  const headline = firstText(
    creative.title,
    linkData.name,
    videoData.title,
    firstArrayText(assetFeed.titles),
  );
  const body = firstText(
    creative.body,
    linkData.message,
    videoData.message,
    photoData.message,
    firstArrayText(assetFeed.bodies),
  );
  const mediaUrl = firstText(
    creative.image_url,
    creative.thumbnail_url,
    linkData.picture,
    videoData.image_url,
    photoData.url,
  );
  const ctaType = firstText(creative.call_to_action_type, linkCta.type, videoCta.type);
  const destinationUrl = firstText(
    linkData.link,
    linkCtaValue.link,
    videoCtaValue.link,
    creative.object_url,
  );

  return {
    creativeId: firstText(creative.id),
    headline,
    body,
    mediaUrl,
    ctaType,
    destinationUrl,
  };
}

async function completeJob(job: MetaAdJob) {
  const admin = createSupabaseAdminClient();
  await admin.from('meta_ad_enrichment_jobs').update({
    status: 'completed',
    completed_at: new Date().toISOString(),
    locked_at: null,
    last_error: null,
    updated_at: new Date().toISOString(),
  }).eq('id', job.id);
}

async function permissionJob(job: MetaAdJob, message: string) {
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  await Promise.all([
    admin.from('meta_ad_enrichment_jobs').update({
      status: 'permission_required',
      locked_at: null,
      last_error: message.slice(0, 1000),
      updated_at: now,
    }).eq('id', job.id),
    admin.from('meta_ad_registry').update({
      enrichment_status: 'permission_required',
      last_meta_sync_error: message.slice(0, 1000),
      updated_at: now,
    }).eq('workspace_id', job.workspace_id).eq('id', job.registry_id),
  ]);
}

async function failJob(job: MetaAdJob, error: unknown) {
  const admin = createSupabaseAdminClient();
  const message = error instanceof Error ? error.message : String(error);
  const attempts = Number(job.attempt_count || 0) + 1;
  const retry = attempts < Number(job.max_attempts || 4);
  const delaySeconds = Math.min(900, 30 * (2 ** Math.max(0, attempts - 1)));
  const now = new Date().toISOString();
  await Promise.all([
    admin.from('meta_ad_enrichment_jobs').update({
      status: retry ? 'queued' : 'failed',
      attempt_count: attempts,
      next_attempt_at: retry ? new Date(Date.now() + delaySeconds * 1000).toISOString() : now,
      locked_at: null,
      last_error: message.slice(0, 1000),
      updated_at: now,
    }).eq('id', job.id),
    admin.from('meta_ad_registry').update({
      enrichment_status: retry ? 'pending' : 'failed',
      last_meta_sync_error: message.slice(0, 1000),
      updated_at: now,
    }).eq('workspace_id', job.workspace_id).eq('id', job.registry_id),
  ]);
  return { retry, attempts, error: message };
}

export async function processMetaAdEnrichmentJob(job: MetaAdJob) {
  const admin = createSupabaseAdminClient();
  try {
    const { data, error } = await admin.from('meta_ad_registry')
      .select('id,workspace_id,connection_id,provider,ad_id,source_id,ad_name,headline,body,media_type,media_url')
      .eq('workspace_id', job.workspace_id)
      .eq('id', job.registry_id)
      .maybeSingle();
    if (error) throw error;
    const registry = data as RegistryRow | null;
    if (!registry) {
      await completeJob(job);
      return { processed: true, skipped: true, reason: 'registry_missing' };
    }
    if (!['facebook', 'instagram', 'whatsapp'].includes(registry.provider)) {
      const now = new Date().toISOString();
      await Promise.all([
        admin.from('meta_ad_registry').update({
          enrichment_status: 'unsupported',
          last_meta_sync_error: 'Automatic Marketing API enrichment is only available for Meta ad conversations.',
          updated_at: now,
        }).eq('id', registry.id).eq('workspace_id', registry.workspace_id),
        admin.from('meta_ad_enrichment_jobs').update({
          status: 'completed', completed_at: now, locked_at: null, updated_at: now,
        }).eq('id', job.id),
      ]);
      return { processed: true, skipped: true, reason: 'unsupported_provider' };
    }

    const auth = await resolveMetaAuthorization(registry.workspace_id, registry.connection_id);
    const ad = await graphObject(
      auth.graphVersion,
      registry.ad_id,
      'id,name,account_id,adset_id,campaign_id,status,effective_status,creative{id},created_time,updated_time',
      auth.accessToken,
    );

    const warnings: string[] = [];
    const creativeRef = record(ad.creative);
    const creativeId = firstText(creativeRef.id);
    const adsetId = firstText(ad.adset_id);
    const campaignId = firstText(ad.campaign_id);
    const [creative, adset, campaign] = await Promise.all([
      optionalGraphObject(
        auth.graphVersion,
        creativeId,
        'id,name,title,body,image_url,thumbnail_url,object_story_spec,asset_feed_spec,call_to_action_type,object_url',
        auth.accessToken,
        warnings,
      ),
      optionalGraphObject(
        auth.graphVersion,
        adsetId,
        'id,name,campaign_id,status,effective_status,start_time,end_time,destination_type',
        auth.accessToken,
        warnings,
      ),
      optionalGraphObject(
        auth.graphVersion,
        campaignId,
        'id,name,status,effective_status',
        auth.accessToken,
        warnings,
      ),
    ]);

    const creativeData = creativeContext(creative);
    const now = new Date().toISOString();
    const patch = {
      campaign_id: firstText(campaign?.id, campaignId),
      campaign_name: firstText(campaign?.name),
      adset_id: firstText(adset?.id, adsetId),
      adset_name: firstText(adset?.name),
      ad_name: firstText(ad.name, registry.ad_name),
      creative_id: creativeData.creativeId || creativeId,
      headline: creativeData.headline || registry.headline,
      body: creativeData.body || registry.body,
      call_to_action_type: creativeData.ctaType,
      destination_url: creativeData.destinationUrl,
      media_url: creativeData.mediaUrl || registry.media_url,
      status: firstText(ad.status),
      effective_status: firstText(ad.effective_status),
      adset_status: firstText(adset?.status),
      adset_effective_status: firstText(adset?.effective_status),
      campaign_status: firstText(campaign?.status),
      campaign_effective_status: firstText(campaign?.effective_status),
      adset_start_time: firstText(adset?.start_time),
      adset_end_time: firstText(adset?.end_time),
      enrichment_status: 'enriched',
      last_meta_sync_at: now,
      last_meta_sync_error: warnings.length ? warnings.join(' | ').slice(0, 1000) : null,
      meta_payload: { ad, creative, adset, campaign, authorization_id: auth.authorizationId },
      updated_at: now,
    };

    const { error: updateError } = await admin.from('meta_ad_registry')
      .update(patch)
      .eq('workspace_id', registry.workspace_id)
      .eq('id', registry.id);
    if (updateError) throw updateError;
    await completeJob(job);
    return {
      processed: true,
      enriched: true,
      registryId: registry.id,
      adId: registry.ad_id,
      partial: warnings.length > 0,
      warnings,
    };
  } catch (error) {
    if (error instanceof MetaAdPermissionError) {
      await permissionJob(job, error.message);
      return { processed: true, enriched: false, permissionRequired: true, error: error.message };
    }
    const failure = await failJob(job, error);
    return { processed: false, ...failure };
  }
}
