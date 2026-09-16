'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BadgeCheck, ExternalLink, Loader2, Megaphone } from 'lucide-react';

type Attribution = {
  id?: string;
  provider?: string | null;
  platform?: string | null;
  campaign_id?: string | null;
  campaign_name?: string | null;
  ad_id?: string | null;
  ad_name?: string | null;
  source_id?: string | null;
  source_url?: string | null;
  headline?: string | null;
  body?: string | null;
  media_type?: string | null;
  ctwa_clid?: string | null;
  captured_at?: string | null;
};

type Knowledge = {
  id: string;
  source: 'meta_auto' | 'manual_override' | 'meta_auto+override';
  name: string;
  title: string | null;
  offer_summary: string | null;
  campaign_name: string | null;
  adset_name: string | null;
  effective_status: string | null;
  enrichment_status: string | null;
  last_meta_sync_at: string | null;
  valid_from: string | null;
  valid_to: string | null;
  validity: 'active' | 'upcoming' | 'expired' | 'inactive' | 'unknown';
};

type Payload = {
  first_touch?: Attribution | null;
  latest?: Attribution | null;
  knowledge?: Knowledge | null;
  touch_count?: number;
};

function compactId(value?: string | null) {
  if (!value) return null;
  return value.length > 24 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value;
}

function sourceLabel(attribution: Attribution) {
  const platform = attribution.platform || attribution.provider || 'Paid';
  return `${platform.charAt(0).toUpperCase()}${platform.slice(1)} ad`;
}

function knowledgeStatus(knowledge: Knowledge) {
  if (knowledge.enrichment_status === 'permission_required') return 'Webhook context captured · Meta reconnect needed';
  if (knowledge.enrichment_status === 'pending') return 'Webhook context captured · Meta enrichment pending';
  if (knowledge.validity === 'expired') return 'Originating ad/offer expired';
  if (knowledge.validity === 'inactive') return 'Originating ad is not active';
  if (knowledge.validity === 'upcoming') return 'Originating offer not active yet';
  if (knowledge.enrichment_status === 'enriched') return 'Meta ad context synced';
  return 'Ad context captured automatically';
}

export default function InboxAdAttribution({ conversationId, canManage }: { conversationId: string; canManage: boolean }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/attribution`, { cache: 'no-store' });
      if (!response.ok) { setPayload(null); return; }
      setPayload(await response.json() as Payload);
    } catch {
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="flex items-center gap-2 border-t border-zinc-100 pt-4 text-[10px] text-zinc-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking ad origin…</div>;
  const attribution = payload?.first_touch;
  if (!attribution) return null;
  const knowledge = payload?.knowledge;

  return <section className="border-t border-zinc-100 pt-4">
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-700"><Megaphone className="h-3.5 w-3.5" /> Ad origin</div>
      {payload?.touch_count && payload.touch_count > 1 ? <span className="text-[10px] text-zinc-400">{payload.touch_count} ad touches</span> : null}
    </div>

    <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50/50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-blue-600">{sourceLabel(attribution)}</div>
          <div className="mt-1 text-xs font-semibold leading-5 text-zinc-900">{knowledge?.title || attribution.headline || attribution.ad_name || 'Paid-ad conversation'}</div>
        </div>
        {attribution.source_url && <a href={attribution.source_url} target="_blank" rel="noreferrer" className="rounded-md p-1.5 text-zinc-400 hover:bg-white hover:text-zinc-700" aria-label="Open ad source"><ExternalLink className="h-3.5 w-3.5" /></a>}
      </div>
      {(knowledge?.offer_summary || attribution.body) && <p className="mt-1.5 line-clamp-4 text-[11px] leading-4 text-zinc-600">{knowledge?.offer_summary || attribution.body}</p>}
      <dl className="mt-2 grid grid-cols-1 gap-1 text-[10px] text-zinc-500">
        {knowledge?.campaign_name && <div className="flex justify-between gap-3"><dt>Campaign</dt><dd className="max-w-[160px] truncate font-medium text-zinc-700" title={knowledge.campaign_name}>{knowledge.campaign_name}</dd></div>}
        {knowledge?.adset_name && <div className="flex justify-between gap-3"><dt>Ad set</dt><dd className="max-w-[160px] truncate font-medium text-zinc-700" title={knowledge.adset_name}>{knowledge.adset_name}</dd></div>}
        {attribution.ad_id && <div className="flex justify-between gap-3"><dt>Ad ID</dt><dd className="font-mono text-zinc-700" title={attribution.ad_id}>{compactId(attribution.ad_id)}</dd></div>}
        {attribution.source_id && attribution.source_id !== attribution.ad_id && <div className="flex justify-between gap-3"><dt>Source ID</dt><dd className="font-mono text-zinc-700" title={attribution.source_id}>{compactId(attribution.source_id)}</dd></div>}
        {attribution.ctwa_clid && <div className="flex justify-between gap-3"><dt>Click ID</dt><dd className="font-mono text-zinc-700" title={attribution.ctwa_clid}>{compactId(attribution.ctwa_clid)}</dd></div>}
      </dl>
    </div>

    {knowledge ? <div className={`mt-2 rounded-lg border p-3 ${knowledge.enrichment_status === 'permission_required' || ['expired','inactive','upcoming'].includes(knowledge.validity) ? 'border-amber-100 bg-amber-50/60' : 'border-emerald-100 bg-emerald-50/50'}`}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide">
        {knowledge.enrichment_status === 'permission_required' ? <AlertTriangle className="h-3.5 w-3.5" /> : <BadgeCheck className="h-3.5 w-3.5" />}
        <span>{knowledgeStatus(knowledge)}</span>
      </div>
      <div className="mt-1 text-xs font-semibold text-zinc-900">{knowledge.name}</div>
      {knowledge.effective_status && <div className="mt-1 text-[10px] text-zinc-500">Meta status: {knowledge.effective_status}</div>}
      {knowledge.source === 'meta_auto+override' && <div className="mt-1 text-[10px] text-blue-700">Includes an optional workspace override.</div>}
    </div> : <div className="mt-2 rounded-lg border border-dashed border-blue-200 bg-blue-50/40 p-3 text-[10px] leading-4 text-blue-800">Ad creative was captured from Meta. Automatic registry enrichment will attach campaign and status details in the background.</div>}

    {canManage && <Link href="/settings/ad-knowledge" className="mt-2 inline-flex text-[10px] font-semibold text-blue-700 hover:text-blue-900">View automatic ad context →</Link>}
  </section>;
}
