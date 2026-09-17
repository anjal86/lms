type UnknownRecord = Record<string, unknown>;

type AdapterContext = {
  workspaceId: string;
  accountId: number;
  inboxId: number;
  inboxLinkId: string;
  integrationConnectionId: string | null;
  provider: string;
};

export type NormalizedChatwootMessage = {
  id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound' | 'internal';
  message_type: string;
  body: string | null;
  metadata: Record<string, unknown>;
  delivery_status: string | null;
  failure_message: string | null;
  sent_at: string;
  created_at: string;
  author_profile: { id: string; full_name: string | null; avatar_url: string | null; role: string } | null;
};

export type NormalizedChatwootConversation = {
  id: string;
  workspace_id: string;
  contact_id: null;
  lead_id: null;
  connection_id: string | null;
  provider: string;
  external_thread_id: string;
  external_contact_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  customer_avatar_url: string | null;
  last_message_preview: string | null;
  status: 'open' | 'closed';
  workflow_state: 'open' | 'waiting' | 'snoozed' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  needs_reply: boolean;
  snoozed_until: string | null;
  first_response_due_at: null;
  next_action_at: null;
  first_responded_at: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  closed_at: string | null;
  resolution_code: null;
  closing_note: null;
  unread_count: number;
  assigned_to: null;
  last_message_at: string;
  created_at: string;
  updated_at: string;
  converted_at: null;
  metadata: Record<string, unknown>;
  connection: null;
  contact: {
    id: string;
    display_name: string;
    primary_phone: string | null;
    primary_email: string | null;
    lifecycle_key: string;
    owner_id: null;
    tags: unknown[];
    custom_data: Record<string, unknown>;
    last_seen_at: string | null;
  } | null;
  lead: null;
  assigned_profile: { id: string; full_name: string | null; email: string; role: string; status: string } | null;
  chatwoot: {
    accountId: number;
    inboxId: number;
    inboxLinkId: string;
    conversationId: number;
    uuid: string | null;
  };
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

function isoTime(value: unknown, fallback = new Date(0).toISOString()) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const millis = value < 10_000_000_000 ? value * 1000 : value;
    const date = new Date(millis);
    return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
  }
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (/^\d+(?:\.\d+)?$/.test(value.trim()) && Number.isFinite(numeric)) return isoTime(numeric, fallback);
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
  }
  return fallback;
}

function nullableIsoTime(value: unknown) {
  const epoch = new Date(0).toISOString();
  const result = isoTime(value, epoch);
  return result === epoch ? null : result;
}

function messageDirection(message: UnknownRecord): NormalizedChatwootMessage['direction'] {
  if (message.private === true) return 'internal';
  const type = message.message_type;
  if (type === 0 || type === '0' || type === 'incoming') return 'inbound';
  if (type === 1 || type === '1' || type === 3 || type === '3' || type === 'outgoing' || type === 'template') return 'outbound';
  return 'internal';
}

function normalizedMessageType(message: UnknownRecord) {
  const contentType = text(message.content_type);
  if (contentType && contentType !== 'text') return contentType;
  if (records(message.attachments).length) {
    const attachment = records(message.attachments)[0];
    const fileType = text(attachment.file_type);
    if (fileType === 'image' || fileType === 'video' || fileType === 'audio' || fileType === 'file') return fileType;
    return 'media';
  }
  return message.private === true ? 'internal_note' : 'text';
}

function attachmentMetadata(message: UnknownRecord) {
  const attachments = records(message.attachments);
  if (!attachments.length) return {};
  const first = attachments[0];
  const normalized = attachments.map((attachment) => ({
    id: positiveInteger(attachment.id),
    file_type: text(attachment.file_type),
    name: text(attachment.file_name) ?? text(attachment.name),
    file_url: text(attachment.data_url) ?? text(attachment.file_url),
    preview_url: text(attachment.thumb_url) ?? text(attachment.preview_url),
    mime_type: text(attachment.mime_type),
  }));
  return {
    attachments: { data: normalized },
    attachment_url: text(first.data_url) ?? text(first.file_url),
    preview_url: text(first.thumb_url) ?? text(first.preview_url),
    file_name: text(first.file_name) ?? text(first.name),
    mime_type: text(first.mime_type),
  };
}

export function normalizeChatwootMessage(raw: unknown, conversationKey: string): NormalizedChatwootMessage {
  const message = record(raw);
  const sender = record(message.sender);
  const messageId = positiveInteger(message.id) ?? 0;
  const sentAt = isoTime(message.created_at, new Date().toISOString());
  const direction = messageDirection(message);
  const senderId = positiveInteger(sender.id);
  const senderName = text(sender.name) ?? text(sender.available_name) ?? text(sender.email);
  const avatarUrl = text(sender.thumbnail) ?? text(sender.avatar_url);

  return {
    id: `chatwoot-message:${messageId}`,
    conversation_id: conversationKey,
    direction,
    message_type: normalizedMessageType(message),
    body: text(message.content),
    metadata: {
      chatwoot_message_id: messageId || null,
      chatwoot_source_id: text(message.source_id),
      chatwoot_content_type: text(message.content_type),
      chatwoot_private: message.private === true,
      ...attachmentMetadata(message),
    },
    delivery_status: text(message.status),
    failure_message: null,
    sent_at: sentAt,
    created_at: sentAt,
    author_profile: direction === 'inbound' || !senderId
      ? null
      : {
          id: `chatwoot-agent:${senderId}`,
          full_name: senderName,
          avatar_url: avatarUrl,
          role: 'agent',
        },
  };
}

