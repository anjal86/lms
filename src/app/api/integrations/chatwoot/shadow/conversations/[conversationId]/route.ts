import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor, isManagement } from '@/lib/auth/api-actor';
import { normalizeChatwootConversation, normalizeChatwootMessage } from '@/lib/integrations/chatwoot-adapter';
import {
  createChatwootMessage,
  getChatwootConversation,
  listChatwootMessages,
} from '@/lib/integrations/chatwoot-client';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  inboxLinkId: uuidSchema,
  before: z.coerce.number().int().positive().optional(),
});

const SendSchema = z.object({
  inboxLinkId: uuidSchema,
  body: z.string().trim().min(1).max(4000),
  direction: z.enum(['outbound', 'internal']).default('internal'),
  dryRun: z.boolean().default(false),
});

type ShadowContext = {
  inbox: {
    id: string;
    integration_connection_id: string | null;
    chatwoot_account_link_id: string;
    chatwoot_inbox_id: number | string;
    name: string | null;
    status: string;
    traffic_mode: 'shadow' | 'active';
    metadata: unknown;
  };
  accountId: number;
  chatwootInboxId: number;
  provider: string;
};

function metadataProvider(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'other';
  const provider = (value as Record<string, unknown>).crm_provider;
  return typeof provider === 'string' && provider.trim() ? provider.trim() : 'other';
}

