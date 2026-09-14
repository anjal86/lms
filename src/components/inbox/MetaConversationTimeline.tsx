'use client';

import { Fragment } from 'react';
import { StickyNote } from 'lucide-react';
import InboxMessageContent from '@/components/inbox/InboxMessageContent';
import { isMediaPlaceholder, messageMedia } from '@/lib/inbox/message-media';

type ChatMessage = {
  id: string;
  direction: 'inbound' | 'outbound' | 'internal';
  message_type: string;
  body: string | null;
  metadata?: Record<string, unknown> | null;
  delivery_status?: string | null;
  sent_at: string;
};

type ChatEvent = {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

type TimelineItem =
  | { kind: 'message'; at: string; message: ChatMessage }
  | { kind: 'event'; at: string; event: ChatEvent };

type Props = {
  timeline: TimelineItem[];
  customerName?: string | null;
  customerAvatarUrl?: string | null;
};

function initials(value?: string | null) {
  return (value || 'C')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'C';
}

function dayKey(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dateLabel(value: string) {
  const date = new Date(value);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((today.getTime() - target.getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function label(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function eventText(event: ChatEvent) {
  if (event.event_type === 'assigned') return `Assigned to ${String(event.payload.assigned_to_name || 'team member')}`;
  if (event.event_type === 'priority_changed') return `Priority changed to ${String(event.payload.priority || 'updated')}`;
  if (event.event_type === 'lifecycle_changed') return `Lifecycle changed to ${label(String(event.payload.lifecycle_key || 'updated'))}`;
  if (event.event_type === 'state_changed') return `Conversation ${String(event.payload.state || event.payload.to || 'updated')}`;
  if (event.event_type === 'next_action_changed') return 'Next action scheduled';
  if (event.event_type === 'contact_tag_changed') return `${String(event.payload.action || 'Tag')} ${String(event.payload.tag || '')}`.trim();
  return label(event.event_type);
}

function isMessage(item: TimelineItem | undefined): item is Extract<TimelineItem, { kind: 'message' }> {
  return item?.kind === 'message';
}

function grouped(a: TimelineItem | undefined, b: TimelineItem | undefined) {
  if (!isMessage(a) || !isMessage(b)) return false;
  if (a.message.direction !== b.message.direction || a.message.direction === 'internal') return false;
  if (dayKey(a.at) !== dayKey(b.at)) return false;
  return Math.abs(new Date(a.at).getTime() - new Date(b.at).getTime()) < 120_000;
}

export default function MetaConversationTimeline({ timeline, customerName, customerAvatarUrl }: Props) {
  return (
    <div className="mx-auto w-full max-w-[760px] pb-2">
      {timeline.map((item, index) => {
        const previous = timeline[index - 1];
        const next = timeline[index + 1];
        const showDate = !previous || dayKey(previous.at) !== dayKey(item.at);

        if (item.kind === 'event') {
          return (
            <Fragment key={`event-${item.event.id}`}>
              {showDate && <div className="my-5 text-center text-[11px] font-medium text-zinc-500">{dateLabel(item.at)}</div>}
              <div className="my-3 flex items-center justify-center gap-2 text-[11px] text-zinc-500">
                <span className="h-1 w-1 rounded-full bg-zinc-400" />
                <span>{eventText(item.event)}</span>
                <span className="font-mono text-[10px] text-zinc-400">{timeLabel(item.at)}</span>
              </div>
            </Fragment>
          );
        }

        const message = item.message;
        if (message.direction === 'internal') {
          return (
            <Fragment key={`message-${message.id}`}>
              {showDate && <div className="my-5 text-center text-[11px] font-medium text-zinc-500">{dateLabel(item.at)}</div>}
              <div className="my-4 flex justify-center">
                <div className="w-full max-w-[620px] border-l-2 border-amber-500 bg-amber-50/70 px-3 py-2.5 text-sm text-zinc-800">
                  <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-amber-700">
                    <StickyNote className="h-3.5 w-3.5" /> Internal note
                  </div>
                  <div className="whitespace-pre-wrap break-words leading-5">{message.body || '—'}</div>
                  <div className="mt-1.5 font-mono text-[10px] text-zinc-400">{timeLabel(message.sent_at)}</div>
                </div>
              </div>
            </Fragment>
          );
        }

        const inbound = message.direction === 'inbound';
        const joinedAbove = grouped(previous, item);
        const joinedBelow = grouped(item, next);
        const media = messageMedia(message.message_type, message.metadata);
        const mediaOnly = Boolean(media && (!message.body || isMediaPlaceholder(message.body)));
        const showMeta = !joinedBelow || message.delivery_status === 'failed' || message.delivery_status === 'sending';

        const radius = inbound
          ? `${joinedAbove ? 'rounded-tl-md' : 'rounded-tl-[18px]'} ${joinedBelow ? 'rounded-bl-md' : 'rounded-bl-[18px]'} rounded-r-[18px]`
          : `${joinedAbove ? 'rounded-tr-md' : 'rounded-tr-[18px]'} ${joinedBelow ? 'rounded-br-md' : 'rounded-br-[18px]'} rounded-l-[18px]`;

        return (
          <Fragment key={`message-${message.id}`}>
            {showDate && <div className="my-5 text-center text-[11px] font-medium text-zinc-500">{dateLabel(item.at)}</div>}
            <div className={`flex items-end gap-2 ${inbound ? 'justify-start' : 'justify-end'} ${joinedAbove ? 'mt-0.5' : 'mt-2.5'}`}>
              {inbound && <div className="w-7 shrink-0 self-end">
                {!joinedBelow && (customerAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={customerAvatarUrl} alt="" className="h-7 w-7 rounded-full object-cover ring-1 ring-zinc-200" />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-200 text-[9px] font-bold text-zinc-700">{initials(customerName)}</div>
                ))}
              </div>}

              <div className={`flex max-w-[78%] flex-col ${inbound ? 'items-start' : 'items-end'}`}>
                <div
                  className={`${radius} ${mediaOnly ? 'p-1' : 'px-3.5 py-2.5'} max-w-full overflow-hidden text-[14px] leading-[1.45] ${
                    inbound
                      ? 'bg-zinc-100 text-zinc-950'
                      : 'bg-[#0866ff] text-white'
                  }`}
                >
                  <InboxMessageContent message={message} />
                </div>
                {showMeta && <div className={`mt-1 flex items-center gap-1.5 px-1 font-mono text-[10px] text-zinc-400 ${inbound ? 'justify-start' : 'justify-end'}`}>
                  <span>{timeLabel(message.sent_at)}</span>
                  {message.delivery_status === 'failed' && <span className="font-sans font-semibold text-rose-600">Failed</span>}
                  {message.delivery_status === 'sending' && <span className="font-sans">Sending…</span>}
                </div>}
              </div>

              {!inbound && <div className="w-1 shrink-0" />}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
