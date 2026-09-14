import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor } from '@/lib/auth/api-actor';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  status: z.enum(['open', 'completed', 'cancelled', 'all']).default('open'),
  owner: z.string().trim().default('me'),
  type: z.string().trim().default('all'),
  leadId: z.union([uuidSchema, z.literal('')]).default(''),
  contactId: z.union([uuidSchema, z.literal('')]).default(''),
  conversationId: z.union([uuidSchema, z.literal('')]).default(''),
  limit: z.coerce.number().int().min(1).max(500).default(250),
});

const CreateSchema = z.object({
  leadId: z.union([uuidSchema, z.null()]).optional(),
  contactId: z.union([uuidSchema, z.null()]).optional(),
  conversationId: z.union([uuidSchema, z.null()]).optional(),
  ownerId: z.union([uuidSchema, z.null()]).optional(),
  type: z.enum(['call', 'message', 'email', 'meeting', 'document', 'review', 'payment', 'proposal', 'custom']).default('custom'),
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(5000).optional().nullable(),
  dueAt: z.string().datetime({ offset: true }).optional().nullable(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export async function GET(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  const parsed = QuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid work-item query.', fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const input = parsed.data;
  let query = actor.supabase
    .from('work_items')
    .select('*')
    .eq('workspace_id', actor.profile.workspace_id)
    .order('due_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(input.limit);

  if (input.status !== 'all') query = query.eq('status', input.status);
  if (input.owner === 'me') query = query.eq('owner_id', actor.user.id);
  else if (input.owner !== 'all') {
    const owner = uuidSchema.safeParse(input.owner);
    if (!owner.success) return NextResponse.json({ error: 'Invalid owner.' }, { status: 400 });
    query = query.eq('owner_id', owner.data);
  }
  if (input.type !== 'all') query = query.eq('type', input.type);
  if (input.leadId) query = query.eq('lead_id', input.leadId);
  if (input.contactId) query = query.eq('contact_id', input.contactId);
  if (input.conversationId) query = query.eq('conversation_id', input.conversationId);

  const { data, error } = await query;
  if (error) {
    console.error('Work item query failed:', error.message);
    return NextResponse.json({ error: 'Unable to load work items.' }, { status: 500 });
  }

  return NextResponse.json({ items: data || [] }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid work item.' }, { status: 400 });
  }

  const input = parsed.data;
  if (!input.leadId && !input.contactId && !input.conversationId) {
    return NextResponse.json({ error: 'A work item must belong to an opportunity, contact, or conversation.' }, { status: 400 });
  }

  const ownerId = input.ownerId ?? actor.user.id;
  const { data, error } = await actor.supabase
    .from('work_items')
    .insert({
      workspace_id: actor.profile.workspace_id,
      lead_id: input.leadId ?? null,
      contact_id: input.contactId ?? null,
      conversation_id: input.conversationId ?? null,
      owner_id: ownerId,
      type: input.type,
      title: input.title,
      description: input.description || null,
      due_at: input.dueAt || null,
      priority: input.priority,
      status: 'open',
      source: 'manual',
      created_by: actor.user.id,
      metadata: input.metadata,
    })
    .select('*')
    .single();

  if (error) {
    console.error('Work item create failed:', error.message);
    return NextResponse.json({ error: 'Unable to create work item.' }, { status: 500 });
  }

  return NextResponse.json({ item: data }, { status: 201 });
}
