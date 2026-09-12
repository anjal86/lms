import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PatchConversationSchema = z.object({
  status: z.enum(['open', 'closed', 'archived']).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
});

async function getActor(request: Request) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (token && serviceKey && token === serviceKey) {
    return {
      supabase: null as any,
      user: { id: '11111111-1111-1111-1111-111111111111', email: 'admin@travellms.com' } as any,
      profile: { id: '11111111-1111-1111-1111-111111111111', role: 'admin', is_active: true, full_name: 'Admin' } as any,
    };
  }

  const supabase = await createSupabaseServerClient();
  let { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const admin = createSupabaseAdminClient();
      const { data: adminUser } = await admin.auth.getUser(token);
      if (adminUser?.user) user = adminUser.user;
    }
  }

  if (!user) return { error: NextResponse.json({ error: 'Unauthorized.' }, { status: 401 }) } as const;

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('id,role,is_active,full_name')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.is_active) return { error: NextResponse.json({ error: 'Account disabled.' }, { status: 403 }) } as const;
  return { supabase, user, profile } as const;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const actor = await getActor(request);
  if ('error' in actor) return actor.error;

  const { id } = await context.params;
  const admin = createSupabaseAdminClient();

  const { data: conversation, error: convError } = await admin
    .from('lead_conversations')
    .select(`
      id,
      lead_id,
      connection_id,
      provider,
      external_thread_id,
      external_contact_id,
      customer_name,
      customer_phone,
      customer_email,
      customer_avatar_url,
      last_message_preview,
      status,
      unread_count,
      assigned_to,
      last_message_at,
      created_at,
      updated_at,
      metadata,
      lead:leads(id, lead_code, customer_name, destination, stage, priority, budget_range, travel_dates, assigned_to, created_at),
      assigned_profile:profiles!lead_conversations_assigned_to_fkey(id, full_name, email, role)
    `)
    .eq('id', id)
    .maybeSingle();

  if (convError || !conversation) {
    return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  }

  // Load message history
  const { data: messages, error: msgError } = await admin
    .from('lead_messages')
    .select(`
      id,
      conversation_id,
      lead_id,
      provider,
      direction,
      message_type,
      body,
      metadata,
      sent_at,
      created_by,
      created_at,
      author_profile:profiles!lead_messages_created_by_fkey(id, full_name, avatar_url, role)
    `)
    .eq('conversation_id', id)
    .order('sent_at', { ascending: true })
    .limit(300);

  if (msgError) {
    console.error('Failed to load conversation messages:', msgError.message);
    return NextResponse.json({ error: 'Unable to load messages.' }, { status: 500 });
  }

  // Clear unread count on view
  if (conversation.unread_count > 0) {
    await admin.from('lead_conversations').update({ unread_count: 0 }).eq('id', id);
    conversation.unread_count = 0;
  }

  return NextResponse.json({
    conversation,
    messages: messages || [],
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const actor = await getActor(request);
  if ('error' in actor) return actor.error;

  const { id } = await context.params;
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = PatchConversationSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed.', details: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const patch: Record<string, unknown> = {};
  if (parsed.data.status !== undefined) patch.status = parsed.data.status;
  if (parsed.data.assigned_to !== undefined) patch.assigned_to = parsed.data.assigned_to;

  const { data: updated, error } = await admin
    .from('lead_conversations')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Failed to update conversation:', error.message);
    return NextResponse.json({ error: 'Unable to update conversation.' }, { status: 500 });
  }

  return NextResponse.json({ conversation: updated });
}
