// @vitest-environment jsdom

import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InboxPage from './page';

vi.mock('@/components/inbox/StableInbox', () => ({
  default: () => <div>Inbox</div>,
}));

describe('Inbox automatic provider sync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('syncs shortly after opening and repeats while visible', async () => {
    render(<InboxPage />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(fetch).toHaveBeenCalledWith('/api/conversations/sync?mode=live', expect.objectContaining({ method: 'POST', cache: 'no-store' }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not poll providers while the Inbox tab is hidden', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    render(<InboxPage />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(fetch).not.toHaveBeenCalled();
  });
});
