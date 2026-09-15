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

export default function InboxConversationListItem({ conversation, selected, contactLabel, statusText, statusDanger, onSelect }: Props) {
  const Icon = PROVIDER_ICONS[conversation.provider] || MessageSquare;
  const unread = conversation.unread_count > 0;
  const assignee = conversation.assigned_profile?.full_name || 'Unassigned';
  const account = conversation.connection?.display_name || conversation.provider;

  return <button
    type="button"
    data-conversation-item="true"
    aria-current={selected ? 'true' : undefined}
    aria-label={`${conversation.customer_name || contactLabel}, ${conversation.unread_count || 0} unread messages, via ${account}`}
    onClick={onSelect}
    className={`relative w-full border-l-2 px-3 py-3 text-left transition-colors hover:bg-zinc-50 ${selected ? 'border-l-blue-600 bg-blue-50/40' : 'border-l-transparent bg-white'}`}
  >
    <div className="flex min-w-0 items-start gap-2.5">
      <div className="relative shrink-0">
        {conversation.customer_avatar_url ? <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={conversation.customer_avatar_url} alt="" className="h-10 w-10 rounded-full object-cover ring-1 ring-zinc-200" />
        </> : <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold ring-1 ring-zinc-200">{initials(conversation.customer_name)}</div>}
        <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-zinc-900 text-white"><Icon className="h-2.5 w-2.5" /></span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`min-w-0 flex-1 truncate text-sm text-zinc-950 ${unread ? 'font-bold' : 'font-semibold'}`}>{conversation.customer_name || contactLabel}</span>
          <span className={`shrink-0 font-mono text-[10px] ${unread ? 'font-bold text-blue-600' : 'text-zinc-400'}`}>{relativeTime(conversation.last_message_at)}</span>
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-2">
          <p className={`min-w-0 flex-1 truncate text-xs leading-5 ${unread ? 'font-semibold text-zinc-800' : 'text-zinc-500'}`}>{conversation.last_message_preview || 'No message preview'}</p>
          {unread && <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[10px] font-bold text-white">{conversation.unread_count}</span>}
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-1 text-[10px] text-zinc-400">
          <span className="max-w-[150px] truncate font-medium capitalize">{account}</span>
          <span>·</span>
          <span className="max-w-[90px] truncate">{assignee}</span>
          {conversation.priority !== 'normal' && <span className="ml-1 shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 font-bold uppercase text-amber-700">{conversation.priority}</span>}
          <span className={`ml-auto shrink-0 font-semibold ${statusDanger ? 'text-rose-600' : conversation.needs_reply ? 'text-blue-600' : 'text-zinc-400'}`}>{statusText}</span>
        </div>
      </div>
    </div>
  </button>;
}
