import Link from 'next/link';
import { ExternalLink, Settings2 } from 'lucide-react';
import LegacyInboxPage from '@/components/inbox/LegacyInboxPage';

function configuredChatwootUrl() {
  const value = process.env.NEXT_PUBLIC_CHATWOOT_INBOX_URL?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export default function InboxPage() {
  const chatwootUrl = configuredChatwootUrl();

  // Keep the previous Inbox available as a zero-config rollback path while the
  // Chatwoot migration is staged. Once NEXT_PUBLIC_CHATWOOT_INBOX_URL exists,
  // Chatwoot becomes the operator-facing Inbox UI.
  if (!chatwootUrl) return <LegacyInboxPage />;

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
          <span className="truncate text-xs font-medium text-zinc-700">Chatwoot Inbox</span>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href="/inbox/channels/chatwoot"
            className="inline-flex min-h-[32px] items-center gap-1.5 rounded-md px-2 text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Setup
          </Link>
          <a
            href={chatwootUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[32px] items-center gap-1.5 rounded-md px-2 text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open full screen
          </a>
        </div>
      </div>

      <iframe
        src={chatwootUrl}
        title="Chatwoot Inbox"
        className="min-h-0 flex-1 border-0 bg-white"
        allow="clipboard-read; clipboard-write; microphone"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}
