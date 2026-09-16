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

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
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
  const adsContext = record(raw.ads_context_data);

  const source = firstText(raw.source, raw.referral_source);
  const sourceType = firstText(raw.source_type, raw.type);
  const adId = firstText(raw.ad_id, adsContext.ad_id);
  const sourceId = firstText(raw.source_id, adId, raw.id);
  const ctwaClid = firstText(raw.ctwa_clid);
  const normalizedSource = source?.toLowerCase() || '';
  const normalizedType = sourceType?.toLowerCase().replace(/[\s-]+/g, '_') || '';
  const paidTypes = new Set(['ad', 'ads', 'paid_ad', 'advertisement', 'click_to_whatsapp', 'ctwa']);

  // Meta referral payloads also exist for organic posts, short links and other
  // entry points. A source_id by itself is therefore not proof of paid traffic.
  // Require an explicit ad identifier/click ID or a provider marker that clearly
  // denotes advertising so organic referrals never contaminate paid attribution.
  const looksPaid = Boolean(
    adId
    || ctwaClid
    || normalizedSource === 'ads'
    || normalizedSource === 'ad'
    || paidTypes.has(normalizedType)
  );
  if (!looksPaid) return null;

  const platform = firstText(raw.platform, raw.source_app)
    || (provider === 'instagram' ? 'instagram' : provider === 'facebook' ? 'facebook' : 'meta');

  const imageUrl = firstText(raw.image_url, raw.original_image_url, adsContext.photo_url);
  const videoUrl = firstText(raw.video_url, adsContext.video_url);
  const thumbnailUrl = firstText(raw.thumbnail_url, adsContext.thumbnail_url);

  return {
    origin: 'paid_ad',
    provider,
    platform,
    source_type: sourceType || 'ad',
    campaign_id: firstText(raw.campaign_id),
    campaign_name: firstText(raw.campaign_name),
    adset_id: firstText(raw.adset_id),
    adset_name: firstText(raw.adset_name),
    ad_id: adId,
    ad_name: firstText(raw.ad_name, adsContext.ad_title),
    source_id: sourceId,
    source_url: firstText(raw.source_url, raw.referer_uri, raw.url),
    headline: firstText(raw.headline, raw.title, raw.ad_title, adsContext.ad_title),
    body: firstText(raw.body, raw.description, raw.text, raw.ad_body, adsContext.ad_body),
    media_type: firstText(raw.media_type),
    media_url: firstText(raw.media_url, imageUrl, videoUrl, thumbnailUrl),
    ctwa_clid: ctwaClid,
    raw,
  };
}
