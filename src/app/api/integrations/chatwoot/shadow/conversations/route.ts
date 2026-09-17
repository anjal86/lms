import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor } from '@/lib/auth/api-actor';
import { normalizeChatwootConversation } from '@/lib/integrations/chatwoot-adapter';
import { listChatwootConversations } from '@/lib/integrations/chatwoot-client';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  inboxLinkId: uuidSchema,
  status: z.enum(['open', 'resolved', 'pending', 'snoozed', 'all']).default('all'),
  assigneeType: z.enum(['me', 'unassigned', 'assigned', 'all']).default('all'),
  page: z.coerce.number().int().min(1).max(200).default(1),
});

function metadataProvider(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'other';
  const provider = (value as Record<string, unknown>).crm_provider;
  return typeof provider === 'string' && provider.trim() ? provider.trim() : 'other';
}

export async function GET(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    inboxLinkId: url.searchParams.get('inboxLinkId'),
    status: url.searchParams.get('status') || undefined,
    assigneeType: url.searchParams.get('assigneeType') || undefined,
    page: url.searchParams.get('page') || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid Chatwoot shadow conversation query.' }, { status: 400 });
  }

  const { data: inbox, error: inboxError } = await actor.supabase
    .from('chatwoot_inboxes')
    .select('id,workspace_id,chatwoot_account_link_id,integration_connection_id,chatwoot_inbox_id,name,status,traffic_mode,metadata')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', parsed.data.inboxLinkId)
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

  try {
    const result = await listChatwootConversations({
      accountId,
      inboxId: chatwootInboxId,
      status: parsed.data.status,
      assigneeType: parsed.data.assigneeType,
      page: parsed.data.page,
    });
    const context = {
      workspaceId: actor.profile.workspace_id,
      accountId,
      inboxId: chatwootInboxId,
      inboxLinkId: inbox.id,
      integrationConnectionId: inbox.integration_connection_id || null,
      provider: metadataProvider(inbox.metadata),
    };
    const conversations = result.conversations
      .map((conversation) => normalizeChatwootConversation(conversation, context))
      .filter((conversation) => conversation.chatwoot.conversationId > 0);

    return NextResponse.json({
      conversations,
      page: result.page,
      hasMore: conversations.length >= 25,
      chatwootMeta: result.meta,
      source: 'chatwoot_shadow',
      inbox: {
        id: inbox.id,
        chatwootInboxId,
        name: inbox.name,
        trafficMode: inbox.traffic_mode,
        integrationConnectionId: inbox.integration_connection_id || null,
        provider: context.provider,
      },
    }, {
      headers: {
        'Cache-Control': 'private, no-store',
        'X-Inbox-Source': 'chatwoot-shadow',
      },
    });
  } catch (error) {
    console.error('Chatwoot shadow conversation list failed:', error);
    return NextResponse.json({ error: 'Unable to load Chatwoot conversations.' }, { status: 502 });
  }
}
