'use client';

import { useEffect, useState } from 'react';
import type { Lead } from '@/lib/types';

interface SlaBadgeProps {
  lead: Lead;
  detailed?: boolean;
}

function Status({ tone, children }: { tone: 'neutral' | 'info' | 'warning' | 'danger' | 'success'; children: React.ReactNode }) {
  const dotClass = {
    neutral: '',
    info: 'status-dot-info',
    warning: 'status-dot-warning',
    danger: 'status-dot-danger',
    success: 'status-dot-success',
  }[tone];

  return (
    <span className="status-line font-mono tracking-tight" suppressHydrationWarning>
      <span className={`status-dot ${dotClass}`} />
      <span>{children}</span>
    </span>
  );
}

export default function SlaBadge({ lead, detailed = false }: SlaBadgeProps) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setNow(Date.now());
    const initial = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 15_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);

  if (now === null) {
    return <Status tone="neutral">Checking next action…</Status>;
  }

  if (!lead.first_contacted_at) {
    if (!lead.first_response_due_at) {
      return <Status tone="neutral">Waiting for owner</Status>;
    }

    const dueTime = new Date(lead.first_response_due_at).getTime();
    const diffMinutes = Math.round((dueTime - now) / 60_000);

    if (diffMinutes <= 0 || lead.is_first_response_breached) {
      const overdue = Math.abs(diffMinutes);
      return <Status tone="danger">{detailed ? 'Reply overdue' : 'Overdue'}{overdue > 0 ? ` · ${overdue}m` : ''}</Status>;
    }

    if (diffMinutes <= 10) {
      return <Status tone="warning">{detailed ? 'Reply soon' : 'Reply'} · {diffMinutes}m</Status>;
    }

    return <Status tone="info">{detailed ? 'First reply due' : 'Reply'} · {diffMinutes}m</Status>;
  }

  if (lead.next_follow_up_at && !['won', 'lost', 'junk'].includes(lead.stage)) {
    const followUpTime = new Date(lead.next_follow_up_at).getTime();
    const diffMinutes = Math.round((followUpTime - now) / 60_000);

    if (diffMinutes < 0) {
      const overdueMinutes = Math.abs(diffMinutes);
      const value = overdueMinutes >= 60 ? `${Math.round(overdueMinutes / 60)}h` : `${overdueMinutes}m`;
      return <Status tone="danger">{detailed ? 'Follow-up overdue' : 'Overdue'} · {value}</Status>;
    }

    if (diffMinutes < 120) {
      return <Status tone="warning">{detailed ? 'Follow-up due' : 'Due'} · {diffMinutes}m</Status>;
    }

    const hours = Math.round(diffMinutes / 60);
    return <Status tone="neutral">{detailed ? 'Next follow-up' : 'Next'} · {hours}h</Status>;
  }

  if (lead.stage === 'won') return <Status tone="success">Won</Status>;
  if (lead.stage === 'lost' || lead.stage === 'junk') return <Status tone="neutral">Closed</Status>;
  return <Status tone="neutral">No follow-up set</Status>;
}
