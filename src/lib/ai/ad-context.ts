import 'server-only';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export type AiAdAttribution = {
  origin?: string | null;
  provider?: string | null;
  platform?: string | null;
  source_type?: string | null;
  campaign_id?: string | null;
  campaign_name?: string | null;
  adset_id?: string | null;
  adset_name?: string | null;
  ad_id?: string | null;
  ad_name?: string | null;
  source_id?: string | null;
  source_url?: string | null;
  headline?: string | null;
  body?: string | null;
  media_type?: string | null;
  media_url?: string | null;
  ctwa_clid?: string | null;
  captured_at?: string | null;
  attribution_id?: string | null;
};

export type AiAdKnowledge = {
  id: string;
  registry_id: string | null;
  override_id: string | null;
  source: 'meta_auto' | 'manual_override' | 'meta_auto+override';
  name: string;
  provider: string | null;
  platform: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  ad_id: string | null;
  source_id: string | null;
  title: string | null;
  offer_summary: string | null;
  knowledge_text: string;
  creative_id: string | null;
  call_to_action_type: string | null;
  destination_url: string | null;
  media_url: string | null;
  status: string | null;
  effective_status: string | null;
  adset_effective_status: string | null;
  campaign_effective_status: string | null;
  enrichment_status: string | null;
  last_meta_sync_at: string | null;
  last_meta_sync_error: string | null;
  valid_from: string | null;
  valid_to: string | null;
  is_active: boolean;
  validity: 'active' | 'upcoming' | 'expired' | 'inactive' | 'unknown';
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function attributionFromConversationMetadata(metadata: unknown): AiAdAttribution | null {
  const root = record(metadata);
  const raw = record(root.ad_attribution);
  if (!Object.keys(raw).length) return null;
  const sourceType = text(raw.source_type);
  const sourceId = text(raw.source_id);
  return {
    origin: text(raw.origin),
    provider: text(raw.provider),
    platform: text(raw.platform),
    source_type: sourceType,
    campaign_id: text(raw.campaign_id),
    campaign_name: text(raw.campaign_name),
    adset_id: text(raw.adset_id),
    adset_name: text(raw.adset_name),
    ad_id: text(raw.ad_id) || (sourceType?.toLowerCase() === 'ad' ? sourceId : null),
    ad_name: text(raw.ad_name),
    source_id: sourceId,
    source_url: text(raw.source_url),
    headline: text(raw.headline),
    body: text(raw.body),
    media_type: text(raw.media_type),
    media_url: text(raw.media_url),
    ctwa_clid: text(raw.ctwa_clid),
    captured_at: text(raw.captured_at),
    attribution_id: text(raw.attribution_id),
  };
}

function scoreKnowledge(row: Record<string, unknown>, attribution: AiAdAttribution) {
  const rowProvider = text(row.provider);
  const rowPlatform = text(row.platform);
  if (rowProvider && attribution.provider && rowProvider !== attribution.provider) return -1;
  if (rowPlatform && attribution.platform && rowPlatform !== attribution.platform) return -1;

  let score = 0;
  const rowAdId = text(row.ad_id);
  const rowSourceId = text(row.source_id);
  const rowCampaignId = text(row.campaign_id);

  if (rowAdId && attribution.ad_id && rowAdId === attribution.ad_id) score += 100;
  if (rowSourceId && attribution.source_id && rowSourceId === attribution.source_id) score += 90;
  if (rowCampaignId && attribution.campaign_id && rowCampaignId === attribution.campaign_id) score += 70;
  if (!score) return -1;
  if (rowProvider && attribution.provider) score += 5;
  if (rowPlatform && attribution.platform) score += 3;
  return score;
}

function computeValidity(input: {
  validFrom: string | null;
  validTo: string | null;
  effectiveStatus: string | null;
  adsetEffectiveStatus: string | null;
  campaignEffectiveStatus: string | null;
  hasManualOverride: boolean;
}): AiAdKnowledge['validity'] {
  const now = Date.now();
  if (input.validFrom && new Date(input.validFrom).getTime() > now) return 'upcoming';
  if (input.validTo && new Date(input.validTo).getTime() < now) return 'expired';

  const statuses = [input.effectiveStatus, input.adsetEffectiveStatus, input.campaignEffectiveStatus]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toUpperCase());
  if (statuses.some((value) => ['PAUSED','DELETED','ARCHIVED','DISAPPROVED','WITH_ISSUES'].includes(value))) return 'inactive';
  if (statuses.some((value) => value === 'ACTIVE')) return 'active';
  if (input.hasManualOverride) return 'active';
  return 'unknown';
}

