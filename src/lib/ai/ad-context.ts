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
  name: string;
  provider: string | null;
  platform: string | null;
  campaign_id: string | null;
  ad_id: string | null;
  source_id: string | null;
  title: string | null;
  offer_summary: string | null;
  knowledge_text: string;
  valid_from: string | null;
  valid_to: string | null;
  is_active: boolean;
  validity: 'active' | 'upcoming' | 'expired';
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
  return {
    origin: text(raw.origin),
    provider: text(raw.provider),
    platform: text(raw.platform),
    source_type: text(raw.source_type),
    campaign_id: text(raw.campaign_id),
    campaign_name: text(raw.campaign_name),
    adset_id: text(raw.adset_id),
    adset_name: text(raw.adset_name),
    ad_id: text(raw.ad_id),
    ad_name: text(raw.ad_name),
    source_id: text(raw.source_id),
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

function validity(validFrom: string | null, validTo: string | null): AiAdKnowledge['validity'] {
  const now = Date.now();
  if (validFrom && new Date(validFrom).getTime() > now) return 'upcoming';
  if (validTo && new Date(validTo).getTime() < now) return 'expired';
  return 'active';
}

export async function resolveAdKnowledge(
  workspaceId: string,
  attribution: AiAdAttribution | null,
): Promise<AiAdKnowledge | null> {
  if (!attribution) return null;
  if (!attribution.ad_id && !attribution.source_id && !attribution.campaign_id) return null;

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
  if (!best || bestScore < 0) return null;

  const validFrom = text(best.valid_from);
  const validTo = text(best.valid_to);
  return {
    id: String(best.id),
    name: String(best.name || 'Ad knowledge'),
    provider: text(best.provider),
    platform: text(best.platform),
    campaign_id: text(best.campaign_id),
    ad_id: text(best.ad_id),
    source_id: text(best.source_id),
    title: text(best.title),
    offer_summary: text(best.offer_summary),
    knowledge_text: text(best.knowledge_text) || '',
    valid_from: validFrom,
    valid_to: validTo,
    is_active: best.is_active === true,
    validity: validity(validFrom, validTo),
  };
}
