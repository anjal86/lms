'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import { useApp } from '@/lib/store';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';
import { getSupabaseBrowserClient, isSupabaseConfigured, syncRealtimeAuth } from '@/lib/supabase/client';

type AssignmentNotification = {
  link: string | null;
  created_at: string;
};

type QueueMetrics = {
  totalOpen: number;
  mine: number;
  unassigned: number;
  collaborations: number;
  waiting: number;
  snoozed: number;
  unread: number;
  needsReply: number;
  slaOverdue: number;
  highPriority: number;
  hasPhone: number;
  resolved: number;
  unconvertedOpen: number;
};

type MetricKey = keyof QueueMetrics;
type CountTarget = {
  id: string;
  element: HTMLElement;
  metric: MetricKey;
};

type MetricsSnapshot = {
  metrics: QueueMetrics;
  fetchedAt: number;
};

const ASSIGNMENT_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const METRICS_REFRESH_DEBOUNCE_MS = 220;
const HIGHLIGHT_REFRESH_DEBOUNCE_MS = 650;
const RUNTIME_METRICS_CACHE = new Map<string, MetricsSnapshot>();

const QUEUE_TARGETS: Array<{ label: string; metric: MetricKey }> = [
  { label: 'All open', metric: 'totalOpen' },
  { label: 'Mine', metric: 'mine' },
  { label: 'Unassigned', metric: 'unassigned' },
  { label: 'Collaborations', metric: 'collaborations' },
  { label: 'Needs reply', metric: 'needsReply' },
  { label: 'SLA overdue', metric: 'slaOverdue' },
  { label: 'Unread', metric: 'unread' },
  { label: 'High priority', metric: 'highPriority' },
  { label: 'Waiting', metric: 'waiting' },
  { label: 'Snoozed', metric: 'snoozed' },
  { label: 'Resolved', metric: 'resolved' },
];

function sameTargets(a: CountTarget[], b: CountTarget[]) {
  return a.length === b.length && a.every((target, index) => (
    target.id === b[index]?.id
    && target.element === b[index]?.element
    && target.metric === b[index]?.metric
  ));
}

function queueSidebar() {
  return Array.from(document.querySelectorAll<HTMLElement>('aside')).find((aside) => {
    const text = aside.textContent || '';
    return text.includes('All open') && text.includes('Needs reply') && text.includes('Exceptions');
  }) || null;
}

function buttonWithLabel(sidebar: HTMLElement, label: string) {
  return Array.from(sidebar.querySelectorAll<HTMLElement>('button')).find((button) =>
    Array.from(button.querySelectorAll('span')).some((span) => span.textContent?.trim() === label)
  ) || null;
}

function collectCountTargets() {
  const sidebar = queueSidebar();
  if (!sidebar) return [] as CountTarget[];

  const targets: CountTarget[] = [];
  const header = sidebar.firstElementChild instanceof HTMLElement ? sidebar.firstElementChild : null;
  if (header && header.textContent?.includes('Inbox')) {
    targets.push({ id: 'header-sla', element: header, metric: 'slaOverdue' });
  }

  for (const item of QUEUE_TARGETS) {
    const button = buttonWithLabel(sidebar, item.label);
    if (button) targets.push({ id: `queue-${item.metric}`, element: button, metric: item.metric });
  }

  return targets;
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

function normalizeMetrics(value: unknown): QueueMetrics | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys: MetricKey[] = [
    'totalOpen',
    'mine',
    'unassigned',
    'collaborations',
    'waiting',
    'snoozed',
    'unread',
    'needsReply',
    'slaOverdue',
    'highPriority',
    'hasPhone',
    'resolved',
    'unconvertedOpen',
  ];
  const result = {} as QueueMetrics;

  for (const key of keys) {
    const number = Number(record[key]);
    if (!Number.isFinite(number) || number < 0) return null;
    result[key] = Math.trunc(number);
  }

  return result;
}

