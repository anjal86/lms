'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, ListTodo, Tag } from 'lucide-react';

type WorkItem = {
  id: string;
  title: string;
  due_at?: string | null;
  priority?: string | null;
  status?: string | null;
};

type Props = {
  conversationId: string;
  tags?: unknown;
  nextActionAt?: string | null;
  lastInboundAt?: string | null;
};

function dateLabel(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function InboxContextExtras({ conversationId, tags, nextActionAt, lastInboundAt }: Props) {
  const [items, setItems] = useState<WorkItem[]>([]);
  const normalizedTags = useMemo(() => Array.isArray(tags) ? tags.map(String).filter(Boolean).slice(0, 8) : [], [tags]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const query = new URLSearchParams({ conversationId, status: 'open', owner: 'all', limit: '5' });
        const response = await fetch(`/api/work-items?${query.toString()}`, { cache: 'no-store' });
        if (!response.ok || cancelled) return;
        const payload = await response.json();
        if (!cancelled) setItems((payload.items || []) as WorkItem[]);
      } catch { /* context enhancement only */ }
    })();
    return () => { cancelled = true; };
  }, [conversationId]);

  return <div className="space-y-4 border-t border-zinc-100 pt-4">
    <div>
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-400"><Clock3 className="h-3 w-3" /> Activity</div>
      <dl className="mt-2 space-y-2 text-xs">
        <div className="flex items-center justify-between gap-3"><dt className="text-zinc-500">Last inbound</dt><dd className="font-medium text-zinc-800">{dateLabel(lastInboundAt)}</dd></div>
        <div className="flex items-center justify-between gap-3"><dt className="text-zinc-500">Next action</dt><dd className="font-medium text-zinc-800">{dateLabel(nextActionAt)}</dd></div>
      </dl>
    </div>

    {normalizedTags.length > 0 && <div>
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-400"><Tag className="h-3 w-3" /> Tags</div>
      <div className="mt-2 flex flex-wrap gap-1.5">{normalizedTags.map((tag) => <span key={tag} className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-semibold text-zinc-600">{tag}</span>)}</div>
    </div>}

    <div>
      <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-400"><ListTodo className="h-3 w-3" /> Open work</div><span className="font-mono text-[10px] text-zinc-400">{items.length}</span></div>
      <div className="mt-2 space-y-1.5">{items.slice(0, 3).map((item) => <div key={item.id} className="rounded-lg border border-zinc-100 bg-zinc-50/70 px-2.5 py-2"><div className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-zinc-400" /><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold text-zinc-800">{item.title}</div>{item.due_at && <div className="mt-0.5 text-[10px] text-zinc-400">Due {dateLabel(item.due_at)}</div>}</div></div></div>)}{items.length === 0 && <div className="text-xs text-zinc-400">No open work for this conversation.</div>}</div>
    </div>
  </div>;
}
