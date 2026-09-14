'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, CircleCheck, Clock3, ListChecks, X } from 'lucide-react';

type OpportunityHealth = {
  lead_id: string;
  workspace_id: string;
  health_score: number;
  overdue_work_count: number;
  last_customer_activity_at: string | null;
  next_action_at: string | null;
};

type Suggestion = {
  id: string;
  kind: 'summary' | 'field_updates' | 'next_action' | 'reply';
  status: string;
  payload: unknown;
  model?: string | null;
  created_at: string;
  expires_at?: string | null;
};

type Props = {
  leadId: string;
  formatDate?: (value: string) => string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function humanize(key: string) {
  return key.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function readable(value: unknown) {
  if (value == null || value === '') return null;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map((item) => String(item)).join(', ');
  return null;
}

function suggestionLines(suggestion: Suggestion) {
  const payload = record(suggestion.payload);
  const preferredKeys = suggestion.kind === 'reply'
    ? ['reply', 'message', 'text']
    : suggestion.kind === 'summary'
      ? ['summary', 'text']
      : suggestion.kind === 'next_action'
        ? ['title', 'action', 'channel', 'due_at', 'reason']
        : ['fields', 'field_updates', 'updates', 'reason'];

  for (const key of preferredKeys) {
    const value = payload[key];
    if (key === 'fields' || key === 'field_updates' || key === 'updates') {
      const updates = record(value);
      const lines = Object.entries(updates).slice(0, 5).map(([field, next]) => {
        const text = readable(next);
        return text ? `${humanize(field)} → ${text}` : null;
      }).filter((line): line is string => Boolean(line));
      if (lines.length) return lines;
    }
    const text = readable(value);
    if (text) return [text];
  }

  return Object.entries(payload).slice(0, 4).map(([key, value]) => {
    const text = readable(value);
    return text ? `${humanize(key)}: ${text}` : null;
  }).filter((line): line is string => Boolean(line));
}

function suggestionLabel(kind: Suggestion['kind']) {
  if (kind === 'field_updates') return 'Suggested details';
  if (kind === 'next_action') return 'Suggested next action';
  if (kind === 'reply') return 'Suggested reply';
  return 'Summary';
}

function localDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function OpportunityInsights({ leadId, formatDate }: Props) {
  const [health, setHealth] = useState<OpportunityHealth | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/leads/${leadId}/insights`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) return;
        const payload = await response.json();
        setHealth(payload.health || null);
        setSuggestions(Array.isArray(payload.suggestions) ? payload.suggestions : []);
      } catch (error) {
        if ((error as { name?: string })?.name !== 'AbortError') {
          // Insights are supplemental. The Opportunity remains fully usable if this read fails.
        }
      } finally {
        if (!controller.signal.aborted) setLoaded(true);
      }
    })();
    return () => controller.abort();
  }, [leadId]);

  const state = useMemo(() => {
    if (!health) return null;
    if (health.overdue_work_count > 0 || health.health_score < 60) return { label: 'Needs attention', icon: AlertTriangle, className: 'text-amber-700' };
    if (health.health_score < 80 || !health.next_action_at) return { label: 'Watch', icon: Clock3, className: 'text-zinc-700' };
    return { label: 'Healthy', icon: CircleCheck, className: 'text-emerald-700' };
  }, [health]);

  async function review(suggestionId: string, status: 'accepted' | 'rejected') {
    setReviewing(suggestionId);
    setReviewError(null);
    try {
      const response = await fetch(`/api/leads/${leadId}/insights/${suggestionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to review suggestion.');
      setSuggestions((current) => current.filter((item) => item.id !== suggestionId));
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : 'Unable to review suggestion.');
    } finally {
      setReviewing(null);
    }
  }

  if (!loaded || (!health && suggestions.length === 0)) return null;
  const displayDate = formatDate || localDate;
  const StateIcon = state?.icon || CircleCheck;

  return (
    <section aria-labelledby="opportunity-health-heading" className="border-y border-zinc-200 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div id="opportunity-health-heading" className="text-xs font-semibold text-zinc-900">Opportunity health</div>
          <div className="mt-0.5 text-[11px] text-zinc-500">Signals from due work and recent customer activity.</div>
        </div>
        {health && state && (
          <div className={`flex items-center gap-2 text-xs font-semibold ${state.className}`}>
            <StateIcon className="h-4 w-4" aria-hidden="true" />
            <span>{state.label}</span>
            <span className="font-mono text-zinc-500">{health.health_score}/100</span>
          </div>
        )}
      </div>

      {health && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div><div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Overdue work</div><div className={`mt-1 font-mono text-sm font-semibold ${health.overdue_work_count ? 'text-amber-700' : 'text-zinc-900'}`}>{health.overdue_work_count}</div></div>
          <div><div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Next action</div><div className="mt-1 text-xs font-medium text-zinc-800">{health.next_action_at ? displayDate(health.next_action_at) : 'Not scheduled'}</div></div>
          <div><div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Last customer activity</div><div className="mt-1 text-xs font-medium text-zinc-800">{health.last_customer_activity_at ? displayDate(health.last_customer_activity_at) : 'No activity yet'}</div></div>
        </div>
      )}

      {suggestions.length > 0 && (
        <details className="mt-4 border-t border-zinc-100 pt-3">
          <summary className="flex min-h-[40px] cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold text-zinc-700 hover:text-zinc-950">
            <span className="flex items-center gap-2"><ListChecks className="h-4 w-4 text-zinc-400" aria-hidden="true" /> Review suggestions <span className="font-mono text-[10px] text-zinc-400">{suggestions.length}</span></span>
            <ChevronDown className="h-4 w-4 text-zinc-400" aria-hidden="true" />
          </summary>
          <div className="divide-y divide-zinc-100 border-t border-zinc-100">
            {suggestions.map((suggestion) => {
              const lines = suggestionLines(suggestion);
              const busy = reviewing === suggestion.id;
              return (
                <article key={suggestion.id} className="py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-zinc-800">{suggestionLabel(suggestion.kind)}</div>
                      <div className="mt-1 space-y-1">
                        {lines.length ? lines.map((line, index) => <div key={`${suggestion.id}-${index}`} className="text-xs leading-5 text-zinc-600">{line}</div>) : <div className="text-xs text-zinc-500">A reviewable suggestion is ready.</div>}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button type="button" disabled={busy} onClick={() => void review(suggestion.id, 'rejected')} className="button-secondary button-sm min-h-[40px]"><X className="h-3.5 w-3.5" aria-hidden="true" /> Dismiss</button>
                      <button type="button" disabled={busy} onClick={() => void review(suggestion.id, 'accepted')} className="button-primary button-sm min-h-[40px]"><Check className="h-3.5 w-3.5" aria-hidden="true" /> Accept</button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          {reviewError && <div role="alert" className="mt-2 text-xs font-medium text-red-700">{reviewError}</div>}
          <p className="mt-2 text-[10px] leading-4 text-zinc-400">Accepting records approval only; suggestions never change customer or opportunity data automatically.</p>
        </details>
      )}
    </section>
  );
}
