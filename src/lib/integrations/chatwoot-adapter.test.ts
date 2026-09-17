import { describe, expect, it } from 'vitest';
import { normalizeChatwootConversation, normalizeChatwootMessage } from './chatwoot-adapter';

const context = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  accountId: 7,
  inboxId: 42,
  inboxLinkId: '22222222-2222-4222-8222-222222222222',
  integrationConnectionId: '33333333-3333-4333-8333-333333333333',
  provider: 'whatsapp',
};

describe('normalizeChatwootMessage', () => {
  it('maps incoming Chatwoot media into the existing inbox message contract', () => {
    const message = normalizeChatwootMessage({
      id: 501,
      content: 'Photo from customer',
      message_type: 0,
      content_type: 'text',
      status: 'sent',
      created_at: 1_789_661_200,
      sender: { id: 88, name: 'Maya' },
      attachments: [{
        id: 901,
        file_type: 'image',
        data_url: 'https://chat.example/files/a.jpg',
        thumb_url: 'https://chat.example/files/a-thumb.jpg',
        file_name: 'a.jpg',
        mime_type: 'image/jpeg',
      }],
    }, 'chatwoot-conversation:123');

    expect(message.direction).toBe('inbound');
    expect(message.message_type).toBe('image');
    expect(message.author_profile).toBeNull();
    expect(message.metadata).toMatchObject({
      chatwoot_message_id: 501,
      attachment_url: 'https://chat.example/files/a.jpg',
      preview_url: 'https://chat.example/files/a-thumb.jpg',
      file_name: 'a.jpg',
      mime_type: 'image/jpeg',
    });
  });

  it('maps private outgoing Chatwoot messages to internal notes', () => {
    const message = normalizeChatwootMessage({
      id: 502,
      content: 'Internal handoff note',
      message_type: 1,
      content_type: 'text',
      private: true,
      created_at: 1_789_661_260,
      sender: { id: 9, name: 'Agent A', email: 'agent@example.com' },
    }, 'chatwoot-conversation:123');

    expect(message.direction).toBe('internal');
    expect(message.message_type).toBe('internal_note');
    expect(message.author_profile?.full_name).toBe('Agent A');
  });
});

describe('normalizeChatwootConversation', () => {
  it('normalizes contact, queue state, unread count and latest message without creating CRM ownership', () => {
    const conversation = normalizeChatwootConversation({
      id: 123,
      uuid: 'cw-uuid',
      status: 'pending',
      priority: 'high',
      unread_count: 3,
      created_at: 1_789_660_000,
      updated_at: 1_789_661_300,
      last_activity_at: 1_789_661_300,
      labels: ['vip'],
      additional_attributes: { source: 'campaign' },
      meta: {
        sender: {
          id: 88,
          name: 'Maya Customer',
          phone_number: '+9779800000000',
          email: 'maya@example.com',
          thumbnail: 'https://chat.example/avatar.jpg',
        },
        assignee: {
          id: 9,
          name: 'Agent A',
          email: 'agent@example.com',
          availability_status: 'online',
        },
      },
      messages: [{
        id: 503,
        content: 'Can you help me?',
        message_type: 0,
        content_type: 'text',
        status: 'sent',
        created_at: 1_789_661_300,
        sender: { id: 88, name: 'Maya Customer' },
      }],
    }, context);

    expect(conversation).toMatchObject({
      id: 'chatwoot-conversation:123',
      workspace_id: context.workspaceId,
      connection_id: context.integrationConnectionId,
      provider: 'whatsapp',
      customer_name: 'Maya Customer',
      customer_phone: '+9779800000000',
      customer_email: 'maya@example.com',
      workflow_state: 'waiting',
      priority: 'high',
      unread_count: 3,
      needs_reply: true,
      assigned_to: null,
      contact_id: null,
      lead_id: null,
    });
    expect(conversation.assigned_profile?.id).toBe('chatwoot-agent:9');
    expect(conversation.metadata).toMatchObject({
      source: 'chatwoot_shadow',
      chatwoot_account_id: 7,
      chatwoot_inbox_id: 42,
      chatwoot_conversation_id: 123,
    });
  });
});