async function findRegistry(workspaceId: string, attribution: AiAdAttribution) {
  const admin = createSupabaseAdminClient();
  const adId = attribution.ad_id || (attribution.source_type?.toLowerCase() === 'ad' ? attribution.source_id : null);
  const fields = 'id,provider,platform,ad_id,source_id,source_url,campaign_id,campaign_name,adset_id,adset_name,ad_name,creative_id,headline,body,call_to_action_type,destination_url,media_type,media_url,status,effective_status,adset_status,adset_effective_status,campaign_status,campaign_effective_status,adset_start_time,adset_end_time,enrichment_status,last_meta_sync_at,last_meta_sync_error,last_seen_at';

  if (adId) {
    const { data, error } = await admin.from('meta_ad_registry')
      .select(fields)
      .eq('workspace_id', workspaceId)
      .eq('ad_id', adId)
      .maybeSingle();
    if (error) throw error;
    if (data) return data as Record<string, unknown>;
  }
  if (attribution.source_id) {
    const { data, error } = await admin.from('meta_ad_registry')
      .select(fields)
      .eq('workspace_id', workspaceId)
      .eq('source_id', attribution.source_id)
      .order('last_seen_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data) return data as Record<string, unknown>;
  }
  return null;
}

async function findOverride(workspaceId: string, attribution: AiAdAttribution) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('ad_knowledge')
    .select('id,name,provider,platform,campaign_id,ad_id,source_id,title,offer_summary,knowledge_text,valid_from,valid_to,is_active,updated_at')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(200);
  if (error) throw error;

  let best: Record<string, unknown> | null = null;
  let bestScore = -1;
  for (const row of data || []) {
    const score = scoreKnowledge(row as Record<string, unknown>, attribution);
    if (score > bestScore) {
      best = row as Record<string, unknown>;
      bestScore = score;
    }
  }
  return bestScore >= 0 ? best : null;
}

export async function resolveAdKnowledge(
  workspaceId: string,
  attribution: AiAdAttribution | null,
): Promise<AiAdKnowledge | null> {
  if (!attribution) return null;
  if (!attribution.ad_id && !attribution.source_id && !attribution.campaign_id) return null;

  const [registry, override] = await Promise.all([
    findRegistry(workspaceId, attribution),
    findOverride(workspaceId, attribution),
  ]);
  if (!registry && !override) return null;

  const registryId = registry ? String(registry.id) : null;
  const overrideId = override ? String(override.id) : null;
  const validFrom = text(override?.valid_from) || text(registry?.adset_start_time);
  const validTo = text(override?.valid_to) || text(registry?.adset_end_time);
  const effectiveStatus = text(registry?.effective_status);
  const adsetEffectiveStatus = text(registry?.adset_effective_status);
  const campaignEffectiveStatus = text(registry?.campaign_effective_status);
  const validity = computeValidity({
    validFrom,
    validTo,
    effectiveStatus,
    adsetEffectiveStatus,
    campaignEffectiveStatus,
    hasManualOverride: Boolean(override),
  });

  const source: AiAdKnowledge['source'] = registry && override
    ? 'meta_auto+override'
    : registry
      ? 'meta_auto'
      : 'manual_override';
  const title = text(override?.title) || text(registry?.headline) || attribution.headline || text(registry?.ad_name) || attribution.ad_name || null;
  const offerSummary = text(override?.offer_summary) || text(registry?.body) || attribution.body || null;
  const name = text(override?.name)
    || text(registry?.ad_name)
    || title
    || text(registry?.campaign_name)
    || 'Meta ad context';

  return {
    id: overrideId || registryId || 'ad-context',
    registry_id: registryId,
    override_id: overrideId,
    source,
    name,
    provider: text(registry?.provider) || text(override?.provider) || attribution.provider || null,
    platform: text(registry?.platform) || text(override?.platform) || attribution.platform || null,
    campaign_id: text(registry?.campaign_id) || text(override?.campaign_id) || attribution.campaign_id || null,
    campaign_name: text(registry?.campaign_name) || attribution.campaign_name || null,
    adset_id: text(registry?.adset_id) || attribution.adset_id || null,
    adset_name: text(registry?.adset_name) || attribution.adset_name || null,
    ad_id: text(registry?.ad_id) || text(override?.ad_id) || attribution.ad_id || null,
    source_id: text(registry?.source_id) || text(override?.source_id) || attribution.source_id || null,
    title,
    offer_summary: offerSummary,
    knowledge_text: text(override?.knowledge_text) || '',
    creative_id: text(registry?.creative_id),
    call_to_action_type: text(registry?.call_to_action_type),
    destination_url: text(registry?.destination_url),
    media_url: text(registry?.media_url) || attribution.media_url || null,
    status: text(registry?.status),
    effective_status: effectiveStatus,
    adset_effective_status: adsetEffectiveStatus,
    campaign_effective_status: campaignEffectiveStatus,
    enrichment_status: text(registry?.enrichment_status),
    last_meta_sync_at: text(registry?.last_meta_sync_at),
    last_meta_sync_error: text(registry?.last_meta_sync_error),
    valid_from: validFrom,
    valid_to: validTo,
    is_active: validity === 'active',
    validity,
  };
}
