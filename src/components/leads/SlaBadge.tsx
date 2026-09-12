'use client';

import React, { useState, useEffect } from 'react';
import { Lead } from '@/lib/types';
import { Clock, AlertTriangle, Check } from 'lucide-react';

interface SlaBadgeProps {
  lead: Lead;
  detailed?: boolean;
}

export default function SlaBadge({ lead }: SlaBadgeProps) {
  const [mounted, setMounted] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    setMounted(true);
    const timer = setInterval(() => setTick((t) => t + 1), 15000);
    return () => clearInterval(timer);
  }, []);

  const now = Date.now();

  // Scenario 1: First Response SLA (uncontacted lead)
  if (!lead.first_contacted_at) {
    if (!lead.first_response_due_at) {
      return (
        <span suppressHydrationWarning className="inline-flex items-center gap-1.5 text-xs text-zinc-500 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-300" />
          <span>unassigned</span>
        </span>
      );
    }

    const dueTime = new Date(lead.first_response_due_at).getTime();
    const diffMinutes = Math.round((dueTime - now) / 60000);

    if (diffMinutes <= 0 || lead.is_first_response_breached) {
      const overdueMins = Math.abs(diffMinutes);
      return (
        <span suppressHydrationWarning className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-red-200 bg-red-50 text-red-700 text-[11px] font-mono font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" />
          <span>SLA BREACH {overdueMins > 0 ? `+${overdueMins}m` : ''}</span>
        </span>
      );
    }

    if (diffMinutes <= 10) {
      return (
        <span suppressHydrationWarning className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-800 text-[11px] font-mono font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
          <span>FRT: {diffMinutes}m</span>
        </span>
      );
    }

    return (
      <span suppressHydrationWarning className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-zinc-200 bg-zinc-50 text-zinc-700 text-[11px] font-mono">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        <span>FRT: {diffMinutes}m</span>
      </span>
    );
  }

  // Scenario 2: Contacted, checking Next Follow-up
  if (lead.next_follow_up_at && lead.stage !== 'won' && lead.stage !== 'lost') {
    const fuTime = new Date(lead.next_follow_up_at).getTime();
    const diffMinutes = Math.round((fuTime - now) / 60000);

    if (diffMinutes < 0) {
      const hours = Math.abs(Math.round(diffMinutes / 60));
      return (
        <span suppressHydrationWarning className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-red-200 bg-red-50 text-red-700 text-[11px] font-mono font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
          <span>OVERDUE {hours > 0 ? `${hours}h` : `${Math.abs(diffMinutes)}m`}</span>
        </span>
      );
    }

    if (diffMinutes < 120) {
      return (
        <span suppressHydrationWarning className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-800 text-[11px] font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          <span>due in {diffMinutes}m</span>
        </span>
      );
    }

    const hours = Math.round(diffMinutes / 60);
    return (
      <span suppressHydrationWarning className="inline-flex items-center gap-1.5 text-xs text-zinc-600 font-mono">
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
        <span>in {hours}h</span>
      </span>
    );
  }

  if (lead.stage === 'won') {
    return (
      <span suppressHydrationWarning className="inline-flex items-center gap-1.5 text-xs text-emerald-700 font-medium font-mono">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        <span>won</span>
      </span>
    );
  }

  return (
    <span suppressHydrationWarning className="inline-flex items-center gap-1.5 text-xs text-zinc-500 font-mono">
      <span className="w-1.5 h-1.5 rounded-full bg-zinc-300" />
      <span>contacted</span>
    </span>
  );
}
