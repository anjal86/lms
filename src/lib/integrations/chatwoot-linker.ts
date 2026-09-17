import 'server-only';
import { chatwootAccountPath, chatwootRequest } from '@/lib/integrations/chatwoot-client';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

type UnknownRecord = Record<string, unknown>;

type MatchResult = {
  linked: boolean;
  leadConversationId: string | null;
  matchedBy: 'source_id' | 'phone' | 'email' | 'created' | null;
  reason: 'linked' | 'created' | 'unmapped_inbox' | 'contact_unavailable' | 'no_match' | 'ambiguous' | 'link_conflict';
};

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function records(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is UnknownRecord => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : [];
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function positiveInteger(value: unknown) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

async function getChatwootContact(accountId: number, contactId: number) {
  const response = await chatwootRequest<{ payload?: UnknownRecord }>(
    `${chatwootAccountPath(accountId, `contacts/${contactId}`)}?include_contact_inboxes=true`
  );
  return record(response?.payload);
}

function contactSourceId(contact: UnknownRecord, inboxId: number) {
  for (const contactInbox of records(contact.contact_inboxes)) {
    const inbox = record(contactInbox.inbox);
    if (positiveInteger(inbox.id) !== inboxId) continue;
    const sourceId = text(contactInbox.source_id);
    if (sourceId) return sourceId;
  }
  return null;
}

async function uniqueConversationMatch(input: {
  workspaceId: string;
  connectionId: string;
  column: 'external_contact_id' | 'customer_phone' | 'customer_email';
  value: string;
  caseInsensitive?: boolean;
}) {
  const admin = createSupabaseAdminClient();
  const base = admin
    .from('lead_conversations')
    .select('id')
    .eq('workspace_id', input.workspaceId)
    .eq('connection_id', input.connectionId)
    .limit(2);

  const query = input.caseInsensitive
    ? base.ilike(input.column, input.value)
    : base.eq(input.column, input.value);

  const { data, error } = await query;
  if (error) throw error;
  if (!data || data.length === 0) return { id: null, ambiguous: false };
  if (data.length > 1) return { id: null, ambiguous: true };
  return { id: String(data[0].id), ambiguous: false };
}

async function saveLink(input: {
  workspaceId: string;
  accountLinkId: string;
  chatwootConversationId: number;
  chatwootInboxId: number;
  chatwootContactId: number;
  leadConversationId: string;
}) {
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { error } = await admin
    .from('chatwoot_conversation_links')
    .upsert({
      workspace_id: input.workspaceId,
      chatwoot_account_link_id: input.accountLinkId,
      lead_conversation_id: input.leadConversationId,
      chatwoot_conversation_id: input.chatwootConversationId,
      chatwoot_inbox_id: input.chatwootInboxId,
      chatwoot_contact_id: input.chatwootContactId,
      last_synced_at: now,
      updated_at: now,
    }, { onConflict: 'chatwoot_account_link_id,chatwoot_conversation_id' });

  if (error?.code === '23505') return false;
  if (error) throw error;
  return true;
}

async function createActiveConversationShell(input: {
  workspaceId: string;
  connectionId: string;
  provider: string;
  accountId: number;
  accountLinkId: string;
  chatwootInboxId: number;
  chatwootConversationId: number;
  chatwootContactId: number;
  contact: UnknownRecord;
  sourceId: string | null;
}) {
  const admin = createSupabaseAdminClient();
  const externalThreadId = `chatwoot:${input.accountId}:${input.chatwootInboxId}:${input.chatwootConversationId}`;
  const now = new Date().toISOString();
  const customerName = text(input.contact.name)
    ?? text(input.contact.available_name)
    ?? text(input.contact.email)
    ?? text(input.contact.phone_number)
    ?? `Chatwoot contact ${input.chatwootContactId}`;

  const row = {
    workspace_id: input.workspaceId,
    lead_id: null,
    connection_id: input.connectionId,
    provider: input.provider,
    external_thread_id: externalThreadId,
    external_contact_id: input.sourceId,
    customer_name: customerName,
    customer_phone: text(input.contact.phone_number),
    customer_email: text(input.contact.email),
    customer_avatar_url: text(input.contact.thumbnail) ?? text(input.contact.avatar_url),
    last_message_preview: null,
    status: 'open',
    workflow_state: 'open',
    priority: 'normal',
    unread_count: 0,
    needs_reply: false,
    last_message_at: now,
    metadata: {
      source: 'chatwoot',
      chatwoot_account_id: input.accountId,
      chatwoot_inbox_id: input.chatwootInboxId,
      chatwoot_conversation_id: input.chatwootConversationId,
      chatwoot_contact_id: input.chatwootContactId,
      chatwoot_managed: true,
    },
  };

  const { data: created, error: insertError } = await admin
    .from('lead_conversations')
    .insert(row)
    .select('id')
    .single();

  let leadConversationId = created?.id ? String(created.id) : null;
  if (insertError?.code === '23505') {
    const { data: existing, error: existingError } = await admin
      .from('lead_conversations')
      .select('id')
      .eq('workspace_id', input.workspaceId)
      .eq('connection_id', input.connectionId)
      .eq('provider', input.provider)
      .eq('external_thread_id', externalThreadId)
      .maybeSingle();
    if (existingError) throw existingError;
    leadConversationId = existing?.id ? String(existing.id) : null;
  } else if (insertError) {
    throw insertError;
  }

  if (!leadConversationId) return null;
  const linked = await saveLink({
    workspaceId: input.workspaceId,
    accountLinkId: input.accountLinkId,
    chatwootConversationId: input.chatwootConversationId,
    chatwootInboxId: input.chatwootInboxId,
    chatwootContactId: input.chatwootContactId,
    leadConversationId,
  });
  return linked ? leadConversationId : null;
}

export async function linkChatwootConversationToCrm(input: {
  workspaceId: string;
  accountLinkId: string;
  accountId: number;
  chatwootInboxId: number;
  chatwootConversationId: number;
  chatwootContactId: number;
}): Promise<MatchResult> {
  const admin = createSupabaseAdminClient();
  const { data: inbox, error: inboxError } = await admin
    .from('chatwoot_inboxes')
    .select('id,integration_connection_id,status,traffic_mode')
    .eq('workspace_id', input.workspaceId)
    .eq('chatwoot_account_link_id', input.accountLinkId)
    .eq('chatwoot_inbox_id', input.chatwootInboxId)
    .maybeSingle();
  if (inboxError) throw inboxError;
  if (!inbox?.integration_connection_id || inbox.status !== 'active') {
    return { linked: false, leadConversationId: null, matchedBy: null, reason: 'unmapped_inbox' };
  }

  const { data: connection, error: connectionError } = await admin
    .from('integration_connections')
    .select('id,provider,status')
    .eq('workspace_id', input.workspaceId)
    .eq('id', inbox.integration_connection_id)
    .maybeSingle();
  if (connectionError) throw connectionError;
  if (!connection || !['connected', 'paused'].includes(connection.status)) {
    return { linked: false, leadConversationId: null, matchedBy: null, reason: 'unmapped_inbox' };
  }

  let contact: UnknownRecord;
  try {
    contact = await getChatwootContact(input.accountId, input.chatwootContactId);
  } catch (error) {
    console.warn(`Unable to load Chatwoot contact ${input.chatwootContactId} for CRM linking:`, error);
    if (inbox.traffic_mode === 'active') throw error;
    return { linked: false, leadConversationId: null, matchedBy: null, reason: 'contact_unavailable' };
  }
  if (!Object.keys(contact).length) {
    if (inbox.traffic_mode === 'active') throw new Error(`Chatwoot contact ${input.chatwootContactId} returned no data.`);
    return { linked: false, leadConversationId: null, matchedBy: null, reason: 'contact_unavailable' };
  }

  const sourceId = contactSourceId(contact, input.chatwootInboxId);
  const candidates: Array<{
    matchedBy: 'source_id' | 'phone' | 'email';
    column: 'external_contact_id' | 'customer_phone' | 'customer_email';
    value: string | null;
    caseInsensitive?: boolean;
  }> = [
    {
      matchedBy: 'source_id',
      column: 'external_contact_id',
      value: sourceId,
    },
    {
      matchedBy: 'phone',
      column: 'customer_phone',
      value: text(contact.phone_number),
    },
    {
      matchedBy: 'email',
      column: 'customer_email',
      value: text(contact.email),
      caseInsensitive: true,
    },
  ];

  for (const candidate of candidates) {
    if (!candidate.value) continue;
    const match = await uniqueConversationMatch({
      workspaceId: input.workspaceId,
      connectionId: inbox.integration_connection_id,
      column: candidate.column,
      value: candidate.value,
      caseInsensitive: candidate.caseInsensitive,
    });
    if (match.ambiguous) {
      return { linked: false, leadConversationId: null, matchedBy: candidate.matchedBy, reason: 'ambiguous' };
    }
    if (!match.id) continue;

    const linked = await saveLink({
      workspaceId: input.workspaceId,
      accountLinkId: input.accountLinkId,
      chatwootConversationId: input.chatwootConversationId,
      chatwootInboxId: input.chatwootInboxId,
      chatwootContactId: input.chatwootContactId,
      leadConversationId: match.id,
    });
    return linked
      ? { linked: true, leadConversationId: match.id, matchedBy: candidate.matchedBy, reason: 'linked' }
      : { linked: false, leadConversationId: null, matchedBy: candidate.matchedBy, reason: 'link_conflict' };
  }

  if (inbox.traffic_mode === 'active') {
    const createdId = await createActiveConversationShell({
      workspaceId: input.workspaceId,
      connectionId: inbox.integration_connection_id,
      provider: connection.provider,
      accountId: input.accountId,
      accountLinkId: input.accountLinkId,
      chatwootInboxId: input.chatwootInboxId,
      chatwootConversationId: input.chatwootConversationId,
      chatwootContactId: input.chatwootContactId,
      contact,
      sourceId,
    });
    if (createdId) {
      return { linked: true, leadConversationId: createdId, matchedBy: 'created', reason: 'created' };
    }
    return { linked: false, leadConversationId: null, matchedBy: 'created', reason: 'link_conflict' };
  }

  return { linked: false, leadConversationId: null, matchedBy: null, reason: 'no_match' };
}
