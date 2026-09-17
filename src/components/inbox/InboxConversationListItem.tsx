'use client';

import { Facebook, Globe, Instagram, Mail, MessageCircle, MessageSquare, Send } from 'lucide-react';

export type InboxListConversation = {
  id: string;
  provider: string;
  customer_name?: string | null;
  customer_avatar_url?: string | null;
  unread_count: number;
  last_message_at?: string | null;
  last_message_preview?: string | null;
  needs_reply: boolean;
  priority: string;
  connection?: {
    id?: string | null;
    provider?: string | null;
    display_name?: string | null;
    external_account_id?: string | null;
  } | null;
  assigned_profile?: { full_name?: string | null; avatar_url?: string | null } | null;
};

type Props = {
  conversation: InboxListConversation;
  selected: boolean;
  contactLabel: string;
  statusText: string;
  statusDanger: boolean;
  onSelect: () => void;
};

const PROVIDER_ICONS: Record<string, typeof MessageSquare> = {
  facebook: Facebook,
  instagram: Instagram,
  whatsapp: MessageCircle,
  tiktok: Send,
  email: Mail,
  website: Globe,
};

const PROVIDER_TONES: Record<string, string> = {
  facebook: 'bg-blue-600 text-white',
  instagram: 'bg-fuchsia-600 text-white',
  whatsapp: 'bg-emerald-600 text-white',
  tiktok: 'bg-zinc-900 text-white',
  email: 'bg-amber-500 text-white',
  website: 'bg-cyan-600 text-white',
};

function initials(value?: string | null) {
  return (value || 'C').trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'C';
}

function relativeTime(value?: string | null) {
  if (!value) return '—';
  const then = new Date(value).getTime();
  const diff = Math.max(0, Date.now() - then);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function exactTime(value?: string | null) {
  if (!value) return undefined;
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function keepSelectedThreadAtLatest() {
  if (typeof window === 'undefined') return;

  let pane: HTMLElement | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let mutationObserver: MutationObserver | null = null;
  let cleanupTimer: number | null = null;
  const startedAt = Date.now();

  const scrollLatest = () => {
    if (!pane) return;
    pane.scrollTop = pane.scrollHeight;
  };

  const cleanup = () => {
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
    if (pane) pane.removeEventListener('load', scrollLatest, true);
    if (cleanupTimer !== null) window.clearTimeout(cleanupTimer);
  };

  const attach = () => {
    pane = document.querySelector<HTMLElement>('[aria-label="Message history"]');
    if (!pane) {
      if (Date.now() - startedAt < 1500) window.requestAnimationFrame(attach);
      return;
    }

    scrollLatest();

    mutationObserver = new MutationObserver(scrollLatest);
    mutationObserver.observe(pane, { childList: true, subtree: true });

    const content = pane.firstElementChild;
    if (content && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(scrollLatest);
      resizeObserver.observe(content);
    }

    // Media can change the thread height after the React commit without mutating the DOM.
    pane.addEventListener('load', scrollLatest, true);
    cleanupTimer = window.setTimeout(cleanup, 1800);
  };

  window.requestAnimationFrame(() => window.requestAnimationFrame(attach));
}

export default function InboxConversationListItem({ conversation, selected, contactLabel, statusText, statusDanger, onSelect }: Props) {
  const Icon = PROVIDER_ICONS[conversation.provider] || MessageSquare;
  const providerTone = PROVIDER_TONES[conversation.provider] || 'bg-zinc-700 text-white';
  const unread = conversation.unread_count > 0;
  const assignee = conversation.assigned_profile?.full_name || 'Unassigned';
  const account = conversation.connection?.display_name || conversation.provider;
  const actionState = statusDanger ? statusText : conversation.needs_reply ? (statusText || 'Needs reply') : (statusText || 'Waiting on customer');

  return <button
    type="button"
    data-conversation-item="true"
    data-conversation-id={conversation.id}
    data-newly-assigned="false"
    aria-current={selected ? 'true' : undefined}
    aria-label={`${conversation.customer_name || contactLabel}, ${conversation.unread_count || 0} unread messages, ${actionState}, via ${account}`}
    onClick={() => {
      onSelect();
      keepSelectedThreadAtLatest();
    }}
    className={`relative min-h-[5.25rem] w-full border-l-2 px-3 py-3 text-left transition-colors data-[newly-assigned=true]:border-l-blue-300 data-[newly-assigned=true]:bg-blue-50/35 hover:bg-zinc-50 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/40 ${selected ? 'border-l-blue-600 bg-blue-50/55' : 'border-l-transparent bg-white'}`}
  >
    <div className="flex min-w-0 items-start gap-2.5">
      <div className="relative shrink-0">
        {conversation.customer_avatar_url ? <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={conversation.customer_avatar_url} alt="" className="h-10 w-10 rounded-full object-cover ring-1 ring-zinc-200" />
        </> : <div className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold ring-1 ${selected ? 'bg-white text-blue-700 ring-blue-100' : 'bg-zinc-100 text-zinc-700 ring-zinc-200'}`}>{initials(conversation.customer_name)}</div>}
        <span className={`absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white ${providerTone}`}><Icon className="h-2.5 w-2.5" /></span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`min-w-0 flex-1 truncate text-[13px] text-zinc-950 ${unread ? 'font-semibold' : 'font-medium'}`}>{conversation.customer_name || contactLabel}</span>
          <time dateTime={conversation.last_message_at || undefined} title={exactTime(conversation.last_message_at)} className={`shrink-0 text-[10px] tabular-nums ${unread ? 'font-semibold text-blue-600' : 'text-zinc-400'}`}>{relativeTime(conversation.last_message_at)}</time>
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-2">
          <p className={`min-w-0 flex-1 truncate text-xs leading-5 ${unread ? 'font-medium text-zinc-800' : 'text-zinc-500'}`}>{conversation.last_message_preview || 'No message preview'}</p>
          {unread && <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[10px] font-semibold text-white">{conversation.unread_count}</span>}
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-1 text-[10px] text-zinc-400">
          <span className="max-w-[150px] truncate font-medium capitalize">{account}</span>
          <span aria-hidden="true">·</span>
          <span className="max-w-[90px] truncate">{assignee}</span>
          {conversation.priority !== 'normal' && <span className={`ml-1 shrink-0 rounded-md px-1.5 py-0.5 font-medium capitalize ${conversation.priority === 'urgent' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{conversation.priority}</span>}
          <span className={`ml-auto shrink-0 rounded-md px-1.5 py-0.5 font-medium ${statusDanger ? 'bg-rose-50 text-rose-700' : conversation.needs_reply ? 'bg-blue-50 text-blue-700' : 'bg-zinc-50 text-zinc-500'}`}>{actionState}</span>
        </div>
      </div>
    </div>
  </button>;
}
