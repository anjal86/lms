import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor, isManagement } from '@/lib/auth/api-actor';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NullableText = z.string().trim().max(4000).nullable().optional();

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

function clean(value: string | null | undefined) {
  return value?.trim() || null;
}

export async function GET(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!isManagement(actor.profile)) return NextResponse.json({ error: 'Manager access required.' }, { status: 403 });

  const { data, error } = await actor.supabase
    .from('ad_knowledge')
    .select('id,workspace_id,name,provider,platform,campaign_id,ad_id,source_id,title,offer_summary,knowledge_text,valid_from,valid_to,is_active,metadata,created_at,updated_at')
    .eq('workspace_id', actor.profile.workspace_id)
    .order('updated_at', { ascending: false });
  if (error) return NextResponse.json({ error: 'Unable to load ad knowledge.' }, { status: 500 });
  return NextResponse.json({ items: data || [] }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!isManagement(actor.profile)) return NextResponse.json({ error: 'Manager access required.' }, { status: 403 });

  const parsed = SaveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid ad knowledge.' }, { status: 400 });
  const input = parsed.data;
  if (!clean(input.ad_id) && !clean(input.source_id) && !clean(input.campaign_id)) {
    return NextResponse.json({ error: 'Add at least one Ad ID, Source ID, or Campaign ID so the conversation can be matched safely.' }, { status: 400 });
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
    metadata: input.metadata,
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
    if (error) return NextResponse.json({ error: error.message || 'Unable to update ad knowledge.' }, { status: 400 });
    if (!data) return NextResponse.json({ error: 'Ad knowledge entry not found.' }, { status: 404 });
    return NextResponse.json({ item: data });
  }

  const { data, error } = await actor.supabase
    .from('ad_knowledge')
    .insert({ ...payload, created_by: actor.profile.id })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message || 'Unable to create ad knowledge.' }, { status: 400 });
  return NextResponse.json({ item: data }, { status: 201 });
}

export async function DELETE(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!isManagement(actor.profile)) return NextResponse.json({ error: 'Manager access required.' }, { status: 403 });

  const parsed = DeleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid ad knowledge ID.' }, { status: 400 });
  const { error } = await actor.supabase
    .from('ad_knowledge')
    .delete()
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', parsed.data.id);
  if (error) return NextResponse.json({ error: 'Unable to delete ad knowledge.' }, { status: 400 });
  return NextResponse.json({ deleted: true });
}
