import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', async () => import('../supabase/admin'));
vi.mock('@/lib/integrations/secrets', async () => import('./secrets'));
vi.mock('@/lib/integrations/meta-http', async () => import('./meta-http'));
vi.mock('@/lib/integrations/meta-message-persistence', async () => import('./meta-message-persistence'));

describe('live Meta history repair', () => {
  it('repairs the selected conversation', async () => {
    const { backfillMetaConversationMessages } = await import('./meta-history');
    const result = await backfillMetaConversationMessages(
      '9673db03-bbc0-4f26-832f-67a03a4710d5',
      { maxPages: 2 }
    );
    console.log(JSON.stringify(result));
    expect(result.errors).toEqual([]);
    expect(result.messagesInserted).toBeGreaterThan(0);
  });
});
