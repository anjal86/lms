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
  assigned_to?: string | null;
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
  tiktok: 'bg-zinc-950 text-white',
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

export default function InboxConversationListItem({ conversation, selected, contactLabel, statusText, statusDanger, onSelect }: Props) {
  const Icon = PROVIDER_ICONS[conversation.provider] || MessageSquare;
  const providerTone = PROVIDER_TONES[conversation.provider] || 'bg-zinc-700 text-white';
  const unread = conversation.unread_count > 0;
  const assignee = conversation.assigned_profile?.full_name || 'Unassigned';
  const account = conversation.connection?.display_name || conversation.provider;
  const actionState = statusDanger
    ? statusText
    : conversation.needs_reply
      ? (statusText || 'Needs reply')
      : (statusText || 'Waiting');

  return <button
    type="button"
    data-conversation-item="true"
    data-conversation-id={conversation.id}
    data-assigned-to={conversation.assigned_to || ''}
    aria-current={selected ? 'true' : undefined}
    aria-label={`${conversation.customer_name || contactLabel}, ${conversation.unread_count || 0} unread messages, ${actionState}, via ${account}`}
    onClick={onSelect}
    className={`group relative w-full border-b border-zinc-100 px-3 py-2.5 text-left transition-colors duration-100 data-[newly-assigned=true]:bg-blue-50/45 hover:bg-zinc-50 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/30 ${selected ? 'bg-zinc-100/80' : 'bg-white'}`}
  >
    <span className={`absolute inset-y-0 left-0 w-0.5 ${selected ? 'bg-blue-600' : 'bg-transparent'} group-data-[newly-assigned=true]:bg-blue-400`} aria-hidden="true" />

    <div className="flex min-w-0 items-start gap-2.5">
      <div className="relative mt-0.5 shrink-0">
        {conversation.customer_avatar_url ? <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={conversation.customer_avatar_url} alt="" className="h-9 w-9 rounded-full object-cover ring-1 ring-zinc-200" />
        </> : <div className={`flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-semibold ring-1 ${selected ? 'bg-white text-zinc-800 ring-zinc-200' : 'bg-zinc-100 text-zinc-700 ring-zinc-200'}`}>{initials(conversation.customer_name)}</div>}
        <span className={`absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white ${providerTone}`} aria-label={conversation.provider}>
          <Icon className="h-2.5 w-2.5" />
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className={`min-w-0 flex-1 truncate text-[13px] leading-5 text-zinc-950 ${unread ? 'font-semibold' : 'font-medium'}`}>{conversation.customer_name || contactLabel}</span>
          <time
            dateTime={conversation.last_message_at || undefined}
            title={exactTime(conversation.last_message_at)}
            className={`shrink-0 text-[10px] tabular-nums ${unread ? 'font-semibold text-blue-600' : 'text-zinc-400'}`}
          >
            {relativeTime(conversation.last_message_at)}
          </time>
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <p className={`min-w-0 flex-1 truncate text-[12px] leading-5 ${unread ? 'font-medium text-zinc-800' : 'text-zinc-500'}`}>
            {conversation.last_message_preview || 'No message preview'}
          </p>
          {unread && <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-blue-600 px-1 text-[9px] font-semibold leading-none text-white">{conversation.unread_count > 99 ? '99+' : conversation.unread_count}</span>}
        </div>

        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[10px] leading-4 text-zinc-400">
          <span className="max-w-[120px] truncate font-medium capitalize text-zinc-500">{account}</span>
          <span aria-hidden="true">·</span>
          <span className="max-w-[90px] truncate">{assignee}</span>
          {conversation.priority !== 'normal' && <span className={`shrink-0 rounded px-1 py-px font-medium capitalize ${conversation.priority === 'urgent' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{conversation.priority}</span>}
          {(conversation.needs_reply || statusDanger) && <span className={`ml-auto shrink-0 rounded px-1.5 py-px font-medium ${statusDanger ? 'bg-rose-50 text-rose-700' : 'bg-blue-50 text-blue-700'}`}>{actionState}</span>}
        </div>
      </div>
    </div>
  </button>;
}
