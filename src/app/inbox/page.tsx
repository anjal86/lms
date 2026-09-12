'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useApp } from '@/lib/store';
import {
  Facebook,
  Instagram,
  MessageCircle,
  Send,
  Mail,
  MessageSquare,
  Search,
  Filter,
  UserCheck,
  ExternalLink,
  CheckCircle2,
  Clock,
  RefreshCw,
  Loader2,
  CornerDownLeft,
  StickyNote,
  AlertCircle,
  Sparkles,
  ChevronRight,
  User,
  ShieldCheck,
  Inbox as InboxIcon,
  Image as ImageIcon,
  Download,
  Maximize2,
  X,
  FileText,
  Music,
  Copy,
  Check,
} from 'lucide-react';
import ConvertToLeadDrawer, { type ConversationForConversion } from '@/components/inbox/ConvertToLeadDrawer';

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
  metadata?: {
    attachment_url?: string | null;
    preview_url?: string | null;
    sent_via?: string;
    attachments?: unknown;
    [key: string]: unknown;
  } | null;
  sent_at: string;
  created_by: string | null;
  author_profile?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    role: string;
  } | null;
};

const PROVIDER_ICONS: Record<string, React.ElementType> = {
  facebook: Facebook,
  instagram: Instagram,
  whatsapp: MessageCircle,
  tiktok: Send,
  email: Mail,
};

const PROVIDER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  facebook: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  instagram: { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
  whatsapp: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  tiktok: { bg: 'bg-zinc-100', text: 'text-zinc-900', border: 'border-zinc-300' },
  email: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
};

function getSafeMediaUrl(url?: string | null): string {
  if (!url) return '';
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('/api/media/proxy')) return url;
  return `/api/media/proxy?url=${encodeURIComponent(url)}`;
}

interface ParsedAttachment {
  id: string;
  type: 'image' | 'video' | 'audio' | 'file';
  url: string;
  previewUrl: string;
  name: string;
  size?: number;
}

function extractAttachments(m: Message): ParsedAttachment[] {
  const meta = m.metadata || {};
  const rawList = Array.isArray((meta.attachments as any)?.data) ? (meta.attachments as any).data : [];

  if (rawList.length > 0) {
    return rawList
      .map((item: any, idx: number): ParsedAttachment | null => {
        const imgUrl = item.image_data?.url || (item.mime_type?.startsWith('image/') ? item.file_url : null);
        const previewUrl = item.image_data?.preview_url || imgUrl;
        const videoUrl = item.video_data?.url || (item.mime_type?.startsWith('video/') ? item.file_url : null);
        const audioUrl = item.mime_type?.startsWith('audio/') || item.name?.includes('audioclip') ? item.file_url : null;
        const targetUrl = imgUrl || videoUrl || audioUrl || item.file_url;
        if (!targetUrl) return null;

        let type: 'image' | 'video' | 'audio' | 'file' = 'file';
        if (imgUrl) type = 'image';
        else if (videoUrl) type = 'video';
        else if (audioUrl) type = 'audio';

        return {
          id: item.id || `${m.id}-${idx}`,
          type,
          url: String(targetUrl),
          previewUrl: String(previewUrl || targetUrl),
          name: String(item.name || (type === 'image' ? 'Photo' : 'Attachment')),
          size: typeof item.size === 'number' ? item.size : undefined,
        };
      })
      .filter((a: ParsedAttachment | null): a is ParsedAttachment => a !== null);
  }

  const singleUrl = (meta.attachment_url || meta.preview_url) as string | undefined;
  if (!singleUrl) return [];

  const isImg =
    m.message_type === 'image' ||
    singleUrl.includes('.jpg') ||
    singleUrl.includes('.png') ||
    singleUrl.includes('.jpeg') ||
    singleUrl.includes('.webp') ||
    (!singleUrl.includes('.mp4') && !singleUrl.includes('audioclip') && m.message_type === 'media');
  const isAud = m.message_type === 'audio' || singleUrl.includes('audioclip') || singleUrl.includes('.mp4');
  const isVid = m.message_type === 'video';

  return [
    {
      id: m.id,
      type: isImg ? 'image' : isAud ? 'audio' : isVid ? 'video' : 'file',
      url: singleUrl,
      previewUrl: (meta.preview_url as string) || singleUrl,
      name: (meta.file_name as string) || (isImg ? 'Photo' : 'Attachment'),
      size: typeof meta.file_size === 'number' ? meta.file_size : undefined,
    },
  ];
}

