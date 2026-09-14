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

  let leadId = input.leadId ?? null;
  let contactId = input.contactId ?? null;
  const conversationId = input.conversationId ?? null;
  const ownerId = input.ownerId ?? actor.user.id;
  const workspaceId = actor.profile.workspace_id;

  if (leadId) {
    const { data: lead, error } = await actor.supabase
      .from('leads')
      .select('id,contact_id')
      .eq('id', leadId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: 'Unable to validate opportunity.' }, { status: 500 });
    if (!lead) return NextResponse.json({ error: 'Opportunity is not available in this workspace.' }, { status: 400 });
    if (contactId && lead.contact_id && contactId !== lead.contact_id) {
      return NextResponse.json({ error: 'Contact does not match the opportunity.' }, { status: 400 });
    }
    contactId = contactId ?? lead.contact_id ?? null;
  }

  if (contactId) {
    const { data: contact, error } = await actor.supabase
      .from('contacts')
      .select('id')
      .eq('id', contactId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: 'Unable to validate contact.' }, { status: 500 });
    if (!contact) return NextResponse.json({ error: 'Contact is not available in this workspace.' }, { status: 400 });
  }

  if (conversationId) {
    const { data: conversation, error } = await actor.supabase
      .from('lead_conversations')
      .select('id,lead_id,contact_id')
      .eq('id', conversationId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: 'Unable to validate conversation.' }, { status: 500 });
    if (!conversation) return NextResponse.json({ error: 'Conversation is not available in this workspace.' }, { status: 400 });
    if (leadId && conversation.lead_id && leadId !== conversation.lead_id) {
      return NextResponse.json({ error: 'Opportunity does not match the conversation.' }, { status: 400 });
    }
    if (contactId && conversation.contact_id && contactId !== conversation.contact_id) {
      return NextResponse.json({ error: 'Contact does not match the conversation.' }, { status: 400 });
    }
    leadId = leadId ?? conversation.lead_id ?? null;
    contactId = contactId ?? conversation.contact_id ?? null;
  }

  if (ownerId) {
    const { data: owner, error } = await actor.supabase
      .from('profiles')
      .select('id')
      .eq('id', ownerId)
      .eq('workspace_id', workspaceId)
      .eq('is_active', true)
      .maybeSingle();
    if (error) return NextResponse.json({ error: 'Unable to validate owner.' }, { status: 500 });
    if (!owner) return NextResponse.json({ error: 'Owner is not an active member of this workspace.' }, { status: 400 });
  }

  const { data, error } = await actor.supabase
    .from('work_items')
    .insert({
      workspace_id: workspaceId,
      lead_id: leadId,
      contact_id: contactId,
      conversation_id: conversationId,
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