function positiveInteger(value: string) {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

async function resolveShadowContext(
  actor: Exclude<Awaited<ReturnType<typeof getApiActor>>, { error: unknown }>,
  inboxLinkId: string
): Promise<ShadowContext | NextResponse> {
  const { data: inbox, error: inboxError } = await actor.supabase
    .from('chatwoot_inboxes')
    .select('id,integration_connection_id,chatwoot_account_link_id,chatwoot_inbox_id,name,status,traffic_mode,metadata')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', inboxLinkId)
    .maybeSingle();

  if (inboxError) {
    console.error('Chatwoot shadow inbox lookup failed:', inboxError.message);
    return NextResponse.json({ error: 'Unable to load Chatwoot inbox mapping.' }, { status: 500 });
  }
  if (!inbox) return NextResponse.json({ error: 'Chatwoot inbox mapping not found.' }, { status: 404 });
  if (inbox.status !== 'active') {
    return NextResponse.json({ error: 'This Chatwoot inbox is disabled.' }, { status: 409 });
  }

  const { data: account, error: accountError } = await actor.supabase
    .from('chatwoot_accounts')
    .select('id,chatwoot_account_id,status')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', inbox.chatwoot_account_link_id)
    .maybeSingle();

  if (accountError) {
    console.error('Chatwoot shadow account lookup failed:', accountError.message);
    return NextResponse.json({ error: 'Unable to load Chatwoot account mapping.' }, { status: 500 });
  }
  if (!account || account.status !== 'active') {
    return NextResponse.json({ error: 'The mapped Chatwoot account is not active.' }, { status: 409 });
  }

  const accountId = Number(account.chatwoot_account_id);
  const chatwootInboxId = Number(inbox.chatwoot_inbox_id);
  if (!Number.isSafeInteger(accountId) || accountId <= 0 || !Number.isSafeInteger(chatwootInboxId) || chatwootInboxId <= 0) {
    return NextResponse.json({ error: 'Invalid Chatwoot account/inbox mapping.' }, { status: 500 });
  }

  return {
    inbox: inbox as ShadowContext['inbox'],
    accountId,
    chatwootInboxId,
    provider: metadataProvider(inbox.metadata),
  };
}

function conversationBelongsToInbox(conversation: Record<string, unknown>, chatwootInboxId: number) {
  return Number(conversation.inbox_id) === chatwootInboxId;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ conversationId: string }> }
) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!isManagement(actor.profile)) {
    return NextResponse.json({ error: 'Workspace manager access is required for Chatwoot shadow mode.' }, { status: 403 });
  }

  const { conversationId: rawConversationId } = await context.params;
  const conversationId = positiveInteger(rawConversationId);
  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    inboxLinkId: url.searchParams.get('inboxLinkId'),
    before: url.searchParams.get('before') || undefined,
  });
  if (!conversationId || !parsed.success) {
    return NextResponse.json({ error: 'Invalid Chatwoot shadow thread request.' }, { status: 400 });
  }

  const resolved = await resolveShadowContext(actor, parsed.data.inboxLinkId);
  if (resolved instanceof NextResponse) return resolved;

  try {
    const [rawConversation, messageResult] = await Promise.all([
      getChatwootConversation(resolved.accountId, conversationId),
      listChatwootMessages({
        accountId: resolved.accountId,
        conversationId,
        before: parsed.data.before ?? null,
      }),
    ]);

    if (!conversationBelongsToInbox(rawConversation, resolved.chatwootInboxId)) {
      return NextResponse.json({ error: 'Chatwoot conversation does not belong to this mapped inbox.' }, { status: 404 });
    }

    const adapterContext = {
      workspaceId: actor.profile.workspace_id,
      accountId: resolved.accountId,
      inboxId: resolved.chatwootInboxId,
      inboxLinkId: resolved.inbox.id,
      integrationConnectionId: resolved.inbox.integration_connection_id || null,
      provider: resolved.provider,
    };
    const conversation = normalizeChatwootConversation(rawConversation, adapterContext);
    const conversationKey = conversation.id;
    const messages = messageResult.messages.map((message) => normalizeChatwootMessage(message, conversationKey));
    const firstRaw = messageResult.messages[0] as Record<string, unknown> | undefined;
    const firstMessageId = firstRaw ? Number(firstRaw.id) : 0;
    const nextBefore = Number.isSafeInteger(firstMessageId) && firstMessageId > 0 ? firstMessageId : null;

    return NextResponse.json({
      conversation,
      messages,
      messageTotal: null,
      hasOlderMessages: messages.length >= 20,
      nextBefore,
      source: 'chatwoot_shadow',
      trafficMode: resolved.inbox.traffic_mode,
    }, {
      headers: {
        'Cache-Control': 'private, no-store',
        'X-Inbox-Source': 'chatwoot-shadow',
      },
    });
  } catch (error) {
    console.error('Chatwoot shadow thread load failed:', error);
    return NextResponse.json({ error: 'Unable to load Chatwoot conversation.' }, { status: 502 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ conversationId: string }> }
) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!isManagement(actor.profile)) {
    return NextResponse.json({ error: 'Workspace manager access is required for Chatwoot shadow mode.' }, { status: 403 });
  }

  const { conversationId: rawConversationId } = await context.params;
  const conversationId = positiveInteger(rawConversationId);
  const parsed = SendSchema.safeParse(await request.json().catch(() => null));
  if (!conversationId || !parsed.success) {
    return NextResponse.json({ error: 'Invalid Chatwoot shadow send request.' }, { status: 400 });
  }

  const resolved = await resolveShadowContext(actor, parsed.data.inboxLinkId);
  if (resolved instanceof NextResponse) return resolved;

  let rawConversation: Record<string, unknown>;
  try {
    rawConversation = await getChatwootConversation(resolved.accountId, conversationId);
  } catch (error) {
    console.error('Chatwoot shadow send conversation lookup failed:', error);
    return NextResponse.json({ error: 'Unable to verify Chatwoot conversation.' }, { status: 502 });
  }
  if (!conversationBelongsToInbox(rawConversation, resolved.chatwootInboxId)) {
    return NextResponse.json({ error: 'Chatwoot conversation does not belong to this mapped inbox.' }, { status: 404 });
  }

  const externalSendAllowed = resolved.inbox.traffic_mode === 'active';
  if (parsed.data.dryRun) {
    return NextResponse.json({
      valid: true,
      wouldSend: parsed.data.direction === 'internal' || externalSendAllowed,
      direction: parsed.data.direction,
      trafficMode: resolved.inbox.traffic_mode,
      blockedReason: parsed.data.direction === 'outbound' && !externalSendAllowed
        ? 'External replies are blocked until this Chatwoot inbox is explicitly activated.'
        : null,
    });
  }

  if (parsed.data.direction === 'outbound' && !externalSendAllowed) {
    return NextResponse.json({
      error: 'External replies are blocked while this Chatwoot inbox is in shadow mode. Use dryRun or an internal note.',
      trafficMode: resolved.inbox.traffic_mode,
    }, { status: 409 });
  }

  try {
    const rawMessage = await createChatwootMessage({
      accountId: resolved.accountId,
      conversationId,
      content: parsed.data.body,
      private: parsed.data.direction === 'internal',
    });
    const message = normalizeChatwootMessage(rawMessage, `chatwoot-conversation:${conversationId}`);
    return NextResponse.json({
      message,
      source: 'chatwoot_shadow',
      trafficMode: resolved.inbox.traffic_mode,
    }, { status: 201 });
  } catch (error) {
    console.error('Chatwoot shadow send failed:', error);
    return NextResponse.json({ error: 'Unable to send through Chatwoot.' }, { status: 502 });
  }
}