function formatTime(isoString?: string | null) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function InboxPage() {
  const { currentUser, allProfiles, templates, showToast } = useApp();

  // Filter & List state
  const [filter, setFilter] = useState<'unconverted' | 'all' | 'mine' | 'converted'>('unconverted');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [metrics, setMetrics] = useState<{ unconvertedOpen: number; totalOpen: number }>({ unconvertedOpen: 0, totalOpen: 0 });
  const [isLoadingList, setIsLoadingList] = useState(true);

  // Selected thread state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  // Message composer state
  const [replyBody, setReplyBody] = useState('');
  const [replyMode, setReplyMode] = useState<'outbound' | 'internal'>('outbound');
  const [isSending, setIsSending] = useState(false);

  // Convert to lead drawer state
  const [isConvertDrawerOpen, setIsConvertDrawerOpen] = useState(false);
  const [isSyncingMeta, setIsSyncingMeta] = useState(false);

  // Lightbox & Inspector Tabs
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<'details' | 'media'>('details');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleCopy = (text: string, key: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    showToast('Copied to clipboard!', 'info');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Extract shared media (photos, audio clips, documents) from message stream
  const sharedMedia = React.useMemo(() => {
    const photos: Array<{ id: string; url: string; preview: string; name?: string; sentAt: string }> = [];
    const audios: Array<{ id: string; url: string; name?: string; sentAt: string }> = [];
    const files: Array<{ id: string; url: string; name?: string; size?: number; sentAt: string }> = [];

    for (const m of messages) {
      const atts = extractAttachments(m);
      for (const a of atts) {
        if (a.type === 'image') {
          photos.push({
            id: a.id,
            url: a.url,
            preview: a.previewUrl,
            name: a.name,
            sentAt: m.sent_at,
          });
        } else if (a.type === 'audio') {
          audios.push({
            id: a.id,
            url: a.url,
            name: a.name,
            sentAt: m.sent_at,
          });
        } else {
          files.push({
            id: a.id,
            url: a.url,
            name: a.name,
            size: a.size,
            sentAt: m.sent_at,
          });
        }
      }
    }

    return { photos, audios, files, total: photos.length + audios.length + files.length };
  }, [messages]);

  // Compute live Meta 24-Hour Messaging Policy countdown
  const replyWindow = React.useMemo(() => {
    if (!activeConversation) return null;
    const lastInboundMsg = [...messages].reverse().find((m) => m.direction === 'inbound');
    const lastInboundAt = activeConversation.metadata?.last_customer_message_at || lastInboundMsg?.sent_at;
    if (!lastInboundAt) {
      return {
        isOpen: activeConversation.metadata?.can_reply !== false,
        hoursRemaining: null,
        label: activeConversation.metadata?.can_reply !== false ? 'Standard Window Active' : 'Window Expired',
      };
    }

    const elapsedMs = Date.now() - new Date(lastInboundAt).getTime();
    const windowMs = 24 * 60 * 60 * 1000;
    const remainingMs = windowMs - elapsedMs;
    const isOpen = remainingMs > 0 && activeConversation.metadata?.can_reply !== false;
    const remainingHours = Math.max(0, Math.floor(remainingMs / (1000 * 60 * 60)));
    const remainingMinutes = Math.max(0, Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60)));

    return {
      isOpen,
      remainingHours,
      remainingMinutes,
      label: isOpen
        ? `${remainingHours}h ${remainingMinutes}m remaining`
        : '24h Window Expired',
      lastInboundAt,
    };
  }, [activeConversation, messages]);

  const handleSyncMeta = async () => {
    if (isSyncingMeta) return;
    setIsSyncingMeta(true);
    showToast('Syncing conversation history from Meta Business Suite...', 'info');
    try {
      const response = await fetch('/api/conversations/sync', { method: 'POST' });
      const data = await response.json();
      if (response.ok && data.success) {
        showToast(
          `Synced ${data.conversationsCount || 0} conversations and ${data.messagesCount || 0} messages from Meta!`,
          'success'
        );
        await loadConversations();
      } else {
        showToast(data.error || 'Failed to sync Meta conversations.', 'error');
      }
    } catch {
      showToast('Network error while syncing Meta conversations.', 'error');
    } finally {
      setIsSyncingMeta(false);
    }
  };

  // Fetch conversations list
  const loadConversations = useCallback(async (selectFirst = false, silent = false) => {
    try {
      if (!silent) setIsLoadingList(true);
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('filter', filter);
      if (providerFilter !== 'all') params.set('provider', providerFilter);
      if (search.trim()) params.set('search', search.trim());

      const response = await fetch(`/api/conversations?${params.toString()}`);
      const data = await response.json();
      if (response.ok && Array.isArray(data.conversations)) {
        setConversations(data.conversations);
        if (data.metrics) setMetrics(data.metrics);

        if (selectFirst && data.conversations.length > 0 && !selectedId) {
          setSelectedId(data.conversations[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      if (!silent) setIsLoadingList(false);
    }
  }, [filter, providerFilter, search, selectedId]);

  // Initial load
  useEffect(() => {
    loadConversations(true);
  }, [loadConversations]);

  // Background polling for new conversations every 10 seconds
  useEffect(() => {
    const pollInterval = setInterval(() => {
      loadConversations(false, true);
    }, 10000);
    return () => clearInterval(pollInterval);
  }, [loadConversations]);

  // Fetch thread messages when selectedId changes & live poll every 4s
  useEffect(() => {
    if (!selectedId) {
      setActiveConversation(null);
      setMessages([]);
      return;
    }

    let isMounted = true;
    async function loadThread(showLoading = true) {
      if (showLoading) setIsLoadingMessages(true);
      try {
        const response = await fetch(`/api/conversations/${selectedId}`);
        const data = await response.json();
        if (isMounted && response.ok) {
          setActiveConversation(data.conversation);
          setMessages((prev) => {
            // Avoid unnecessary re-renders if length and last message are identical
            const incoming = data.messages || [];
            if (prev.length === incoming.length && prev[prev.length - 1]?.id === incoming[incoming.length - 1]?.id) {
              return prev;
            }
            return incoming;
          });
          // update unread count in local list
          setConversations((prev) =>
            prev.map((c) => (c.id === selectedId ? { ...c, unread_count: 0 } : c))
          );
        }
      } catch (err) {
        console.error('Failed to load thread:', err);
      } finally {
        if (isMounted && showLoading) setIsLoadingMessages(false);
      }
    }

    loadThread(true);

    // Live background polling every 4 seconds for immediate bidirectional updates
    const pollInterval = setInterval(() => {
      loadThread(false);
    }, 4000);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
    };
  }, [selectedId]);

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!replyBody.trim() || !selectedId || isSending) return;

    setIsSending(true);
    const textToSend = replyBody.trim();
    setReplyBody('');

    try {
      const response = await fetch(`/api/conversations/${selectedId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: textToSend,
          direction: replyMode,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to send message');

      if (data.message) {
        setMessages((prev) => [...prev, data.message]);
        // Update snippet in conversation list
        setConversations((prev) =>
          prev.map((c) =>
            c.id === selectedId
              ? {
                  ...c,
                  last_message_preview: replyMode === 'internal' ? `[Note] ${textToSend}` : textToSend,
                  last_message_at: new Date().toISOString(),
                }
              : c
          )
        );
      }

      if (data.deliveryWarning) {
        showToast(`Saved locally, but delivery had a warning: ${data.deliveryWarning}`, 'info');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error sending message', 'error');
      setReplyBody(textToSend); // restore on error
    } finally {
      setIsSending(false);
    }
  };

  // Status toggle
  const handleUpdateStatus = async (status: 'open' | 'closed' | 'archived') => {
    if (!selectedId || !activeConversation) return;
    try {
      const response = await fetch(`/api/conversations/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (response.ok) {
        setActiveConversation((prev) => (prev ? { ...prev, status } : null));
        setConversations((prev) =>
          prev.map((c) => (c.id === selectedId ? { ...c, status } : c))
        );
        showToast(`Conversation marked as ${status}`, 'success');
      }
    } catch (err) {
      showToast('Failed to update status', 'error');
    }
  };

  // Successful conversion callback
  const handleConverted = (lead: { id: string; customer_name: string; destination: string }) => {
    if (activeConversation) {
      setActiveConversation((prev) =>
        prev
          ? {
              ...prev,
              lead_id: lead.id,
              lead: {
                id: lead.id,
                customer_name: lead.customer_name,
                destination: lead.destination,
                stage: 'new',
                priority: 'normal',
                assigned_to: currentUser.id,
                created_at: new Date().toISOString(),
              },
            }
          : null
      );
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeConversation.id
            ? {
                ...c,
                lead_id: lead.id,
                lead: {
                  id: lead.id,
                  customer_name: lead.customer_name,
                  destination: lead.destination,
                  stage: 'new',
                  priority: 'normal',
                  assigned_to: currentUser.id,
                  created_at: new Date().toISOString(),
                },
              }
            : c
        )
      );
    }
  };

  return (
    <div className="flex h-[calc(100vh-4.25rem)] overflow-hidden bg-zinc-50">
      {/* ========================================================================= */}
      {/* COLUMN 1: Conversation List (Width 360px) */}
      {/* ========================================================================= */}
      <section className="flex w-80 md:w-96 shrink-0 flex-col border-r border-zinc-200 bg-white" aria-label="Inbox Conversations">
        {/* Top Header */}
        <div className="border-b border-zinc-200 px-4 py-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <InboxIcon className="h-4 w-4 text-zinc-900" />
              <h1 className="text-sm font-semibold text-zinc-950">Omnichannel Inbox</h1>
              {metrics.unconvertedOpen > 0 && (
                <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-800">
                  {metrics.unconvertedOpen} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleSyncMeta}
                disabled={isSyncingMeta}
                className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 shadow-2xs transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 disabled:opacity-50"
                aria-label="Sync history from Meta Business Suite"
                title="Fetch past conversations & messages from Meta"
              >
                <RefreshCw className={`h-3 w-3 ${isSyncingMeta ? 'animate-spin text-blue-600' : 'text-zinc-500'}`} />
                <span>{isSyncingMeta ? 'Syncing...' : 'Sync Meta'}</span>
              </button>
              <button
                type="button"
                onClick={() => void loadConversations()}
                className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950"
                aria-label="Refresh conversations"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative mt-2.5">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations..."
              className="h-8 w-full rounded-md border border-zinc-200 bg-zinc-50/50 pl-8 pr-3 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-950 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-950"
            />
          </div>

          {/* Filter Pills */}
          <div className="mt-2.5 flex items-center gap-1 rounded-lg bg-zinc-100 p-1 text-[11px] font-medium">
            <button
              type="button"
              onClick={() => setFilter('unconverted')}
              className={`flex-1 rounded-md py-1 transition-all ${
                filter === 'unconverted' ? 'bg-white font-semibold text-zinc-950 shadow-2xs' : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              Unconverted
            </button>
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`flex-1 rounded-md py-1 transition-all ${
                filter === 'all' ? 'bg-white font-semibold text-zinc-950 shadow-2xs' : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setFilter('mine')}
              className={`flex-1 rounded-md py-1 transition-all ${
                filter === 'mine' ? 'bg-white font-semibold text-zinc-950 shadow-2xs' : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              My Chats
            </button>
            <button
              type="button"
              onClick={() => setFilter('converted')}
              className={`flex-1 rounded-md py-1 transition-all ${
                filter === 'converted' ? 'bg-white font-semibold text-zinc-950 shadow-2xs' : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              Leads
            </button>
          </div>
        </div>

        {/* Channel quick filter */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-zinc-100 px-3 py-2 text-[11px]">
          {['all', 'facebook', 'instagram', 'whatsapp', 'tiktok'].map((prov) => {
            const Icon = PROVIDER_ICONS[prov];
            const isProvActive = providerFilter === prov;
            return (
              <button
                key={prov}
                type="button"
                onClick={() => setProviderFilter(prov)}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 capitalize transition-all ${
                  isProvActive
                    ? 'border border-zinc-950 bg-zinc-950 font-medium text-white'
                    : 'border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
                }`}
              >
                {Icon && <Icon className="h-3 w-3" />}
                {prov}
              </button>
            );
          })}
        </div>

        {/* Conversation List Items */}
        <div className="flex-1 divide-y divide-zinc-100 overflow-y-auto">
          {isLoadingList ? (
            <div className="flex flex-col items-center justify-center p-8 text-xs text-zinc-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="mt-2">Loading inbox...</span>
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-400">
              <MessageSquare className="mx-auto h-7 w-7 text-zinc-300" />
              <p className="mt-2 font-medium text-zinc-600">No conversations found</p>
              <p className="mt-1 text-[11px] text-zinc-400">
                {filter === 'unconverted' ? 'All conversations have been converted to leads!' : 'Inbound messages will arrive here.'}
              </p>
            </div>
          ) : (
            conversations.map((c) => {
              const isSelected = selectedId === c.id;
              const Icon = PROVIDER_ICONS[c.provider] || MessageSquare;
              const style = PROVIDER_COLORS[c.provider] || { bg: 'bg-zinc-100', text: 'text-zinc-700', border: 'border-zinc-200' };
              const isUnconverted = !c.lead_id;

              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left transition-all p-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 ${
                    isSelected
                      ? 'bg-zinc-100/90 border-l-2 border-l-zinc-950'
                      : 'hover:bg-zinc-50/80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="relative shrink-0">
                        {c.customer_avatar_url ? (
                          <img
                            src={getSafeMediaUrl(c.customer_avatar_url)}
                            alt={c.customer_name || 'Traveler'}
                            referrerPolicy="no-referrer"
                            className="h-7 w-7 rounded-full object-cover border border-zinc-200"
                            loading="lazy"
                            onError={(e) => {
                              (e.currentTarget as HTMLElement).style.display = 'none';
                              const fallback = (e.currentTarget as HTMLElement).nextElementSibling as HTMLElement | null;
                              if (fallback) fallback.style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <span
                          style={{ display: c.customer_avatar_url ? 'none' : 'flex' }}
                          className={`h-7 w-7 items-center justify-center rounded-full border ${style.border} ${style.bg} ${style.text} text-[10px] font-semibold`}
                        >
                          {(c.customer_name || 'T').slice(0, 2).toUpperCase()}
                        </span>
                        <span className={`absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white ${style.bg} ${style.text}`}>
                          <Icon className="h-2 w-2" />
                        </span>
                      </div>
                      <div className="min-w-0">
                        <span className="truncate block text-xs font-semibold text-zinc-950">
                          {c.customer_name || 'Traveler'}
                        </span>
                        {c.metadata?.meta_page_name && (
                          <span className="block truncate text-[10px] text-zinc-400">
                            {c.metadata.meta_page_name}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="font-mono text-[10px] text-zinc-400 shrink-0">
                      {formatTime(c.last_message_at)}
                    </span>
                  </div>

                  <p className="mt-1.5 line-clamp-2 text-[11px] text-zinc-500">
                    {c.last_message_preview || 'No messages yet'}
                  </p>

                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      {isUnconverted ? (
                        <span className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-blue-700">
                          Unconverted
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-medium text-emerald-800">
                          <CheckCircle2 className="h-2.5 w-2.5" /> Lead: {c.lead?.destination || 'Active'}
                        </span>
                      )}
                    </div>
                    {c.unread_count > 0 && (
                      <span className="flex h-2 w-2 rounded-full bg-blue-600" />
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* COLUMN 2: Chat Canvas (Flex 1) */}
      {/* ========================================================================= */}
      <section className="flex flex-1 flex-col overflow-hidden bg-zinc-50" aria-label="Conversation Thread">
        {!activeConversation ? (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-200 bg-white shadow-2xs">
              <MessageSquare className="h-6 w-6 text-zinc-400" />
            </div>
            <h2 className="mt-3 text-sm font-semibold text-zinc-800">No conversation selected</h2>
            <p className="mt-1 max-w-sm text-xs text-zinc-500">
              Select an inquiry from the left panel to review traveler messages, reply directly, or qualify and convert into a sales lead.
            </p>
          </div>
        ) : (
          <>
            {/* Thread Header */}
            <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3 shadow-2xs">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => activeConversation.customer_avatar_url && setLightboxImage(activeConversation.customer_avatar_url)}
                  className="shrink-0 group relative focus-visible:outline-none"
                  title="Click to view full photo"
                >
                  {activeConversation.customer_avatar_url ? (
                    <img
                      src={getSafeMediaUrl(activeConversation.customer_avatar_url)}
                      alt={activeConversation.customer_name || 'Traveler'}
                      referrerPolicy="no-referrer"
                      className="h-10 w-10 rounded-full border border-zinc-200 object-cover group-hover:ring-2 group-hover:ring-zinc-950 transition"
                      onError={(e) => {
                        (e.currentTarget as HTMLElement).style.display = 'none';
                        const fallback = (e.currentTarget as HTMLElement).nextElementSibling as HTMLElement | null;
                        if (fallback) fallback.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div
                    style={{ display: activeConversation.customer_avatar_url ? 'none' : 'flex' }}
                    className="h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-zinc-800 font-semibold text-sm"
                  >
                    {activeConversation.customer_name?.[0]?.toUpperCase() || 'T'}
                  </div>
                  {activeConversation.customer_avatar_url && (
                    <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition text-white">
                      <Maximize2 className="h-3.5 w-3.5" />
                    </span>
                  )}
                </button>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm font-semibold text-zinc-950 truncate">
                      {activeConversation.customer_name || 'Traveler'}
                    </h2>
                    <span className="inline-flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium capitalize text-zinc-600">
                      {activeConversation.provider}
                    </span>
                    {replyWindow && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          replyWindow.isOpen
                            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20'
                            : 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20'
                        }`}
                        title={
                          replyWindow.isOpen
                            ? `Meta 24-Hour Policy: You can send standard messages for the next ${replyWindow.label}`
                            : 'Meta 24-Hour Policy Window has closed. Messages require Meta Message Tags.'
                        }
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            replyWindow.isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                          }`}
                        />
                        Meta 24h: {replyWindow.label}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-zinc-400 mt-0.5">
                    {activeConversation.metadata?.meta_page_name && (
                      <span className="font-medium text-zinc-600">Page: {activeConversation.metadata.meta_page_name}</span>
                    )}
                    {activeConversation.customer_phone && <span className="font-mono">{activeConversation.customer_phone}</span>}
                    {activeConversation.customer_email && <span>{activeConversation.customer_email}</span>}
                  </div>
                </div>
              </div>

              {/* Conversion CTA & Meta Business Suite Link */}
              <div className="flex items-center gap-2 shrink-0">
                {activeConversation.metadata?.meta_link && (
                  <a
                    href={activeConversation.metadata.meta_link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 shadow-2xs hover:bg-zinc-50 hover:text-zinc-950"
                    title="Open this conversation in Meta Business Suite"
                  >
                    <ExternalLink className="h-3.5 w-3.5 text-zinc-400" />
                    <span>Meta Suite</span>
                  </a>
                )}
                {!activeConversation.lead_id ? (
                  <button
                    type="button"
                    onClick={() => setIsConvertDrawerOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950"
                  >
                    <UserCheck className="h-3.5 w-3.5" />
                    Convert to Lead
                  </button>
                ) : (
                  <Link
                    href={`/leads/${activeConversation.lead_id}/workspace`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-2xs hover:bg-zinc-50"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    View Lead Workspace
                  </Link>
                )}
              </div>
            </div>

            {/* Message Stream */}
            <div className="flex-1 space-y-3 overflow-y-auto p-6 text-xs">
              {isLoadingMessages ? (
                <div className="flex h-full items-center justify-center text-zinc-400">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="py-12 text-center text-zinc-400">
                  <p>No messages recorded for this thread yet.</p>
                </div>
              ) : (
                messages.map((m) => {
                  const isInbound = m.direction === 'inbound';
                  const isInternal = m.direction === 'internal';

                  if (isInternal) {
                    return (
                      <div key={m.id} className="mx-auto my-2 max-w-md rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-amber-900 shadow-2xs">
                        <div className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                          <span className="flex items-center gap-1">
                            <StickyNote className="h-3 w-3" /> Internal Agent Note
                          </span>
                          <span className="font-mono">{formatTime(m.sent_at)}</span>
                        </div>
                        <p className="mt-1 text-xs whitespace-pre-wrap leading-relaxed">{m.body}</p>
                        {m.author_profile?.full_name && (
                          <div className="mt-1 text-[10px] text-amber-600">— {m.author_profile.full_name}</div>
                        )}
                      </div>
                    );
                  }

                  const attachments = extractAttachments(m);
                  const isMetaSuite = m.metadata?.sent_via === 'meta_business_suite';
                  const tags = Array.isArray(m.metadata?.tags) ? (m.metadata.tags as string[]) : [];

                  const photoAttachments = attachments.filter((a) => a.type === 'image');
                  const audioAttachments = attachments.filter((a) => a.type === 'audio');
                  const fileAttachments = attachments.filter((a) => a.type === 'file' || a.type === 'video');

                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isInbound ? 'items-start' : 'items-end'}`}
                    >
                      <div
                        className={`max-w-[78%] rounded-xl px-4 py-2.5 shadow-2xs ${
                          isInbound
                            ? 'border border-zinc-200 bg-white text-zinc-900'
                            : 'bg-zinc-950 text-white'
                        }`}
                      >
                        {/* Single Photo Attachment */}
                        {photoAttachments.length === 1 && (
                          <div className="relative group my-1.5 overflow-hidden rounded-lg border border-black/10 bg-zinc-900/40">
                            <img
                              src={getSafeMediaUrl(photoAttachments[0].previewUrl || photoAttachments[0].url)}
                              alt={photoAttachments[0].name}
                              referrerPolicy="no-referrer"
                              className="max-h-72 w-full object-cover cursor-pointer hover:scale-[1.01] transition-transform duration-200"
                              loading="lazy"
                              onClick={() => setLightboxImage(photoAttachments[0].url)}
                              onError={(e) => {
                                // Direct fallback if proxy has issue
                                const target = e.currentTarget;
                                if (target.src !== photoAttachments[0].url) {
                                  target.src = photoAttachments[0].url;
                                }
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => setLightboxImage(photoAttachments[0].url)}
                              className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition text-white text-xs font-medium gap-1.5"
                            >
                              <Maximize2 className="h-4 w-4" />
                              <span>View High-Res Photo</span>
                            </button>
                          </div>
                        )}

                        {/* Multi-Photo Grid Attachment */}
                        {photoAttachments.length > 1 && (
                          <div
                            className={`my-1.5 grid gap-1.5 overflow-hidden rounded-lg border border-black/10 ${
                              photoAttachments.length === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'
                            }`}
                          >
                            {photoAttachments.map((photo) => (
                              <div key={photo.id} className="relative group aspect-square bg-zinc-900/40 overflow-hidden">
                                <img
                                  src={getSafeMediaUrl(photo.previewUrl || photo.url)}
                                  alt={photo.name}
                                  referrerPolicy="no-referrer"
                                  className="h-full w-full object-cover cursor-pointer hover:scale-105 transition-transform duration-200"
                                  loading="lazy"
                                  onClick={() => setLightboxImage(photo.url)}
                                  onError={(e) => {
                                    const target = e.currentTarget;
                                    if (target.src !== photo.url) {
                                      target.src = photo.url;
                                    }
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={() => setLightboxImage(photo.url)}
                                  className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition text-white"
                                  aria-label="View photo"
                                >
                                  <Maximize2 className="h-4 w-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Inline Voice Note / Audio Player */}
                        {audioAttachments.map((audio) => (
                          <div key={audio.id} className="my-2 rounded-lg bg-zinc-100/90 p-2 border border-zinc-200/80 text-zinc-900">
                            <div className="flex items-center gap-2 mb-1 text-[11px] font-medium text-zinc-700">
                              <Music className="h-3.5 w-3.5 text-zinc-500" />
                              <span>Voice Note / Audio Clip</span>
                            </div>
                            <audio controls src={getSafeMediaUrl(audio.url)} className="h-8 w-full max-w-[280px]" />
                          </div>
                        ))}

                        {/* File / Video Attachment */}
                        {fileAttachments.map((file) => (
                          <a
                            key={file.id}
                            href={getSafeMediaUrl(file.url)}
                            target="_blank"
                            rel="noreferrer"
                            className="my-1.5 flex items-center gap-2.5 rounded-lg border border-zinc-200 bg-zinc-50/80 p-2.5 hover:bg-zinc-100 transition text-zinc-900"
                          >
                            <FileText className="h-5 w-5 text-zinc-500 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="font-medium truncate text-[11px]">{file.name}</div>
                              <div className="text-[10px] text-zinc-400">
                                {file.size ? `${Math.round(file.size / 1024)} KB · Click to view/download` : 'Click to view file'}
                              </div>
                            </div>
                            <Download className="h-3.5 w-3.5 text-zinc-400" />
                          </a>
                        ))}

                        {/* Message Text */}
                        {m.body &&
                          (!photoAttachments.length || m.body !== '[Photo]') &&
                          (!audioAttachments.length || m.body !== '[Voice message]') && (
                            <p className="whitespace-pre-wrap text-xs leading-relaxed">{m.body}</p>
                          )}

                        {/* Meta Tags (e.g. Reel Reply, Private Reply) */}
                        {tags.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {tags.map((tag, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center rounded bg-black/5 px-1.5 py-0.2 text-[9px] font-mono text-zinc-500"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Timestamp & Metadata Footer */}
                      <div className="mt-1 flex items-center gap-1.5 px-1 text-[10px] text-zinc-400">
                        <span className="font-mono">{formatTime(m.sent_at)}</span>
                        {!isInbound && (
                          <span>
                            • {isMetaSuite ? 'Meta Business Suite' : m.author_profile?.full_name || 'Agent'}
                          </span>
                        )}
                        {isMetaSuite && (
                          <span className="inline-flex items-center rounded bg-blue-50 px-1 py-0.2 text-[9px] font-medium text-blue-700">
                            FB Suite
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Bottom Composer */}
            <div className="border-t border-zinc-200 bg-white p-4">
              {/* Mode switch & Quick reply templates */}
              <div className="mb-2 flex items-center justify-between text-xs">
                <div className="flex items-center gap-1 rounded-md bg-zinc-100 p-0.5 text-[11px] font-medium">
                  <button
                    type="button"
                    onClick={() => setReplyMode('outbound')}
                    className={`rounded px-2.5 py-1 transition-all ${
                      replyMode === 'outbound' ? 'bg-white font-semibold text-zinc-900 shadow-2xs' : 'text-zinc-500 hover:text-zinc-800'
                    }`}
                  >
                    Reply to Traveler ({activeConversation.provider})
                  </button>
                  <button
                    type="button"
                    onClick={() => setReplyMode('internal')}
                    className={`rounded px-2.5 py-1 transition-all ${
                      replyMode === 'internal' ? 'bg-amber-100 font-semibold text-amber-900 shadow-2xs' : 'text-zinc-500 hover:text-zinc-800'
                    }`}
                  >
                    Internal Note
                  </button>
                </div>

                {/* Templates Selector */}
                {templates.length > 0 && replyMode === 'outbound' && (
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        setReplyBody((prev) => (prev ? `${prev}\n${e.target.value}` : e.target.value));
                        e.target.value = '';
                      }
                    }}
                    className="rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 shadow-2xs hover:bg-zinc-50 focus:outline-none"
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Quick Templates...
                    </option>
                    {templates.map((tpl) => (
                      <option key={tpl.id} value={tpl.content}>
                        {tpl.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Textarea + Submit */}
              <form onSubmit={handleSendMessage} className="relative">
                <textarea
                  rows={2}
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      void handleSendMessage();
                    }
                  }}
                  placeholder={
                    replyMode === 'internal'
                      ? 'Add an internal note visible only to your agency team...'
                      : `Reply directly to ${activeConversation.customer_name || 'traveler'}... (Cmd+Enter to send)`
                  }
                  className={`w-full resize-none rounded-lg border p-3 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-1 ${
                    replyMode === 'internal'
                      ? 'border-amber-300 bg-amber-50/40 focus:border-amber-500 focus:ring-amber-500'
                      : 'border-zinc-200 bg-white focus:border-zinc-950 focus:ring-zinc-950'
                  }`}
                />
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[11px] text-zinc-400">Press Cmd+Enter to send</span>
                  <button
                    type="submit"
                    disabled={!replyBody.trim() || isSending}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold shadow-2xs transition-all disabled:opacity-40 ${
                      replyMode === 'internal'
                        ? 'bg-amber-600 text-white hover:bg-amber-700'
                        : 'bg-zinc-950 text-white hover:bg-zinc-800'
                    }`}
                  >
                    {isSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    {replyMode === 'internal' ? 'Add Note' : 'Send'}
                  </button>
                </div>
              </form>
            </div>
          </>
        )}
      </section>

      {/* ========================================================================= */}
      {/* COLUMN 3: Lead, Contact & Media Inspector (Width 300px) */}
      {/* ========================================================================= */}
      {activeConversation && (
        <aside className="hidden w-80 shrink-0 flex-col border-l border-zinc-200 bg-white p-5 lg:flex overflow-y-auto" aria-label="Lead & Contact Inspector">
          {/* Header Tabs: Overview vs Shared Media */}
          <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setInspectorTab('details')}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                  inspectorTab === 'details'
                    ? 'bg-zinc-950 text-white'
                    : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
                }`}
              >
                Overview
              </button>
              <button
                type="button"
                onClick={() => setInspectorTab('media')}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                  inspectorTab === 'media'
                    ? 'bg-zinc-950 text-white'
                    : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
                }`}
              >
                <ImageIcon className="h-3 w-3" />
                <span>Media</span>
                <span className="rounded-full bg-zinc-200 px-1.5 py-0.2 text-[10px] font-mono text-zinc-700">
                  {sharedMedia.total}
                </span>
              </button>
            </div>
          </div>

          {/* TAB 1: DETAILS & META WORKFLOW */}
          {inspectorTab === 'details' && (
            <div className="mt-4 space-y-4 text-xs">
              {/* Customer Profile Box with High-Res Avatar */}
              <div className="rounded-lg border border-zinc-200 bg-zinc-50/70 p-3.5">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => activeConversation.customer_avatar_url && setLightboxImage(activeConversation.customer_avatar_url)}
                    className="relative group shrink-0"
                    title="Click to view full photo"
                  >
                    {activeConversation.customer_avatar_url ? (
                      <img
                        src={getSafeMediaUrl(activeConversation.customer_avatar_url)}
                        alt={activeConversation.customer_name || 'Traveler'}
                        referrerPolicy="no-referrer"
                        className="h-12 w-12 rounded-full border border-zinc-200 object-cover shadow-2xs group-hover:ring-2 group-hover:ring-zinc-950 transition"
                        onError={(e) => {
                          (e.currentTarget as HTMLElement).style.display = 'none';
                          const fallback = (e.currentTarget as HTMLElement).nextElementSibling as HTMLElement | null;
                          if (fallback) fallback.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div
                      style={{ display: activeConversation.customer_avatar_url ? 'none' : 'flex' }}
                      className="h-12 w-12 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-sm font-bold text-zinc-800"
                    >
                      {(activeConversation.customer_name || 'T').slice(0, 2).toUpperCase()}
                    </div>
                    {activeConversation.customer_avatar_url && (
                      <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition text-white">
                        <Maximize2 className="h-4 w-4" />
                      </span>
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-zinc-950 truncate text-sm">
                      {activeConversation.customer_name || 'Traveler'}
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-zinc-500 truncate">
                      {activeConversation.customer_phone || 'No phone'}
                    </div>
                    {activeConversation.customer_email && (
                      <div className="text-[11px] text-zinc-500 truncate">{activeConversation.customer_email}</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Meta Workflow & Platform Details */}
              <div className="rounded-lg border border-zinc-200 bg-zinc-50/70 p-3.5 space-y-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 flex items-center justify-between">
                  <span>Meta Workflow & Policy</span>
                  <span className="font-mono text-[9px] text-zinc-400">v26.0</span>
                </div>

                {activeConversation.metadata?.meta_page_name && (
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-500">Facebook Page:</span>
                    <span className="font-medium text-zinc-900 truncate max-w-[140px] text-right">
                      {activeConversation.metadata.meta_page_name}
                    </span>
                  </div>
                )}

                {/* 24-Hour Policy Window Tracker */}
                <div className="rounded-md border border-zinc-200 bg-white p-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-500">24h Policy Window:</span>
                    <span
                      className={`inline-flex items-center gap-1 font-semibold ${
                        replyWindow?.isOpen ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          replyWindow?.isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                        }`}
                      />
                      {replyWindow?.isOpen ? 'Active' : 'Expired'}
                    </span>
                  </div>
                  <div className="mt-1 text-[10px] text-zinc-500">
                    {replyWindow?.isOpen ? (
                      <span>Free-form reply allowed for <strong>{replyWindow.label}</strong></span>
                    ) : (
                      <span>Standard window closed. Outbound message tags required.</span>
                    )}
                  </div>
                </div>

                {activeConversation.metadata?.message_count !== undefined && (
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-500">Exchanged Messages:</span>
                    <span className="font-mono text-zinc-900 font-medium">
                      {activeConversation.metadata.message_count}
                    </span>
                  </div>
                )}

                {/* Customer PSID with Copy */}
                {activeConversation.external_contact_id && (
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-500">Customer PSID:</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(activeConversation.external_contact_id || '', 'psid')}
                      className="inline-flex items-center gap-1 font-mono text-[10px] text-zinc-700 hover:text-zinc-950"
                      title="Copy PSID"
                    >
                      <span>{activeConversation.external_contact_id.slice(0, 10)}...</span>
                      {copiedKey === 'psid' ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3 text-zinc-400" />}
                    </button>
                  </div>
                )}

                {/* Scoped Thread Key */}
                {activeConversation.metadata?.scoped_thread_key && (
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-500">Thread Key:</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(activeConversation.metadata?.scoped_thread_key || '', 'thread_key')}
                      className="inline-flex items-center gap-1 font-mono text-[10px] text-zinc-700 hover:text-zinc-950"
                      title="Copy Thread Key"
                    >
                      <span className="truncate max-w-[120px]">{activeConversation.metadata.scoped_thread_key}</span>
                      {copiedKey === 'thread_key' ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3 text-zinc-400" />}
                    </button>
                  </div>
                )}

                {/* Direct Meta Business Suite Link */}
                {activeConversation.metadata?.meta_link && (
                  <div className="pt-2 border-t border-zinc-200/60">
                    <a
                      href={activeConversation.metadata.meta_link}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-zinc-200 bg-white py-1.5 text-xs font-medium text-zinc-700 shadow-2xs hover:bg-zinc-50 hover:text-zinc-950"
                    >
                      <ExternalLink className="h-3.5 w-3.5 text-zinc-400" />
                      <span>Open in Meta Business Suite</span>
                    </a>
                  </div>
                )}
              </div>

              {/* Conversation Status & Assignment */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-zinc-600">
                  <span>Channel:</span>
                  <span className="font-medium capitalize text-zinc-900">{activeConversation.provider}</span>
                </div>
                <div className="flex items-center justify-between text-zinc-600">
                  <span>Status:</span>
                  <select
                    value={activeConversation.status}
                    onChange={(e) => void handleUpdateStatus(e.target.value as any)}
                    className="rounded border border-zinc-200 bg-white px-2 py-0.5 text-xs text-zinc-800 focus:outline-none"
                  >
                    <option value="open">Open</option>
                    <option value="closed">Closed</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
                <div className="flex items-center justify-between text-zinc-600">
                  <span>Assigned:</span>
                  <span className="font-medium text-zinc-900 truncate max-w-[120px]">
                    {activeConversation.assigned_profile?.full_name || 'Unassigned'}
                  </span>
                </div>
              </div>

              {/* Conversion Status Card */}
              <div className="border-t border-zinc-100 pt-4">
                {!activeConversation.lead_id ? (
                  <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-3.5 text-blue-900">
                    <div className="flex items-center gap-1.5 font-semibold text-xs text-blue-950">
                      <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                      Unconverted Chat
                    </div>
                    <p className="mt-1 text-[11px] text-blue-700 leading-relaxed">
                      This inquiry is in your inbox but not yet counted as an active lead in your sales pipeline.
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsConvertDrawerOpen(true)}
                      className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-zinc-950 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-zinc-800"
                    >
                      <UserCheck className="h-3.5 w-3.5" />
                      Convert to Lead
                    </button>
                  </div>
                ) : (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3.5 text-emerald-950">
                    <div className="flex items-center gap-1.5 font-semibold text-xs">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      Qualified Lead
                    </div>
                    <div className="mt-2 space-y-1 text-[11px] text-emerald-800">
                      <div>Destination: <strong className="text-zinc-900">{activeConversation.lead?.destination}</strong></div>
                      <div>Stage: <strong className="capitalize text-zinc-900">{activeConversation.lead?.stage}</strong></div>
                      <div>Priority: <strong className="capitalize text-zinc-900">{activeConversation.lead?.priority}</strong></div>
                    </div>
                    <Link
                      href={`/leads/${activeConversation.lead_id}/workspace`}
                      className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-zinc-200 bg-white py-2 text-xs font-semibold text-zinc-800 shadow-2xs hover:bg-zinc-50"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open Lead Workspace
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: SHARED MEDIA & CUSTOMER PHOTOS GALLERY */}
          {inspectorTab === 'media' && (
            <div className="mt-4 space-y-4 text-xs">
              {sharedMedia.total === 0 ? (
                <div className="p-8 text-center text-zinc-400">
                  <ImageIcon className="mx-auto h-8 w-8 text-zinc-300 mb-2" />
                  <p className="font-medium text-zinc-600">No media shared yet</p>
                  <p className="text-[11px] mt-1 text-zinc-400">Photos, voice clips, and documents sent in this chat will appear here.</p>
                </div>
              ) : (
                <>
                  {/* Customer Photos Gallery Grid */}
                  {sharedMedia.photos.length > 0 && (
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2 flex items-center justify-between">
                        <span>Photos & Images ({sharedMedia.photos.length})</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {sharedMedia.photos.map((photo) => (
                          <button
                            key={photo.id}
                            type="button"
                            onClick={() => setLightboxImage(photo.url)}
                            className="group relative aspect-square overflow-hidden rounded-md border border-zinc-200 bg-zinc-100 focus-visible:outline-none"
                            title="Click to view full photo"
                          >
                            <img
                              src={getSafeMediaUrl(photo.preview || photo.url)}
                              alt={photo.name || 'Photo'}
                              referrerPolicy="no-referrer"
                              className="h-full w-full object-cover group-hover:scale-105 transition duration-200"
                              loading="lazy"
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition text-white">
                              <Maximize2 className="h-3.5 w-3.5" />
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Voice Notes & Audio Clips */}
                  {sharedMedia.audios.length > 0 && (
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                        Voice Notes ({sharedMedia.audios.length})
                      </div>
                      <div className="space-y-2">
                        {sharedMedia.audios.map((audio) => (
                          <div key={audio.id} className="rounded-lg border border-zinc-200 bg-zinc-50 p-2">
                            <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 mb-1">
                              <Music className="h-3 w-3" />
                              <span className="font-mono">{formatTime(audio.sentAt)}</span>
                            </div>
                            <audio controls src={getSafeMediaUrl(audio.url)} className="h-7 w-full" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Files & Documents */}
                  {sharedMedia.files.length > 0 && (
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                        Files & Documents ({sharedMedia.files.length})
                      </div>
                      <div className="space-y-1.5">
                        {sharedMedia.files.map((file) => (
                          <a
                            key={file.id}
                            href={getSafeMediaUrl(file.url)}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-between rounded-md border border-zinc-200 bg-zinc-50 p-2 hover:bg-zinc-100 transition text-zinc-900"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText className="h-4 w-4 text-zinc-500 shrink-0" />
                              <span className="truncate text-[11px] font-medium">{file.name || 'Document'}</span>
                            </div>
                            <Download className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </aside>
      )}

      {/* Convert to Lead Drawer */}
      <ConvertToLeadDrawer
        isOpen={isConvertDrawerOpen}
        onClose={() => setIsConvertDrawerOpen(false)}
        conversation={activeConversation}
        onConverted={handleConverted}
      />

      {/* Interactive Photo Lightbox Modal */}
      {lightboxImage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="High Resolution Photo Preview"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={() => setLightboxImage(null)}
        >
          {/* Lightbox Top Control Bar */}
          <div
            className="absolute top-4 right-4 flex items-center gap-2 z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <a
              href={getSafeMediaUrl(lightboxImage)}
              download="photo.jpg"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 transition backdrop-blur-md"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download</span>
            </a>
            <button
              type="button"
              onClick={() => setLightboxImage(null)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white/10 text-white hover:bg-white/20 transition backdrop-blur-md"
              aria-label="Close photo preview"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Lightbox Image Container */}
          <div
            className="max-h-[90vh] max-w-[90vw] overflow-hidden rounded-lg shadow-2xl flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={getSafeMediaUrl(lightboxImage)}
              alt="High Resolution Customer Photo"
              referrerPolicy="no-referrer"
              className="max-h-[85vh] max-w-[85vw] object-contain rounded-md"
            />
          </div>
        </div>
      )}
    </div>
  );
}
