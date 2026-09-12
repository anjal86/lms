'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Copy,
  Download,
  ExternalLink,
  Facebook,
  FileText,
  Image as ImageIcon,
  Inbox as InboxIcon,
  Instagram,
  Loader2,
  Mail,
  Maximize2,
  MessageCircle,
  MessageSquare,
  Music,
  PanelRight,
  RefreshCw,
  Search,
  Send,
  StickyNote,
  UserCheck,
  X,
} from 'lucide-react';
import { useApp } from '@/lib/store';
import ConvertToLeadDrawer from '@/components/inbox/ConvertToLeadDrawer';

type UnknownRecord = Record<string, unknown>;

type Conversation = {
  id: string;
  lead_id: string | null;
  connection_id: string | null;
  provider: string;
  external_thread_id: string | null;
  external_contact_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_avatar_url: string | null;
  last_message_preview: string | null;
  status: 'open' | 'closed' | 'archived';
  unread_count: number;
  assigned_to: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  converted_at?: string | null;
  metadata?: {
    meta_page_id?: string;
    meta_page_name?: string;
    meta_link?: string;
    can_reply?: boolean;
    is_subscribed?: boolean;
    message_count?: number;
    scoped_thread_key?: string;
    customer_id?: string;
    customer_email?: string;
    last_customer_message_at?: string;
    shared_photos_count?: number;
    shared_files_count?: number;
    synced_at?: string;
    [key: string]: unknown;
  } | null;
  lead?: {
    id: string;
    customer_name: string;
    destination: string;
    stage: string;
    priority: string;
    assigned_to: string | null;
    created_at: string;
  } | null;
  assigned_profile?: {
    id: string;
    full_name: string | null;
    email: string;
    role: string;
  } | null;
};

type Message = {
  id: string;
  conversation_id: string;
  lead_id: string | null;
  provider: string;
  direction: 'inbound' | 'outbound' | 'internal';
  message_type: string;
  body: string | null;
  metadata?: UnknownRecord | null;
  delivery_status?: 'queued' | 'pending' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed' | null;
  client_request_id?: string | null;
  failure_code?: string | null;
  failure_message?: string | null;
  sent_at: string;
  created_by: string | null;
  author_profile?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    role: string;
  } | null;
};

type ParsedAttachment = {
  id: string;
  type: 'image' | 'video' | 'audio' | 'file';
  url: string;
  previewUrl: string;
  name: string;
  size?: number;
};

const LIST_POLL_MS = 18_000;
const THREAD_POLL_MS = 7_000;
const OUTBOUND_PROVIDERS = new Set(['facebook', 'instagram', 'whatsapp']);
const PROVIDER_ICONS: Record<string, React.ElementType> = {
  facebook: Facebook,
  instagram: Instagram,
  whatsapp: MessageCircle,
  email: Mail,
};

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {};
}

function getSafeMediaUrl(url?: string | null) {
  if (!url) return '';
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('/api/media/proxy')) return url;
  return `/api/media/proxy?url=${encodeURIComponent(url)}`;
}

function extractAttachments(message: Message): ParsedAttachment[] {
  const metadata = message.metadata || {};
  const attachments = record(metadata.attachments);
  const rawList = Array.isArray(attachments.data) ? attachments.data : [];

  const parsed = rawList.flatMap((raw, index) => {
    const item = record(raw);
    const image = record(item.image_data);
    const video = record(item.video_data);
    const mime = typeof item.mime_type === 'string' ? item.mime_type : '';
    const name = typeof item.name === 'string' ? item.name : '';
    const imageUrl = typeof image.url === 'string' ? image.url : mime.startsWith('image/') && typeof item.file_url === 'string' ? item.file_url : '';
    const videoUrl = typeof video.url === 'string' ? video.url : mime.startsWith('video/') && typeof item.file_url === 'string' ? item.file_url : '';
    const audioUrl = (mime.startsWith('audio/') || name.includes('audioclip')) && typeof item.file_url === 'string' ? item.file_url : '';
    const fileUrl = typeof item.file_url === 'string' ? item.file_url : '';
    const url = imageUrl || videoUrl || audioUrl || fileUrl;
    if (!url) return [];

    const type: ParsedAttachment['type'] = imageUrl ? 'image' : videoUrl ? 'video' : audioUrl ? 'audio' : 'file';
    return [{
      id: typeof item.id === 'string' ? item.id : `${message.id}-${index}`,
      type,
      url,
      previewUrl: typeof image.preview_url === 'string' ? image.preview_url : imageUrl || url,
      name: name || (type === 'image' ? 'Photo' : type === 'audio' ? 'Voice note' : 'Attachment'),
      size: typeof item.size === 'number' ? item.size : undefined,
    }];
  });
  if (parsed.length) return parsed;

  const singleUrl = typeof metadata.attachment_url === 'string'
    ? metadata.attachment_url
    : typeof metadata.preview_url === 'string'
      ? metadata.preview_url
      : '';
  if (!singleUrl) return [];

  const type: ParsedAttachment['type'] = message.message_type === 'image'
    ? 'image'
    : message.message_type === 'audio'
      ? 'audio'
      : message.message_type === 'video'
        ? 'video'
        : 'file';
  return [{
    id: message.id,
    type,
    url: singleUrl,
    previewUrl: typeof metadata.preview_url === 'string' ? metadata.preview_url : singleUrl,
    name: typeof metadata.file_name === 'string' ? metadata.file_name : type === 'image' ? 'Photo' : 'Attachment',
    size: typeof metadata.file_size === 'number' ? metadata.file_size : undefined,
  }];
}

function formatTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function mergeMessage(list: Message[], message: Message) {
  const existing = list.findIndex((item) => item.id === message.id);
  if (existing >= 0) {
    const next = [...list];
    next[existing] = message;
    return next;
  }
  return [...list, message].sort((a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime());
}

function deliveryLabel(message: Message) {
  if (message.direction !== 'outbound') return null;
  switch (message.delivery_status) {
    case 'failed': return { text: 'Failed', className: 'text-red-600', icon: X };
    case 'read': return { text: 'Read', className: 'text-blue-600', icon: CheckCheck };
    case 'delivered': return { text: 'Delivered', className: 'text-zinc-500', icon: CheckCheck };
    case 'sending':
    case 'queued':
    case 'pending': return { text: 'Sending', className: 'text-zinc-400', icon: Loader2 };
    default: return { text: 'Sent', className: 'text-zinc-500', icon: Check };
  }
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

export default function InboxPage() {
  const { currentUser, templates, showToast } = useApp();
  const [filter, setFilter] = useState<'unconverted' | 'all' | 'mine' | 'converted'>('unconverted');
  const [providerFilter, setProviderFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [metrics, setMetrics] = useState({ unconvertedOpen: 0, totalOpen: 0 });
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [replyMode, setReplyMode] = useState<'outbound' | 'internal'>('outbound');
  const [isSending, setIsSending] = useState(false);
  const [isConvertDrawerOpen, setIsConvertDrawerOpen] = useState(false);
  const [isSyncingMeta, setIsSyncingMeta] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<'details' | 'media'>('details');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const listAbortRef = useRef<AbortController | null>(null);
  const listSequenceRef = useRef(0);
  const liveSyncAbortRef = useRef<AbortController | null>(null);
  const liveSyncInFlightRef = useRef(false);
  const selectedIdRef = useRef<string | null>(null);
  const inspectorCloseRef = useRef<HTMLButtonElement>(null);
  const lightboxCloseRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const sharedMedia = useMemo(() => {
    const photos: Array<ParsedAttachment & { sentAt: string }> = [];
    const audios: Array<ParsedAttachment & { sentAt: string }> = [];
    const files: Array<ParsedAttachment & { sentAt: string }> = [];
    for (const message of messages) {
      for (const attachment of extractAttachments(message)) {
        const item = { ...attachment, sentAt: message.sent_at };
        if (attachment.type === 'image') photos.push(item);
        else if (attachment.type === 'audio') audios.push(item);
        else files.push(item);
      }
    }
    return { photos, audios, files, total: photos.length + audios.length + files.length };
  }, [messages]);

  const replyWindow = useMemo(() => {
    if (!activeConversation || !['facebook', 'instagram', 'whatsapp'].includes(activeConversation.provider)) return null;
    const lastInbound = [...messages].reverse().find((message) => message.direction === 'inbound');
    const lastInboundAt = activeConversation.metadata?.last_customer_message_at || lastInbound?.sent_at;
    if (!lastInboundAt) return { isOpen: activeConversation.metadata?.can_reply !== false, label: 'No traveler timestamp' };
    const remaining = 24 * 60 * 60 * 1000 - (Date.now() - new Date(lastInboundAt).getTime());
    const isOpen = remaining > 0 && activeConversation.metadata?.can_reply !== false;
    const hours = Math.max(0, Math.floor(remaining / 3_600_000));
    const minutes = Math.max(0, Math.floor((remaining % 3_600_000) / 60_000));
    return { isOpen, label: isOpen ? `${hours}h ${minutes}m` : 'Expired' };
  }, [activeConversation, messages]);

  const canSendOutbound = Boolean(
    activeConversation &&
    OUTBOUND_PROVIDERS.has(activeConversation.provider) &&
    replyWindow?.isOpen !== false
  );

  const handleCopy = (text: string, key: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 1600);
  };

  const runLiveMetaSync = useCallback(async () => {
    if (typeof document !== 'undefined' && document.hidden) return;
    if (liveSyncInFlightRef.current) return;

    const controller = new AbortController();
    liveSyncAbortRef.current = controller;
    liveSyncInFlightRef.current = true;
    try {
      const response = await fetch('/api/conversations/sync?mode=live', {
        method: 'POST',
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!response.ok && response.status !== 502) {
        console.warn('Live Meta sync returned', response.status);
      }
    } catch (error) {
      if (!controller.signal.aborted && !isAbortError(error)) {
        console.warn('Live Meta sync failed:', error);
      }
    } finally {
      if (liveSyncAbortRef.current === controller) liveSyncAbortRef.current = null;
      liveSyncInFlightRef.current = false;
    }
  }, []);

  const loadConversations = useCallback(async (selectFirst = false, silent = false) => {
    if (silent && typeof document !== 'undefined' && document.hidden) return;
    listAbortRef.current?.abort();
    const controller = new AbortController();
    listAbortRef.current = controller;
    const sequence = ++listSequenceRef.current;
    if (!silent) setIsLoadingList(true);

    try {
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('filter', filter);
      if (providerFilter !== 'all') params.set('provider', providerFilter);
      if (debouncedSearch) params.set('search', debouncedSearch);
      const response = await fetch(`/api/conversations?${params.toString()}`, { signal: controller.signal, cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load inbox.');
      if (sequence !== listSequenceRef.current || controller.signal.aborted) return;
      const incoming = Array.isArray(data.conversations) ? data.conversations as Conversation[] : [];
      setConversations(incoming);
      if (data.metrics) setMetrics(data.metrics);

      if (selectFirst && incoming.length && !selectedIdRef.current && window.matchMedia('(min-width: 768px)').matches) {
        setSelectedId(incoming[0].id);
      }
      if (selectedIdRef.current && !incoming.some((conversation) => conversation.id === selectedIdRef.current)) {
        setSelectedId(null);
      }
    } catch (error) {
      if (!controller.signal.aborted && !isAbortError(error)) {
        console.error('Failed to load conversations:', error);
        if (!silent) showToast('Unable to load inbox conversations.', 'error');
      }
    } finally {
      if (!silent && sequence === listSequenceRef.current) setIsLoadingList(false);
    }
  }, [filter, providerFilter, debouncedSearch, showToast]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await loadConversations(true);
      await runLiveMetaSync();
      if (!cancelled) await loadConversations(false, true);
    })();
    return () => {
      cancelled = true;
      listAbortRef.current?.abort();
    };
  }, [loadConversations, runLiveMetaSync]);

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    const poll = async () => {
      if (stopped) return;
      if (!document.hidden) {
        await runLiveMetaSync();
        if (!stopped) await loadConversations(false, true);
      }
      if (!stopped) timer = window.setTimeout(poll, LIST_POLL_MS);
    };
    timer = window.setTimeout(poll, LIST_POLL_MS);
    const onVisibility = () => {
      if (!document.hidden) {
        void (async () => {
          await runLiveMetaSync();
          if (!stopped) await loadConversations(false, true);
        })();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [loadConversations, runLiveMetaSync]);

  useEffect(() => {
    if (!selectedId) {
      setActiveConversation(null);
      setMessages([]);
      return;
    }

    let stopped = false;
    let timer: number | undefined;
    let controller: AbortController | null = null;
    let inFlight = false;
    let sequence = 0;

    const loadThread = async (showLoading = false) => {
      if (stopped || inFlight || (document.hidden && !showLoading)) return;
      inFlight = true;
      const requestController = new AbortController();
      controller = requestController;
      const requestSequence = ++sequence;
      if (showLoading) setIsLoadingMessages(true);
      try {
        await runLiveMetaSync();
        if (stopped || requestController.signal.aborted) return;

        const response = await fetch(`/api/conversations/${selectedId}`, {
          signal: requestController.signal,
          cache: 'no-store',
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to load conversation.');
        if (stopped || requestController.signal.aborted || requestSequence !== sequence) return;

        const conversation = data.conversation as Conversation;
        const incoming = Array.isArray(data.messages) ? data.messages as Message[] : [];
        setActiveConversation(conversation);
        setMessages((previous) => {
          const newest = incoming.at(-1);
          const previousNewest = previous.at(-1);
          if (previous.length > 0 && newest?.direction === 'inbound' && newest.id !== previousNewest?.id) {
            setLiveAnnouncement(`New message from ${conversation.customer_name || 'traveler'}: ${newest.body || newest.message_type}`);
          }
          if (previous.length === incoming.length && previousNewest?.id === newest?.id && previousNewest?.delivery_status === newest?.delivery_status) return previous;
          return incoming;
        });

        if (conversation.unread_count > 0) {
          void fetch(`/api/conversations/${selectedId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mark_read: true }),
          }).catch(() => undefined);
          setConversations((previous) => previous.map((item) => item.id === selectedId ? { ...item, unread_count: 0 } : item));
        }
      } catch (error) {
        if (!requestController.signal.aborted && !isAbortError(error)) {
          console.error('Failed to load thread:', error);
        }
      } finally {
        if (controller === requestController) controller = null;
        inFlight = false;
        if (!stopped && showLoading) setIsLoadingMessages(false);
      }
    };

    const poll = async () => {
      if (stopped) return;
      await loadThread(false);
      if (!stopped) timer = window.setTimeout(poll, THREAD_POLL_MS);
    };

    void loadThread(true).then(() => {
      if (!stopped) timer = window.setTimeout(poll, THREAD_POLL_MS);
    });
    const onVisibility = () => { if (!document.hidden) void loadThread(false); };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopped = true;
      controller?.abort();
      if (timer) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [selectedId, runLiveMetaSync]);

  useEffect(() => {
    return () => liveSyncAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (lightboxImage) setLightboxImage(null);
      else if (isInspectorOpen) setIsInspectorOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [lightboxImage, isInspectorOpen]);

  useEffect(() => {
    if (isInspectorOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      window.setTimeout(() => inspectorCloseRef.current?.focus(), 0);
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [isInspectorOpen]);

  useEffect(() => {
    if (lightboxImage) window.setTimeout(() => lightboxCloseRef.current?.focus(), 0);
  }, [lightboxImage]);

  const handleSyncMeta = async () => {
    if (isSyncingMeta || currentUser.role === 'agent') return;
    setIsSyncingMeta(true);
    try {
      const response = await fetch('/api/conversations/sync', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Meta sync failed.');
      showToast(`Synced ${data.conversationsCount || 0} conversations and ${data.messagesCount || 0} new messages.`, 'success');
      await loadConversations(false, true);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Meta sync failed.', 'error');
    } finally {
      setIsSyncingMeta(false);
    }
  };

  const handleSendMessage = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!selectedId || isSending || !replyBody.trim()) return;
    if (replyMode === 'outbound' && !canSendOutbound) {
      showToast(replyWindow?.isOpen === false ? 'The standard 24-hour reply window has closed.' : 'Outbound sending is not configured for this channel.', 'error');
      return;
    }

    const body = replyBody.trim();
    const clientRequestId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setReplyBody('');
    setIsSending(true);

    try {
      const response = await fetch(`/api/conversations/${selectedId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': clientRequestId },
        body: JSON.stringify({ body, direction: replyMode, clientRequestId }),
      });
      const data = await response.json();
      if (data.message) setMessages((previous) => mergeMessage(previous, data.message as Message));
      if (!response.ok) throw new Error(data.error || 'Message delivery failed.');

      setConversations((previous) => previous.map((conversation) => conversation.id === selectedId
        ? { ...conversation, last_message_preview: replyMode === 'internal' ? `[Note] ${body}` : body, last_message_at: new Date().toISOString() }
        : conversation));
    } catch (error) {
      setReplyBody(body);
      showToast(error instanceof Error ? error.message : 'Message delivery failed.', 'error');
    } finally {
      setIsSending(false);
    }
  };

  const handleUpdateStatus = async (status: Conversation['status']) => {
    if (!selectedId) return;
    const response = await fetch(`/api/conversations/${selectedId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) {
      showToast('Unable to update conversation status.', 'error');
      return;
    }
    setActiveConversation((previous) => previous ? { ...previous, status } : previous);
    setConversations((previous) => previous.map((conversation) => conversation.id === selectedId ? { ...conversation, status } : conversation));
  };

  const handleConverted = (lead: { id: string; customer_name: string; destination: string }) => {
    const leadSummary = {
      id: lead.id,
      customer_name: lead.customer_name,
      destination: lead.destination,
      stage: 'new',
      priority: 'normal',
      assigned_to: currentUser.id,
      created_at: new Date().toISOString(),
    };
    setActiveConversation((previous) => previous ? { ...previous, lead_id: lead.id, lead: leadSummary } : previous);
    setConversations((previous) => previous.map((conversation) => conversation.id === selectedId ? { ...conversation, lead_id: lead.id, lead: leadSummary } : conversation));
  };

  const moveConversationFocus = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-conversation-item="true"]'));
    const index = buttons.indexOf(event.currentTarget);
    const next = event.key === 'ArrowDown' ? Math.min(buttons.length - 1, index + 1) : Math.max(0, index - 1);
    buttons[next]?.focus();
  };

  const openInspector = () => setIsInspectorOpen(true);
  const closeMobileThread = () => {
    setSelectedId(null);
    setIsInspectorOpen(false);
  };

  return (
    <div className="relative flex h-[calc(100dvh-8rem)] min-h-[32rem] overflow-hidden border border-zinc-200 bg-white md:h-[calc(100vh-4.5rem)] md:rounded-lg">
      <div className="sr-only" aria-live="polite" aria-atomic="true">{liveAnnouncement}</div>

      <section className={`${selectedId ? 'hidden md:flex' : 'flex'} w-full shrink-0 flex-col border-r border-zinc-200 bg-white md:w-80 lg:w-96`} aria-label="Inbox conversations">
        <div className="border-b border-zinc-200 px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <InboxIcon className="h-4 w-4 shrink-0 text-zinc-700" />
              <h1 className="truncate text-sm font-semibold text-zinc-950">Inbox</h1>
              {metrics.unconvertedOpen > 0 && <span className="font-mono text-[10px] text-zinc-500">{metrics.unconvertedOpen} new</span>}
            </div>
            <div className="flex items-center gap-1">
              {currentUser.role !== 'agent' && (
                <button type="button" onClick={handleSyncMeta} disabled={isSyncingMeta} className="button-secondary button-sm px-2" aria-label="Sync Meta conversation history" title="Sync Meta conversation history">
                  <RefreshCw className={`h-3.5 w-3.5 ${isSyncingMeta ? 'animate-spin' : ''}`} />
                  <span className="hidden lg:inline">Sync</span>
                </button>
              )}
              <button type="button" onClick={() => void (async () => { await runLiveMetaSync(); await loadConversations(false, false); })()} className="button-ghost button-sm px-2" aria-label="Refresh inbox">
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <label className="relative mt-3 block">
            <span className="sr-only">Search conversations</span>
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, phone, email or message" className="field h-8 pl-8 text-xs" />
          </label>

          <div className="mt-2 grid grid-cols-4 gap-1 rounded-md bg-zinc-100 p-1 text-[10px] font-medium" aria-label="Inbox filters">
            {([
              ['unconverted', 'New'],
              ['all', 'All'],
              ['mine', 'Mine'],
              ['converted', 'Leads'],
            ] as const).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded px-1.5 py-1 ${filter === value ? 'bg-white text-zinc-950 shadow-2xs' : 'text-zinc-500 hover:text-zinc-900'}`} aria-pressed={filter === value}>{label}</button>
            ))}
          </div>
        </div>

        <div className="flex gap-1 overflow-x-auto border-b border-zinc-100 px-3 py-2" aria-label="Channel filter">
          {['all', 'facebook', 'instagram', 'whatsapp', 'email'].map((provider) => {
            const Icon = PROVIDER_ICONS[provider];
            const active = providerFilter === provider;
            return (
              <button key={provider} type="button" onClick={() => setProviderFilter(provider)} className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[10px] capitalize ${active ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'}`} aria-pressed={active}>
                {Icon && <Icon className="h-3 w-3" />}{provider}
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 divide-y divide-zinc-100 overflow-y-auto">
          {isLoadingList ? (
            <div className="flex h-32 items-center justify-center gap-2 text-xs text-zinc-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading inbox…</div>
          ) : conversations.length === 0 ? (
            <div className="p-8 text-center"><MessageSquare className="mx-auto h-6 w-6 text-zinc-300" /><p className="mt-2 text-xs font-medium text-zinc-700">No conversations</p><p className="mt-1 text-[11px] text-zinc-400">New channel messages will appear here.</p></div>
          ) : conversations.map((conversation) => {
            const Icon = PROVIDER_ICONS[conversation.provider] || MessageSquare;
            const selected = selectedId === conversation.id;
            return (
              <button
                key={conversation.id}
                data-conversation-item="true"
                type="button"
                onClick={() => setSelectedId(conversation.id)}
                onKeyDown={moveConversationFocus}
                className={`w-full border-l-2 p-3 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-950 ${selected ? 'border-l-zinc-950 bg-zinc-50' : 'border-l-transparent hover:bg-zinc-50/70'}`}
                aria-current={selected ? 'true' : undefined}
                aria-label={`${conversation.customer_name || 'Traveler'}, ${conversation.provider}, ${conversation.unread_count} unread messages`}
              >
                <div className="flex items-start gap-2.5">
                  <div className="relative shrink-0">
                    <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-zinc-200 bg-zinc-100 text-[10px] font-semibold text-zinc-700">
                      {conversation.customer_avatar_url ? (
                        <img src={getSafeMediaUrl(conversation.customer_avatar_url)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
                      ) : (conversation.customer_name || 'T').slice(0, 2).toUpperCase()}
                    </div>
                    <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-zinc-800 text-white"><Icon className="h-2 w-2" /></span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold text-zinc-950">{conversation.customer_name || 'Traveler'}</span>
                      <span className="shrink-0 font-mono text-[9px] text-zinc-400">{formatTime(conversation.last_message_at)}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-zinc-500">{conversation.last_message_preview || 'No messages yet'}</p>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <span className="truncate text-[9px] uppercase tracking-wide text-zinc-400">{conversation.lead_id ? `Lead · ${conversation.lead?.destination || 'Active'}` : 'Not qualified'}</span>
                      {conversation.unread_count > 0 && <span className="h-2 w-2 shrink-0 rounded-full bg-blue-600" aria-hidden="true" />}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className={`${selectedId ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col bg-zinc-50`} aria-label="Conversation thread">
        {!activeConversation ? (
          <div className="flex h-full items-center justify-center p-6 text-center text-xs text-zinc-500">{isLoadingMessages ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Select a conversation to start.'}</div>
        ) : (
          <>
            <header className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-white px-3 py-2.5 sm:px-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <button type="button" onClick={closeMobileThread} className="button-ghost button-sm px-2 md:hidden" aria-label="Back to conversation list"><ArrowLeft className="h-4 w-4" /></button>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-200 bg-zinc-100 text-xs font-semibold text-zinc-700">
                  {activeConversation.customer_avatar_url ? <img src={getSafeMediaUrl(activeConversation.customer_avatar_url)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = 'none'; }} /> : (activeConversation.customer_name || 'T').slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <h2 className="truncate text-sm font-semibold text-zinc-950">{activeConversation.customer_name || 'Traveler'}</h2>
                    <span className="shrink-0 text-[9px] uppercase tracking-wide text-zinc-400">{activeConversation.provider}</span>
                  </div>
                  <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[10px] text-zinc-400">
                    {activeConversation.customer_phone && <span className="truncate font-mono">{activeConversation.customer_phone}</span>}
                    {replyWindow && <span className={replyWindow.isOpen ? 'text-emerald-600' : 'text-amber-600'}>24h {replyWindow.label}</span>}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {activeConversation.metadata?.meta_link && <a href={activeConversation.metadata.meta_link} target="_blank" rel="noreferrer" className="button-secondary button-sm hidden sm:inline-flex"><ExternalLink className="h-3.5 w-3.5" /> Meta</a>}
                {!activeConversation.lead_id ? <button type="button" onClick={() => setIsConvertDrawerOpen(true)} className="button-primary button-sm"><UserCheck className="h-3.5 w-3.5" /><span className="hidden sm:inline">Convert</span></button> : <Link href={`/leads/${activeConversation.lead_id}/workspace`} className="button-secondary button-sm"><ExternalLink className="h-3.5 w-3.5" /><span className="hidden sm:inline">Lead</span></Link>}
                <button type="button" onClick={openInspector} className="button-ghost button-sm px-2 xl:hidden" aria-label="Open conversation details"><PanelRight className="h-4 w-4" /></button>
              </div>
            </header>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 sm:p-5" aria-label="Message history">
              {isLoadingMessages ? (
                <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-zinc-400" /></div>
              ) : messages.length === 0 ? (
                <div className="py-12 text-center text-xs text-zinc-400">No messages recorded yet.</div>
              ) : messages.map((message) => {
                const inbound = message.direction === 'inbound';
                const internal = message.direction === 'internal';
                const attachments = extractAttachments(message);
                const photos = attachments.filter((attachment) => attachment.type === 'image');
                const audios = attachments.filter((attachment) => attachment.type === 'audio');
                const files = attachments.filter((attachment) => attachment.type === 'file' || attachment.type === 'video');
                const delivery = deliveryLabel(message);
                const DeliveryIcon = delivery?.icon;

                if (internal) {
                  return <div key={message.id} className="mx-auto max-w-lg rounded-md border border-zinc-200 bg-zinc-100 px-3 py-2 text-xs text-zinc-700"><div className="flex items-center justify-between gap-2 text-[9px] font-semibold uppercase tracking-wide text-zinc-500"><span className="inline-flex items-center gap-1"><StickyNote className="h-3 w-3" /> Internal note</span><span className="font-mono">{formatTime(message.sent_at)}</span></div><p className="mt-1 whitespace-pre-wrap leading-5">{message.body}</p></div>;
                }

                return (
                  <article key={message.id} className={`flex flex-col ${inbound ? 'items-start' : 'items-end'}`}>
                    <div className={`max-w-[88%] rounded-lg px-3 py-2 text-xs shadow-2xs sm:max-w-[76%] ${inbound ? 'border border-zinc-200 bg-white text-zinc-900' : message.delivery_status === 'failed' ? 'border border-red-200 bg-red-50 text-zinc-900' : 'bg-zinc-950 text-white'}`}>
                      {photos.length === 1 && <button type="button" onClick={() => setLightboxImage(photos[0].url)} className="my-1 block max-w-full overflow-hidden rounded-md bg-zinc-100" aria-label={`View ${photos[0].name}`}><img src={getSafeMediaUrl(photos[0].previewUrl)} alt={photos[0].name} referrerPolicy="no-referrer" loading="lazy" className="max-h-72 w-full object-cover" onError={(event) => { event.currentTarget.style.display = 'none'; }} /></button>}
                      {photos.length > 1 && <div className={`my-1 grid gap-1 ${photos.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>{photos.slice(0, 6).map((photo, index) => <button key={photo.id} type="button" onClick={() => setLightboxImage(photo.url)} className="relative aspect-square overflow-hidden rounded-md bg-zinc-100" aria-label={`View ${photo.name}`}><img src={getSafeMediaUrl(photo.previewUrl)} alt={photo.name} referrerPolicy="no-referrer" loading="lazy" className="h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = 'none'; }} />{index === 5 && photos.length > 6 && <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs font-semibold text-white">+{photos.length - 6}</span>}</button>)}</div>}
                      {audios.map((audio) => <div key={audio.id} className="my-1.5 rounded-md bg-white p-2 text-zinc-900"><div className="mb-1 flex items-center gap-1 text-[10px] text-zinc-500"><Music className="h-3 w-3" /> Voice note</div><audio controls preload="metadata" src={getSafeMediaUrl(audio.url)} className="h-8 w-full max-w-[280px]" /></div>)}
                      {files.map((file) => <a key={file.id} href={getSafeMediaUrl(file.url)} target="_blank" rel="noreferrer" className="my-1.5 flex items-center gap-2 rounded-md border border-zinc-200 bg-white p-2 text-zinc-900"><FileText className="h-4 w-4 shrink-0 text-zinc-400" /><span className="min-w-0 flex-1 truncate text-[11px]">{file.name}</span><Download className="h-3.5 w-3.5 shrink-0 text-zinc-400" /></a>)}
                      {message.body && !['[Photo]', '[Voice message]'].includes(message.body) && <p className="whitespace-pre-wrap leading-5">{message.body}</p>}
                      {message.delivery_status === 'failed' && message.failure_message && <p className="mt-1.5 border-t border-red-200 pt-1.5 text-[10px] text-red-700">{message.failure_message}</p>}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 px-1 text-[9px] text-zinc-400">
                      <span className="font-mono">{formatTime(message.sent_at)}</span>
                      {!inbound && delivery && DeliveryIcon && <span className={`inline-flex items-center gap-1 ${delivery.className}`}><DeliveryIcon className={`h-3 w-3 ${message.delivery_status === 'sending' ? 'animate-spin' : ''}`} />{delivery.text}</span>}
                      {!inbound && message.metadata?.sent_via === 'meta_business_suite' && <span>Meta Suite</span>}
                    </div>
                  </article>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <footer className="border-t border-zinc-200 bg-white p-3 sm:p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex rounded-md bg-zinc-100 p-0.5 text-[10px] font-medium">
                  <button type="button" onClick={() => setReplyMode('outbound')} className={`rounded px-2.5 py-1 ${replyMode === 'outbound' ? 'bg-white text-zinc-950 shadow-2xs' : 'text-zinc-500'}`}>Traveler</button>
                  <button type="button" onClick={() => setReplyMode('internal')} className={`rounded px-2.5 py-1 ${replyMode === 'internal' ? 'bg-white text-zinc-950 shadow-2xs' : 'text-zinc-500'}`}>Internal note</button>
                </div>
                {replyMode === 'outbound' && templates.length > 0 && <select defaultValue="" onChange={(event) => { if (event.target.value) setReplyBody((previous) => previous ? `${previous}\n${event.target.value}` : event.target.value); event.target.value = ''; }} className="select-field h-7 max-w-48 text-[10px]" aria-label="Insert saved message"><option value="" disabled>Saved message…</option>{templates.map((template) => <option key={template.id} value={template.content}>{template.name}</option>)}</select>}
              </div>

              {replyMode === 'outbound' && !canSendOutbound && <div className="mb-2 text-[10px] text-amber-700">{replyWindow?.isOpen === false ? 'The standard 24-hour reply window is closed. Use an approved provider template from the provider console.' : `Direct outbound ${activeConversation.provider} sending is not configured yet.`}</div>}
              <form onSubmit={handleSendMessage}>
                <label className="sr-only" htmlFor="inbox-composer">{replyMode === 'internal' ? 'Internal note' : 'Message to traveler'}</label>
                <textarea id="inbox-composer" rows={2} value={replyBody} onChange={(event) => setReplyBody(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void handleSendMessage(); } }} placeholder={replyMode === 'internal' ? 'Add a note for your team…' : `Reply to ${activeConversation.customer_name || 'traveler'}…`} className="textarea-field min-h-16 text-xs" />
                <div className="mt-2 flex items-center justify-between gap-3"><span className="text-[9px] text-zinc-400">⌘/Ctrl + Enter to send</span><button type="submit" disabled={!replyBody.trim() || isSending || (replyMode === 'outbound' && !canSendOutbound)} className="button-primary button-sm"><Send className="h-3.5 w-3.5" />{isSending ? 'Sending…' : replyMode === 'internal' ? 'Add note' : 'Send'}</button></div>
              </form>
            </footer>
          </>
        )}
      </section>

      {activeConversation && isInspectorOpen && <button type="button" className="fixed inset-0 z-40 bg-zinc-950/30 xl:hidden" onClick={() => setIsInspectorOpen(false)} aria-label="Close conversation details" />}
      {activeConversation && (
        <aside
          role={isInspectorOpen ? 'dialog' : 'complementary'}
          aria-modal={isInspectorOpen ? true : undefined}
          aria-label="Conversation details"
          className={`${isInspectorOpen ? 'flex' : 'hidden'} fixed inset-y-0 right-0 z-50 w-[min(22rem,100vw)] flex-col overflow-y-auto border-l border-zinc-200 bg-white p-4 shadow-xl xl:static xl:z-auto xl:flex xl:w-80 xl:shadow-none`}
        >
          <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
            <div className="flex gap-1">
              <button type="button" onClick={() => setInspectorTab('details')} className={`rounded-md px-2.5 py-1 text-xs font-semibold ${inspectorTab === 'details' ? 'bg-zinc-950 text-white' : 'text-zinc-500 hover:bg-zinc-100'}`}>Details</button>
              <button type="button" onClick={() => setInspectorTab('media')} className={`rounded-md px-2.5 py-1 text-xs font-semibold ${inspectorTab === 'media' ? 'bg-zinc-950 text-white' : 'text-zinc-500 hover:bg-zinc-100'}`}>Media <span className="font-mono text-[9px]">{sharedMedia.total}</span></button>
            </div>
            <button ref={inspectorCloseRef} type="button" onClick={() => setIsInspectorOpen(false)} className="button-ghost button-sm px-2 xl:hidden" aria-label="Close conversation details"><X className="h-4 w-4" /></button>
          </div>

          {inspectorTab === 'details' ? (
            <div className="mt-4 space-y-5 text-xs">
              <section>
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-zinc-200 bg-zinc-100 font-semibold text-zinc-700">{activeConversation.customer_avatar_url ? <img src={getSafeMediaUrl(activeConversation.customer_avatar_url)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = 'none'; }} /> : (activeConversation.customer_name || 'T').slice(0, 2).toUpperCase()}</div>
                  <div className="min-w-0"><div className="truncate font-semibold text-zinc-950">{activeConversation.customer_name || 'Traveler'}</div><div className="mt-0.5 truncate font-mono text-[10px] text-zinc-500">{activeConversation.customer_phone || 'No phone'}</div>{activeConversation.customer_email && <div className="truncate text-[10px] text-zinc-500">{activeConversation.customer_email}</div>}</div>
                </div>
              </section>

              <section className="border-t border-zinc-100 pt-4">
                <div className="text-[9px] font-semibold uppercase tracking-wide text-zinc-400">Conversation</div>
                <dl className="mt-2 space-y-2.5">
                  <div className="flex justify-between gap-3"><dt className="text-zinc-500">Channel</dt><dd className="capitalize text-zinc-900">{activeConversation.provider}</dd></div>
                  <div className="flex items-center justify-between gap-3"><dt className="text-zinc-500">Status</dt><dd><select value={activeConversation.status} onChange={(event) => void handleUpdateStatus(event.target.value as Conversation['status'])} className="select-field h-7 text-[10px]"><option value="open">Open</option><option value="closed">Closed</option><option value="archived">Archived</option></select></dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-zinc-500">Assigned</dt><dd className="truncate text-right text-zinc-900">{activeConversation.assigned_profile?.full_name || 'Unassigned'}</dd></div>
                  {replyWindow && <div className="flex justify-between gap-3"><dt className="text-zinc-500">Reply window</dt><dd className={replyWindow.isOpen ? 'text-emerald-600' : 'text-amber-600'}>{replyWindow.label}</dd></div>}
                </dl>
              </section>

              <section className="border-t border-zinc-100 pt-4">
                <div className="text-[9px] font-semibold uppercase tracking-wide text-zinc-400">Provider IDs</div>
                <div className="mt-2 space-y-2">
                  {activeConversation.external_contact_id && <button type="button" onClick={() => handleCopy(activeConversation.external_contact_id || '', 'contact')} className="flex w-full items-center justify-between gap-2 text-left"><span className="text-zinc-500">Contact</span><span className="inline-flex max-w-40 items-center gap-1 truncate font-mono text-[9px] text-zinc-700">{activeConversation.external_contact_id}{copiedKey === 'contact' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}</span></button>}
                  {activeConversation.metadata?.scoped_thread_key && <button type="button" onClick={() => handleCopy(String(activeConversation.metadata?.scoped_thread_key || ''), 'thread')} className="flex w-full items-center justify-between gap-2 text-left"><span className="text-zinc-500">Thread</span><span className="inline-flex max-w-40 items-center gap-1 truncate font-mono text-[9px] text-zinc-700">{activeConversation.metadata.scoped_thread_key}{copiedKey === 'thread' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}</span></button>}
                </div>
              </section>

              <section className="border-t border-zinc-100 pt-4">
                {!activeConversation.lead_id ? <><p className="text-[11px] leading-5 text-zinc-500">Qualify this conversation before adding it to the sales pipeline.</p><button type="button" onClick={() => setIsConvertDrawerOpen(true)} className="button-primary mt-3 w-full"><UserCheck className="h-3.5 w-3.5" /> Convert to lead</button></> : <><div className="grid grid-cols-2 gap-2 text-[10px]"><div><span className="block text-zinc-400">Destination</span><span className="font-medium text-zinc-800">{activeConversation.lead?.destination || '—'}</span></div><div><span className="block text-zinc-400">Stage</span><span className="font-medium capitalize text-zinc-800">{activeConversation.lead?.stage || '—'}</span></div></div><Link href={`/leads/${activeConversation.lead_id}/workspace`} className="button-secondary mt-3 w-full"><ExternalLink className="h-3.5 w-3.5" /> Open lead workspace</Link></>}
              </section>
            </div>
          ) : (
            <div className="mt-4 space-y-5">
              {sharedMedia.total === 0 ? <div className="py-10 text-center text-xs text-zinc-400"><ImageIcon className="mx-auto h-6 w-6" /><p className="mt-2">No shared media</p></div> : <>
                {sharedMedia.photos.length > 0 && <section><div className="mb-2 text-[9px] font-semibold uppercase tracking-wide text-zinc-400">Photos · {sharedMedia.photos.length}</div><div className="grid grid-cols-3 gap-1">{sharedMedia.photos.map((photo) => <button key={photo.id} type="button" onClick={() => setLightboxImage(photo.url)} className="aspect-square overflow-hidden rounded-md border border-zinc-200 bg-zinc-100" aria-label={`View ${photo.name}`}><img src={getSafeMediaUrl(photo.previewUrl)} alt={photo.name} referrerPolicy="no-referrer" loading="lazy" className="h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = 'none'; }} /></button>)}</div></section>}
                {sharedMedia.audios.length > 0 && <section><div className="mb-2 text-[9px] font-semibold uppercase tracking-wide text-zinc-400">Voice notes · {sharedMedia.audios.length}</div><div className="space-y-2">{sharedMedia.audios.map((audio) => <audio key={audio.id} controls preload="metadata" src={getSafeMediaUrl(audio.url)} className="h-8 w-full" />)}</div></section>}
                {sharedMedia.files.length > 0 && <section><div className="mb-2 text-[9px] font-semibold uppercase tracking-wide text-zinc-400">Files · {sharedMedia.files.length}</div><div className="space-y-1">{sharedMedia.files.map((file) => <a key={file.id} href={getSafeMediaUrl(file.url)} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-md border border-zinc-200 p-2 text-[10px] text-zinc-700"><FileText className="h-3.5 w-3.5" /><span className="min-w-0 flex-1 truncate">{file.name}</span><Download className="h-3.5 w-3.5" /></a>)}</div></section>}
              </>}
            </div>
          )}
        </aside>
      )}

      <ConvertToLeadDrawer isOpen={isConvertDrawerOpen} onClose={() => setIsConvertDrawerOpen(false)} conversation={activeConversation} onConverted={handleConverted} />

      {lightboxImage && (
        <div role="dialog" aria-modal="true" aria-label="Photo preview" className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-950/90 p-4" onClick={() => setLightboxImage(null)}>
          <button ref={lightboxCloseRef} type="button" onClick={() => setLightboxImage(null)} className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-md bg-white/10 text-white hover:bg-white/20" aria-label="Close photo preview"><X className="h-4 w-4" /></button>
          <button type="button" onClick={(event) => event.stopPropagation()} className="max-h-[90vh] max-w-[92vw] overflow-hidden rounded-md"><img src={getSafeMediaUrl(lightboxImage)} alt="Shared traveler media" referrerPolicy="no-referrer" className="max-h-[88vh] max-w-[90vw] object-contain" onError={(event) => { event.currentTarget.style.display = 'none'; }} /></button>
        </div>
      )}
    </div>
  );
}
