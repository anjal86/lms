'use client';

import { Fragment, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Clipboard, ListTodo, Reply, RotateCcw, StickyNote, X } from 'lucide-react';
import InboxMessageContent from '@/components/inbox/InboxMessageContent';
import { isMediaPlaceholder, messageMedia } from '@/lib/inbox/message-media';

type ChatMessage = {
  id: string;
  direction: 'inbound' | 'outbound' | 'internal';
  message_type: string;
  body: string | null;
  metadata?: Record<string, unknown> | null;
  delivery_status?: string | null;
  failure_message?: string | null;
  sent_at: string;
  author_profile?: { full_name?: string | null } | null;
};

type ChatEvent = {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
  actor_id?: string | null;
  actor?: { full_name?: string | null } | null;
};

type TimelineItem =
  | { kind: 'message'; at: string; message: ChatMessage }
  | { kind: 'event'; at: string; event: ChatEvent };

type Props = {
  timeline: TimelineItem[];
  customerName?: string | null;
  customerAvatarUrl?: string | null;
  onQuote?: (message: ChatMessage) => void;
  onAddNote?: (message: ChatMessage) => void;
  onCreateTask?: (message: ChatMessage) => void;
  onRetry?: (message: ChatMessage) => void;
};

function initials(value?: string | null) {
  return (value || 'C').trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'C';
}
function dayKey(value: string) { const date = new Date(value); return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`; }
function dateLabel(value: string) {
  const date = new Date(value); const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((today.getTime() - target.getTime()) / 86_400_000);
  if (days === 0) return 'Today'; if (days === 1) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}
function timeLabel(value: string) { return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function label(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase()); }
function eventText(event: ChatEvent) {
  if (event.event_type === 'collaborator_added' || event.event_type === 'collaborator_removed') {
    const collaboratorId = typeof event.payload.collaborator_id === 'string' ? event.payload.collaborator_id : null;
    const collaboratorName = String(event.payload.collaborator_name || 'team member');
    const actorName = event.actor?.full_name || 'Team member';
    const selfChange = Boolean(event.actor_id && collaboratorId && event.actor_id === collaboratorId);
    if (event.event_type === 'collaborator_added') return selfChange ? `${collaboratorName} joined as collaborator` : `${actorName} added ${collaboratorName}`;
    return selfChange ? `${collaboratorName} left as collaborator` : `${actorName} removed ${collaboratorName}`;
  }
  if (event.event_type === 'assigned') return `Assigned to ${String(event.payload.assigned_to_name || 'team member')}`;
  if (event.event_type === 'priority_changed') return `Priority → ${String(event.payload.priority || 'updated')}`;
  if (event.event_type === 'lifecycle_changed') return `Lifecycle → ${label(String(event.payload.lifecycle_key || 'updated'))}`;
  if (event.event_type === 'state_changed') return `Conversation ${String(event.payload.state || event.payload.to || 'updated')}`;
  if (event.event_type === 'next_action_changed') return 'Next action scheduled';
  if (event.event_type === 'contact_tag_changed') return `${String(event.payload.action || 'Tag')} ${String(event.payload.tag || '')}`.trim();
  return label(event.event_type);
}
function isMessage(item: TimelineItem | undefined): item is Extract<TimelineItem, { kind: 'message' }> { return item?.kind === 'message'; }
function grouped(a: TimelineItem | undefined, b: TimelineItem | undefined) {
  if (!isMessage(a) || !isMessage(b)) return false;
  if (a.message.direction !== b.message.direction || a.message.direction === 'internal') return false;
  if (dayKey(a.at) !== dayKey(b.at)) return false;
  return Math.abs(new Date(a.at).getTime() - new Date(b.at).getTime()) < 120_000;
}
function deliveryText(status?: string | null) {
  if (status === 'sending') return 'Sending…';
  if (status === 'failed') return 'Failed';
  if (status === 'delivered') return 'Delivered';
  if (status === 'read') return 'Read';
  return status === 'sent' ? 'Sent' : '';
}

export default function MetaConversationTimeline({ timeline, customerName, customerAvatarUrl, onQuote, onAddNote, onCreateTask, onRetry }: Props) {
  const mediaItems = useMemo(() => timeline.flatMap((item) => {
    if (item.kind !== 'message') return [];
    const media = messageMedia(item.message.message_type, item.message.metadata);
    if (!media || !media.url || !['image', 'video'].includes(media.kind)) return [];
    return [{ id: item.message.id, media }];
  }), [timeline]);
  const mediaIndexById = useMemo(() => new Map(mediaItems.map((item, index) => [item.id, index])), [mediaItems]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const lightbox = lightboxIndex === null ? null : mediaItems[lightboxIndex];

  return <>
    <div className="mx-auto w-full max-w-[880px] pb-2">
      {timeline.map((item, index) => {
        const previous = timeline[index - 1];
        const next = timeline[index + 1];
        const showDate = !previous || dayKey(previous.at) !== dayKey(item.at);

        if (item.kind === 'event') {
          if (previous?.kind === 'event' && dayKey(previous.at) === dayKey(item.at) && new Date(item.at).getTime() - new Date(previous.at).getTime() < 90_000) return null;
          const groupedEvents = [item];
          for (let cursor = index + 1; cursor < timeline.length; cursor += 1) {
            const candidate = timeline[cursor];
            if (candidate.kind !== 'event' || dayKey(candidate.at) !== dayKey(item.at) || new Date(candidate.at).getTime() - new Date(item.at).getTime() >= 90_000) break;
            groupedEvents.push(candidate);
          }
          return <Fragment key={`event-${item.event.id}`}>
            {showDate && <div className="my-5 text-center text-[11px] font-medium text-zinc-500">{dateLabel(item.at)}</div>}
            <div className="my-3 flex justify-center px-8 text-center text-[11px] text-zinc-400">
              <span>{groupedEvents.map((entry) => eventText(entry.event)).join(' · ')} · {timeLabel(item.at)}</span>
            </div>
          </Fragment>;
        }

        const message = item.message;
        if (message.direction === 'internal') {
          return <Fragment key={`message-${message.id}`}>
            {showDate && <div className="my-5 text-center text-[11px] font-medium text-zinc-500">{dateLabel(item.at)}</div>}
            <div className="group relative my-4 flex justify-center">
              <div className="w-full max-w-[660px] rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-zinc-800">
                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-amber-700"><StickyNote className="h-3.5 w-3.5" /> Internal note{message.author_profile?.full_name ? ` · ${message.author_profile.full_name}` : ''}</div>
                <div className="whitespace-pre-wrap break-words leading-5">{message.body || '—'}</div>
                <div className="mt-1.5 font-mono text-[10px] text-zinc-400">{timeLabel(message.sent_at)}</div>
              </div>
            </div>
          </Fragment>;
        }

        const inbound = message.direction === 'inbound';
        const joinedAbove = grouped(previous, item);
        const joinedBelow = grouped(item, next);
        const media = messageMedia(message.message_type, message.metadata);
        const mediaOnly = Boolean(media && (!message.body || isMediaPlaceholder(message.body)));
        const showMeta = !joinedBelow || ['failed', 'sending', 'delivered', 'read'].includes(message.delivery_status || '');
        const radius = inbound
          ? `${joinedAbove ? 'rounded-tl-md' : 'rounded-tl-[18px]'} ${joinedBelow ? 'rounded-bl-md' : 'rounded-bl-[18px]'} rounded-r-[18px]`
          : `${joinedAbove ? 'rounded-tr-md' : 'rounded-tr-[18px]'} ${joinedBelow ? 'rounded-br-md' : 'rounded-br-[18px]'} rounded-l-[18px]`;
        const mediaIndex = mediaIndexById.get(message.id);
        const actions = (
          <div className="mb-1 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            {onQuote && (
              <button
                type="button"
                aria-label="Quote in reply"
                title="Quote in reply"
                onClick={() => onQuote(message)}
                className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
              >
                <Reply className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              aria-label="Copy message"
              title="Copy message"
              onClick={() => void navigator.clipboard?.writeText(message.body || '')}
              className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
            >
              <Clipboard className="h-3.5 w-3.5" />
            </button>
            {onAddNote && (
              <button
                type="button"
                aria-label="Add internal note"
                title="Add internal note"
                onClick={() => onAddNote(message)}
                className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
              >
                <StickyNote className="h-3.5 w-3.5" />
              </button>
            )}
            {onCreateTask && (
              <button
                type="button"
                aria-label="Create task"
                title="Create task"
                onClick={() => onCreateTask(message)}
                className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
              >
                <ListTodo className="h-3.5 w-3.5" />
              </button>
            )}
            {message.delivery_status === 'failed' && onRetry && (
              <button
                type="button"
                aria-label="Retry failed message"
                title="Retry failed message"
                onClick={() => onRetry(message)}
                className="rounded-md p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        );

        return <Fragment key={`message-${message.id}`}>
          {showDate && <div className="my-5 text-center text-[11px] font-medium text-zinc-500">{dateLabel(item.at)}</div>}
          <div className={`group relative flex items-end gap-1.5 ${inbound ? 'justify-start' : 'justify-end'} ${joinedAbove ? 'mt-0.5' : 'mt-2.5'}`}>
            {inbound && <div className="w-7 shrink-0 self-end">{!joinedBelow && (customerAvatarUrl ? <img src={customerAvatarUrl} alt="" className="h-7 w-7 rounded-full object-cover ring-1 ring-zinc-200" /> : <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-200 text-[9px] font-bold text-zinc-700">{initials(customerName)}</div>)}</div>}

            {!inbound && actions}

            <div className={`flex max-w-[78%] flex-col ${inbound ? 'items-start' : 'items-end'}`}>
              <div className={`${radius} ${mediaOnly ? 'p-1' : 'px-3.5 py-2.5'} max-w-full overflow-hidden text-[14px] leading-[1.45] ${inbound ? 'bg-zinc-100 text-zinc-950' : 'bg-[#0866ff] text-white'}`}>
                <InboxMessageContent message={message} onOpenMedia={mediaIndex === undefined ? undefined : () => setLightboxIndex(mediaIndex)} />
              </div>
              {showMeta && <div className={`mt-1 flex items-center gap-1.5 px-1 font-mono text-[10px] text-zinc-400 ${inbound ? 'justify-start' : 'justify-end'}`} title={message.failure_message || undefined}>
                {!inbound && message.author_profile?.full_name && <span className="font-sans">{message.author_profile.full_name}</span>}
                <span>{timeLabel(message.sent_at)}</span>
                {!inbound && deliveryText(message.delivery_status) && <span className={`font-sans ${message.delivery_status === 'failed' ? 'font-semibold text-rose-600' : ''}`}>{deliveryText(message.delivery_status)}</span>}
                {message.delivery_status === 'failed' && onRetry && <button type="button" onClick={() => onRetry(message)} className="font-sans font-semibold text-rose-600 hover:underline">Retry</button>}
              </div>}
            </div>

            {inbound && actions}

            {!inbound && <div className="w-1 shrink-0" />}
          </div>
        </Fragment>;
      })}
    </div>

    {lightbox && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4" onClick={() => setLightboxIndex(null)}>
      <button type="button" aria-label="Close media" onClick={() => setLightboxIndex(null)} className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"><X className="h-5 w-5" /></button>
      {mediaItems.length > 1 && <button type="button" aria-label="Previous media" onClick={(event) => { event.stopPropagation(); setLightboxIndex((current) => current === null ? 0 : (current - 1 + mediaItems.length) % mediaItems.length); }} className="absolute left-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"><ChevronLeft className="h-6 w-6" /></button>}
      <div className="max-h-[88vh] max-w-[88vw]" onClick={(event) => event.stopPropagation()}>
        {lightbox.media.kind === 'image' ? <img src={lightbox.media.url || ''} alt={lightbox.media.fileName || 'Conversation attachment'} className="max-h-[88vh] max-w-[88vw] object-contain" /> : <video src={lightbox.media.url || ''} controls autoPlay className="max-h-[88vh] max-w-[88vw]" />}
      </div>
      {mediaItems.length > 1 && <button type="button" aria-label="Next media" onClick={(event) => { event.stopPropagation(); setLightboxIndex((current) => current === null ? 0 : (current + 1) % mediaItems.length); }} className="absolute right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"><ChevronRight className="h-6 w-6" /></button>}
      <div className="absolute bottom-4 text-xs text-white/70">{(lightboxIndex || 0) + 1} / {mediaItems.length}</div>
    </div>}
  </>;
}
