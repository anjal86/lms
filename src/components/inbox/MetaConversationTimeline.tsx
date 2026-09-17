'use client';

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Bot, Check, ChevronLeft, ChevronRight, Clipboard, ListTodo, MoreHorizontal, Reply, RotateCcw, StickyNote, X } from 'lucide-react';
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
  client_request_id?: string | null;
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
  isAiReplying?: boolean;
  aiAgentName?: string;
  onTakeover?: () => void;
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
function stableMessageKey(message: ChatMessage) {
  if (message.client_request_id) return `request:${message.client_request_id}`;
  if (message.id.startsWith('optimistic:')) return `request:${message.id.slice('optimistic:'.length)}`;
  return `message:${message.id}`;
}
function mergeMessages(previous: ChatMessage, incoming: ChatMessage): ChatMessage {
  const preferIncomingId = previous.id.startsWith('optimistic:') && !incoming.id.startsWith('optimistic:');
  return {
    ...previous,
    ...incoming,
    id: preferIncomingId ? incoming.id : incoming.id || previous.id,
    client_request_id: incoming.client_request_id || previous.client_request_id || (previous.id.startsWith('optimistic:') ? previous.id.slice('optimistic:'.length) : null),
    metadata: { ...(previous.metadata || {}), ...(incoming.metadata || {}) },
    author_profile: incoming.author_profile || previous.author_profile,
    delivery_status: incoming.delivery_status || previous.delivery_status,
    failure_message: incoming.failure_message || previous.failure_message,
  };
}

