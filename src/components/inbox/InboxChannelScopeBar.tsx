'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Layers3, Loader2 } from 'lucide-react';

type Connection = {
  id: string;
  provider: string;
  display_name: string;
  external_account_id?: string | null;
  status: string;
  config?: Record<string, unknown> | null;
};

const PROVIDER_LABELS: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  tiktok: 'TikTok',
  email: 'Email',
  website: 'Website',
  api: 'API',
};

export default function InboxChannelScopeBar() {
  const router = useRouter();
  const params = useSearchParams();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const selectedId = params.get('accountId') || '';

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.cookie = 'inbox_page_filter=; Path=/; Max-Age=0; SameSite=Lax';
    }

    let alive = true;
    const load = async () => {
      try {
        const response = await fetch('/api/integrations/connections', { cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !alive) return;
        setConnections((payload.connections || []) as Connection[]);
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    return () => { alive = false; };
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, Connection[]>();
    for (const connection of connections) {
      const list = map.get(connection.provider) || [];
      list.push(connection);
      map.set(connection.provider, list);
    }
    return [...map.entries()];
  }, [connections]);

  const selected = connections.find((connection) => connection.id === selectedId) || null;

  const changeAccount = (connectionId: string) => {
    const next = new URLSearchParams(params.toString());
    if (!connectionId) {
      next.delete('accountId');
      next.delete('accountProvider');
    } else {
      const connection = connections.find((item) => item.id === connectionId);
      if (!connection) return;
      next.set('accountId', connection.id);
      next.set('accountProvider', connection.provider);
      next.set('provider', connection.provider);
      next.delete('conversationId');
      next.delete('id');
      next.delete('conversation');
    }
    const query = next.toString();
    router.replace(query ? `/inbox?${query}` : '/inbox');
  };

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-zinc-200 bg-white px-3 lg:px-4">
      <div className="hidden items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-400 sm:flex">
        <Layers3 className="h-3.5 w-3.5" /> Working inbox
      </div>
      <div className="min-w-0 flex-1 sm:max-w-md">
        {loading ? (
          <div className="flex h-8 items-center gap-2 rounded-md border border-zinc-200 px-2.5 text-xs text-zinc-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading channel accounts…</div>
        ) : (
          <select
            aria-label="Working channel account"
            value={selectedId}
            onChange={(event) => changeAccount(event.target.value)}
            className="select-field h-8 w-full text-xs"
          >
            <option value="">All connected accounts</option>
            {grouped.map(([provider, accounts]) => (
              <optgroup key={provider} label={PROVIDER_LABELS[provider] || provider}>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.display_name}{account.status !== 'connected' ? ` · ${account.status.replaceAll('_', ' ')}` : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
      </div>
      {selected && (
        <div className="ml-auto hidden min-w-0 items-center gap-2 text-[10px] text-zinc-500 md:flex">
          <span className="capitalize">{PROVIDER_LABELS[selected.provider] || selected.provider}</span>
          {selected.external_account_id && <><span className="text-zinc-300">·</span><span className="max-w-48 truncate font-mono">{selected.external_account_id}</span></>}
          <span className={`h-1.5 w-1.5 rounded-full ${selected.status === 'connected' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
        </div>
      )}
    </div>
  );
}
