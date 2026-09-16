import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor, isManagement } from '@/lib/auth/api-actor';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SaveSchema = z.object({
  id: uuidSchema.nullable().optional(),
  name: z.string().trim().min(1).max(160),
  provider: z.string().trim().max(40).nullable().optional(),
  platform: z.string().trim().max(40).nullable().optional(),
  campaign_id: z.string().trim().max(200).nullable().optional(),
  ad_id: z.string().trim().max(200).nullable().optional(),
  source_id: z.string().trim().max(200).nullable().optional(),
  title: z.string().trim().max(300).nullable().optional(),
  offer_summary: z.string().trim().max(2000).nullable().optional(),
  knowledge_text: z.string().trim().max(12000).optional().default(''),
  valid_from: z.string().datetime().nullable().optional(),
  valid_to: z.string().datetime().nullable().optional(),
  is_active: z.boolean().optional().default(true),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

const DeleteSchema = z.object({ id: uuidSchema });
const SyncSchema = z.object({ action: z.literal('sync'), registry_id: uuidSchema });

function clean(value: string | null | undefined) {
  return value?.trim() || null;
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function overrideScore(override: Record<string, unknown>, registry: Record<string, unknown>) {
  const provider = text(override.provider);
  const platform = text(override.platform);
  if (provider && provider !== text(registry.provider)) return -1;
  if (platform && platform !== text(registry.platform)) return -1;
  let score = 0;
  if (text(override.ad_id) && text(override.ad_id) === text(registry.ad_id)) score += 100;
  if (text(override.source_id) && text(override.source_id) === text(registry.source_id)) score += 90;
  if (text(override.campaign_id) && text(override.campaign_id) === text(registry.campaign_id)) score += 70;
  return score || -1;
}

export async function GET(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!isManagement(actor.profile)) return NextResponse.json({ error: 'Manager access required.' }, { status: 403 });

  const [registryResult, overrideResult] = await Promise.all([
    actor.supabase
      .from('meta_ad_registry')
      .select('id,workspace_id,connection_id,provider,platform,ad_id,source_id,source_url,campaign_id,campaign_name,adset_id,adset_name,ad_name,creative_id,headline,body,call_to_action_type,destination_url,media_type,media_url,status,effective_status,adset_status,adset_effective_status,campaign_status,campaign_effective_status,adset_start_time,adset_end_time,enrichment_status,last_meta_sync_at,last_meta_sync_error,first_seen_at,last_seen_at,created_at,updated_at')
      .eq('workspace_id', actor.profile.workspace_id)
      .order('last_seen_at', { ascending: false }),
    actor.supabase
      .from('ad_knowledge')
      .select('id,workspace_id,name,provider,platform,campaign_id,ad_id,source_id,title,offer_summary,knowledge_text,valid_from,valid_to,is_active,metadata,created_at,updated_at')
      .eq('workspace_id', actor.profile.workspace_id)
      .order('updated_at', { ascending: false }),
  ]);
  if (registryResult.error) return NextResponse.json({ error: 'Unable to load automatic ad context.' }, { status: 500 });
  if (overrideResult.error) return NextResponse.json({ error: 'Unable to load ad overrides.' }, { status: 500 });

  const overrides = (overrideResult.data || []) as Array<Record<string, unknown>>;
  const matchedOverrideIds = new Set<string>();
  const items = (registryResult.data || []).map((registry) => {
    let best: Record<string, unknown> | null = null;
    let bestScore = -1;
    for (const override of overrides) {
      const score = overrideScore(override, registry as Record<string, unknown>);
      if (score > bestScore) {
        best = override;
        bestScore = score;
      }
    }
    if (best && bestScore >= 0) matchedOverrideIds.add(String(best.id));
    return { ...registry, override: bestScore >= 0 ? best : null };
  });

  const legacyOverrides = overrides.filter((override) => !matchedOverrideIds.has(String(override.id)));
  return NextResponse.json({
    items,
    legacy_overrides: legacyOverrides,
    summary: {
      detected: items.length,
      enriched: items.filter((item) => item.enrichment_status === 'enriched').length,
      permission_required: items.filter((item) => item.enrichment_status === 'permission_required').length,
      pending: items.filter((item) => item.enrichment_status === 'pending').length,
    },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!isManagement(actor.profile)) return NextResponse.json({ error: 'Manager access required.' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const syncParsed = SyncSchema.safeParse(body);
  if (syncParsed.success) {
    const { data: registry, error: registryError } = await actor.supabase
      .from('meta_ad_registry')
      .select('id')
      .eq('workspace_id', actor.profile.workspace_id)
      .eq('id', syncParsed.data.registry_id)
      .maybeSingle();
    if (registryError || !registry) return NextResponse.json({ error: 'Ad registry entry not found.' }, { status: 404 });

    const admin = createSupabaseAdminClient();
    const now = new Date().toISOString();
    const { error: registryUpdateError } = await admin.from('meta_ad_registry').update({
      enrichment_status: 'pending',
      last_meta_sync_error: null,
      updated_at: now,
    }).eq('workspace_id', actor.profile.workspace_id).eq('id', registry.id);
    if (registryUpdateError) return NextResponse.json({ error: 'Unable to queue ad refresh.' }, { status: 500 });

    const { error: jobError } = await admin.from('meta_ad_enrichment_jobs').upsert({
      workspace_id: actor.profile.workspace_id,
      registry_id: registry.id,
      status: 'queued',
      attempt_count: 0,
      next_attempt_at: now,
      locked_at: null,
      completed_at: null,
      last_error: null,
      updated_at: now,
    }, { onConflict: 'registry_id' });
    if (jobError) return NextResponse.json({ error: 'Unable to queue ad refresh.' }, { status: 500 });
    return NextResponse.json({ queued: true, registry_id: registry.id });
  }

  const parsed = SaveSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid ad override.' }, { status: 400 });
  const input = parsed.data;
  if (!clean(input.ad_id) && !clean(input.source_id) && !clean(input.campaign_id)) {
    return NextResponse.json({ error: 'An Ad ID, Source ID, or Campaign ID is required for an override.' }, { status: 400 });
  }
  if (input.valid_from && input.valid_to && new Date(input.valid_to).getTime() <= new Date(input.valid_from).getTime()) {
    return NextResponse.json({ error: 'Valid until must be later than valid from.' }, { status: 400 });
  }

  const payload = {
    workspace_id: actor.profile.workspace_id,
    name: input.name,
    provider: clean(input.provider),
    platform: clean(input.platform),
    campaign_id: clean(input.campaign_id),
    ad_id: clean(input.ad_id),
    source_id: clean(input.source_id),
    title: clean(input.title),
    offer_summary: clean(input.offer_summary),
    knowledge_text: input.knowledge_text.trim(),
    valid_from: input.valid_from || null,
    valid_to: input.valid_to || null,
    is_active: input.is_active,
    metadata: { ...input.metadata, role: 'optional_ad_override' },
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { data, error } = await actor.supabase
      .from('ad_knowledge')
      .update(payload)
      .eq('workspace_id', actor.profile.workspace_id)
      .eq('id', input.id)
      .select('*')
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message || 'Unable to update ad override.' }, { status: 400 });
    if (!data) return NextResponse.json({ error: 'Ad override not found.' }, { status: 404 });
    return NextResponse.json({ item: data });
  }

  const { data, error } = await actor.supabase
    .from('ad_knowledge')
    .insert({ ...payload, created_by: actor.profile.id })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message || 'Unable to create ad override.' }, { status: 400 });
  return NextResponse.json({ item: data }, { status: 201 });
}

export async function DELETE(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!isManagement(actor.profile)) return NextResponse.json({ error: 'Manager access required.' }, { status: 403 });

  const parsed = DeleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid ad override ID.' }, { status: 400 });
  const { error } = await actor.supabase
    .from('ad_knowledge')
    .delete()
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', parsed.data.id);
  if (error) return NextResponse.json({ error: 'Unable to delete ad override.' }, { status: 400 });
  return NextResponse.json({ deleted: true });
}
