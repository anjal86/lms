import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor, isManagement } from '@/lib/auth/api-actor';
import { linkChatwootConversationToCrm } from '@/lib/integrations/chatwoot-linker';
import { listChatwootConversations } from '@/lib/integrations/chatwoot-client';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  inboxLinkId: uuidSchema,
  page: z.number().int().min(1).max(200).default(1),
});

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function positiveInteger(value: unknown) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function POST(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!isManagement(actor.profile)) {
    return NextResponse.json({ error: 'Workspace manager access is required for Chatwoot shadow mode.' }, { status: 403 });
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid Chatwoot linker request.' }, { status: 400 });
  }

  const { data: inbox, error: inboxError } = await actor.supabase
    .from('chatwoot_inboxes')
    .select('id,chatwoot_account_link_id,integration_connection_id,chatwoot_inbox_id,status,traffic_mode')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', parsed.data.inboxLinkId)
    .maybeSingle();
  if (inboxError) {
    console.error('Chatwoot linker inbox lookup failed:', inboxError.message);
    return NextResponse.json({ error: 'Unable to load Chatwoot inbox mapping.' }, { status: 500 });
  }
  if (!inbox) return NextResponse.json({ error: 'Chatwoot inbox mapping not found.' }, { status: 404 });
  if (!inbox.integration_connection_id) {
    return NextResponse.json({ error: 'Map this Chatwoot inbox to a CRM connection before linking conversations.' }, { status: 409 });
  }
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
    console.error('Chatwoot linker account lookup failed:', accountError.message);
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

  let rawConversations: Array<Record<string, unknown>>;
  try {
    const result = await listChatwootConversations({
      accountId,
      inboxId: chatwootInboxId,
      status: 'all',
      page: parsed.data.page,
    });
    rawConversations = result.conversations;
  } catch (error) {
    console.error('Chatwoot linker conversation discovery failed:', error);
    return NextResponse.json({ error: 'Unable to load Chatwoot conversations for linking.' }, { status: 502 });
  }

  const summary = {
    scanned: 0,
    linked: 0,
    sourceId: 0,
    phone: 0,
    email: 0,
    unmatched: 0,
    ambiguous: 0,
    conflicts: 0,
    contactUnavailable: 0,
    invalid: 0,
  };
  const results: Array<Record<string, unknown>> = [];

  for (const rawConversation of rawConversations) {
    const conversationId = positiveInteger(rawConversation.id);
    const sender = record(record(rawConversation.meta).sender);
    const contactId = positiveInteger(sender.id);
    if (!conversationId || !contactId) {
      summary.invalid += 1;
      continue;
    }
    summary.scanned += 1;

    try {
      const result = await linkChatwootConversationToCrm({
        workspaceId: actor.profile.workspace_id,
        accountLinkId: inbox.chatwoot_account_link_id,
        accountId,
        chatwootInboxId,
        chatwootConversationId: conversationId,
        chatwootContactId: contactId,
      });
      if (result.linked) {
        summary.linked += 1;
        if (result.matchedBy === 'source_id') summary.sourceId += 1;
        if (result.matchedBy === 'phone') summary.phone += 1;
        if (result.matchedBy === 'email') summary.email += 1;
      } else if (result.reason === 'ambiguous') summary.ambiguous += 1;
      else if (result.reason === 'link_conflict') summary.conflicts += 1;
      else if (result.reason === 'contact_unavailable') summary.contactUnavailable += 1;
      else summary.unmatched += 1;
      results.push({ conversationId, contactId, ...result });
    } catch (error) {
      summary.unmatched += 1;
      results.push({
        conversationId,
        contactId,
        linked: false,
        reason: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return NextResponse.json({
    summary,
    results,
    page: parsed.data.page,
    hasMore: rawConversations.length >= 25,
    source: 'chatwoot_shadow',
    trafficMode: inbox.traffic_mode,
  });
}
