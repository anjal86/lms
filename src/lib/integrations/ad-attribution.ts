export type NormalizedAdAttribution = {
  origin: 'paid_ad';
  provider: 'facebook' | 'instagram' | 'whatsapp';
  platform: string;
  source_type: string;
  campaign_id: string | null;
  campaign_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  ad_id: string | null;
  ad_name: string | null;
  source_id: string | null;
  source_url: string | null;
  headline: string | null;
  body: string | null;
  media_type: string | null;
  media_url: string | null;
  ctwa_clid: string | null;
  raw: Record<string, unknown>;
};

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

export function mergeReferralObjects(...values: unknown[]): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const value of values) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    Object.assign(merged, value as Record<string, unknown>);
  }
  return merged;
}

export function normalizeMetaAdAttribution(
  rawInput: unknown,
  provider: 'facebook' | 'instagram' | 'whatsapp',
): NormalizedAdAttribution | null {
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) return null;
  const raw = rawInput as Record<string, unknown>;

  const source = firstText(raw.source, raw.referral_source);
  const sourceType = firstText(raw.source_type, raw.type) || 'ad';
  const adId = firstText(raw.ad_id);
  const sourceId = firstText(raw.source_id, raw.ad_id, raw.id);
  const ctwaClid = firstText(raw.ctwa_clid);

  const looksPaid = Boolean(
    adId
    || ctwaClid
    || sourceId
    || source?.toUpperCase() === 'ADS'
    || sourceType.toLowerCase() === 'ad'
    || sourceType.toLowerCase().includes('ad')
  );
  if (!looksPaid) return null;

  const platform = firstText(raw.platform)
    || (provider === 'instagram' ? 'instagram' : provider === 'facebook' ? 'facebook' : 'meta');

  return {
    origin: 'paid_ad',
    provider,
    platform,
    source_type: sourceType,
    campaign_id: firstText(raw.campaign_id),
    campaign_name: firstText(raw.campaign_name),
    adset_id: firstText(raw.adset_id),
    adset_name: firstText(raw.adset_name),
    ad_id: adId,
    ad_name: firstText(raw.ad_name),
    source_id: sourceId,
    source_url: firstText(raw.source_url, raw.url),
    headline: firstText(raw.headline, raw.title),
    body: firstText(raw.body, raw.description, raw.text),
    media_type: firstText(raw.media_type),
    media_url: firstText(raw.image_url, raw.video_url, raw.thumbnail_url, raw.media_url),
    ctwa_clid: ctwaClid,
    raw,
  };
}
