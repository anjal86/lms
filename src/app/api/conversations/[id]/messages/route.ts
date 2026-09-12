import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { decryptIntegrationSecret, decryptSecretPayload } from '@/lib/integrations/secrets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OutboundMessageSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  direction: z.enum(['outbound', 'internal']).default('outbound'),
});

async function getActor(request: Request) {
  const supabase = await createSupabaseServerClient();
  let { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const authHeader = request.headers.get('authorization');
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

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const actor = await getActor(request);
  if ('error' in actor) return actor.error;

  const { id: conversationId } = await context.params;
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = OutboundMessageSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Message body cannot be empty.', details: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: conversation, error: convError } = await admin
    .from('lead_conversations')
    .select('id,lead_id,provider,connection_id,external_thread_id,external_contact_id')
    .eq('id', conversationId)
    .maybeSingle();

  if (convError || !conversation) {
    return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  }

  const now = new Date().toISOString();
  let externalMessageId: string | null = null;
  let deliveryWarning: string | null = null;

  // Try live delivery if outbound to Facebook/Instagram/WhatsApp
  if (parsed.data.direction === 'outbound' && conversation.connection_id && conversation.external_contact_id) {
    try {
      const { data: secretRow } = await admin
        .from('integration_secrets')
        .select('access_token,secret_payload')
        .eq('connection_id', conversation.connection_id)
        .maybeSingle();

      if (secretRow) {
        const payload = decryptSecretPayload(secretRow.secret_payload || {}) as Record<string, unknown>;
        const pageTokens = Array.isArray(payload.page_access_tokens)
          ? payload.page_access_tokens as Array<Record<string, unknown>>
          : [];

        // If thread has accountId prefix: accountId:senderId
        const accountId = conversation.external_thread_id?.split(':')[0];
        const page = pageTokens.find((p) => String(p.id || '') === accountId) || pageTokens[0];
        const token = (typeof page?.access_token === 'string' ? page.access_token : null) || decryptIntegrationSecret(secretRow.access_token);

        if (token && conversation.provider === 'facebook') {
          const version = process.env.META_GRAPH_VERSION?.trim() || 'v26.0';
          const sendUrl = new URL(`https://graph.facebook.com/${version}/me/messages`);
          sendUrl.searchParams.set('access_token', token);

          const sendRes = await fetch(sendUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipient: { id: conversation.external_contact_id },
              message: { text: parsed.data.body },
            }),
          });
          const sendPayload = await sendRes.json().catch(() => ({}));
          if (sendRes.ok && sendPayload.message_id) {
            externalMessageId = String(sendPayload.message_id);
          } else if (sendPayload?.error?.message) {
            deliveryWarning = sendPayload.error.message;
            console.warn('Meta message send warning:', sendPayload.error);
          }
        }
      }
    } catch (deliveryError) {
      console.warn('Live outbound delivery skipped or failed:', deliveryError);
    }
  }

  // Record in lead_messages
  const { data: message, error: insertError } = await admin
    .from('lead_messages')
    .insert({
      conversation_id: conversation.id,
      lead_id: conversation.lead_id || null,
      connection_id: conversation.connection_id || null,
      provider: conversation.provider,
      external_message_id: externalMessageId,
      direction: parsed.data.direction,
      message_type: parsed.data.direction === 'internal' ? 'internal_note' : 'text',
      body: parsed.data.body,
      metadata: deliveryWarning ? { delivery_warning: deliveryWarning } : {},
      created_by: actor.user.id,
      sent_at: now,
    })
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
    .single();

  if (insertError) {
    console.error('Failed to record message:', insertError.message);
    return NextResponse.json({ error: 'Unable to save message.' }, { status: 500 });
  }

  // Update conversation last message preview
  await admin
    .from('lead_conversations')
    .update({
      last_message_at: now,
      last_message_preview: parsed.data.direction === 'internal' ? `[Note] ${parsed.data.body.slice(0, 160)}` : parsed.data.body.slice(0, 180),
      status: 'open',
    })
    .eq('id', conversation.id);

  // If lead exists, also log activity
  if (conversation.lead_id) {
    await admin.from('activity_logs').insert({
      lead_id: conversation.lead_id,
      agent_id: actor.user.id,
      activity_type: parsed.data.direction === 'internal' ? 'note' : (conversation.provider === 'whatsapp' ? 'whatsapp' : 'system'),
      title: parsed.data.direction === 'internal' ? 'Internal Note' : `Replied via ${conversation.provider}`,
      notes: parsed.data.body,
      metadata: { conversation_id: conversation.id, external_message_id: externalMessageId },
    });

    await admin.from('leads').update({ last_contacted_at: now }).eq('id', conversation.lead_id);
  }

  return NextResponse.json({ message, deliveryWarning }, { status: 201 });
}
