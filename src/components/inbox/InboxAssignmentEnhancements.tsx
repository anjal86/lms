'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import { useApp } from '@/lib/store';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/lib/supabase/client';

type AssignmentNotification = {
  link: string | null;
  created_at: string;
};

const ASSIGNMENT_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const REFRESH_DEBOUNCE_MS = 350;

function sameTargets(a: HTMLElement[], b: HTMLElement[]) {
  return a.length === b.length && a.every((node, index) => node === b[index]);
}

function mineButtons() {
  return Array.from(document.querySelectorAll<HTMLElement>('aside button')).filter((button) =>
    Array.from(button.querySelectorAll('span')).some((span) => span.textContent?.trim() === 'Mine')
  );
}

function conversationIdFromLink(link: string | null) {
  if (!link || typeof window === 'undefined') return null;
  try {
    return new URL(link, window.location.origin).searchParams.get('conversationId');
  } catch {
    return null;
  }
}

function readSeenAssignments(key: string) {
  if (typeof window === 'undefined') return {} as Record<string, number>;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(key) || '{}');
    return parsed && typeof parsed === 'object' ? parsed as Record<string, number> : {};
  } catch {
    return {} as Record<string, number>;
  }
}

export default function InboxAssignmentEnhancements() {
  const params = useSearchParams();
  const { currentUser } = useApp();
  const { config } = useWorkspace();
  const [mineCount, setMineCount] = useState<number | null>(null);
  const [targets, setTargets] = useState<HTMLElement[]>([]);
  const refreshTimer = useRef<number | null>(null);
  const seenKey = `inbox:assignment-seen:${config.workspace.id}:${currentUser.id}`;

  const provider = params.get('provider') || 'all';
  const accountId = params.get('accountId') || 'all';
  const accountProvider = params.get('accountProvider') || 'all';
  const scopeKey = useMemo(() => JSON.stringify([provider, accountProvider, accountId]), [accountId, accountProvider, provider]);

  const syncTargets = useCallback(() => {
    const next = mineButtons();
    setTargets((current) => sameTargets(current, next) ? current : next);
  }, []);

  const refreshMineCount = useCallback(async () => {
    const query = new URLSearchParams({ filter: 'mine', limit: '1', sort: 'newest' });
    if (provider !== 'all') query.set('provider', provider);
    if (accountId !== 'all') query.set('accountId', accountId);
    if (accountProvider !== 'all') query.set('accountProvider', accountProvider);

    try {
      const response = await fetch(`/api/conversations?${query.toString()}`, { cache: 'no-store' });
      if (!response.ok) return;
      const payload = await response.json().catch(() => ({})) as { total?: number };
      setMineCount(Number.isFinite(Number(payload.total)) ? Number(payload.total) : 0);
    } catch {
      // Keep the last known count during a transient network failure.
    }
  }, [accountId, accountProvider, provider]);

  const refreshAssignmentHighlights = useCallback(async () => {
    const items = Array.from(document.querySelectorAll<HTMLElement>('[data-conversation-id]'));
    if (items.length === 0) return;

    for (const item of items) {
      item.dataset.newlyAssigned = 'false';
      delete item.dataset.assignmentAt;
    }

    if (!isSupabaseConfigured() || !currentUser.id) return;

    const supabase = getSupabaseBrowserClient();
    const since = new Date(Date.now() - ASSIGNMENT_LOOKBACK_MS).toISOString();
    const { data, error } = await supabase
      .from('notifications')
      .select('link,created_at')
      .eq('user_id', currentUser.id)
      .eq('type', 'reassignment')
      .like('link', '/inbox?conversationId=%')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) return;

    const latestAssignment = new Map<string, number>();
    for (const row of (data || []) as AssignmentNotification[]) {
      const id = conversationIdFromLink(row.link);
      if (!id) continue;
      const timestamp = new Date(row.created_at).getTime();
      if (!Number.isFinite(timestamp)) continue;
      const current = latestAssignment.get(id) || 0;
      if (timestamp > current) latestAssignment.set(id, timestamp);
    }

    const seen = readSeenAssignments(seenKey);
    for (const item of items) {
      const id = item.dataset.conversationId;
      if (!id || item.dataset.assignedTo !== currentUser.id) continue;
      const assignedAt = latestAssignment.get(id) || 0;
      const seenAt = Number(seen[id] || 0);
      if (assignedAt > seenAt) {
        item.dataset.newlyAssigned = 'true';
        item.dataset.assignmentAt = String(assignedAt);
      }
    }
  }, [currentUser.id, seenKey]);

  const refresh = useCallback(() => {
    syncTargets();
    void refreshMineCount();
    void refreshAssignmentHighlights();
  }, [refreshAssignmentHighlights, refreshMineCount, syncTargets]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = null;
      refresh();
    }, REFRESH_DEBOUNCE_MS);
  }, [refresh]);

  useEffect(() => {
    const initialFrame = window.requestAnimationFrame(refresh);
    const onDataChange = () => scheduleRefresh();
    const onFocus = () => scheduleRefresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') scheduleRefresh();
    }, 30_000);

    window.addEventListener('crm:data-mutated', onDataChange);
    window.addEventListener('inbox:provider-sync', onDataChange);
    window.addEventListener('focus', onFocus);

    const onConversationClick = (event: MouseEvent) => {
      const element = event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-conversation-id]')
        : null;
      if (!element || element.dataset.newlyAssigned !== 'true') return;

      const id = element.dataset.conversationId;
      const assignmentAt = Number(element.dataset.assignmentAt || 0);
      if (!id || !assignmentAt) return;

      const seen = readSeenAssignments(seenKey);
      seen[id] = assignmentAt;
      window.sessionStorage.setItem(seenKey, JSON.stringify(seen));
      element.dataset.newlyAssigned = 'false';
    };

    document.addEventListener('click', onConversationClick, true);

    return () => {
      window.cancelAnimationFrame(initialFrame);
      document.removeEventListener('click', onConversationClick, true);
      window.removeEventListener('crm:data-mutated', onDataChange);
      window.removeEventListener('inbox:provider-sync', onDataChange);
      window.removeEventListener('focus', onFocus);
      window.clearInterval(interval);
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
    };
  }, [refresh, scheduleRefresh, scopeKey, seenKey]);

  return <>
    {targets.map((target, index) => createPortal(
      <span
        key={`mine-count-${index}`}
        data-inbox-mine-count="true"
        className="ml-auto font-mono text-[10px] tabular-nums opacity-70"
        aria-label={mineCount === null ? 'Mine count loading' : `${mineCount} conversations assigned to you`}
      >
        {mineCount ?? '—'}
      </span>,
      target,
    ))}
  </>;
}
