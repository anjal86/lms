'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Facebook, Instagram, Layers3, Loader2 } from 'lucide-react';

type PageOption = {
  key: string;
  provider: 'facebook' | 'instagram';
  accountId: string;
  name: string;
  conversations: number;
  newConversations: number;
  unreadMessages: number;
  lastMessageAt: string | null;
};

const COOKIE_NAME = 'inbox_page_filter';

function readCookie(name: string) {
  if (typeof document === 'undefined') return '';
  const prefix = `${name}=`;
  const row = document.cookie.split('; ').find((item) => item.startsWith(prefix));
  return row ? decodeURIComponent(row.slice(prefix.length)) : '';
}

function clearPageCookie() {
  document.cookie = `${COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export default function PageInboxSelector() {
  const pathname = usePathname();
  const [pages, setPages] = useState<PageOption[]>([]);
  const [selected, setSelected] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (pathname !== '/inbox') {
      setLoading(false);
      return;
    }

    setSelected(readCookie(COOKIE_NAME) || 'all');
    let cancelled = false;
    void fetch('/api/conversations/pages', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to load Page inboxes.');
        if (!cancelled) setPages(Array.isArray(data.pages) ? data.pages : []);
      })
      .catch((error) => {
        console.warn('Unable to load Page inbox selector:', error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [pathname]);

  const selectedPage = useMemo(
    () => pages.find((page) => page.key === selected) || null,
    [pages, selected]
  );

  useEffect(() => {
    if (pathname !== '/inbox' || loading || selected === 'all') return;
    if (!pages.some((page) => page.key === selected)) {
      clearPageCookie();
      setSelected('all');
      window.location.reload();
    }
  }, [loading, pages, pathname, selected]);

  if (pathname !== '/inbox') return null;
  if (!loading && pages.length <= 1) return null;

  const handleChange = (value: string) => {
    setSelected(value);
    if (value === 'all') {
      clearPageCookie();
    } else {
      document.cookie = `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; Max-Age=2592000; SameSite=Lax`;
    }
    window.location.reload();
  };

  return (
    <header className="flex min-h-10 shrink-0 items-center justify-between gap-3 border-b border-zinc-200 bg-white px-3 py-1.5 sm:px-4" aria-label="Page inbox selector">
      <div className="flex min-w-0 items-center gap-2">
        <Layers3 className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Working inbox</span>
        {loading ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500"><Loader2 className="h-3 w-3 animate-spin" /> Loading Pages</span>
        ) : (
          <select
            value={selectedPage ? selectedPage.key : 'all'}
            onChange={(event) => handleChange(event.target.value)}
            className="select-field h-7 min-w-0 max-w-[320px] text-xs font-semibold text-zinc-900"
            aria-label="Choose which connected Page inbox to work"
          >
            <option value="all">All Pages · combined inbox</option>
            {pages.map((page) => (
              <option key={page.key} value={page.key}>
                {page.provider === 'facebook' ? 'Facebook' : 'Instagram'} · {page.name} · {page.conversations} chats · {page.newConversations} new
              </option>
            ))}
          </select>
        )}
      </div>

      {selectedPage && (
        <div className="hidden min-w-0 items-center gap-3 text-[11px] font-medium text-zinc-500 sm:flex">
          <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-zinc-700">
            {selectedPage.provider === 'facebook'
              ? <Facebook className="h-3 w-3 shrink-0" />
              : <Instagram className="h-3 w-3 shrink-0" />}
            <span className="truncate">{selectedPage.name}</span>
          </span>
          <span className="font-mono">{selectedPage.conversations} chats</span>
          <span className="font-mono">{selectedPage.newConversations} new</span>
          {selectedPage.unreadMessages > 0 && <span className="font-mono font-semibold text-blue-700">{selectedPage.unreadMessages} unread</span>}
        </div>
      )}
    </header>
  );
}