function workflowState(value: unknown): NormalizedChatwootConversation['workflow_state'] {
  switch (value) {
    case 'resolved': return 'closed';
    case 'pending': return 'waiting';
    case 'snoozed': return 'snoozed';
    default: return 'open';
  }
}

function priority(value: unknown): NormalizedChatwootConversation['priority'] {
  switch (value) {
    case 'low': return 'low';
    case 'high': return 'high';
    case 'urgent': return 'urgent';
    default: return 'normal';
  }
}

export function normalizeChatwootConversation(raw: unknown, context: AdapterContext): NormalizedChatwootConversation {
  const conversation = record(raw);
  const meta = record(conversation.meta);
  const sender = record(meta.sender);
  const assignee = record(meta.assignee);
  const conversationId = positiveInteger(conversation.id) ?? 0;
  const conversationKey = `chatwoot-conversation:${conversationId}`;
  const messageCandidates = records(conversation.messages);
  const lastMessageRaw = messageCandidates[messageCandidates.length - 1] ?? record(conversation.last_non_activity_message);
  const lastMessage = Object.keys(lastMessageRaw).length ? normalizeChatwootMessage(lastMessageRaw, conversationKey) : null;
  const state = workflowState(conversation.status);
  const lastActivity = isoTime(
    conversation.last_activity_at ?? conversation.timestamp ?? conversation.updated_at,
    new Date().toISOString()
  );
  const createdAt = isoTime(conversation.created_at, lastActivity);
  const updatedAt = isoTime(conversation.updated_at, lastActivity);
  const contactId = positiveInteger(sender.id);
  const name = text(sender.name) ?? text(sender.available_name) ?? text(sender.email) ?? text(sender.phone_number) ?? `Chatwoot contact ${contactId ?? ''}`.trim();
  const phone = text(sender.phone_number);
  const email = text(sender.email);
  const avatar = text(sender.thumbnail) ?? text(sender.avatar_url);
  const assigneeId = positiveInteger(assignee.id);
  const assigneeEmail = text(assignee.email) ?? '';
  const assigneeName = text(assignee.name) ?? text(assignee.available_name) ?? (assigneeEmail || null);
  const lastInbound = lastMessage?.direction === 'inbound' ? lastMessage.sent_at : null;
  const lastOutbound = lastMessage?.direction === 'outbound' ? lastMessage.sent_at : null;

  return {
    id: conversationKey,
    workspace_id: context.workspaceId,
    contact_id: null,
    lead_id: null,
    connection_id: context.integrationConnectionId,
    provider: context.provider,
    external_thread_id: String(conversationId),
    external_contact_id: contactId ? String(contactId) : null,
    customer_name: name,
    customer_phone: phone,
    customer_email: email,
    customer_avatar_url: avatar,
    last_message_preview: lastMessage?.body?.slice(0, 500) ?? null,
    status: state === 'closed' ? 'closed' : 'open',
    workflow_state: state,
    priority: priority(conversation.priority),
    needs_reply: lastMessage?.direction === 'inbound',
    snoozed_until: state === 'snoozed' ? nullableIsoTime(conversation.snoozed_until) : null,
    first_response_due_at: null,
    next_action_at: null,
    first_responded_at: nullableIsoTime(conversation.first_reply_created_at),
    last_inbound_at: lastInbound,
    last_outbound_at: lastOutbound,
    closed_at: state === 'closed' ? updatedAt : null,
    resolution_code: null,
    closing_note: null,
    unread_count: Math.max(0, Number(conversation.unread_count) || 0),
    assigned_to: null,
    last_message_at: lastActivity,
    created_at: createdAt,
    updated_at: updatedAt,
    converted_at: null,
    metadata: {
      source: 'chatwoot_shadow',
      chatwoot_account_id: context.accountId,
      chatwoot_inbox_id: context.inboxId,
      chatwoot_inbox_link_id: context.inboxLinkId,
      chatwoot_conversation_id: conversationId,
      chatwoot_uuid: text(conversation.uuid),
      chatwoot_labels: Array.isArray(conversation.labels) ? conversation.labels : [],
      chatwoot_additional_attributes: record(conversation.additional_attributes),
      chatwoot_can_reply: conversation.can_reply !== false,
    },
    connection: null,
    contact: contactId
      ? {
          id: `chatwoot-contact:${contactId}`,
          display_name: name,
          primary_phone: phone,
          primary_email: email,
          lifecycle_key: 'unknown',
          owner_id: null,
          tags: Array.isArray(conversation.labels) ? conversation.labels : [],
          custom_data: record(conversation.additional_attributes),
          last_seen_at: nullableIsoTime(conversation.contact_last_seen_at),
        }
      : null,
    lead: null,
    assigned_profile: assigneeId
      ? {
          id: `chatwoot-agent:${assigneeId}`,
          full_name: assigneeName,
          email: assigneeEmail,
          role: 'agent',
          status: text(assignee.availability_status) ?? 'active',
        }
      : null,
    chatwoot: {
      accountId: context.accountId,
      inboxId: context.inboxId,
      inboxLinkId: context.inboxLinkId,
      conversationId,
      uuid: text(conversation.uuid),
    },
  };
}
