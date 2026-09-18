'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  AlarmClock,
  AlertTriangle,
  ArrowLeft,
  AtSign,
  Bot,
  CheckCircle2,
  Clock3,
  History,
  Inbox as InboxIcon,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  PanelRight,
  Pause,
  PauseCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  UserCheck,
  UserPlus,
  UserRound,
  Users,
  WandSparkles,
  X,
} from 'lucide-react';
import { useApp } from '@/lib/store';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';
import { useWorkspacePermissions } from '@/lib/use-workspace-permissions';
import { getSupabaseBrowserClient, isSupabaseConfigured, syncRealtimeAuth } from '@/lib/supabase/client';
import ConvertToLeadDrawer, { type ConversationForConversion } from '@/components/inbox/ConvertToLeadDrawer';
import MetaConversationTimeline from '@/components/inbox/MetaConversationTimeline';
import InboxComposer, { type InboxComposerAttachment } from '@/components/inbox/InboxComposer';
import InboxConversationListItem from '@/components/inbox/InboxConversationListItem';
import InboxContextExtras from '@/components/inbox/InboxContextExtras';
import ConversationPresenceIndicator from '@/components/inbox/ConversationPresenceIndicator';
import { useConversationPresence } from '@/lib/inbox/use-conversation-presence';

type QueueKey = 'all' | 'mine' | 'unassigned' | 'collaborations' | 'unread' | 'needs_reply' | 'sla_overdue' | 'high_priority' | 'has_phone' | 'waiting' | 'snoozed' | 'closed';
type WorkflowState = 'open' | 'waiting' | 'snoozed' | 'closed';
type Priority = 'low' | 'normal' | 'high' | 'urgent';
type SortKey = 'newest' | 'oldest' | 'waiting' | 'sla';
type ReplyMode = 'outbound' | 'internal';
type ContextTab = 'details' | 'history' | 'assist' | 'crm';
type UnknownRecord = Record<string, unknown>;

type Contact = {
  id: string;
  display_name: string | null;
  primary_phone: string | null;
  primary_email: string | null;
  lifecycle_key: string;
  owner_id: string | null;
  tags: unknown;
  custom_data: Record<string, unknown> | null;
};

type LeadSummary = {
  id: string;
  lead_code?: string | null;
  customer_name: string;
  stage: string;
  priority: string;
};

type Conversation = ConversationForConversion & {
  workspace_id: string;
  contact_id: string | null;
  lead_id: string | null;
  customer_avatar_url: string | null;
  workflow_state: WorkflowState;
  priority: Priority;
  needs_reply: boolean;
  snoozed_until: string | null;
  first_response_due_at: string | null;
  next_action_at: string | null;
  first_responded_at: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  closed_at: string | null;
  resolution_code: string | null;
  closing_note: string | null;
  unread_count: number;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  converted_at?: string | null;
  contact: Contact | Contact[] | null;
  lead: LeadSummary | LeadSummary[] | null;
  assigned_profile: { id: string; full_name: string | null; email: string; role: string; status?: string } | null;
};

type Message = {
  id: string;
  conversation_id?: string;
  direction: 'inbound' | 'outbound' | 'internal';
  message_type: string;
  body: string | null;
  metadata?: Record<string, unknown> | null;
  delivery_status?: string | null;
  failure_message?: string | null;
  sent_at: string;
  author_profile?: { full_name?: string | null } | null;
  client_request_id?: string | null;
};

type TimelineEvent = { id: string; event_type: string; payload: Record<string, unknown>; created_at: string; actor_id?: string | null; actor: { full_name: string | null } | null };
type Collaborator = { user_id: string; user: { id: string; full_name: string | null; email: string; role: string } | null };
type Metrics = { totalOpen: number; unassigned: number; collaborations: number; waiting: number; snoozed: number; unread: number; needsReply: number; slaOverdue: number; highPriority: number; hasPhone: number };
type SavedView = { id: string; name: string; filters: { filter?: QueueKey; provider?: string; state?: string; priority?: string; sort?: SortKey; search?: string }; is_shared: boolean; owner_id: string; sort_order: number };
type Session = { id: string; owner_id: string | null; opened_at: string; first_response_seconds: number | null; closed_at: string | null; resolution_code: string | null; closing_note: string | null; resolution_seconds: number | null; is_current: boolean; owner?: { full_name?: string | null; email?: string } | null };
type AssistResult = { mode: 'provider' | 'local'; action: 'summary' | 'reply' | 'extract'; result?: string; data?: Record<string, unknown> };
type ThreadSnapshot = { conversation: Conversation; messages: Message[]; messageTotal: number; hasOlderMessages: boolean; messageLimit: number; fetchedAt: number };
type SecondarySnapshot = { events: TimelineEvent[]; collaborators: Collaborator[]; fetchedAt: number };
type ListSnapshot = { conversations: Conversation[]; metrics: Metrics; selectedId: string | null; fetchedAt: number };
type SavedViewsSnapshot = { views: SavedView[]; fetchedAt: number };
type AiAgentInfo = { id: string; name: string; model: string; mode: string; is_active: boolean };
type AiState = {
  conversation_id: string;
  agent_id: string | null;
  state: 'active' | 'paused' | 'handed_off' | 'failed' | 'disabled';
  draft_reply?: string | null;
  last_ai_at?: string | null;
  handoff_reason?: string | null;
  last_error?: string | null;
  agent?: AiAgentInfo | AiAgentInfo[] | null;
};

function agentName(state: AiState | null): string {
  if (!state?.agent) return 'AI Agent';
  const a = Array.isArray(state.agent) ? state.agent[0] : state.agent;
  return a?.name || 'AI Agent';
}

const EMPTY_METRICS: Metrics = { totalOpen: 0, unassigned: 0, collaborations: 0, waiting: 0, snoozed: 0, unread: 0, needsReply: 0, slaOverdue: 0, highPriority: 0, hasPhone: 0 };
const EVENT_TYPES = new Set(['state_changed', 'assigned', 'priority_changed', 'lifecycle_changed', 'next_action_changed', 'contact_tag_changed', 'collaborator_added', 'collaborator_removed']);
const THREAD_TTL_MS = 30_000;
const SECONDARY_TTL_MS = 60_000;
const INITIAL_MESSAGE_LIMIT = 160;
const RUNTIME_LIST_CACHE = new Map<string, ListSnapshot>();
const RUNTIME_THREAD_CACHE = new Map<string, ThreadSnapshot>();
const RUNTIME_SECONDARY_CACHE = new Map<string, SecondarySnapshot>();
const RUNTIME_SESSIONS_CACHE = new Map<string, Session[]>();
const RUNTIME_SAVED_VIEWS_CACHE = new Map<string, SavedViewsSnapshot>();

function remember<T>(cache: Map<string, T>, key: string, value: T, maxEntries: number) {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > maxEntries) {
    const oldest = cache.keys().next().value as string | undefined;
    if (!oldest) break;
    cache.delete(oldest);
  }
}
function scopedCacheKey(scope: string, id: string) { return `${scope}::${id}`; }
function listCacheKey(scope: string, queue: QueueKey, provider: string, sort: SortKey, state: string, priority: string, search: string) {
  return JSON.stringify([scope, queue, provider, sort, state, priority, search]);
}
function createScopedRuntimeCache<T>(backing: Map<string, T>, scope: () => string, maxEntries: number) {
  return {
    get(id: string) { return backing.get(scopedCacheKey(scope(), id)); },
    set(id: string, value: T) { remember(backing, scopedCacheKey(scope(), id), value, maxEntries); },
    delete(id: string) { return backing.delete(scopedCacheKey(scope(), id)); },
  };
}
function asRecord(value: unknown): UnknownRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {}; }
function contactOf(conversation: Conversation | null) { if (!conversation?.contact) return null; return Array.isArray(conversation.contact) ? conversation.contact[0] || null : conversation.contact; }
function leadOf(conversation: Conversation | null) { if (!conversation?.lead) return null; return Array.isArray(conversation.lead) ? conversation.lead[0] || null : conversation.lead; }
function initials(value?: string | null) { return (value || 'C').trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'C'; }
function label(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase()); }
function shortTime(value?: string | null) { if (!value) return '—'; const date = new Date(value); return date.toDateString() === new Date().toDateString() ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : date.toLocaleDateString([], { month: 'short', day: 'numeric' }); }
function duration(seconds?: number | null) { if (seconds == null) return '—'; if (seconds < 60) return `${seconds}s`; if (seconds < 3600) return `${Math.round(seconds / 60)}m`; return `${Math.round(seconds / 360) / 10}h`; }
function queueFromParam(value: string | null): QueueKey { const allowed: QueueKey[] = ['all','mine','unassigned','collaborations','unread','needs_reply','sla_overdue','high_priority','has_phone','waiting','snoozed','closed']; return allowed.includes(value as QueueKey) ? value as QueueKey : 'all'; }
function sortFromParam(value: string | null): SortKey { const allowed: SortKey[] = ['newest', 'oldest', 'waiting', 'sla']; return allowed.includes(value as SortKey) ? value as SortKey : 'newest'; }
function tabFromParam(value: string | null): ContextTab { const allowed: ContextTab[] = ['details', 'history', 'assist', 'crm']; return allowed.includes(value as ContextTab) ? value as ContextTab : 'details'; }
function providerFromParam(value: string | null): string { const allowed = ['all', 'facebook', 'instagram', 'whatsapp', 'email', 'website', 'tiktok']; return value && allowed.includes(value.toLowerCase()) ? value.toLowerCase() : 'all'; }
function parseInboxParams(source: { get: (key: string) => string | null }) {
  return {
    conversationId: source.get('conversationId') || source.get('id') || source.get('conversation') || null,
    queue: queueFromParam(source.get('view') || source.get('filter') || source.get('queue')),
    provider: providerFromParam(source.get('provider') || source.get('channel')),
    sort: sortFromParam(source.get('sort')),
    search: source.get('search') || source.get('q') || '',
    state: source.get('state') || '',
    priority: source.get('priority') || '',
    tab: tabFromParam(source.get('tab')),
  };
}
function sla(conversation: Conversation) { if (conversation.workflow_state === 'closed') return { text: 'Resolved', danger: false }; if (conversation.needs_reply && conversation.first_responded_at) return { text: 'Needs reply', danger: false }; if (conversation.first_responded_at) return { text: 'Responded', danger: false }; if (!conversation.first_response_due_at) return { text: 'No SLA', danger: false }; const ms = new Date(conversation.first_response_due_at).getTime() - Date.now(); const mins = Math.max(1, Math.floor(Math.abs(ms) / 60000)); return { text: ms < 0 ? `${mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h`} overdue` : `${mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h`} left`, danger: ms < 0 }; }

