import { NextResponse } from 'next/server';
import { z } from 'zod';
import { uuidSchema } from '@/lib/validation';
import { getApiActor } from '@/lib/auth/api-actor';
import { actorHasPermission } from '@/lib/auth/permissions';
import { invalidateRedisCache } from '@/lib/redis/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PatchSchema = z.object({
  display_name: z.string().trim().max(160).nullable().optional(),
  primary_phone: z.string().trim().max(80).nullable().optional(),
  primary_email: z.string().trim().email().max(200).nullable().optional(),
  lifecycle_key: z.string().trim().min(1).max(80).optional(),
  owner_id: uuidSchema.nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(100).optional(),
  custom_data: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!(await actorHasPermission(actor, 'contacts.view'))) {
    return NextResponse.json({ error: 'Contact access required.' }, { status: 403 });
  }
  const { id } = await context.params;

  const { data: contact, error } = await actor.supabase
    .from('contacts')
    .select('id,display_name,primary_phone,primary_email,avatar_url,lifecycle_key,owner_id,tags,custom_data,last_seen_at,created_at,updated_at')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Unable to load contact.' }, { status: 500 });
  if (!contact) return NextResponse.json({ error: 'Contact not found.' }, { status: 404 });

  const [identitiesResult, conversationsResult, ownerResult] = await Promise.all([
    actor.supabase.from('contact_identities').select('id,provider,identity_type,identity_value,is_primary,created_at').eq('workspace_id', actor.profile.workspace_id).eq('contact_id', id).order('is_primary', { ascending: false }),
    actor.supabase.from('lead_conversations').select('id,provider,workflow_state,priority,assigned_to,last_message_at,closed_at,resolution_code').eq('workspace_id', actor.profile.workspace_id).eq('contact_id', id).order('last_message_at', { ascending: false }).limit(25),
    contact.owner_id ? actor.supabase.from('profiles').select('id,full_name,email').eq('workspace_id', actor.profile.workspace_id).eq('id', contact.owner_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);

  return NextResponse.json({
    contact: { ...contact, owner: ownerResult.data || null },
    identities: identitiesResult.data || [],
    conversations: conversationsResult.data || [],
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!(await actorHasPermission(actor, 'contacts.edit'))) {
    return NextResponse.json({ error: 'Contact edit permission required.' }, { status: 403 });
  }
  const { id } = await context.params;

  let raw: unknown;
  try { raw = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }); }
  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'Validation failed.', details: parsed.success ? undefined : parsed.error.flatten() }, { status: 400 });
  }

  const { data: current, error: currentError } = await actor.supabase
    .from('contacts')
    .select('id,display_name,primary_phone,primary_email,lifecycle_key,owner_id,tags,custom_data')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', id)
    .maybeSingle();
  if (currentError) return NextResponse.json({ error: 'Unable to load contact.' }, { status: 500 });
  if (!current) return NextResponse.json({ error: 'Contact not found.' }, { status: 404 });

  const next = { ...current, ...parsed.data };
  const { data, error } = await actor.supabase.rpc('update_contact_profile', {
    p_contact_id: id,
    p_display_name: next.display_name,
    p_primary_phone: next.primary_phone,
    p_primary_email: next.primary_email,
    p_lifecycle_key: next.lifecycle_key,
    p_owner_id: next.owner_id,
    p_tags: Array.isArray(next.tags) ? next.tags : [],
    p_custom_data: next.custom_data && typeof next.custom_data === 'object' && !Array.isArray(next.custom_data) ? next.custom_data : {},
  });

  if (error) {
    const conflict = error.code === '23505';
    return NextResponse.json({ error: conflict ? error.message || 'Phone or email belongs to another contact.' : 'Unable to update contact.' }, { status: conflict ? 409 : 500 });
  }
  await invalidateRedisCache({ workspaceId: actor.profile.workspace_id, namespace: 'contacts:list' });
  return NextResponse.json({ contact: data });
}
