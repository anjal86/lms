import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor, isManagement } from '@/lib/auth/api-actor';
import { fetchWhatsappHistory } from '@/lib/integrations/whatsapp-baileys';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RequestSchema = z.object({
  count: z.coerce.number().int().min(1).max(100).default(50),
  mode: z.enum(['older', 'repair']).default('older'),
});

const ACTIVE_STATUSES = ['queued', 'requested', 'receiving'];
const HISTORY_TIMEOUT_MS = 2 * 60 * 1000;

type ConnectionRow = {
  id: string;
  workspace_id: string | null;
  connected_by: string | null;
  visibility_scope: 'personal' | 'workspace';
  provider: string;
  config: unknown;
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function canUseConnection(connection: ConnectionRow, userId: string, management: boolean) {
  return management || connection.visibility_scope === 'workspace' || connection.connected_by === userId;
}

async function getConversationAndConnection(
  request: Request,
  conversationId: string
) {
  const actor = await getApiActor(request);
  if ('error' in actor) return { error: actor.error };

  const admin = createSupabaseAdminClient();
  const { data: conversation, error: conversationError } = await admin
    .from('lead_conversations')
    .select('id,workspace_id,provider,connection_id,external_thread_id,metadata')
    .eq('id', conversationId)
    .eq('workspace_id', actor.profile.workspace_id)
    .maybeSingle();

  if (conversationError || !conversation) {
    return { error: NextResponse.json({ error: 'Conversation not found.' }, { status: 404 }) } as const;
  }
  if (conversation.provider !== 'whatsapp' || !conversation.connection_id) {
    return { error: NextResponse.json({ error: 'This conversation is not backed by a WhatsApp connection.' }, { status: 400 }) } as const;
  }

  const { data: connection, error: connectionError } = await admin
    .from('integration_connections')
    .select('id,workspace_id,connected_by,visibility_scope,provider,config')
    .eq('id', conversation.connection_id)
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('provider', 'whatsapp')
    .maybeSingle();

  if (connectionError || !connection) {
    return { error: NextResponse.json({ error: 'WhatsApp connection not found.' }, { status: 404 }) } as const;
  }

  const typedConnection = connection as ConnectionRow;
  if (!canUseConnection(typedConnection, actor.user.id, isManagement(actor.profile))) {
    return { error: NextResponse.json({ error: 'You do not have access to this WhatsApp account.' }, { status: 403 }) } as const;
  }

  return { actor, admin, conversation, connection: typedConnection } as const;
}

async function latestJob(admin: ReturnType<typeof createSupabaseAdminClient>, conversationId: string) {
  const { data } = await admin
    .from('whatsapp_history_sync_jobs')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data || !ACTIVE_STATUSES.includes(data.status)) return data;

  const requestedAt = new Date(data.requested_at).getTime();
  if (Number.isFinite(requestedAt) && Date.now() - requestedAt > HISTORY_TIMEOUT_MS) {
    const { data: timedOut } = await admin
      .from('whatsapp_history_sync_jobs')
      .update({
        status: data.messages_received > 0 ? 'partial' : 'timed_out',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        error: data.messages_received > 0
          ? 'WhatsApp returned only part of the requested history before timing out.'
          : 'WhatsApp did not return history for this request before the timeout.',
      })
      .eq('id', data.id)
      .select('*')
      .single();
    return timedOut || data;
  }

  return data;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const resolved = await getConversationAndConnection(request, id);
  if ('error' in resolved) return resolved.error;

  const job = await latestJob(resolved.admin, id);
  return NextResponse.json({ job });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const resolved = await getConversationAndConnection(request, id);
  if ('error' in resolved) return resolved.error;

  const raw = await request.json().catch(() => ({}));
  const parsed = RequestSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid history request.' }, { status: 400 });

  const existing = await latestJob(resolved.admin, id);
  if (existing && ACTIVE_STATUSES.includes(existing.status)) {
    return NextResponse.json({ accepted: true, already_running: true, mode: parsed.data.mode, job: existing }, { status: 202 });
  }

  const { data: activeConnectionJob } = await resolved.admin
    .from('whatsapp_history_sync_jobs')
    .select('*')
    .eq('connection_id', resolved.connection.id)
    .in('status', ACTIVE_STATUSES)
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeConnectionJob) {
    return NextResponse.json({
      error: 'Another chat on this WhatsApp account is already syncing history.',
      job: activeConnectionJob,
    }, { status: 409 });
  }

  const repairMode = parsed.data.mode === 'repair';
  const { data: anchorMessage, error: messageError } = await resolved.admin
    .from('lead_messages')
    .select('id,external_message_id,direction,sent_at,metadata')
    .eq('workspace_id', resolved.actor.profile.workspace_id)
    .eq('conversation_id', id)
    .not('external_message_id', 'is', null)
    .order('sent_at', { ascending: !repairMode })
    .limit(1)
    .maybeSingle();

  if (messageError) {
    return NextResponse.json({ error: 'Unable to determine a local WhatsApp message anchor.' }, { status: 500 });
  }
  if (!anchorMessage?.external_message_id) {
    return NextResponse.json({
      error: 'No WhatsApp message anchor is available yet. Reconnect the account once so WhatsApp can deliver its initial history sync.',
    }, { status: 409 });
  }

  const conversationMetadata = objectValue(resolved.conversation.metadata);
  const messageMetadata = objectValue(anchorMessage.metadata);
  const metadataJid = typeof messageMetadata.jid === 'string' ? messageMetadata.jid : null;
  const conversationJid = typeof conversationMetadata.whatsapp_jid === 'string'
    ? conversationMetadata.whatsapp_jid
    : null;
  const externalThreadJid = typeof resolved.conversation.external_thread_id === 'string'
    && resolved.conversation.external_thread_id.includes('@')
    ? resolved.conversation.external_thread_id
    : null;
  const remoteJid = metadataJid || conversationJid || externalThreadJid;

  if (!remoteJid) {
    return NextResponse.json({ error: 'The WhatsApp chat JID is missing, so history cannot be requested safely.' }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { data: job, error: jobError } = await resolved.admin
    .from('whatsapp_history_sync_jobs')
    .insert({
      workspace_id: resolved.actor.profile.workspace_id,
      connection_id: resolved.connection.id,
      conversation_id: id,
      requested_by: resolved.actor.user.id,
      status: 'queued',
      requested_count: parsed.data.count,
      requested_at: now,
      updated_at: now,
    })
    .select('*')
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: 'Unable to create the WhatsApp history sync job.' }, { status: 500 });
  }

  try {
    const result = await fetchWhatsappHistory(resolved.connection.id, {
      count: parsed.data.count,
      oldestMsgId: anchorMessage.external_message_id,
      oldestMsgRemoteJid: remoteJid,
      oldestMsgFromMe: anchorMessage.direction === 'outbound',
      oldestMsgTimestamp: new Date(anchorMessage.sent_at).getTime(),
    });

    const { data: requestedJob } = await resolved.admin
      .from('whatsapp_history_sync_jobs')
      .update({
        status: 'requested',
        request_id: result.request_id || result.result || null,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id)
      .select('*')
      .single();

    return NextResponse.json({ accepted: true, mode: parsed.data.mode, job: requestedJob || job }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'WhatsApp history request failed.';
    const { data: failedJob } = await resolved.admin
      .from('whatsapp_history_sync_jobs')
      .update({
        status: 'failed',
        error: message,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id)
      .select('*')
      .single();

    return NextResponse.json({ error: message, mode: parsed.data.mode, job: failedJob || job }, { status: 503 });
  }
}
