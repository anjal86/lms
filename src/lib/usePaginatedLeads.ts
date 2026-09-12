'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Lead } from './types';

export interface LeadPipelineSummary {
  visible_count: number;
  my_count: number;
  pending_sla_count: number;
  overdue_count: number;
  won_count: number;
  won_value: number;
  destinations: string[];
  stage_counts: Record<string, number>;
}

interface LeadPageResponse {
  items: Lead[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: Partial<LeadPipelineSummary>;
}

const EMPTY_SUMMARY: LeadPipelineSummary = {
  visible_count: 0,
  my_count: 0,
  pending_sla_count: 0,
  overdue_count: 0,
  won_count: 0,
  won_value: 0,
  destinations: [],
  stage_counts: {},
};

export function usePaginatedLeads(input: {
  page: number;
  pageSize: number;
  tab: 'all' | 'my' | 'overdue' | 'sla_pending' | 'won';
  q: string;
  dest: string;
  trip: string;
}) {
  const [data, setData] = useState<LeadPageResponse>({
    items: [],
    total: 0,
    page: input.page,
    pageSize: input.pageSize,
    totalPages: 1,
    summary: EMPTY_SUMMARY,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const queryString = useMemo(() => {
    const query = new URLSearchParams({
      page: String(input.page),
      pageSize: String(input.pageSize),
      tab: input.tab,
    });
    if (input.q.trim()) query.set('q', input.q.trim());
    if (input.dest && input.dest !== 'ALL') query.set('dest', input.dest);
    if (input.trip && input.trip !== 'ALL') query.set('trip', input.trip);
    return query.toString();
  }, [input.page, input.pageSize, input.tab, input.q, input.dest, input.trip]);

  const refresh = useCallback(() => setRefreshToken((value) => value + 1), []);

  useEffect(() => {
    const handleMutation = () => refresh();
    window.addEventListener('crm:data-mutated', handleMutation);
    return () => window.removeEventListener('crm:data-mutated', handleMutation);
  }, [refresh]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/leads?${queryString}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Unable to load leads.');
        setData(payload as LeadPageResponse);
      } catch (fetchError) {
        if (controller.signal.aborted) return;
        setError(fetchError instanceof Error ? fetchError.message : 'Unable to load leads.');
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, input.q.trim() ? 220 : 20);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [queryString, refreshToken, input.q]);

  const summary: LeadPipelineSummary = {
    ...EMPTY_SUMMARY,
    ...(data.summary || {}),
    visible_count: Number(data.summary?.visible_count || 0),
    my_count: Number(data.summary?.my_count || 0),
    pending_sla_count: Number(data.summary?.pending_sla_count || 0),
    overdue_count: Number(data.summary?.overdue_count || 0),
    won_count: Number(data.summary?.won_count || 0),
    won_value: Number(data.summary?.won_value || 0),
    destinations: Array.isArray(data.summary?.destinations) ? data.summary.destinations : [],
    stage_counts: data.summary?.stage_counts || {},
  };

  return {
    leads: data.items || [],
    total: data.total || 0,
    totalPages: data.totalPages || 1,
    summary,
    isLoading,
    error,
    refresh,
  };
}