export default function StableInbox() {
  const params = useSearchParams();
  const initialParams = useMemo(() => parseInboxParams(params), [params]);
  const { currentUser, allProfiles, showToast } = useApp();
  const { config, term } = useWorkspace();
  const { can } = useWorkspacePermissions();
  const contactLabel = term('contact', 'Contact');
  const leadLabel = term('lead', 'Lead');
  const cacheScope = `${currentUser.id}::${config.workspace.id}`;
  const initialListKey = listCacheKey(cacheScope, initialParams.queue, initialParams.provider, initialParams.sort, initialParams.state, initialParams.priority, initialParams.search.trim());
  const initialListSnapshot = RUNTIME_LIST_CACHE.get(initialListKey);
  const initialSelectedId = initialParams.conversationId || initialListSnapshot?.selectedId || null;
  const initialThreadSnapshot = initialSelectedId ? RUNTIME_THREAD_CACHE.get(scopedCacheKey(cacheScope, initialSelectedId)) : undefined;
  const initialSecondarySnapshot = initialSelectedId ? RUNTIME_SECONDARY_CACHE.get(scopedCacheKey(cacheScope, initialSelectedId)) : undefined;
  const initialSessionsSnapshot = initialSelectedId ? RUNTIME_SESSIONS_CACHE.get(scopedCacheKey(cacheScope, initialSelectedId)) : undefined;
  const initialSavedViews = RUNTIME_SAVED_VIEWS_CACHE.get(cacheScope)?.views || [];

  const [queue, setQueue] = useState<QueueKey>(() => initialParams.queue);
  const [provider, setProvider] = useState(() => initialParams.provider);
  const [state, setState] = useState(() => initialParams.state);
  const [priority, setPriority] = useState(() => initialParams.priority);
  const [sort, setSort] = useState<SortKey>(() => initialParams.sort);
  const [search, setSearch] = useState(() => initialParams.search);
  const [debouncedSearch, setDebouncedSearch] = useState(() => initialParams.search);
  const [conversations, setConversations] = useState<Conversation[]>(() => initialListSnapshot?.conversations || []);
  const [metrics, setMetrics] = useState<Metrics>(() => initialListSnapshot?.metrics || EMPTY_METRICS);
  const [savedViews, setSavedViews] = useState<SavedView[]>(() => initialSavedViews);
  const [activeSavedView, setActiveSavedView] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(() => initialSelectedId);
  const [selected, setSelected] = useState<Conversation | null>(() => initialThreadSnapshot?.conversation || initialListSnapshot?.conversations.find((row) => row.id === initialSelectedId) || null);
  const [messages, setMessages] = useState<Message[]>(() => initialThreadSnapshot?.messages || []);
  const [messageTotal, setMessageTotal] = useState(() => initialThreadSnapshot?.messageTotal || 0);
  const [hasOlderMessages, setHasOlderMessages] = useState(() => initialThreadSnapshot?.hasOlderMessages || false);
  const [events, setEvents] = useState<TimelineEvent[]>(() => initialSecondarySnapshot?.events || []);
  const [collaborators, setCollaborators] = useState<Collaborator[]>(() => initialSecondarySnapshot?.collaborators || []);
  const [sessions, setSessions] = useState<Session[]>(() => initialSessionsSnapshot || []);
  const [contextTab, setContextTab] = useState<ContextTab>(() => initialParams.tab);
  const [contextOpen, setContextOpen] = useState(false);
  const [replyMode, setReplyMode] = useState<ReplyMode>('outbound');
  const [replyBody, setReplyBody] = useState('');
  const [loadingList, setLoadingList] = useState(() => !initialListSnapshot);
  const [loadingThread, setLoadingThread] = useState(() => Boolean(initialSelectedId && !initialThreadSnapshot));
  const [refreshingThread, setRefreshingThread] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [contextBusy, setContextBusy] = useState(false);
  const [assist, setAssist] = useState<AssistResult | null>(null);
  const [assisting, setAssisting] = useState<AssistResult['action'] | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const [resolution, setResolution] = useState('resolved');
  const [closingNote, setClosingNote] = useState('');
  const [aiState, setAiState] = useState<AiState | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [isAiReplying, setIsAiReplying] = useState(false);
  const aiReplyingTimer = useRef<number | null>(null);

  const cacheScopeRef = useRef(cacheScope);
  cacheScopeRef.current = cacheScope;
  const threadCache = useRef(createScopedRuntimeCache(RUNTIME_THREAD_CACHE, () => cacheScopeRef.current, 160));
  const secondaryCache = useRef(createScopedRuntimeCache(RUNTIME_SECONDARY_CACHE, () => cacheScopeRef.current, 160));
  const sessionsCache = useRef(createScopedRuntimeCache(RUNTIME_SESSIONS_CACHE, () => cacheScopeRef.current, 160));
  const selectedIdRef = useRef<string | null>(selectedId);
  const coreAbort = useRef<AbortController | null>(null);
  const coreRequestToken = useRef(0);
  const secondaryRequestToken = useRef(0);
  const listRefreshTimer = useRef<number | null>(null);
  const threadRefreshTimer = useRef<number | null>(null);
  const messagePaneRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const autoScrollRef = useRef(false);

  const selectedContact = contactOf(selected);
  const selectedLead = leadOf(selected);
  const presence = useConversationPresence({
    workspaceId: config.workspace.id,
    conversationId: selectedId,
    user: { id: currentUser.id, full_name: currentUser.full_name, avatar_url: currentUser.avatar_url },
  });

  const syncUrl = useCallback((updates: {
    conversationId?: string | null;
    view?: QueueKey | null;
    provider?: string | null;
    sort?: SortKey | null;
    search?: string | null;
    state?: string | null;
    priority?: string | null;
    tab?: ContextTab | null;
  }, options?: { replace?: boolean }) => {
    try {
      if (typeof window === 'undefined') return;
      const url = new URL(window.location.href);

      if ('conversationId' in updates) {
        if (updates.conversationId) {
          url.searchParams.set('conversationId', updates.conversationId);
        } else {
          url.searchParams.delete('conversationId');
          url.searchParams.delete('id');
          url.searchParams.delete('conversation');
        }
      }

      if ('view' in updates) {
        if (updates.view && updates.view !== 'all') {
          url.searchParams.set('view', updates.view);
        } else {
          url.searchParams.delete('view');
          url.searchParams.delete('filter');
          url.searchParams.delete('queue');
        }
      }

      if ('provider' in updates) {
        if (updates.provider && updates.provider !== 'all') {
          url.searchParams.set('provider', updates.provider);
        } else {
          url.searchParams.delete('provider');
          url.searchParams.delete('channel');
        }
      }

      if ('sort' in updates) {
        if (updates.sort && updates.sort !== 'newest') {
          url.searchParams.set('sort', updates.sort);
        } else {
          url.searchParams.delete('sort');
        }
      }

      if ('search' in updates) {
        const term = updates.search?.trim();
        if (term) {
          url.searchParams.set('search', term);
        } else {
          url.searchParams.delete('search');
          url.searchParams.delete('q');
        }
      }

      if ('state' in updates) {
        if (updates.state) {
          url.searchParams.set('state', updates.state);
        } else {
          url.searchParams.delete('state');
        }
      }

      if ('priority' in updates) {
        if (updates.priority) {
          url.searchParams.set('priority', updates.priority);
        } else {
          url.searchParams.delete('priority');
        }
      }

      if ('tab' in updates) {
        if (updates.tab && updates.tab !== 'details') {
          url.searchParams.set('tab', updates.tab);
        } else {
          url.searchParams.delete('tab');
        }
      }

      const nextSearch = url.searchParams.toString();
      const nextQuery = nextSearch ? `?${nextSearch}` : '';
      const nextUrl = `${url.pathname}${nextQuery}${url.hash}`;
      const currentQuery = window.location.search ? `?${new URLSearchParams(window.location.search).toString()}` : '';
      const currentUrl = `${window.location.pathname}${currentQuery}${window.location.hash}`;

      if (nextUrl !== currentUrl) {
        if (options?.replace) {
          window.history.replaceState(window.history.state, '', nextUrl);
        } else {
          window.history.pushState(window.history.state, '', nextUrl);
        }
      }
    } catch {
      // noop
    }
  }, []);

  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  useEffect(() => {
    const p = parseInboxParams(params);
    setSelectedId((curr) => (curr === p.conversationId ? curr : p.conversationId));
    setQueue((curr) => (curr === p.queue ? curr : p.queue));
    setProvider((curr) => (curr === p.provider ? curr : p.provider));
    setSort((curr) => (curr === p.sort ? curr : p.sort));
    setSearch((curr) => (curr === p.search ? curr : p.search));
    setDebouncedSearch((curr) => (curr === p.search ? curr : p.search));
    setState((curr) => (curr === p.state ? curr : p.state));
    setPriority((curr) => (curr === p.priority ? curr : p.priority));
    setContextTab((curr) => (curr === p.tab ? curr : p.tab));
  }, [params]);

  useEffect(() => {
    const onPopState = () => {
      const sp = new URLSearchParams(window.location.search);
      const p = parseInboxParams(sp);
      setSelectedId(p.conversationId);
      setQueue(p.queue);
      setProvider(p.provider);
      setSort(p.sort);
      setSearch(p.search);
      setDebouncedSearch(p.search);
      setState(p.state);
      setPriority(p.priority);
      setContextTab(p.tab);
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const trimmed = search.trim();
      setDebouncedSearch(trimmed);
      syncUrl({ search: trimmed }, { replace: true });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [search, syncUrl]);

  useEffect(() => {
    const onComposerError = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      showToast(detail || 'Composer action failed.', 'error');
    };
    window.addEventListener('inbox-composer-error', onComposerError);
    return () => window.removeEventListener('inbox-composer-error', onComposerError);
  }, [showToast]);

  const scrollToBottom = useCallback(() => {
    window.requestAnimationFrame(() => {
      const pane = messagePaneRef.current;
      if (pane) pane.scrollTop = pane.scrollHeight;
    });
  }, []);

  const loadViews = useCallback(async () => {
    const cached = RUNTIME_SAVED_VIEWS_CACHE.get(cacheScope);
    if (cached) setSavedViews(cached.views);
    try {
      const response = await fetch('/api/inbox/views', { cache: 'no-store' });
      if (response.ok) {
        const views = (await response.json()).views || [];
        setSavedViews(views);
        remember(RUNTIME_SAVED_VIEWS_CACHE, cacheScope, { views, fetchedAt: Date.now() }, 24);
      }
    } catch { /* optional */ }
  }, [cacheScope]);

  const loadList = useCallback(async (quiet = false) => {
    const currentListKey = listCacheKey(cacheScope, queue, provider, sort, state, priority, debouncedSearch);
    const cached = RUNTIME_LIST_CACHE.get(currentListKey);
    if (cached) {
      setConversations(cached.conversations);
      setMetrics(cached.metrics);
      if (!selectedIdRef.current && cached.selectedId) {
        selectedIdRef.current = cached.selectedId;
        setSelectedId(cached.selectedId);
      }
      setLoadingList(false);
    } else if (!quiet) {
      setLoadingList(true);
    }

    try {
      const query = new URLSearchParams({ filter: queue, provider, sort, limit: '180' });
      if (state) query.set('state', state);
      if (priority) query.set('priority', priority);
      if (debouncedSearch) query.set('search', debouncedSearch);
      const response = await fetch(`/api/conversations?${query.toString()}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to load Inbox.');
      const rows = (payload.conversations || []) as Conversation[];
      const nextMetrics = { ...EMPTY_METRICS, ...(payload.metrics || {}) };
      setConversations(rows);
      setMetrics(nextMetrics);

      let target = selectedIdRef.current;
      if (!target) {
        const fromParam = initialParams.conversationId;
        const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
        target = fromParam || (isDesktop ? rows[0]?.id : null) || null;
        if (target) {
          selectedIdRef.current = target;
          setSelectedId(target);
        }
        if (target && isDesktop && !fromParam && rows[0]?.id === target) {
          syncUrl({ conversationId: target }, { replace: true });
        }
      }

      remember(RUNTIME_LIST_CACHE, currentListKey, {
        conversations: rows,
        metrics: nextMetrics,
        selectedId: target,
        fetchedAt: Date.now(),
      }, 32);
    } catch (error) {
      if (!quiet && !cached) showToast(error instanceof Error ? error.message : 'Unable to load Inbox.', 'error');
    } finally {
      if (!quiet) setLoadingList(false);
    }
  }, [cacheScope, debouncedSearch, initialParams.conversationId, priority, provider, queue, showToast, sort, state, syncUrl]);

  const applyThreadSnapshot = useCallback((snapshot: ThreadSnapshot) => {
    setSelected(snapshot.conversation);
    setMessages(snapshot.messages);
    setMessageTotal(snapshot.messageTotal);
    setHasOlderMessages(snapshot.hasOlderMessages);
  }, []);

  const loadCoreThread = useCallback(async (id: string, options?: { force?: boolean; messageLimit?: number; quiet?: boolean }) => {
    const cached = threadCache.current.get(id);
    const force = options?.force === true;
    const messageLimit = options?.messageLimit || cached?.messageLimit || INITIAL_MESSAGE_LIMIT;
    const fresh = cached && Date.now() - cached.fetchedAt < THREAD_TTL_MS && cached.messageLimit >= messageLimit;

    if (cached && !force) applyThreadSnapshot(cached);
    if (fresh && !force) {
      setLoadingThread(false);
      return cached;
    }

    const pane = messagePaneRef.current;
    const stickToBottom = Boolean(pane && pane.scrollHeight - pane.scrollTop - pane.clientHeight < 140);
    const token = ++coreRequestToken.current;
    coreAbort.current?.abort();
    const controller = new AbortController();
    coreAbort.current = controller;

    if (!cached && !options?.quiet) setLoadingThread(true);
    else setRefreshingThread(true);

    try {
      const response = await fetch(`/api/conversations/${id}/fast?messageLimit=${messageLimit}`, { cache: 'no-store', signal: controller.signal });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to load conversation.');
      if (token !== coreRequestToken.current || selectedIdRef.current !== id) return null;

      const snapshot: ThreadSnapshot = {
        conversation: payload.conversation as Conversation,
        messages: (payload.messages || []) as Message[],
        messageTotal: Number(payload.messageTotal || 0),
        hasOlderMessages: Boolean(payload.hasOlderMessages),
        messageLimit: Number(payload.messageLimit || messageLimit),
        fetchedAt: Date.now(),
      };
      threadCache.current.set(id, snapshot);
      applyThreadSnapshot(snapshot);
      setConversations((rows) => rows.map((row) => row.id === id ? { ...row, ...snapshot.conversation } : row));

      if (snapshot.conversation.unread_count > 0) {
        setConversations((rows) => rows.map((row) => row.id === id ? { ...row, unread_count: 0 } : row));
        void fetch(`/api/conversations/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mark_read: true }) });
      }

      if (autoScrollRef.current || stickToBottom) {
        autoScrollRef.current = false;
        scrollToBottom();
      }
      return snapshot;
    } catch (error) {
      if ((error as Error).name !== 'AbortError' && !options?.quiet) showToast(error instanceof Error ? error.message : 'Unable to load conversation.', 'error');
      return null;
    } finally {
      if (token === coreRequestToken.current) {
        setLoadingThread(false);
        setRefreshingThread(false);
        setLoadingOlder(false);
      }
    }
  }, [applyThreadSnapshot, scrollToBottom, showToast]);

  const loadSecondary = useCallback(async (id: string, force = false) => {
    const cached = secondaryCache.current.get(id);
    if (cached) { setEvents(cached.events); setCollaborators(cached.collaborators); }
    if (cached && !force && Date.now() - cached.fetchedAt < SECONDARY_TTL_MS) return;

    const token = ++secondaryRequestToken.current;
    setContextBusy(!cached);
    try {
      const [eventResponse, collaboratorResponse] = await Promise.all([
        fetch(`/api/conversations/${id}/events?limit=120`, { cache: 'no-store' }),
        fetch(`/api/conversations/${id}/collaborators`, { cache: 'no-store' }),
      ]);
      if (token !== secondaryRequestToken.current || selectedIdRef.current !== id) return;
      const snapshot: SecondarySnapshot = {
        events: eventResponse.ok ? (await eventResponse.json()).events || [] : [],
        collaborators: collaboratorResponse.ok ? (await collaboratorResponse.json()).collaborators || [] : [],
        fetchedAt: Date.now(),
      };
      secondaryCache.current.set(id, snapshot);
      setEvents(snapshot.events);
      setCollaborators(snapshot.collaborators);
    } finally {
      if (token === secondaryRequestToken.current) setContextBusy(false);
    }
  }, []);

  const loadSessions = useCallback(async (id: string) => {
    const cached = sessionsCache.current.get(id);
    if (cached) { setSessions(cached); return; }
    setContextBusy(true);
    try {
      const response = await fetch(`/api/conversations/${id}/sessions`, { cache: 'no-store' });
      if (!response.ok || selectedIdRef.current !== id) return;
      const rows = (await response.json()).sessions || [];
      sessionsCache.current.set(id, rows);
      setSessions(rows);
    } finally { setContextBusy(false); }
  }, []);

  const loadAiState = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/conversations/${id}/ai`, { cache: 'no-store' });
      if (!response.ok || selectedIdRef.current !== id) return;
      const payload = await response.json().catch(() => ({}));
      setAiState(payload.ai || null);
    } catch {}
  }, []);

  const handleAiAction = useCallback(async (action: 'takeover' | 'resume' | 'pause') => {
    const id = selectedIdRef.current;
    if (!id) return;
    setAiBusy(true);
    if (action === 'takeover' || action === 'pause') {
      setIsAiReplying(false);
      if (aiReplyingTimer.current) window.clearTimeout(aiReplyingTimer.current);
    }
    try {
      const response = await fetch(`/api/conversations/${id}/ai`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to update AI state.');
      setAiState(payload.ai || null);
      showToast(action === 'resume' ? 'Assigned to AI Agent.' : action === 'takeover' ? 'You took over this conversation.' : 'AI Agent paused.', 'success');
      window.dispatchEvent(new CustomEvent('crm:data-mutated'));
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to update AI state.', 'error');
    } finally {
      setAiBusy(false);
    }
  }, [showToast]);

  const selectConversation = useCallback((conversation: Conversation) => {
    if (selectedIdRef.current === conversation.id) return;
    selectedIdRef.current = conversation.id;
    setSelectedId(conversation.id);
    setContextOpen(false);
    setMoreOpen(false);
    setAssist(null);
    setContextTab('details');
    setEvents([]);
    setCollaborators([]);
    setSessions([]);
    
    autoScrollRef.current = true;
    const cached = threadCache.current.get(conversation.id);
    if (cached) {
      applyThreadSnapshot(cached);
      window.setTimeout(() => {
        if (autoScrollRef.current) {
          autoScrollRef.current = false;
          scrollToBottom();
        }
      }, 50);
    } else {
      setSelected(conversation);
      setMessages([]);
      setMessageTotal(0);
      setHasOlderMessages(false);
      setLoadingThread(true);
    }
    const secondary = secondaryCache.current.get(conversation.id);
    if (secondary) { setEvents(secondary.events); setCollaborators(secondary.collaborators); }
    syncUrl({ conversationId: conversation.id });
    void loadAiState(conversation.id);
  }, [applyThreadSnapshot, loadAiState, setContextOpen, syncUrl, scrollToBottom]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void Promise.all([loadViews(), loadList()]); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadList, loadViews]);

  useEffect(() => {
    if (!selectedId) {
      coreAbort.current?.abort();
      setSelected(null); setMessages([]); setEvents([]); setCollaborators([]); setSessions([]);
      setAiState(null); setIsAiReplying(false);
      return;
    }
    void loadCoreThread(selectedId);
    void loadSecondary(selectedId);
    void loadAiState(selectedId);
  }, [loadAiState, loadCoreThread, loadSecondary, selectedId]);

  useEffect(() => {
    const reconcile = () => {
      void loadList(true);
      const id = selectedIdRef.current;
      if (id) void loadCoreThread(id, { force: true, quiet: true });
    };
    window.addEventListener('inbox:provider-sync', reconcile);
    return () => window.removeEventListener('inbox:provider-sync', reconcile);
  }, [loadCoreThread, loadList]);

  // Active thread polling fallback: ensures real-time updates even if WebSockets are throttled or reconnecting
  useEffect(() => {
    if (!selectedId) return;
    const intervalMs = isAiReplying ? 2500 : 6000;
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible' && selectedIdRef.current === selectedId) {
        void loadCoreThread(selectedId, { force: true, quiet: true });
        void loadAiState(selectedId);
      }
    }, intervalMs);
    return () => window.clearInterval(interval);
  }, [isAiReplying, loadAiState, loadCoreThread, selectedId]);

  useEffect(() => {
    if (contextTab === 'history' && selectedId) void loadSessions(selectedId);
  }, [contextTab, loadSessions, selectedId]);

  const scheduleListRefresh = useCallback(() => {
    if (listRefreshTimer.current) window.clearTimeout(listRefreshTimer.current);
    listRefreshTimer.current = window.setTimeout(() => void loadList(true), 300);
  }, [loadList]);

  const scheduleThreadRefresh = useCallback((id: string) => {
    if (threadRefreshTimer.current) window.clearTimeout(threadRefreshTimer.current);
    threadRefreshTimer.current = window.setTimeout(() => {
      if (selectedIdRef.current === id) void loadCoreThread(id, { force: true, quiet: true });
    }, 220);
  }, [loadCoreThread]);

  useEffect(() => {
    if (!isSupabaseConfigured() || !config.workspace.id) return;
    let channel: ReturnType<ReturnType<typeof getSupabaseBrowserClient>['channel']> | null = null;
    let active = true;

    async function setupRealtime() {
      const supabase = getSupabaseBrowserClient();
      await syncRealtimeAuth(supabase);
      if (!active) return;

      channel = supabase.channel(`stable-inbox:${config.workspace.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_conversations', filter: `workspace_id=eq.${config.workspace.id}` }, (payload) => {
          const changed = payload.new as UnknownRecord;
          const id = typeof changed?.id === 'string' ? changed.id : null;
          if (id && selectedIdRef.current === id) {
            setSelected((current) => current ? { ...current, ...changed } as Conversation : current);
          }
          scheduleListRefresh();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_messages', filter: `workspace_id=eq.${config.workspace.id}` }, (payload) => {
          const changed = payload.new as UnknownRecord;
          const conversationId = typeof changed?.conversation_id === 'string' ? changed.conversation_id : null;
          if (conversationId && payload.eventType === 'INSERT') {
            setConversations((rows) => {
              const current = rows.find((row) => row.id === conversationId);
              if (!current) return rows;
              const inbound = changed.direction === 'inbound';
              const selectedNow = selectedIdRef.current === conversationId;
              const body = typeof changed.body === 'string' && changed.body.trim() ? changed.body : current.last_message_preview;
              const updated = {
                ...current,
                last_message_at: typeof changed.sent_at === 'string' ? changed.sent_at : new Date().toISOString(),
                last_message_preview: body || current.last_message_preview,
                needs_reply: inbound ? true : current.needs_reply,
                unread_count: inbound && !selectedNow ? current.unread_count + 1 : current.unread_count,
              };
              if (sort === 'newest') return [updated, ...rows.filter((row) => row.id !== conversationId)];
              return rows.map((row) => row.id === conversationId ? updated : row);
            });
          }
          scheduleListRefresh();
          if (conversationId && conversationId === selectedIdRef.current) {
            if (payload.eventType === 'INSERT') {
              const incoming = changed as unknown as Message;
              if (incoming.direction === 'inbound') {
                setIsAiReplying(true);
                if (aiReplyingTimer.current) window.clearTimeout(aiReplyingTimer.current);
                aiReplyingTimer.current = window.setTimeout(() => setIsAiReplying(false), 30_000);
              } else if (incoming.direction === 'outbound') {
                setIsAiReplying(false);
                if (aiReplyingTimer.current) window.clearTimeout(aiReplyingTimer.current);
              }

              const cached = threadCache.current.get(conversationId);
              if (cached) {
                const exists = cached.messages.some(
                  (m) => m.id === incoming.id || (incoming.client_request_id && m.client_request_id === incoming.client_request_id)
                );
                if (!exists) {
                  cached.messages = [...cached.messages, incoming];
                  cached.messageTotal += 1;
                }
              }

              setMessages((rows) => {
                if (rows.some((row) => row.id === incoming.id || (incoming.client_request_id && (row as unknown as { client_request_id?: string }).client_request_id === incoming.client_request_id))) {
                  return rows.map((row) => (row.id === incoming.id || (incoming.client_request_id && (row as unknown as { client_request_id?: string }).client_request_id === incoming.client_request_id)) ? { ...row, ...incoming } : row);
                }
                return [...rows, incoming];
              });
              scrollToBottom();
            } else if (payload.eventType === 'UPDATE') {
              const updated = changed as unknown as Message;
              setMessages((rows) => rows.map((row) => row.id === updated.id ? { ...row, ...updated } : row));
            }
            scheduleThreadRefresh(conversationId);
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_events', filter: `workspace_id=eq.${config.workspace.id}` }, (payload) => {
          const changed = payload.new as UnknownRecord;
          const conversationId = typeof changed?.conversation_id === 'string' ? changed.conversation_id : null;
          if (conversationId && conversationId === selectedIdRef.current) void loadSecondary(conversationId, true);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_ai_states', filter: `workspace_id=eq.${config.workspace.id}` }, (payload) => {
          const changed = payload.new as UnknownRecord;
          const conversationId = typeof changed?.conversation_id === 'string' ? changed.conversation_id : null;
          if (conversationId && conversationId === selectedIdRef.current) {
            void loadAiState(conversationId);
            if (changed?.state !== 'active' || changed?.draft_reply) {
              setIsAiReplying(false);
              if (aiReplyingTimer.current) window.clearTimeout(aiReplyingTimer.current);
            }
          }
          window.dispatchEvent(new CustomEvent('crm:data-mutated'));
        })
        .subscribe();
    }

    void setupRealtime();

    return () => {
      active = false;
      if (channel) {
        const supabase = getSupabaseBrowserClient();
        void supabase.removeChannel(channel);
      }
      if (listRefreshTimer.current) window.clearTimeout(listRefreshTimer.current);
      if (threadRefreshTimer.current) window.clearTimeout(threadRefreshTimer.current);
      if (aiReplyingTimer.current) window.clearTimeout(aiReplyingTimer.current);
    };
  }, [config.workspace.id, loadAiState, loadSecondary, scheduleListRefresh, scheduleThreadRefresh, scrollToBottom, sort]);

  useEffect(() => {
    const reconcile = window.setInterval(() => { if (document.visibilityState === 'visible') void loadList(true); }, 120_000);
    return () => window.clearInterval(reconcile);
  }, [loadList]);

  useEffect(() => () => coreAbort.current?.abort(), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      if (event.key.toLowerCase() === 'r') { setReplyMode('outbound'); composerRef.current?.focus(); }
      if (event.key.toLowerCase() === 'n') { setReplyMode('internal'); composerRef.current?.focus(); }
      if (event.key === ']' || event.key === '[') {
        const index = conversations.findIndex((row) => row.id === selectedIdRef.current);
        const nextIndex = event.key === ']' ? Math.min(conversations.length - 1, index + 1) : Math.max(0, index - 1);
        const next = conversations[nextIndex];
        if (next) selectConversation(next);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [conversations, selectConversation]);

  const syncProvider = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const response = await fetch('/api/conversations/sync?mode=live', { method: 'POST', cache: 'no-store' });
      showToast(response.ok ? 'Inbox synchronized.' : 'Provider sync failed.', response.ok ? 'success' : 'error');
      if (response.ok) {
        await loadList(true);
        if (selectedIdRef.current) await loadCoreThread(selectedIdRef.current, { force: true, quiet: true });
      }
    } finally { setSyncing(false); }
  };

  const patchConversation = async (patch: Record<string, unknown>, success?: string) => {
    const id = selectedIdRef.current;
    if (!id) return null;
    setSaving(true);
    const before = selected;
    setSelected((current) => current ? { ...current, ...patch } as Conversation : current);
    setConversations((rows) => rows.map((row) => row.id === id ? { ...row, ...patch } as Conversation : row));
    try {
      const response = await fetch(`/api/conversations/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to update conversation.');
      const updated = { ...(before || {}), ...(payload.conversation || {}), ...patch } as Conversation;
      setSelected(updated);
      const cached = threadCache.current.get(id);
      if (cached) threadCache.current.set(id, { ...cached, conversation: updated, fetchedAt: Date.now() });
      if (success) showToast(success, 'success');
      void loadList(true);
      return updated;
    } catch (error) {
      if (before) setSelected(before);
      showToast(error instanceof Error ? error.message : 'Unable to update conversation.', 'error');
      return null;
    } finally { setSaving(false); }
  };

  const sendPayload = async ({ body, attachment, mode }: { body: string; attachment?: InboxComposerAttachment | null; mode: ReplyMode }) => {
    const id = selectedIdRef.current;
    if (!id || sending || (!body.trim() && !attachment)) return false;
    const requestId = `${currentUser.id}:${id}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const optimisticBody = attachment
      ? `[${attachment.kind === 'image' ? 'Photo' : attachment.kind === 'video' ? 'Video' : attachment.kind === 'audio' ? 'Voice message' : `File:${attachment.fileName}`}]`
      : body.trim();
    const optimistic: Message = {
      id: `optimistic:${requestId}`,
      conversation_id: id,
      direction: mode,
      message_type: mode === 'internal' ? 'internal_note' : attachment?.kind || 'text',
      body: optimisticBody,
      metadata: attachment ? { attachment_url: attachment.url, storage_path: attachment.storagePath, file_name: attachment.fileName, mime_type: attachment.mimeType, size: attachment.size } : {},
      delivery_status: 'sending',
      sent_at: new Date().toISOString(),
      author_profile: { full_name: currentUser.full_name },
    };
    setSending(true);
    setMessages((rows) => [...rows, optimistic]);
    scrollToBottom();
    try {
      const response = await fetch(`/api/conversations/${id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestId },
        body: JSON.stringify({ body: body.trim(), direction: mode, clientRequestId: requestId, attachment: attachment ? { storagePath: attachment.storagePath, fileName: attachment.fileName, mimeType: attachment.mimeType, size: attachment.size } : undefined }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (payload.message) setMessages((rows) => rows.map((row) => row.id === optimistic.id ? payload.message as Message : row));
        else setMessages((rows) => rows.map((row) => row.id === optimistic.id ? { ...row, delivery_status: 'failed', failure_message: payload.error || 'Message delivery failed.' } : row));
        throw new Error(payload.error || 'Message delivery failed.');
      }
      if (selectedIdRef.current === id && payload.message) setMessages((rows) => rows.map((row) => row.id === optimistic.id ? payload.message as Message : row));
      threadCache.current.delete(id);
      await loadCoreThread(id, { force: true, quiet: true });
      void loadList(true);
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Message delivery failed.', 'error');
      return false;
    } finally { setSending(false); }
  };

  const retryMessage = async (message: Message) => {
    const metadata = asRecord(message.metadata);
    const storagePath = typeof metadata.storage_path === 'string' ? metadata.storage_path : null;
    const fileName = typeof metadata.file_name === 'string' ? metadata.file_name : null;
    const mimeType = typeof metadata.mime_type === 'string' ? metadata.mime_type : null;
    const size = typeof metadata.size === 'number' ? metadata.size : Number(metadata.size || 0);
    const attachment = storagePath && fileName && mimeType && size > 0 ? {
      storagePath,
      url: typeof metadata.attachment_url === 'string' ? metadata.attachment_url : '',
      fileName,
      mimeType,
      size,
      kind: message.message_type,
    } satisfies InboxComposerAttachment : null;
    await sendPayload({ body: attachment ? '' : message.body || '', attachment, mode: 'outbound' });
  };

  const quoteMessage = (message: Message) => {
    const quote = (message.body || 'Attachment').split('\n').slice(0, 3).join(' ');
    setReplyMode('outbound');
    setReplyBody((current) => `> ${quote.slice(0, 180)}\n\n${current}`);
    window.requestAnimationFrame(() => composerRef.current?.focus());
  };

  const noteFromMessage = (message: Message) => {
    setReplyMode('internal');
    setReplyBody(`Context from message: ${message.body || 'Attachment'}`);
    window.requestAnimationFrame(() => composerRef.current?.focus());
  };

  const createTaskFromMessage = async (message: Message) => {
    const id = selectedIdRef.current;
    if (!id) return;
    const text = (message.body || 'Conversation attachment').replace(/\s+/g, ' ').trim();
    try {
      const response = await fetch('/api/work-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: id,
          ownerId: currentUser.id,
          type: 'custom',
          title: `Follow up: ${text.slice(0, 90)}`,
          description: `Created from Inbox message: ${text.slice(0, 500)}`,
          priority: selected?.priority === 'urgent' ? 'urgent' : selected?.priority === 'high' ? 'high' : 'normal',
          metadata: { source_message_id: message.id },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to create task.');
      showToast('Task created from message.', 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : 'Unable to create task.', 'error'); }
  };

  const loadOlder = async () => {
    const id = selectedIdRef.current;
    if (!id || loadingOlder) return;
    const cached = threadCache.current.get(id);
    const currentLimit = cached?.messageLimit || INITIAL_MESSAGE_LIMIT;
    setLoadingOlder(true);
    await loadCoreThread(id, { force: true, quiet: true, messageLimit: Math.min(1000, currentLimit + 240) });
  };

  const runAssist = async (action: AssistResult['action']) => {
    const id = selectedIdRef.current;
    if (!id) return;
    setAssisting(action); setAssist(null);
    try {
      const response = await fetch(`/api/conversations/${id}/assist`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Assist failed.');
      if (selectedIdRef.current !== id) return;
      setAssist(payload as AssistResult);
      if (action === 'reply' && payload.result) { setReplyMode('outbound'); setReplyBody(payload.result); composerRef.current?.focus(); }
    } catch (error) { showToast(error instanceof Error ? error.message : 'Assist failed.', 'error'); }
    finally { setAssisting(null); }
  };

  const addCollaborator = async (userId: string) => {
    const id = selectedIdRef.current;
    if (!id || !userId) return;
    const response = await fetch(`/api/conversations/${id}/collaborators`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId }) });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) {
      showToast(payload.error || 'Unable to add collaborator.', 'error');
      return;
    }
    secondaryCache.current.delete(id);
    await loadSecondary(id, true);
  };

  const removeCollaborator = async (userId: string) => {
    const id = selectedIdRef.current;
    if (!id) return;
    const response = await fetch(`/api/conversations/${id}/collaborators?userId=${encodeURIComponent(userId)}`, { method: 'DELETE' });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) {
      showToast(payload.error || 'Unable to remove collaborator.', 'error');
      return;
    }
    secondaryCache.current.delete(id);
    await loadSecondary(id, true);
  };

  const applySavedView = (view: SavedView) => {
    setActiveSavedView(view.id);
    const q = view.filters.filter || 'all';
    const p = view.filters.provider || 'all';
    const st = view.filters.state || '';
    const pr = view.filters.priority || '';
    const so = view.filters.sort || 'newest';
    const sr = view.filters.search || '';
    setQueue(q);
    setProvider(p);
    setState(st);
    setPriority(pr);
    setSort(so);
    setSearch(sr);
    syncUrl({
      view: q,
      provider: p,
      state: st || null,
      priority: pr || null,
      sort: so,
      search: sr || null,
    });
  };

  const standardViews = [
    { key: 'all' as const, label: 'All open', count: metrics.totalOpen, icon: InboxIcon },
    { key: 'mine' as const, label: 'Mine', icon: UserCheck },
    { key: 'unassigned' as const, label: 'Unassigned', count: metrics.unassigned, icon: Users },
    { key: 'collaborations' as const, label: 'Collaborations', count: metrics.collaborations, icon: UserPlus },
  ];
  const exceptionViews = [
    { key: 'needs_reply' as const, label: 'Needs reply', count: metrics.needsReply, icon: AtSign },
    { key: 'sla_overdue' as const, label: 'SLA overdue', count: metrics.slaOverdue, icon: ShieldAlert },
    { key: 'unread' as const, label: 'Unread', count: metrics.unread, icon: MessageSquare },
    { key: 'high_priority' as const, label: 'High priority', count: metrics.highPriority, icon: AlertTriangle },
    { key: 'waiting' as const, label: 'Waiting', count: metrics.waiting, icon: PauseCircle },
    { key: 'snoozed' as const, label: 'Snoozed', count: metrics.snoozed, icon: Clock3 },
    { key: 'closed' as const, label: 'Resolved', icon: CheckCircle2 },
  ];

  const timeline = useMemo(() => {
    const messageItems = messages.map((message) => ({ kind: 'message' as const, at: message.sent_at, message }));
    const eventItems = events.filter((event) => EVENT_TYPES.has(event.event_type)).map((event) => ({ kind: 'event' as const, at: event.created_at, event }));
    return [...messageItems, ...eventItems].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [events, messages]);

  const metadata = asRecord(selected?.metadata);
  const isMetaWindowExpired = Boolean(
    (selected?.provider === 'facebook' || selected?.provider === 'instagram') &&
    selected?.last_inbound_at &&
    Date.now() - new Date(selected.last_inbound_at).getTime() > 24 * 60 * 60 * 1000
  );
  const canReply = metadata.can_reply !== false && !isMetaWindowExpired;
  const canManageCollaborators = can('inbox.assign');
  const availableCollaborators = allProfiles.filter((profile) =>
    profile.is_active
    && !collaborators.some((row) => row.user_id === profile.id)
  );

  const context = selected ? <section aria-label="Conversation details" className="flex h-full min-h-0 flex-col bg-white">
    <div data-context-tabs="true">{(['details','history','assist','crm'] as ContextTab[]).map((tab) => <button key={tab} type="button" aria-selected={contextTab === tab} onClick={() => { setContextTab(tab); syncUrl({ tab }, { replace: true }); }}>{tab === 'crm' ? 'CRM' : label(tab)}</button>)}</div>
    <div className="relative min-h-0 flex-1 overflow-y-auto p-4">
      {contextBusy && <div className="absolute right-3 top-3"><Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" /></div>}
      {contextTab === 'details' && <div className="space-y-5">
        <div data-customer-summary="true" className="flex items-center gap-3">{selected.customer_avatar_url ? <img data-customer-avatar="true" src={selected.customer_avatar_url} alt="" /> : <div data-customer-avatar="true" className="flex items-center justify-center bg-zinc-100 text-xs font-bold">{initials(selected.customer_name)}</div>}<div className="min-w-0"><div className="truncate text-base font-semibold text-zinc-950">{selected.customer_name || contactLabel}</div><div className="truncate text-xs text-zinc-500">{selected.customer_phone || selectedContact?.primary_phone || selected.customer_email || selectedContact?.primary_email || 'No direct contact detail'}</div></div></div>
        <dl className="space-y-3 text-xs"><div className="flex justify-between gap-3"><dt className="text-zinc-500">Channel</dt><dd className="font-semibold capitalize">{selected.provider}</dd></div><div className="flex justify-between gap-3"><dt className="text-zinc-500">Priority</dt><dd className="font-semibold capitalize">{selected.priority}</dd></div><div className="flex justify-between gap-3"><dt className="text-zinc-500">Lifecycle</dt><dd className="font-semibold">{label(selectedContact?.lifecycle_key || 'new')}</dd></div></dl>
        <section className="border-t border-zinc-100 pt-4"><div className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">Assignment</div>{can('inbox.assign') ? <select value={selected.assigned_to || ''} onChange={(e) => void patchConversation({ assigned_to: e.target.value || null })} className="select-field mt-2 h-9 w-full text-xs"><option value="">Unassigned</option>{allProfiles.filter((p) => p.is_active).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select> : <div className="mt-2 text-xs font-semibold">{selected.assigned_profile?.full_name || 'Unassigned'}</div>}</section>
        <section className="border-t border-zinc-100 pt-4"><div className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">Collaborators</div><div className="mt-2 flex flex-wrap gap-1.5">{collaborators.map((item) => { const removable = canManageCollaborators || item.user_id === currentUser?.id; return removable ? <button key={item.user_id} type="button" onClick={() => void removeCollaborator(item.user_id)} className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-semibold">{item.user?.full_name || 'Member'} ×</button> : <span key={item.user_id} className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-semibold text-zinc-600">{item.user?.full_name || 'Member'}</span>; })}</div>{availableCollaborators.length > 0 && <select defaultValue="" onChange={(e) => { const value = e.target.value; e.target.value = ''; if (value) void addCollaborator(value); }} className="select-field mt-2 h-8 w-full text-xs"><option value="">Add collaborator…</option>{availableCollaborators.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>}</section>
        <InboxContextExtras conversationId={selected.id} tags={selectedContact?.tags} nextActionAt={selected.next_action_at} lastInboundAt={selected.last_inbound_at} />
        <Link href={selectedContact ? `/contacts/${selectedContact.id}` : '/contacts'} className="button-secondary w-full">Open contact profile</Link>
      </div>}

      {contextTab === 'history' && <div><div className="mb-3 flex items-center justify-between"><div className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">Conversation sessions</div><span className="font-mono text-xs">{sessions.length}</span></div><div className="space-y-3">{sessions.map((session, index) => <div key={session.id} className={`rounded-lg border p-3 ${session.is_current ? 'border-zinc-300 bg-zinc-50' : 'border-zinc-200'}`}><div className="flex items-center justify-between gap-3"><div className="text-xs font-semibold">Conversation #{sessions.length - index}</div>{session.is_current ? <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[9px] font-bold text-zinc-900">Current</span> : <span className="text-[10px] text-zinc-400">{session.closed_at ? shortTime(session.closed_at) : 'Open'}</span>}</div><div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-zinc-500"><div>Response <span className="block font-mono font-semibold text-zinc-800">{duration(session.first_response_seconds)}</span></div><div>Resolution <span className="block font-mono font-semibold text-zinc-800">{duration(session.resolution_seconds)}</span></div></div><div className="mt-2 text-[10px] text-zinc-500">Owner: <span className="font-semibold text-zinc-700">{session.owner?.full_name || 'Unassigned'}</span></div>{session.resolution_code && <div className="mt-2 text-xs font-medium text-zinc-800">{label(session.resolution_code)}</div>}{session.closing_note && <p className="mt-1 text-xs leading-5 text-zinc-600">{session.closing_note}</p>}</div>)}{!contextBusy && sessions.length === 0 && <div className="py-8 text-center text-xs text-zinc-400">No session history yet.</div>}</div></div>}

      {contextTab === 'assist' && <div><div className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">Assist</div><p className="mt-1 text-xs leading-5 text-zinc-500">Use conversation context without changing CRM data automatically.</p><div className="mt-4 grid gap-2"><button type="button" disabled={Boolean(assisting)} onClick={() => void runAssist('summary')} className="button-secondary justify-start"><Sparkles className="h-4 w-4" /> Summarize conversation</button><button type="button" disabled={Boolean(assisting)} onClick={() => void runAssist('reply')} className="button-secondary justify-start"><WandSparkles className="h-4 w-4" /> Draft reply</button><button type="button" disabled={Boolean(assisting)} onClick={() => void runAssist('extract')} className="button-secondary justify-start"><Search className="h-4 w-4" /> Extract explicit details</button></div>{assisting && <div className="mt-4 flex items-center gap-2 text-xs text-zinc-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Working…</div>}{assist && <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3"><div className="mb-2 text-[9px] font-bold uppercase tracking-wide text-zinc-400">{assist.mode} · {assist.action}</div>{assist.result ? <div className="whitespace-pre-wrap text-xs leading-5 text-zinc-800">{assist.result}</div> : <pre className="whitespace-pre-wrap break-words text-[11px] leading-5 text-zinc-700">{JSON.stringify(assist.data || {}, null, 2)}</pre>}</div>}</div>}

      {contextTab === 'crm' && <div><div className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">CRM</div>{selectedLead ? <div className="mt-3 rounded-lg border border-zinc-200 p-4"><div className="font-semibold">{selectedLead.customer_name}</div><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded bg-zinc-50 p-2">Stage<div className="mt-1 font-semibold">{label(selectedLead.stage)}</div></div><div className="rounded bg-zinc-50 p-2">Priority<div className="mt-1 font-semibold">{label(selectedLead.priority)}</div></div></div><Link href={`/leads/${selectedLead.id}/workspace`} className="button-primary mt-3 w-full">Open {leadLabel}</Link></div> : <div className="mt-3 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-4 text-center"><div className="text-sm font-semibold">No {leadLabel.toLowerCase()} yet</div><p className="mt-1 text-xs text-zinc-500">Create a CRM record when this conversation becomes commercially relevant.</p><button type="button" onClick={() => setConvertOpen(true)} className="button-primary mt-3 w-full">Create {leadLabel}</button></div>}</div>}
    </div>
  </section> : null;

  return <div className="flex h-full min-h-0 flex-1 overflow-hidden bg-white">
    <div className="grid h-full min-h-0 w-full grid-cols-1 md:grid-cols-[330px_minmax(0,1fr)] lg:grid-cols-[190px_330px_minmax(0,1fr)] xl:grid-cols-[190px_330px_minmax(420px,1fr)_310px]">
      <aside className="hidden min-h-0 border-r border-zinc-200 bg-zinc-50/80 lg:flex lg:flex-col">
        <div className="flex h-14 items-center gap-2 border-b border-zinc-200 px-3"><InboxIcon className="h-4 w-4" /><span className="text-sm font-semibold">Inbox</span>{metrics.slaOverdue > 0 && <span className="ml-auto rounded-md bg-rose-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-rose-700">{metrics.slaOverdue}</span>}</div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
          <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-zinc-400">Standard</div>
          {standardViews.map((item) => { const Icon = item.icon; const active = !activeSavedView && queue === item.key; return <button key={item.key} type="button" onClick={() => { setActiveSavedView(null); setQueue(item.key); setState(''); setPriority(''); syncUrl({ view: item.key, state: null, priority: null }); }} className={`mt-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-semibold ${active ? 'bg-zinc-900 text-white' : 'text-zinc-700 hover:bg-zinc-100'}`}><Icon className="h-3.5 w-3.5" /><span className="flex-1 truncate">{item.label}</span>{item.count !== undefined && <span className="font-mono text-[10px]">{item.count}</span>}</button>; })}
          <div className="mt-4 px-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-zinc-400">Exceptions</div>
          {exceptionViews.map((item) => { const Icon = item.icon; const active = !activeSavedView && queue === item.key; return <button key={item.key} type="button" onClick={() => { setActiveSavedView(null); setQueue(item.key); setState(''); setPriority(''); syncUrl({ view: item.key, state: null, priority: null }); }} className={`mt-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-semibold ${active ? 'bg-white text-zinc-950 ring-1 ring-zinc-200' : 'text-zinc-700 hover:bg-zinc-100'}`}><Icon className="h-3.5 w-3.5" /><span className="flex-1 truncate">{item.label}</span>{item.count !== undefined && <span className={`font-mono text-[10px] ${item.key === 'sla_overdue' && item.count ? 'text-rose-600' : ''}`}>{item.count}</span>}</button>; })}
          {savedViews.length > 0 && <><div className="mt-4 px-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-zinc-400">Saved</div>{savedViews.map((view) => <button key={view.id} type="button" onClick={() => applySavedView(view)} className={`mt-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-semibold ${activeSavedView === view.id ? 'bg-zinc-100 text-zinc-900 ring-1 ring-zinc-300' : 'text-zinc-700 hover:bg-zinc-100'}`}><History className="h-3.5 w-3.5" /><span className="flex-1 truncate">{view.name}</span>{view.is_shared && <Users className="h-3 w-3 text-zinc-400" />}</button>)}</>}
          {can('inbox.saved_views.manage') && <Link href="/inbox/views" className="mt-3 flex items-center gap-2 rounded-md px-2.5 py-2 text-[11px] font-semibold text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"><Plus className="h-3.5 w-3.5" /> Manage saved views</Link>}
        </div>
      </aside>

      <section aria-label="Inbox conversations" className={`${selectedId ? 'hidden lg:flex' : 'flex'} min-h-0 min-w-0 flex-col border-r border-zinc-200`}>
        <div className="shrink-0 border-b border-zinc-200 p-3">
          <div className="flex gap-2 lg:hidden"><select aria-label="Inbox view" value={queue} onChange={(e) => { const val = e.target.value as QueueKey; setActiveSavedView(null); setQueue(val); setState(''); setPriority(''); syncUrl({ view: val, state: null, priority: null }); }} className="select-field h-9 flex-1 text-xs">{[...standardViews, ...exceptionViews].map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select><button type="button" aria-label="Sync inbox" onClick={() => void syncProvider()} className="button-secondary button-sm" disabled={syncing}><RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} /></button></div>
          <div className="mt-2 flex gap-2 lg:mt-0"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-400" /><input aria-label="Search conversations" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${contactLabel.toLowerCase()} or message`} className="field h-9 pl-8 text-xs" /></div><button type="button" aria-label="Sync inbox" onClick={() => void syncProvider()} className="button-secondary button-sm hidden lg:inline-flex" disabled={syncing}><RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} /></button></div>
          <div className="mt-2 grid grid-cols-2 gap-2"><select aria-label="Filter by channel" value={provider} onChange={(e) => { const val = e.target.value; setProvider(val); syncUrl({ provider: val }); }} className="select-field h-8 text-xs"><option value="all">All channels</option><option value="facebook">Facebook</option><option value="instagram">Instagram</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="website">Website</option></select><select aria-label="Sort conversations" value={sort} onChange={(e) => { const val = e.target.value as SortKey; setSort(val); syncUrl({ sort: val }, { replace: true }); }} className="select-field h-8 text-xs"><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="waiting">Longest waiting</option><option value="sla">SLA soonest</option></select></div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-zinc-100">{loadingList ? <div className="flex h-32 items-center justify-center gap-2 text-xs text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading Inbox…</div> : conversations.length === 0 ? <div className="px-6 py-16 text-center"><InboxIcon className="mx-auto h-6 w-6 text-zinc-300" /><div className="mt-2 text-sm font-semibold">Nothing here</div><p className="mt-1 text-xs text-zinc-500">This view is clear.</p></div> : conversations.map((conversation) => { const info = sla(conversation); return <InboxConversationListItem key={conversation.id} conversation={conversation} selected={selectedId === conversation.id} contactLabel={contactLabel} statusText={info.text} statusDanger={info.danger} onSelect={() => selectConversation(conversation)} />; })}</div>
      </section>

      <section aria-label="Conversation thread" className={`${selectedId ? 'flex' : 'hidden lg:flex'} min-h-0 min-w-0 flex-col bg-zinc-50/50`}>
        {!selected ? <div className="flex h-full items-center justify-center text-sm text-zinc-500">Select a conversation to start working.</div> : <>
          <header className="relative flex min-h-14 items-center justify-between gap-2 border-b border-zinc-200 bg-white px-3">
            {refreshingThread && <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-zinc-100"><div className="h-full w-1/3 animate-pulse bg-blue-500" /></div>}
            <div className="flex min-w-0 items-center gap-2">
              <button type="button" aria-label="Back to conversations" onClick={() => { selectedIdRef.current = null; setSelectedId(null); syncUrl({ conversationId: null }); }} className="button-ghost button-sm md:hidden"><ArrowLeft className="h-4 w-4" /></button>
              {selected.customer_avatar_url ? <img data-chat-avatar="true" src={selected.customer_avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" /> : <div data-chat-avatar="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold">{initials(selected.customer_name)}</div>}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div data-chat-name="true" className="truncate text-sm font-semibold text-zinc-950">{selected.customer_name || contactLabel}</div>
                  {aiState?.state === 'active' ? (
                    <span className="inline-flex items-center gap-1 rounded border border-emerald-200/80 bg-emerald-50/70 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800" title={`AI Agent ${agentName(aiState)} is active on this chat`}>
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span>AI Active</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded border border-zinc-200 bg-zinc-100/70 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600" title="Human control (AI is paused/inactive)">
                      <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
                      <span>Human</span>
                    </span>
                  )}
                </div>
                <div data-chat-subtitle="true" className="truncate text-[11px] text-zinc-500"><span className="capitalize">{selected.provider}</span> · {selected.assigned_profile?.full_name || 'Unassigned'} · {label(selectedContact?.lifecycle_key || 'new')}</div>
              </div>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <ConversationPresenceIndicator members={presence.members} typingMembers={presence.typingMembers} />
              <div className="flex shrink-0 items-center gap-1.5">
                {aiState?.state === 'active' ? (
                  <button
                    type="button"
                    disabled={aiBusy}
                    onClick={() => void handleAiAction('takeover')}
                    className="inline-flex items-center gap-1.5 rounded-md border border-amber-300/80 bg-amber-50/80 px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100 hover:border-amber-400 transition-colors shadow-2xs"
                    title="Pause AI agent and take over this conversation"
                  >
                    {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-700" /> : <Pause className="h-3.5 w-3.5 text-amber-700" />}
                    <span>Take over</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={aiBusy}
                    onClick={() => void handleAiAction('resume')}
                    className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950 transition-colors shadow-2xs"
                    title="Assign conversation to AI Agent"
                  >
                    {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" /> : <Bot className="h-3.5 w-3.5 text-blue-600" />}
                    <span>Assign to AI</span>
                  </button>
                )}
                {!selected.assigned_to && <button type="button" onClick={() => void patchConversation({ assigned_to: currentUser.id }, 'Conversation claimed.')} className="button-secondary button-sm"><UserCheck className="h-3.5 w-3.5" /><span className="hidden sm:inline">Claim</span></button>}
                <button type="button" aria-label="Open conversation details" onClick={() => setContextOpen(true)} className="button-secondary button-sm xl:hidden"><PanelRight className="h-3.5 w-3.5" /></button>
                {selected.workflow_state !== 'closed' && can('inbox.resolve') && <button type="button" onClick={() => setCloseOpen(true)} className="button-primary button-sm"><CheckCircle2 className="h-3.5 w-3.5" /><span className="hidden sm:inline">Resolve</span></button>}
                <div className="relative">
                  <button type="button" aria-label="More conversation actions" onClick={() => setMoreOpen((value) => !value)} className="button-secondary button-sm"><MoreHorizontal className="h-4 w-4" /></button>
                  {moreOpen && <div className="absolute right-0 top-9 z-30 w-52 rounded-lg border border-zinc-200 bg-white p-1.5 shadow-lg"><button type="button" onClick={() => { setMoreOpen(false); void patchConversation({ workflow_state: 'waiting' }); }} className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-xs hover:bg-zinc-50"><PauseCircle className="h-3.5 w-3.5" /> Mark waiting</button><button type="button" onClick={() => { setMoreOpen(false); void patchConversation({ workflow_state: 'snoozed', snoozed_until: new Date(Date.now() + 3600000).toISOString() }); }} className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-xs hover:bg-zinc-50"><AlarmClock className="h-3.5 w-3.5" /> Snooze 1 hour</button><button type="button" onClick={() => { setMoreOpen(false); void patchConversation({ workflow_state: 'snoozed', snoozed_until: new Date(Date.now() + 86400000).toISOString() }); }} className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-xs hover:bg-zinc-50"><Clock3 className="h-3.5 w-3.5" /> Snooze 24 hours</button>{selected.workflow_state !== 'open' && <button type="button" onClick={() => { setMoreOpen(false); void patchConversation({ workflow_state: 'open' }); }} className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-xs hover:bg-zinc-50"><InboxIcon className="h-3.5 w-3.5" /> Reopen</button>}<div className="my-1 border-t border-zinc-100" /><select value={selected.priority} onChange={(e) => void patchConversation({ priority: e.target.value })} className="select-field h-8 w-full text-xs"><option value="low">Low priority</option><option value="normal">Normal priority</option><option value="high">High priority</option><option value="urgent">Urgent priority</option></select></div>}
                </div>
              </div>
            </div>
          </header>

          <div ref={messagePaneRef} aria-label="Message history" className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            <div className="mx-auto max-w-3xl">
              {hasOlderMessages && <div className="mb-5 flex justify-center"><button type="button" onClick={() => void loadOlder()} disabled={loadingOlder} className="button-secondary button-sm">{loadingOlder ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <History className="h-3.5 w-3.5" />} Load older messages <span className="font-mono text-[10px] text-zinc-400">{messages.length}/{messageTotal}</span></button></div>}
              {loadingThread && messages.length === 0 ? <div className="space-y-3 py-3" aria-label="Loading conversation"><div className="h-12 w-2/3 animate-pulse rounded-lg bg-zinc-200/70" /><div className="ml-auto h-12 w-1/2 animate-pulse rounded-lg bg-zinc-200/70" /><div className="h-16 w-3/4 animate-pulse rounded-lg bg-zinc-200/70" /></div> : <MetaConversationTimeline conversationId={selected.id} timeline={timeline} customerName={selected.customer_name} customerAvatarUrl={selected.customer_avatar_url} onQuote={quoteMessage} onAddNote={noteFromMessage} onCreateTask={(message) => void createTaskFromMessage(message)} onRetry={(message) => void retryMessage(message)} isAiReplying={isAiReplying} aiAgentName={agentName(aiState)} onTakeover={() => void handleAiAction('takeover')} />}
            </div>
          </div>

          <footer className="shrink-0 border-t border-zinc-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {isAiReplying && (
              <div className="mb-2 flex items-center justify-between rounded-md border border-blue-200/80 bg-blue-50/60 px-3 py-1.5 text-xs text-blue-900 animate-in fade-in duration-150">
                <div className="flex items-center gap-2">
                  <Bot className="h-3.5 w-3.5 text-blue-600 animate-pulse" />
                  <span><strong>{agentName(aiState)}</strong> is replying to the customer…</span>
                </div>
                <button
                  type="button"
                  disabled={aiBusy}
                  onClick={() => void handleAiAction('takeover')}
                  className="rounded border border-blue-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-blue-800 hover:bg-blue-50 transition-colors shadow-2xs"
                >
                  Take over now
                </button>
              </div>
            )}
            {aiState?.draft_reply && (
              <div className="mb-2 rounded-md border border-zinc-200 bg-zinc-50 p-2.5 text-xs">
                <div className="flex items-center justify-between font-semibold text-zinc-800 mb-1">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-blue-600" /> AI Suggested Draft
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setReplyBody(aiState.draft_reply || '');
                        composerRef.current?.focus();
                      }}
                      className="rounded border border-zinc-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-zinc-700 hover:bg-zinc-100"
                    >
                      Use draft
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleAiAction('takeover')}
                      className="rounded border border-zinc-200 bg-white px-2 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-100"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
                <p className="line-clamp-2 text-zinc-600 italic">&ldquo;{aiState.draft_reply}&rdquo;</p>
              </div>
            )}
            <InboxComposer
              workspaceId={config.workspace.id}
              conversationId={selected.id}
              mode={replyMode}
              onModeChange={(mode) => { presence.setTyping(false); setReplyMode(mode); }}
              value={replyBody}
              onChange={setReplyBody}
              canReply={canReply}
              loading={loadingThread}
              sending={sending}
              composerRef={composerRef}
              onTyping={presence.setTyping}
              onSend={sendPayload}
            />
          </footer>
        </>}
      </section>

      <aside aria-label="Conversation context panel" className="hidden min-h-0 border-l border-zinc-200 xl:block">{context}</aside>
    </div>

    {contextOpen && selected && <div className="fixed inset-0 z-40 flex justify-end bg-zinc-950/30 xl:hidden" onClick={() => setContextOpen(false)}><div className="h-full w-full max-w-sm" onClick={(e) => e.stopPropagation()}>{context}<button type="button" aria-label="Close conversation details" onClick={() => setContextOpen(false)} className="absolute right-2 top-2 rounded-md bg-white p-2 shadow"><X className="h-4 w-4" /></button></div></div>}

    {closeOpen && selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-4"><div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white shadow-xl"><div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3"><div className="text-sm font-semibold">Resolve conversation</div><button type="button" aria-label="Close resolve dialog" onClick={() => setCloseOpen(false)}><X className="h-4 w-4" /></button></div><div className="space-y-3 p-4"><select value={resolution} onChange={(e) => setResolution(e.target.value)} className="select-field w-full"><option value="resolved">Resolved</option><option value="qualified">Qualified</option><option value="converted">Converted</option><option value="not_interested">Not interested</option><option value="duplicate">Duplicate</option><option value="spam">Spam</option><option value="other">Other</option></select><textarea value={closingNote} onChange={(e) => setClosingNote(e.target.value)} rows={4} placeholder="Closing note / handoff context" className="field" /></div><div className="flex justify-end gap-2 border-t border-zinc-100 p-3"><button type="button" onClick={() => setCloseOpen(false)} className="button-secondary">Cancel</button><button type="button" disabled={saving} onClick={async () => { const updated = await patchConversation({ workflow_state: 'closed', resolution_code: resolution, closing_note: closingNote.trim() || null }); if (updated) { setCloseOpen(false); setClosingNote(''); } }} className="button-primary">Resolve</button></div></div></div>}

    <ConvertToLeadDrawer isOpen={convertOpen} onClose={() => setConvertOpen(false)} conversation={selected} onConverted={() => { setConvertOpen(false); const id = selectedIdRef.current; if (id) { threadCache.current.delete(id); void loadCoreThread(id, { force: true, quiet: true }); } }} />
  </div>;
}
