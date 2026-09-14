import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor } from '@/lib/auth/api-actor';
import { actorHasPermission } from '@/lib/auth/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FilterSchema = z.object({
  filter: z.enum(['all','mine','unassigned','collaborations','unread','needs_reply','sla_overdue','high_priority','has_phone','open','waiting','snoozed','closed']).default('all'),
  provider: z.enum(['all','facebook','instagram','whatsapp','email','website']).default('all'),
  state: z.enum(['','open','waiting','snoozed','closed']).default(''),
  priority: z.enum(['','low','normal','high','urgent']).default(''),
  sort: z.enum(['newest','oldest','waiting','sla']).default('newest'),
  search: z.string().trim().max(120).default(''),
});

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  filters: FilterSchema,
  is_shared: z.boolean().default(false),
  sort_order: z.number().int().min(0).max(10000).default(100),
});

export async function GET(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!(await actorHasPermission(actor, 'inbox.view'))) {
    return NextResponse.json({ error: 'Inbox access required.' }, { status: 403 });
  }

  const { data, error } = await actor.supabase
    .from('conversation_saved_views')
    .select('id,name,filters,is_shared,sort_order,owner_id,created_at,updated_at')
    .eq('workspace_id', actor.profile.workspace_id)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.error('Load saved Inbox views failed:', error.message);
    return NextResponse.json({ error: 'Unable to load saved views.' }, { status: 500 });
  }
  return NextResponse.json({ views: data || [] }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!(await actorHasPermission(actor, 'inbox.saved_views.manage'))) {
    return NextResponse.json({ error: 'Saved-view permission required.' }, { status: 403 });
  }

  let raw: unknown;
  try { raw = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }); }
  const parsed = CreateSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed.', details: parsed.error.flatten() }, { status: 400 });

  const { data, error } = await actor.supabase
    .from('conversation_saved_views')
    .insert({
      workspace_id: actor.profile.workspace_id,
      owner_id: actor.user.id,
      name: parsed.data.name,
      filters: parsed.data.filters,
      is_shared: parsed.data.is_shared && actor.profile.role !== 'agent',
      sort_order: parsed.data.sort_order,
    })
    .select('id,name,filters,is_shared,sort_order,owner_id,created_at,updated_at')
    .single();

  if (error) {
    console.error('Create saved Inbox view failed:', error.message);
    return NextResponse.json({ error: error.code === '23505' ? 'A saved view with this name already exists.' : 'Unable to create saved view.' }, { status: error.code === '23505' ? 409 : 500 });
  }
  return NextResponse.json({ view: data }, { status: 201 });
}