export default function InboxAssignmentEnhancements() {
  const params = useSearchParams();
  const { currentUser } = useApp();
  const { config } = useWorkspace();

  const provider = params.get('provider') || 'all';
  const accountId = params.get('accountId') || 'all';
  const accountProvider = params.get('accountProvider') || 'all';
  const scopeKey = useMemo(
    () => JSON.stringify([config.workspace.id, currentUser.id, provider, accountProvider, accountId]),
    [accountId, accountProvider, config.workspace.id, currentUser.id, provider],
  );
  const seenKey = `inbox:assignment-seen:${config.workspace.id}:${currentUser.id}`;

  const [metrics, setMetrics] = useState<QueueMetrics | null>(() => RUNTIME_METRICS_CACHE.get(scopeKey)?.metrics || null);
  const [targets, setTargets] = useState<CountTarget[]>([]);
  const metricsTimer = useRef<number | null>(null);
  const highlightTimer = useRef<number | null>(null);
  const targetTimer = useRef<number | null>(null);
  const metricsAbort = useRef<AbortController | null>(null);
  const metricsToken = useRef(0);

  const syncTargets = useCallback(() => {
    const next = collectCountTargets();
    setTargets((current) => {
      for (const target of current) {
        if (!next.some((candidate) => candidate.element === target.element)) {
          delete target.element.dataset.inboxVerifiedCountTarget;
        }
      }
      for (const target of next) target.element.dataset.inboxVerifiedCountTarget = 'true';
      return sameTargets(current, next) ? current : next;
    });
  }, []);

  const scheduleTargetSync = useCallback(() => {
    if (targetTimer.current !== null) window.clearTimeout(targetTimer.current);
    targetTimer.current = window.setTimeout(() => {
      targetTimer.current = null;
      syncTargets();
    }, 80);
  }, [syncTargets]);

  const refreshMetrics = useCallback(async () => {
    if (!currentUser.id || !config.workspace.id) return;

    const token = ++metricsToken.current;
    metricsAbort.current?.abort();
    const controller = new AbortController();
    metricsAbort.current = controller;

    const query = new URLSearchParams();
    if (provider !== 'all') query.set('provider', provider);
    if (accountId !== 'all') query.set('accountId', accountId);

    try {
      const response = await fetch(`/api/conversations/metrics${query.size ? `?${query.toString()}` : ''}`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({})) as { metrics?: unknown };
      if (!response.ok) throw new Error('Unable to refresh Inbox counts.');
      if (token !== metricsToken.current) return;

      const verified = normalizeMetrics(payload.metrics);
      if (!verified) throw new Error('Inbox counts were incomplete.');

      RUNTIME_METRICS_CACHE.set(scopeKey, { metrics: verified, fetchedAt: Date.now() });
      setMetrics(verified);
    } catch (error) {
      if ((error as { name?: string })?.name === 'AbortError') return;
      // Preserve the last verified snapshot. A transient count failure must never
      // turn into a fake zero in the operator UI.
      const cached = RUNTIME_METRICS_CACHE.get(scopeKey);
      if (cached) setMetrics(cached.metrics);
    }
  }, [accountId, config.workspace.id, currentUser.id, provider, scopeKey]);

  const scheduleMetricsRefresh = useCallback(() => {
    if (metricsTimer.current !== null) window.clearTimeout(metricsTimer.current);
    metricsTimer.current = window.setTimeout(() => {
      metricsTimer.current = null;
      void refreshMetrics();
    }, METRICS_REFRESH_DEBOUNCE_MS);
  }, [refreshMetrics]);

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

  const scheduleHighlightRefresh = useCallback(() => {
    if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => {
      highlightTimer.current = null;
      void refreshAssignmentHighlights();
    }, HIGHLIGHT_REFRESH_DEBOUNCE_MS);
  }, [refreshAssignmentHighlights]);

  useEffect(() => {
    const cached = RUNTIME_METRICS_CACHE.get(scopeKey);
    setMetrics(cached?.metrics || null);
    scheduleTargetSync();
    scheduleMetricsRefresh();
    scheduleHighlightRefresh();
  }, [scheduleHighlightRefresh, scheduleMetricsRefresh, scheduleTargetSync, scopeKey]);

  useEffect(() => {
    const observer = new MutationObserver(scheduleTargetSync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [scheduleTargetSync]);

  useEffect(() => {
    if (!isSupabaseConfigured() || !config.workspace.id) return;
    const supabase = getSupabaseBrowserClient();
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    void (async () => {
      await syncRealtimeAuth(supabase);
      if (!active) return;
      channel = supabase
        .channel(`inbox-verified-metrics:${config.workspace.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'lead_conversations',
            filter: `workspace_id=eq.${config.workspace.id}`,
          },
          () => scheduleMetricsRefresh(),
        )
        .subscribe();
    })();

    return () => {
      active = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [config.workspace.id, scheduleMetricsRefresh]);

  useEffect(() => {
    const onDataChange = () => {
      scheduleMetricsRefresh();
      scheduleHighlightRefresh();
    };
    const onFocus = () => {
      scheduleMetricsRefresh();
      scheduleHighlightRefresh();
    };
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') scheduleMetricsRefresh();
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
      document.removeEventListener('click', onConversationClick, true);
      window.removeEventListener('crm:data-mutated', onDataChange);
      window.removeEventListener('inbox:provider-sync', onDataChange);
      window.removeEventListener('focus', onFocus);
      window.clearInterval(interval);
      metricsAbort.current?.abort();
      if (metricsTimer.current !== null) window.clearTimeout(metricsTimer.current);
      if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
      if (targetTimer.current !== null) window.clearTimeout(targetTimer.current);
      for (const target of targets) delete target.element.dataset.inboxVerifiedCountTarget;
    };
  }, [scheduleHighlightRefresh, scheduleMetricsRefresh, seenKey, targets]);

  return <>
    <style>{`
      [data-inbox-verified-count-target="true"] > span.font-mono:not([data-inbox-verified-count="true"]) {
        display: none !important;
      }
    `}</style>
    {targets.map((target) => {
      const value = metrics ? metrics[target.metric] : null;
      const danger = target.metric === 'slaOverdue' && Boolean(value);
      return createPortal(
        <span
          key={target.id}
          data-inbox-verified-count="true"
          className={`ml-auto font-mono text-[10px] tabular-nums ${danger ? 'text-rose-600' : 'opacity-70'}`}
          aria-label={value === null ? `${target.metric} count loading` : `${value} ${target.metric}`}
          title={value === null ? 'Refreshing verified count…' : 'Verified for the selected channel scope'}
        >
          {value ?? '—'}
        </span>,
        target.element,
      );
    })}
  </>;
}
