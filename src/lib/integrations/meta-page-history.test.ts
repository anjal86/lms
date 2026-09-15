import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  metaFetchJson: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock('@/lib/integrations/meta-http', () => ({ metaFetchJson: mocks.metaFetchJson }));
vi.mock('@/lib/integrations/meta-message-persistence', async () => import('./meta-message-persistence'));
vi.mock('@/lib/integrations/secrets', () => ({
  decryptIntegrationSecret: vi.fn((value: string | null) => value),
  decryptSecretPayload: vi.fn((value: unknown) => value),
}));
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: mocks.createSupabaseAdminClient }));

import { discoverSelectedMetaPageHistory } from './meta-page-history';

type QueryOp = {
  table: string;
  action: 'select' | 'insert' | 'update';
  payload?: unknown;
  filters: Array<[string, unknown]>;
};

function createMockAdmin(connectionConfig?: Record<string, unknown>) {
  const insertedMessages: Array<Record<string, unknown>> = [];
  const insertedConversations: Array<Record<string, unknown>> = [];
  const updatedConnections: Array<Record<string, unknown>> = [];
  const operations: QueryOp[] = [];

  const connection = {
    id: 'connection-new',
    provider: 'facebook',
    display_name: 'Travel Page',
    workspace_id: 'workspace-new',
    status: 'connected',
    config: connectionConfig || {
      pages: [{ id: 'page-1', name: 'Travel Page' }],
    },
  };
  const secret = {
    access_token: 'fallback-token',
    secret_payload: {
      page_access_tokens: [{ id: 'page-1', access_token: 'page-token' }],
    },
  };

  function builder(table: string) {
    const op: QueryOp = { table, action: 'select', filters: [] };
    const api = {
      select() {
        op.action = 'select';
        return api;
      },
      insert(payload: Record<string, unknown> | Array<Record<string, unknown>>) {
        op.action = 'insert';
        op.payload = payload;
        operations.push(op);
        if (table === 'lead_conversations') {
          if (Array.isArray(payload)) throw new Error('Expected one conversation row.');
          insertedConversations.push(payload);
          return {
            select: () => ({
              single: async () => ({ data: { id: 'conversation-new', lead_id: null }, error: null }),
            }),
          };
        }
        if (table === 'lead_messages') insertedMessages.push(...(Array.isArray(payload) ? payload : [payload]));
        return Promise.resolve({ data: null, error: null });
      },
      update(payload: Record<string, unknown>) {
        op.action = 'update';
        op.payload = payload;
        operations.push(op);
        if (table === 'integration_connections') updatedConnections.push(payload);
        return api;
      },
      eq(column: string, value: unknown) {
        op.filters.push([column, value]);
        return api;
      },
      in() {
        operations.push(op);
        return Promise.resolve({ data: [], error: null });
      },
      maybeSingle: async () => {
        operations.push(op);
        if (table === 'integration_connections') return { data: connection, error: null };
        if (table === 'integration_secrets') return { data: secret, error: null };
        return { data: null, error: null };
      },
      single: async () => ({ data: null, error: null }),
    };
    return api;
  }

  return {
    admin: { from: vi.fn(builder) },
    insertedMessages,
    insertedConversations,
    updatedConnections,
    operations,
  };
}

describe('discoverSelectedMetaPageHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.metaFetchJson.mockResolvedValue({
      response: new Response('{}', { status: 200 }),
      data: {
        data: [{
          id: 'meta-conversation-1',
          updated_time: '2026-09-15T10:05:00Z',
          snippet: 'Newest message',
          participants: {
            data: [
              { id: 'page-1', name: 'Travel Page' },
              { id: 'customer-1', name: 'Ada Traveler' },
            ],
          },
          messages: {
            data: [
              { id: 'message-3', created_time: '2026-09-15T10:05:00Z', from: { id: 'customer-1' }, message: 'Newest message' },
              { id: 'message-2', created_time: '2026-09-15T10:00:00Z', from: { id: 'page-1' }, message: 'Agent reply' },
              { id: 'message-1', created_time: '2026-09-15T09:55:00Z', from: { id: 'customer-1' }, message: 'Opening question' },
            ],
          },
        }],
        paging: {},
      },
    });
  });

  it('seeds a recent message window for newly discovered Page conversations', async () => {
    const mock = createMockAdmin();
    mocks.createSupabaseAdminClient.mockReturnValue(mock.admin);

    const result = await discoverSelectedMetaPageHistory({
      provider: 'facebook',
      accountId: 'page-1',
      connectionId: 'connection-new',
      pageId: 'page-1',
      maxPages: 1,
    });

    const requestedUrl = String(mocks.metaFetchJson.mock.calls[0][0]);
    expect(requestedUrl).toContain('messages.limit%2825%29');
    expect(result.conversationsDiscovered).toBe(1);
    expect(result.previewMessagesInserted).toBe(3);
    expect(mock.insertedConversations[0]).toMatchObject({
      workspace_id: 'workspace-new',
      connection_id: 'connection-new',
      provider: 'facebook',
      external_thread_id: 'page-1:customer-1',
    });
    expect(mock.insertedMessages.map((message) => message.external_message_id)).toEqual([
      'message-3',
      'message-2',
      'message-1',
    ]);
    expect(mock.insertedMessages.every((message) => (
      message.workspace_id === 'workspace-new'
      && message.connection_id === 'connection-new'
      && message.conversation_id === 'conversation-new'
    ))).toBe(true);
  });

  it('restarts discovery completed by an older repair generation', async () => {
    const mock = createMockAdmin({
      pages: [{ id: 'page-1', name: 'Travel Page' }],
      inbox_history_discovery: {
        'facebook:page-1': {
          version: 2,
          complete: true,
          after_cursor: 'stale-cursor',
        },
      },
    });
    mocks.createSupabaseAdminClient.mockReturnValue(mock.admin);

    const result = await discoverSelectedMetaPageHistory({
      provider: 'facebook',
      accountId: 'page-1',
      connectionId: 'connection-new',
      pageId: 'page-1',
      maxPages: 1,
    });

    expect(mocks.metaFetchJson).toHaveBeenCalledTimes(1);
    expect(String(mocks.metaFetchJson.mock.calls[0][0])).not.toContain('after=stale-cursor');
    expect(result.conversationsScanned).toBe(1);
    expect(result.previewMessagesInserted).toBe(3);
  });
});
