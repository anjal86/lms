import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: vi.fn() }));

import { persistConnectionScopedMetaMessages } from './meta-message-persistence';

describe('persistConnectionScopedMetaMessages', () => {
  it('re-homes stale messages from the previous workspace and inserts new messages', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const inserts: Array<Array<Record<string, unknown>>> = [];
    const existingRows = [{
      id: 'stale-message',
      workspace_id: 'workspace-old',
      conversation_id: 'conversation-old',
      external_message_id: 'message-1',
    }];

    const admin = {
      from: vi.fn((table: string) => {
        const filters: Array<[string, unknown]> = [];
        const query = {
          select: vi.fn(() => query),
          update: vi.fn((payload: Record<string, unknown>) => {
            updates.push(payload);
            return query;
          }),
          insert: vi.fn((payload: Array<Record<string, unknown>>) => {
            inserts.push(payload);
            return Promise.resolve({ error: null });
          }),
          eq: vi.fn((column: string, value: unknown) => {
            filters.push([column, value]);
            return query;
          }),
          in: vi.fn(() => Promise.resolve({ data: existingRows, error: null })),
          then: (resolve: (value: { error: null }) => unknown) => resolve({ error: null }),
        };
        if (table !== 'lead_messages') throw new Error(`Unexpected table: ${table}`);
        return query;
      }),
    };

    const count = await persistConnectionScopedMetaMessages({
      workspaceId: 'workspace-new',
      conversationId: 'conversation-new',
      leadId: null,
      connectionId: 'connection-new',
      provider: 'facebook',
      messages: [
        { external_message_id: 'message-1', body: 'Existing message' },
        { external_message_id: 'message-2', body: 'New message' },
      ],
    }, admin as never);

    expect(count).toBe(2);
    expect(updates).toEqual([expect.objectContaining({
      workspace_id: 'workspace-new',
      conversation_id: 'conversation-new',
      lead_id: null,
      connection_id: 'connection-new',
      provider: 'facebook',
    })]);
    expect(inserts).toEqual([[
      expect.objectContaining({ external_message_id: 'message-2' }),
    ]]);
  });

  it('deduplicates messages repeated at provider page boundaries', async () => {
    const inserts: Array<Array<Record<string, unknown>>> = [];
    const admin = {
      from: vi.fn(() => {
        const query = {
          select: vi.fn(() => query),
          insert: vi.fn((payload: Array<Record<string, unknown>>) => {
            inserts.push(payload);
            return Promise.resolve({ error: null });
          }),
          eq: vi.fn(() => query),
          in: vi.fn(() => Promise.resolve({ data: [], error: null })),
        };
        return query;
      }),
    };

    const count = await persistConnectionScopedMetaMessages({
      workspaceId: 'workspace-new',
      conversationId: 'conversation-new',
      leadId: null,
      connectionId: 'connection-new',
      provider: 'facebook',
      messages: [
        { external_message_id: 'message-1', body: 'Repeated message' },
        { external_message_id: 'message-1', body: 'Repeated message' },
      ],
    }, admin as never);

    expect(count).toBe(1);
    expect(inserts[0]).toHaveLength(1);
  });

  it('keeps duplicate lookups below database URL limits', async () => {
    const lookup = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const admin = {
      from: vi.fn(() => {
        const query = {
          select: vi.fn(() => query),
          insert: vi.fn(() => Promise.resolve({ error: null })),
          eq: vi.fn(() => query),
          in: lookup,
        };
        return query;
      }),
    };

    await persistConnectionScopedMetaMessages({
      workspaceId: 'workspace-new',
      conversationId: 'conversation-new',
      leadId: null,
      connectionId: 'connection-new',
      provider: 'facebook',
      messages: Array.from({ length: 101 }, (_, index) => ({
        external_message_id: `message-${index}`,
      })),
    }, admin as never);

    expect(lookup).toHaveBeenCalledTimes(6);
  });

  it('recovers when another worker inserts the message after lookup', async () => {
    const admin = {
      from: vi.fn(() => {
        const query = {
          select: vi.fn(() => query),
          insert: vi.fn(() => Promise.resolve({
            error: { code: '23505', message: 'duplicate key value' },
          })),
          eq: vi.fn(() => query),
          in: vi.fn(() => Promise.resolve({ data: [], error: null })),
          maybeSingle: vi.fn(() => Promise.resolve({
            data: {
              id: 'concurrent-message',
              workspace_id: 'workspace-new',
              conversation_id: 'conversation-new',
            },
            error: null,
          })),
        };
        return query;
      }),
    };

    await expect(persistConnectionScopedMetaMessages({
      workspaceId: 'workspace-new',
      conversationId: 'conversation-new',
      leadId: null,
      connectionId: 'connection-new',
      provider: 'facebook',
      messages: [{ external_message_id: 'message-1' }],
    }, admin as never)).resolves.toBe(0);
  });
});