export default function MetaConversationTimeline({
  timeline,
  customerName,
  customerAvatarUrl,
  onQuote,
  onAddNote,
  onCreateTask,
  onRetry,
  isAiReplying,
  aiAgentName,
  onTakeover,
}: Props) {
  const renderedTimeline = useMemo(() => {
    const result: TimelineItem[] = [];
    const messageIndex = new Map<string, number>();

    for (const item of timeline) {
      if (item.kind === 'event') {
        result.push(item);
        continue;
      }

      const key = stableMessageKey(item.message);
      const existingIndex = messageIndex.get(key);
      if (existingIndex === undefined) {
        messageIndex.set(key, result.length);
        result.push(item);
        continue;
      }

      const existing = result[existingIndex];
      if (existing?.kind === 'message') {
        const merged = mergeMessages(existing.message, item.message);
        result[existingIndex] = { kind: 'message', at: merged.sent_at || item.at, message: merged };
      }
    }

    return result;
  }, [timeline]);

  const mediaItems = useMemo(() => renderedTimeline.flatMap((item) => {
    if (item.kind !== 'message') return [];
    const media = messageMedia(item.message.message_type, item.message.metadata);
    if (!media || !media.url || !['image', 'video'].includes(media.kind)) return [];
    return [{ key: stableMessageKey(item.message), media }];
  }), [renderedTimeline]);
  const mediaIndexByKey = useMemo(() => new Map(mediaItems.map((item, index) => [item.key, index])), [mediaItems]);
  const firstMessageKey = useMemo(() => {
    const first = renderedTimeline.find((item) => item.kind === 'message');
    return first?.kind === 'message' ? stableMessageKey(first.message) : '';
  }, [renderedTimeline]);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const scrollState = useRef({ top: 0, height: 0, nearBottom: true, firstKey: '' });
  const copiedTimer = useRef<number | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [openActionsKey, setOpenActionsKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const lightbox = lightboxIndex === null ? null : mediaItems[lightboxIndex];

  useEffect(() => {
    const pane = rootRef.current?.closest<HTMLElement>('[aria-label="Message history"]');
    if (!pane) return;
    const capture = () => {
      scrollState.current = {
        ...scrollState.current,
        top: pane.scrollTop,
        height: pane.scrollHeight,
        nearBottom: pane.scrollHeight - pane.scrollTop - pane.clientHeight < 140,
      };
    };
    capture();
    pane.addEventListener('scroll', capture, { passive: true });
    return () => pane.removeEventListener('scroll', capture);
  }, []);

  useLayoutEffect(() => {
    const pane = rootRef.current?.closest<HTMLElement>('[aria-label="Message history"]');
    if (!pane) return;
    const previous = scrollState.current;
    const nextHeight = pane.scrollHeight;

    if (!previous.nearBottom && previous.height > 0) {
      const prepended = Boolean(previous.firstKey && firstMessageKey && previous.firstKey !== firstMessageKey);
      const targetTop = prepended
        ? Math.max(0, previous.top + (nextHeight - previous.height))
        : previous.top;

      pane.scrollTop = targetTop;
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (!pane.isConnected) return;
          pane.scrollTop = targetTop;
          scrollState.current = {
            top: targetTop,
            height: pane.scrollHeight,
            nearBottom: pane.scrollHeight - targetTop - pane.clientHeight < 140,
            firstKey: firstMessageKey,
          };
        });
      });
    } else {
      scrollState.current = {
        top: pane.scrollTop,
        height: nextHeight,
        nearBottom: pane.scrollHeight - pane.scrollTop - pane.clientHeight < 140,
        firstKey: firstMessageKey,
      };
    }
  }, [firstMessageKey, renderedTimeline]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!openActionsKey) return;
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-message-actions]') : null;
      if (target?.dataset.messageActions === openActionsKey) return;
      setOpenActionsKey(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenActionsKey(null);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
    };
  }, [openActionsKey]);

  const copyMessage = async (message: ChatMessage, key: string) => {
    const text = message.body || '';
    if (!text) return;
    try {
      await navigator.clipboard?.writeText(text);
      setCopiedKey(key);
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopiedKey(null), 1200);
    } catch { /* clipboard is optional */ }
  };

  return <>
    <div ref={rootRef} className="mx-auto w-full max-w-[880px] pb-2">
      {renderedTimeline.map((item, index) => {
        const previous = renderedTimeline[index - 1];
        const next = renderedTimeline[index + 1];
        const showDate = !previous || dayKey(previous.at) !== dayKey(item.at);

        if (item.kind === 'event') {
          if (previous?.kind === 'event' && dayKey(previous.at) === dayKey(item.at) && new Date(item.at).getTime() - new Date(previous.at).getTime() < 90_000) return null;
          const groupedEvents = [item];
          for (let cursor = index + 1; cursor < renderedTimeline.length; cursor += 1) {
            const candidate = renderedTimeline[cursor];
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
        const messageKey = stableMessageKey(message);
        if (message.direction === 'internal') {
          return <Fragment key={messageKey}>
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
        const mediaIndex = mediaIndexByKey.get(messageKey);
        const menuOpen = openActionsKey === messageKey;
        const sending = message.delivery_status === 'sending';
        const failed = message.delivery_status === 'failed';

        const actions = (
          <div
            data-message-actions={messageKey}
            className={`absolute bottom-0 z-30 ${inbound ? 'left-[calc(100%+0.5rem)]' : 'right-[calc(100%+0.5rem)]'} ${menuOpen ? 'pointer-events-auto translate-y-0 opacity-100' : 'pointer-events-none translate-y-0.5 opacity-0 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100'} transition duration-150`}
          >
            <div className="flex items-center gap-0.5 rounded-full border border-zinc-200/90 bg-white/95 p-0.5 shadow-sm backdrop-blur">
              {onQuote && <button type="button" aria-label="Reply to message" title="Reply" onClick={() => onQuote(message)} className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"><Reply className="h-3.5 w-3.5" /></button>}
              <button type="button" aria-label="Copy message" title="Copy" onClick={() => void copyMessage(message, messageKey)} disabled={!message.body} className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 disabled:opacity-35">{copiedKey === messageKey ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Clipboard className="h-3.5 w-3.5" />}</button>
              <button type="button" aria-label="More message actions" title="More actions" aria-expanded={menuOpen} onClick={() => setOpenActionsKey((current) => current === messageKey ? null : messageKey)} className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"><MoreHorizontal className="h-3.5 w-3.5" /></button>
            </div>

            {menuOpen && <div role="menu" className={`absolute top-9 w-44 overflow-hidden rounded-xl border border-zinc-200 bg-white p-1 shadow-xl ${inbound ? 'left-0' : 'right-0'}`}>
              {onAddNote && <button type="button" role="menuitem" onClick={() => { setOpenActionsKey(null); onAddNote(message); }} className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs font-medium text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950"><StickyNote className="h-3.5 w-3.5 text-zinc-400" /> Add internal note</button>}
              {onCreateTask && <button type="button" role="menuitem" onClick={() => { setOpenActionsKey(null); onCreateTask(message); }} className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs font-medium text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950"><ListTodo className="h-3.5 w-3.5 text-zinc-400" /> Create task</button>}
              {failed && onRetry && <><div className="my-1 border-t border-zinc-100" /><button type="button" role="menuitem" onClick={() => { setOpenActionsKey(null); onRetry(message); }} className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50"><RotateCcw className="h-3.5 w-3.5" /> Retry message</button></>}
            </div>}
          </div>
        );

        return <Fragment key={messageKey}>
          {showDate && <div className="my-5 text-center text-[11px] font-medium text-zinc-500">{dateLabel(item.at)}</div>}
          <div className={`group relative flex items-end gap-1.5 ${inbound ? 'justify-start' : 'justify-end'} ${joinedAbove ? 'mt-0.5' : 'mt-2.5'}`}>
            {inbound && <div className="w-7 shrink-0 self-end">{!joinedBelow && (customerAvatarUrl ? <img src={customerAvatarUrl} alt="" className="h-7 w-7 rounded-full object-cover ring-1 ring-zinc-200" /> : <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-200 text-[9px] font-bold text-zinc-700">{initials(customerName)}</div>)}</div>}

            <div className={`relative flex max-w-[78%] flex-col ${inbound ? 'items-start' : 'items-end'}`}>
              <div className={`${radius} ${mediaOnly ? 'p-1' : 'px-3.5 py-2.5'} ${sending ? 'opacity-80' : ''} ${failed ? 'ring-1 ring-rose-300' : ''} max-w-full overflow-hidden text-[14px] leading-[1.45] transition-[opacity,box-shadow,background-color] duration-150 ${inbound ? 'bg-zinc-100 text-zinc-950' : 'bg-[#0866ff] text-white'}`}>
                <InboxMessageContent message={message} onOpenMedia={mediaIndex === undefined ? undefined : () => setLightboxIndex(mediaIndex)} />
              </div>
              {actions}
              {showMeta && <div className={`mt-1 flex items-center gap-1.5 px-1 font-mono text-[10px] text-zinc-400 ${inbound ? 'justify-start' : 'justify-end'}`} title={message.failure_message || undefined}>
                {!inbound && message.author_profile?.full_name && <span className="font-sans">{message.author_profile.full_name}</span>}
                <span>{timeLabel(message.sent_at)}</span>
                {!inbound && deliveryText(message.delivery_status) && <span className={`font-sans ${failed ? 'font-semibold text-rose-600' : ''}`}>{deliveryText(message.delivery_status)}</span>}
                {failed && onRetry && <button type="button" onClick={() => onRetry(message)} className="font-sans font-semibold text-rose-600 hover:underline">Retry</button>}
              </div>}
            </div>

            {!inbound && <div className="w-1 shrink-0" />}
          </div>
        </Fragment>;
      })}
      {isAiReplying && (
        <div className="mt-3 flex items-end gap-1.5 justify-end">
          <div className="flex max-w-[80%] flex-col items-end">
            <div className="flex items-center gap-2 rounded-xl rounded-br-xs border border-zinc-200 bg-zinc-100/90 px-3.5 py-2.5 text-xs text-zinc-700 shadow-2xs">
              <Bot className="h-3.5 w-3.5 text-blue-600 animate-pulse shrink-0" />
              <span className="font-medium text-zinc-800">{aiAgentName || 'AI Agent'}</span>
              <span className="text-zinc-500">is typing</span>
              <span className="inline-flex items-center gap-1 ml-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-bounce [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-bounce [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-bounce" />
              </span>
              {onTakeover && (
                <button
                  type="button"
                  onClick={onTakeover}
                  className="ml-2 rounded border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950 transition-colors shadow-2xs"
                >
                  Take over
                </button>
              )}
            </div>
            <div className="mt-1 px-1 font-mono text-[10px] text-zinc-400">
              Formulating automated reply…
            </div>
          </div>
        </div>
      )}
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
