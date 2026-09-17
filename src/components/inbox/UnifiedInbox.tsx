'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  AlarmClock,
  AlertTriangle,
  ArrowLeft,
  AtSign,
  CheckCircle2,
  Clock3,
  Facebook,
  Globe,
  History,
  Inbox as InboxIcon,
  Instagram,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquare,
  MoreHorizontal,
  PanelRight,
  PauseCircle,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  StickyNote,
  UserCheck,
  UserPlus,
  Users,
  WandSparkles,
  X,
} from 'lucide-react';
import { useApp } from '@/lib/store';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';
import { useWorkspacePermissions } from '@/lib/use-workspace-permissions';
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/lib/supabase/client';
import ConvertToLeadDrawer, { type ConversationForConversion } from '@/components/inbox/ConvertToLeadDrawer';

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
  contact: Contact | Contact[] | null;
  lead: LeadSummary | LeadSummary[] | null;
  assigned_profile: { id: string; full_name: string | null; email: string; role: string; status?: string } | null;
};

type Message = {
  id: string;
  direction: 'inbound' | 'outbound' | 'internal';
  message_type: string;
  body: string | null;
  delivery_status?: string | null;
  failure_message?: string | null;
  sent_at: string;
  author_profile?: { full_name: string | null } | null;
};

type TimelineEvent = { id: string; event_type: string; payload: Record<string, unknown>; created_at: string; actor: { full_name: string | null } | null };
type Collaborator = { user_id: string; user: { id: string; full_name: string | null; email: string; role: string } | null };
type Metrics = { totalOpen: number; unassigned: number; collaborations: number; waiting: number; snoozed: number; unread: number; needsReply: number; slaOverdue: number; highPriority: number; hasPhone: number };
type SavedView = { id: string; name: string; filters: { filter?: QueueKey; provider?: string; state?: string; priority?: string; sort?: SortKey; search?: string }; is_shared: boolean; owner_id: string; sort_order: number };
type Session = { id: string; owner_id: string | null; opened_at: string; first_response_seconds: number | null; closed_at: string | null; resolution_code: string | null; closing_note: string | null; resolution_seconds: number | null; is_current: boolean; owner?: { full_name?: string | null; email?: string } | null };
type AssistResult = { mode: 'provider' | 'local'; action: 'summary' | 'reply' | 'extract'; result?: string; data?: Record<string, unknown> };

const EMPTY_METRICS: Metrics = { totalOpen: 0, unassigned: 0, collaborations: 0, waiting: 0, snoozed: 0, unread: 0, needsReply: 0, slaOverdue: 0, highPriority: 0, hasPhone: 0 };
const PROVIDER_ICONS: Record<string, typeof MessageSquare> = { facebook: Facebook, instagram: Instagram, whatsapp: MessageCircle, email: Mail, website: Globe };
const EVENT_TYPES = new Set(['state_changed', 'assigned', 'priority_changed', 'lifecycle_changed', 'next_action_changed', 'contact_tag_changed']);

function asRecord(value: unknown): UnknownRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {}; }
function contactOf(conversation: Conversation | null) { if (!conversation?.contact) return null; return Array.isArray(conversation.contact) ? conversation.contact[0] || null : conversation.contact; }
function leadOf(conversation: Conversation | null) { if (!conversation?.lead) return null; return Array.isArray(conversation.lead) ? conversation.lead[0] || null : conversation.lead; }
function initials(value?: string | null) { return (value || 'C').trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'C'; }
function label(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase()); }
function shortTime(value?: string | null) { if (!value) return '—'; const date = new Date(value); return date.toDateString() === new Date().toDateString() ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : date.toLocaleDateString([], { month: 'short', day: 'numeric' }); }
function duration(seconds?: number | null) { if (seconds == null) return '—'; if (seconds < 60) return `${seconds}s`; if (seconds < 3600) return `${Math.round(seconds / 60)}m`; return `${Math.round(seconds / 360) / 10}h`; }
function queueFromParam(value: string | null): QueueKey { const allowed: QueueKey[] = ['all','mine','unassigned','collaborations','unread','needs_reply','sla_overdue','high_priority','has_phone','waiting','snoozed','closed']; return allowed.includes(value as QueueKey) ? value as QueueKey : 'mine'; }
function sla(conversation: Conversation) { if (conversation.workflow_state === 'closed') return { text: 'Resolved', danger: false }; if (conversation.needs_reply && conversation.first_responded_at) return { text: 'Needs reply', danger: false }; if (conversation.first_responded_at) return { text: 'Responded', danger: false }; if (!conversation.first_response_due_at) return { text: 'No SLA', danger: false }; const ms = new Date(conversation.first_response_due_at).getTime() - Date.now(); const mins = Math.max(1, Math.floor(Math.abs(ms) / 60000)); return { text: ms < 0 ? `${mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h`} overdue` : `${mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h`} left`, danger: ms < 0 }; }
function eventText(event: TimelineEvent) { if (event.event_type === 'assigned') return `Assigned to ${String(event.payload.assigned_to_name || 'team member')}`; if (event.event_type === 'priority_changed') return `Priority changed to ${String(event.payload.priority || 'updated')}`; if (event.event_type === 'lifecycle_changed') return `Lifecycle changed to ${label(String(event.payload.lifecycle_key || 'updated'))}`; if (event.event_type === 'state_changed') return `Conversation ${String(event.payload.state || event.payload.to || 'updated')}`; if (event.event_type === 'next_action_changed') return 'Next action scheduled'; if (event.event_type === 'contact_tag_changed') return `${String(event.payload.action || 'Tag')} ${String(event.payload.tag || '')}`; return label(event.event_type); }

export default function UnifiedInbox() {
  const params = useSearchParams();
  const { currentUser, allProfiles, showToast } = useApp();
  const { config, term } = useWorkspace();
  const { can } = useWorkspacePermissions();
  const contactLabel = term('contact', 'Contact');
  const leadLabel = term('lead', 'Lead');

  const [queue, setQueue] = useState<QueueKey>(() => queueFromParam(params.get('view')));
  const [provider, setProvider] = useState('all');
  const [state, setState] = useState('');
  const [priority, setPriority] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [metrics, setMetrics] = useState<Metrics>(EMPTY_METRICS);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [activeSavedView, setActiveSavedView] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(() => params.get('conversationId'));
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [contextTab, setContextTab] = useState<ContextTab>('details');
  const [contextOpen, setContextOpen] = useState(false);
  const [replyMode, setReplyMode] = useState<ReplyMode>('outbound');
  const [replyBody, setReplyBody] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [resolution, setResolution] = useState('resolved');
  const [closingNote, setClosingNote] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [collaboratorId, setCollaboratorId] = useState('');
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [saveViewName, setSaveViewName] = useState('');
  const [saveViewShared, setSaveViewShared] = useState(false);
  const [assist, setAssist] = useState<AssistResult | null>(null);
  const [assisting, setAssisting] = useState<AssistResult['action'] | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const refreshTimer = useRef<number | null>(null);

  const selectedContact = contactOf(selected);
  const selectedLead = leadOf(selected);

  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 220); return () => window.clearTimeout(timer); }, [search]);

  const loadViews = useCallback(async () => {
    try {
      const response = await fetch('/api/inbox/views', { cache: 'no-store' });
      if (!response.ok) return;
      const payload = await response.json();
      setSavedViews(payload.views || []);
    } catch { /* views are non-blocking */ }
  }, []);

  const loadList = useCallback(async (quiet = false) => {
    if (!quiet) setLoadingList(true);
    try {
      const query = new URLSearchParams({ filter: queue, provider, sort, limit: '300' });
      if (state) query.set('state', state);
      if (priority) query.set('priority', priority);
      if (debouncedSearch) query.set('search', debouncedSearch);
      const response = await fetch(`/api/conversations?${query.toString()}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to load Inbox.');
      const rows = (payload.conversations || []) as Conversation[];
      setConversations(rows);
      setMetrics({ ...EMPTY_METRICS, ...(payload.metrics || {}) });
      setSelectedId((current) => current && rows.some((row) => row.id === current) ? current : (params.get('conversationId') || rows[0]?.id || null));
    } catch (error) {
      if (!quiet) showToast(error instanceof Error ? error.message : 'Unable to load Inbox.', 'error');
    } finally { if (!quiet) setLoadingList(false); }
  }, [debouncedSearch, params, priority, provider, queue, showToast, sort, state]);

  const loadThread = useCallback(async (id: string, quiet = false) => {
    if (!quiet) setLoadingThread(true);
    try {
      const [conversationResponse, eventResponse, collaboratorResponse, sessionResponse] = await Promise.all([
        fetch(`/api/conversations/${id}?messageLimit=1000`, { cache: 'no-store' }),
        fetch(`/api/conversations/${id}/events?limit=160`, { cache: 'no-store' }),
        fetch(`/api/conversations/${id}/collaborators`, { cache: 'no-store' }),
        fetch(`/api/conversations/${id}/sessions`, { cache: 'no-store' }),
      ]);
      const payload = await conversationResponse.json();
      if (!conversationResponse.ok) throw new Error(payload.error || 'Unable to load conversation.');
      setSelected(payload.conversation as Conversation);
      setMessages(payload.messages || []);
      if (eventResponse.ok) setEvents((await eventResponse.json()).events || []);
      if (collaboratorResponse.ok) setCollaborators((await collaboratorResponse.json()).collaborators || []);
      if (sessionResponse.ok) setSessions((await sessionResponse.json()).sessions || []);
      if ((payload.conversation as Conversation).unread_count > 0) void fetch(`/api/conversations/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mark_read: true }) });
      window.setTimeout(() => endRef.current?.scrollIntoView({ block: 'end' }), 40);
    } catch (error) {
      if (!quiet) showToast(error instanceof Error ? error.message : 'Unable to load conversation.', 'error');
    } finally { if (!quiet) setLoadingThread(false); }
  }, [showToast]);

  const scheduleRealtimeRefresh = useCallback(() => {
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => {
      void loadList(true);
      if (selectedId) void loadThread(selectedId, true);
    }, 250);
  }, [loadList, loadThread, selectedId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void Promise.all([loadViews(), loadList()]); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadList, loadViews]);

  useEffect(() => {
    if (!selectedId) { const timer = window.setTimeout(() => { setSelected(null); setMessages([]); setEvents([]); setSessions([]); }, 0); return () => window.clearTimeout(timer); }
    const timer = window.setTimeout(() => void loadThread(selectedId), 0);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('conversationId', selectedId);
      window.history.replaceState(null, '', url.toString());
    } catch { /* noop */ }
    return () => window.clearTimeout(timer);
  }, [loadThread, selectedId]);

  useEffect(() => {
    if (!isSupabaseConfigured() || !config.workspace.id) return;
    const supabase = getSupabaseBrowserClient();
    const channel = supabase.channel(`inbox:${config.workspace.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_conversations', filter: `workspace_id=eq.${config.workspace.id}` }, scheduleRealtimeRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_messages', filter: `workspace_id=eq.${config.workspace.id}` }, scheduleRealtimeRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_events', filter: `workspace_id=eq.${config.workspace.id}` }, scheduleRealtimeRefresh)
      .subscribe();
    return () => { void supabase.removeChannel(channel); if (refreshTimer.current) window.clearTimeout(refreshTimer.current); };
  }, [config.workspace.id, scheduleRealtimeRefresh]);

  useEffect(() => {
    const reconcile = window.setInterval(() => { if (document.visibilityState === 'visible') { void loadList(true); if (selectedId) void loadThread(selectedId, true); } }, 90_000);
    return () => window.clearInterval(reconcile);
  }, [loadList, loadThread, selectedId]);

  const syncProvider = useCallback(async (manual = false) => {
    if (syncing) return;
    if (manual) setSyncing(true);
    try {
      const response = await fetch('/api/conversations/sync?mode=live', { method: 'POST', cache: 'no-store' });
      if (manual) showToast(response.ok ? 'Inbox synchronized.' : 'Provider sync failed.', response.ok ? 'success' : 'error');
      if (response.ok) { await loadList(true); if (selectedId) await loadThread(selectedId, true); }
    } finally { if (manual) setSyncing(false); }
  }, [loadList, loadThread, selectedId, showToast, syncing]);

  useEffect(() => {
    const initial = window.setTimeout(() => { if (document.visibilityState === 'visible') void syncProvider(false); }, 500);
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void syncProvider(false); }, 60_000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [syncProvider]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      if (event.key.toLowerCase() === 'r') { setReplyMode('outbound'); composerRef.current?.focus(); }
      if (event.key.toLowerCase() === 'n') { setReplyMode('internal'); composerRef.current?.focus(); }
      if (event.key === ']' || event.key === '[') {
        const index = conversations.findIndex((row) => row.id === selectedId);
        const next = event.key === ']' ? Math.min(conversations.length - 1, index + 1) : Math.max(0, index - 1);
        if (conversations[next]) setSelectedId(conversations[next].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [conversations, selectedId]);

  const patchConversation = async (patch: Record<string, unknown>, success?: string) => {
    if (!selectedId) return null;
    setSaving(true);
    try {
      const response = await fetch(`/api/conversations/${selectedId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to update conversation.');
      setSelected(payload.conversation as Conversation);
      if (success) showToast(success, 'success');
      await Promise.all([loadList(true), loadThread(selectedId, true)]);
      return payload.conversation as Conversation;
    } catch (error) { showToast(error instanceof Error ? error.message : 'Unable to update conversation.', 'error'); return null; }
    finally { setSaving(false); }
  };

  const send = async () => {
    if (!selectedId || !replyBody.trim() || sending) return;
    const body = replyBody.trim(); setSending(true); setReplyBody('');
    try {
      const requestId = `${currentUser.id}:${selectedId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
      const response = await fetch(`/api/conversations/${selectedId}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestId }, body: JSON.stringify({ body, direction: replyMode, clientRequestId: requestId }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Message delivery failed.');
      await Promise.all([loadList(true), loadThread(selectedId, true)]);
    } catch (error) { setReplyBody(body); showToast(error instanceof Error ? error.message : 'Message delivery failed.', 'error'); }
    finally { setSending(false); }
  };

  const runAssist = async (action: AssistResult['action']) => {
    if (!selectedId) return;
    setAssisting(action); setAssist(null);
    try {
      const response = await fetch(`/api/conversations/${selectedId}/assist`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Assist failed.');
      setAssist(payload as AssistResult);
      if (action === 'reply' && payload.result) { setReplyMode('outbound'); setReplyBody(payload.result); composerRef.current?.focus(); }
    } catch (error) { showToast(error instanceof Error ? error.message : 'Assist failed.', 'error'); }
    finally { setAssisting(null); }
  };

  const createSavedView = async () => {
    if (!saveViewName.trim()) return;
    const response = await fetch('/api/inbox/views', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: saveViewName.trim(), is_shared: saveViewShared, sort_order: 100, filters: { filter: queue, provider, state, priority, sort, search: debouncedSearch } }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { showToast(payload.error || 'Unable to save view.', 'error'); return; }
    setSaveViewName(''); setSaveViewShared(false); setSaveViewOpen(false); await loadViews(); showToast('Inbox view saved.', 'success');
  };

  const applySavedView = (view: SavedView) => {
    setActiveSavedView(view.id);
    setQueue(view.filters.filter || 'all');
    setProvider(view.filters.provider || 'all');
    setState(view.filters.state || '');
    setPriority(view.filters.priority || '');
    setSort(view.filters.sort || 'newest');
    setSearch(view.filters.search || '');
  };

  const addCollaborator = async () => {
    if (!selectedId || !collaboratorId) return;
    const response = await fetch(`/api/conversations/${selectedId}/collaborators`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: collaboratorId }) });
    if (response.ok) { setCollaboratorId(''); await loadThread(selectedId, true); }
  };

  const removeCollaborator = async (userId: string) => { if (selectedId) { await fetch(`/api/conversations/${selectedId}/collaborators?userId=${encodeURIComponent(userId)}`, { method: 'DELETE' }); await loadThread(selectedId, true); } };

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

  const availableCollaborators = allProfiles.filter((profile) => profile.is_active && !collaborators.some((row) => row.user_id === profile.id));
  const metadata = asRecord(selected?.metadata);
  const isMetaWindowExpired = Boolean(
    (selected?.provider === 'facebook' || selected?.provider === 'instagram') &&
    selected?.last_inbound_at &&
    Date.now() - new Date(selected.last_inbound_at).getTime() > 24 * 60 * 60 * 1000
  );
  const canReply = metadata.can_reply !== false && !isMetaWindowExpired;

  const context = selected ? <div className="flex h-full min-h-0 flex-col bg-white">
    <div className="grid grid-cols-4 border-b border-zinc-200 bg-zinc-50 p-1.5">{(['details','history','assist','crm'] as ContextTab[]).map((tab) => <button key={tab} type="button" onClick={() => setContextTab(tab)} className={`rounded-md px-1 py-2 text-[11px] font-semibold capitalize ${contextTab === tab ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}`}>{tab}</button>)}</div>
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      {contextTab === 'details' && <div className="space-y-5"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold">{initials(selected.customer_name)}</div><div className="min-w-0"><div className="truncate text-base font-semibold text-zinc-950">{selected.customer_name || contactLabel}</div><div className="truncate text-xs text-zinc-500">{selected.customer_phone || selectedContact?.primary_phone || selected.customer_email || selectedContact?.primary_email || 'No direct contact detail'}</div></div></div>
        <dl className="space-y-3 text-xs"><div className="flex justify-between gap-3"><dt className="text-zinc-500">Channel</dt><dd className="font-semibold capitalize">{selected.provider}</dd></div><div className="flex justify-between gap-3"><dt className="text-zinc-500">Priority</dt><dd className="font-semibold capitalize">{selected.priority}</dd></div><div className="flex items-center justify-between gap-3"><dt className="text-zinc-500">Lifecycle</dt><dd>{can('contacts.edit') ? <select value={selectedContact?.lifecycle_key || 'new'} disabled={!selectedContact} onChange={(e) => void patchConversation({ lifecycle_key: e.target.value })} className="select-field h-8 text-xs"><option value="new">New</option><option value="qualified">Qualified</option><option value="opportunity">Opportunity</option><option value="customer">Customer</option><option value="lost">Lost</option></select> : <span className="font-semibold">{label(selectedContact?.lifecycle_key || 'new')}</span>}</dd></div></dl>
        <section className="border-t border-zinc-100 pt-4"><div className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">Assignment</div>{can('inbox.assign') ? <select value={selected.assigned_to || ''} onChange={(e) => void patchConversation({ assigned_to: e.target.value || null })} className="select-field mt-2 h-9 w-full text-xs"><option value="">Unassigned</option>{allProfiles.filter((p) => p.is_active).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select> : <div className="mt-2 text-xs font-semibold">{selected.assigned_profile?.full_name || 'Unassigned'}</div>}</section>
        <section className="border-t border-zinc-100 pt-4"><div className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">Collaborators</div><div className="mt-2 flex flex-wrap gap-1.5">{collaborators.map((item) => <button key={item.user_id} type="button" onClick={() => void removeCollaborator(item.user_id)} className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-semibold">{item.user?.full_name || 'Member'} ×</button>)}</div><div className="mt-2 flex gap-1.5"><select value={collaboratorId} onChange={(e) => setCollaboratorId(e.target.value)} className="select-field h-8 min-w-0 flex-1 text-xs"><option value="">Add collaborator…</option>{availableCollaborators.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select><button type="button" onClick={() => void addCollaborator()} disabled={!collaboratorId} className="button-secondary button-sm">Add</button></div></section>
        <Link href={selectedContact ? `/contacts/${selectedContact.id}` : '/contacts'} className="button-secondary w-full">Open contact profile</Link>
      </div>}

      {contextTab === 'history' && <div><div className="mb-3 flex items-center justify-between"><div className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">Conversation sessions</div><span className="font-mono text-xs">{sessions.length}</span></div><div className="space-y-3">{sessions.map((session, index) => <div key={session.id} className={`rounded-lg border p-3 ${session.is_current ? 'border-zinc-300 bg-zinc-50' : 'border-zinc-200'}`}><div className="flex items-center justify-between gap-3"><div className="text-xs font-semibold">Conversation #{sessions.length - index}</div>{session.is_current ? <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[9px] font-bold text-zinc-900">Current</span> : <span className="text-[10px] text-zinc-400">{session.closed_at ? shortTime(session.closed_at) : 'Open'}</span>}</div><div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-zinc-500"><div>Response <span className="block font-mono font-semibold text-zinc-800">{duration(session.first_response_seconds)}</span></div><div>Resolution <span className="block font-mono font-semibold text-zinc-800">{duration(session.resolution_seconds)}</span></div></div><div className="mt-2 text-[10px] text-zinc-500">Owner: <span className="font-semibold text-zinc-700">{session.owner?.full_name || 'Unassigned'}</span></div>{session.resolution_code && <div className="mt-2 text-xs font-medium text-zinc-800">{label(session.resolution_code)}</div>}{session.closing_note && <p className="mt-1 text-xs leading-5 text-zinc-600">{session.closing_note}</p>}</div>)}</div></div>}

      {contextTab === 'assist' && <div><div className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">Assist</div><p className="mt-1 text-xs leading-5 text-zinc-500">Use conversation context without automatically sending or writing CRM data.</p><div className="mt-4 grid gap-2"><button type="button" disabled={Boolean(assisting)} onClick={() => void runAssist('summary')} className="button-secondary justify-start"><Sparkles className="h-4 w-4" /> Summarize conversation</button><button type="button" disabled={Boolean(assisting)} onClick={() => void runAssist('reply')} className="button-secondary justify-start"><WandSparkles className="h-4 w-4" /> Draft reply</button><button type="button" disabled={Boolean(assisting)} onClick={() => void runAssist('extract')} className="button-secondary justify-start"><Search className="h-4 w-4" /> Extract explicit details</button></div>{assisting && <div className="mt-4 flex items-center gap-2 text-xs text-zinc-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Working…</div>}{assist && <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3"><div className="mb-2 text-[9px] font-bold uppercase tracking-wide text-zinc-400">{assist.mode} · {assist.action}</div>{assist.result ? <div className="whitespace-pre-wrap text-xs leading-5 text-zinc-800">{assist.result}</div> : <pre className="whitespace-pre-wrap break-words text-[11px] leading-5 text-zinc-700">{JSON.stringify(assist.data || {}, null, 2)}</pre>}</div>}</div>}

      {contextTab === 'crm' && <div><div className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">CRM</div>{selectedLead ? <div className="mt-3 rounded-lg border border-zinc-200 p-4"><div className="font-semibold">{selectedLead.customer_name}</div><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded bg-zinc-50 p-2">Stage<div className="mt-1 font-semibold">{label(selectedLead.stage)}</div></div><div className="rounded bg-zinc-50 p-2">Priority<div className="mt-1 font-semibold">{label(selectedLead.priority)}</div></div></div><Link href={`/leads/${selectedLead.id}/workspace`} className="button-primary mt-3 w-full">Open {leadLabel}</Link></div> : <div className="mt-3 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-4 text-center"><div className="text-sm font-semibold">No {leadLabel.toLowerCase()} yet</div><p className="mt-1 text-xs text-zinc-500">Create a CRM record when the conversation becomes commercially relevant.</p><button type="button" onClick={() => setConvertOpen(true)} className="button-primary mt-3 w-full">Create {leadLabel}</button></div>}</div>}
    </div>
  </div> : null;

  return <div className="flex h-full min-h-0 flex-1 overflow-hidden bg-white">
    <div className="grid h-full min-h-0 w-full grid-cols-1 md:grid-cols-[330px_minmax(0,1fr)] lg:grid-cols-[190px_330px_minmax(0,1fr)] xl:grid-cols-[190px_330px_minmax(420px,1fr)_310px]">
      <aside className="hidden min-h-0 border-r border-zinc-200 bg-zinc-50/80 lg:flex lg:flex-col"><div className="flex h-14 items-center gap-2 border-b border-zinc-200 px-3"><InboxIcon className="h-4 w-4" /><span className="text-sm font-semibold">Inbox</span>{metrics.slaOverdue > 0 && <span className="ml-auto rounded-md bg-rose-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-rose-700">{metrics.slaOverdue}</span>}</div><div className="min-h-0 flex-1 overflow-y-auto p-2.5"><div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-zinc-400">Standard</div>{standardViews.map((item) => { const Icon = item.icon; const active = !activeSavedView && queue === item.key; return <button key={item.key} type="button" onClick={() => { setActiveSavedView(null); setQueue(item.key); setState(''); setPriority(''); }} className={`mt-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-semibold ${active ? 'bg-zinc-900 text-white' : 'text-zinc-700 hover:bg-zinc-100'}`}><Icon className="h-3.5 w-3.5" /><span className="flex-1 truncate">{item.label}</span>{item.count !== undefined && <span className="font-mono text-[10px]">{item.count}</span>}</button>; })}<div className="mt-4 px-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-zinc-400">Exceptions</div>{exceptionViews.map((item) => { const Icon = item.icon; const active = !activeSavedView && queue === item.key; return <button key={item.key} type="button" onClick={() => { setActiveSavedView(null); setQueue(item.key); setState(''); setPriority(''); }} className={`mt-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-semibold ${active ? 'bg-white text-zinc-950 ring-1 ring-zinc-200' : 'text-zinc-700 hover:bg-zinc-100'}`}><Icon className="h-3.5 w-3.5" /><span className="flex-1 truncate">{item.label}</span>{item.count !== undefined && <span className={`font-mono text-[10px] ${item.key === 'sla_overdue' && item.count ? 'text-rose-600' : ''}`}>{item.count}</span>}</button>; })}<div className="mt-4 flex items-center justify-between px-2 pb-1"><span className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">Saved</span>{can('inbox.saved_views.manage') && <button type="button" onClick={() => setSaveViewOpen(true)} className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800" title="Save current view"><Plus className="h-3.5 w-3.5" /></button>}</div>{savedViews.map((view) => <button key={view.id} type="button" onClick={() => applySavedView(view)} className={`mt-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-semibold ${activeSavedView === view.id ? 'bg-zinc-100 text-zinc-900 ring-1 ring-zinc-300' : 'text-zinc-700 hover:bg-zinc-100'}`}><History className="h-3.5 w-3.5" /><span className="flex-1 truncate">{view.name}</span>{view.is_shared && <Users className="h-3 w-3 text-zinc-400" />}</button>)}<Link href="/inbox/views" className="mt-2 flex items-center gap-2 rounded-md px-2.5 py-2 text-[11px] font-semibold text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800">Manage saved views</Link></div></aside>

      <section className={`${selectedId ? 'hidden md:flex' : 'flex'} min-h-0 min-w-0 flex-col border-r border-zinc-200`}><div className="shrink-0 border-b border-zinc-200 p-3"><div className="flex gap-2 lg:hidden"><select value={queue} onChange={(e) => { setActiveSavedView(null); setQueue(e.target.value as QueueKey); }} className="select-field h-9 flex-1 text-xs">{[...standardViews, ...exceptionViews].map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select><button type="button" onClick={() => void syncProvider(true)} className="button-secondary button-sm" disabled={syncing}><RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} /></button></div><div className="mt-2 flex gap-2 lg:mt-0"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${contactLabel.toLowerCase()} or message`} className="field h-9 pl-8 text-xs" /></div><button type="button" onClick={() => void syncProvider(true)} className="button-secondary button-sm hidden lg:inline-flex" disabled={syncing}><RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} /></button></div><div className="mt-2 grid grid-cols-2 gap-2"><select value={provider} onChange={(e) => setProvider(e.target.value)} className="select-field h-8 text-xs"><option value="all">All channels</option><option value="facebook">Facebook</option><option value="instagram">Instagram</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="website">Website</option></select><select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="select-field h-8 text-xs"><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="waiting">Longest waiting</option><option value="sla">SLA soonest</option></select></div></div><div className="min-h-0 flex-1 overflow-y-auto divide-y divide-zinc-100">{loadingList ? <div className="flex h-32 items-center justify-center gap-2 text-xs text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading Inbox…</div> : conversations.length === 0 ? <div className="px-6 py-16 text-center"><InboxIcon className="mx-auto h-6 w-6 text-zinc-300" /><div className="mt-2 text-sm font-semibold">Nothing here</div><p className="mt-1 text-xs text-zinc-500">This view is clear.</p></div> : conversations.map((conversation) => { const Icon = PROVIDER_ICONS[conversation.provider] || MessageSquare; const info = sla(conversation); return <button key={conversation.id} type="button" onClick={() => { setSelectedId(conversation.id); setContextOpen(false); }} className={`w-full px-3.5 py-3 text-left hover:bg-zinc-50 ${selectedId === conversation.id ? 'bg-zinc-100/90' : ''}`}><div className="flex items-start gap-2.5"><div className="relative"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold ring-1 ring-zinc-200">{initials(conversation.customer_name)}</div><span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-zinc-900 text-white"><Icon className="h-2.5 w-2.5" /></span></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate text-sm font-semibold text-zinc-950">{conversation.customer_name || contactLabel}</span>{conversation.unread_count > 0 && <span className="rounded-full bg-zinc-950 px-1.5 text-[10px] font-bold text-white">{conversation.unread_count}</span>}<span className="ml-auto font-mono text-[10px] text-zinc-500">{shortTime(conversation.last_message_at)}</span></div><p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-600">{conversation.last_message_preview || 'No message preview'}</p><div className="mt-2 flex items-center gap-1.5 text-[10px] text-zinc-500"><span className="max-w-24 truncate font-semibold text-zinc-700">{conversation.assigned_profile?.full_name || 'Unassigned'}</span><span>·</span><span>{label(contactOf(conversation)?.lifecycle_key || 'new')}</span><span className="ml-auto" />{conversation.priority !== 'normal' && <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-medium uppercase text-zinc-600">{conversation.priority}</span>}<span className={`font-semibold ${info.danger ? 'text-rose-600' : conversation.needs_reply ? 'text-zinc-900' : ''}`}>{info.text}</span></div></div></div></button>; })}</div></section>

      <section className={`${selectedId ? 'flex' : 'hidden md:flex'} min-h-0 min-w-0 flex-col bg-zinc-50/50`}>{!selected ? <div className="flex h-full items-center justify-center text-sm text-zinc-500">Select a conversation to start working.</div> : <><header className="flex min-h-14 items-center justify-between gap-2 border-b border-zinc-200 bg-white px-3"><div className="flex min-w-0 items-center gap-2"><button type="button" onClick={() => setSelectedId(null)} className="button-ghost button-sm md:hidden"><ArrowLeft className="h-4 w-4" /></button><div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold">{initials(selected.customer_name)}</div><div className="min-w-0"><div className="truncate text-sm font-semibold text-zinc-950">{selected.customer_name || contactLabel}</div><div className="truncate text-[11px] text-zinc-500">{selected.assigned_profile?.full_name || 'Unassigned'} · {label(selectedContact?.lifecycle_key || 'new')}</div></div></div><div className="flex items-center gap-1.5">{!selected.assigned_to && <button type="button" onClick={() => void patchConversation({ assigned_to: currentUser.id }, 'Conversation claimed.')} className="button-secondary button-sm"><UserCheck className="h-3.5 w-3.5" /><span className="hidden sm:inline">Claim</span></button>}<button type="button" onClick={() => setContextOpen(true)} className="button-secondary button-sm xl:hidden"><PanelRight className="h-3.5 w-3.5" /></button>{selected.workflow_state !== 'closed' && can('inbox.resolve') && <button type="button" onClick={() => setCloseOpen(true)} className="button-primary button-sm"><CheckCircle2 className="h-3.5 w-3.5" /><span className="hidden sm:inline">Resolve</span></button>}<div className="relative"><button type="button" onClick={() => setMoreOpen((value) => !value)} className="button-secondary button-sm"><MoreHorizontal className="h-4 w-4" /></button>{moreOpen && <div className="absolute right-0 top-9 z-30 w-52 rounded-lg border border-zinc-200 bg-white p-1.5 shadow-lg"><button type="button" onClick={() => { setMoreOpen(false); void patchConversation({ workflow_state: 'waiting' }); }} className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-xs hover:bg-zinc-50"><PauseCircle className="h-3.5 w-3.5" /> Mark waiting</button><button type="button" onClick={() => { setMoreOpen(false); void patchConversation({ workflow_state: 'snoozed', snoozed_until: new Date(Date.now() + 3600000).toISOString() }); }} className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-xs hover:bg-zinc-50"><AlarmClock className="h-3.5 w-3.5" /> Snooze 1 hour</button><button type="button" onClick={() => { setMoreOpen(false); void patchConversation({ workflow_state: 'snoozed', snoozed_until: new Date(Date.now() + 86400000).toISOString() }); }} className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-xs hover:bg-zinc-50"><Clock3 className="h-3.5 w-3.5" /> Snooze 24 hours</button>{selected.workflow_state !== 'open' && <button type="button" onClick={() => { setMoreOpen(false); void patchConversation({ workflow_state: 'open' }); }} className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-xs hover:bg-zinc-50"><InboxIcon className="h-3.5 w-3.5" /> Reopen</button>}<div className="my-1 border-t border-zinc-100" /><select value={selected.priority} onChange={(e) => void patchConversation({ priority: e.target.value })} className="select-field h-8 w-full text-xs"><option value="low">Low priority</option><option value="normal">Normal priority</option><option value="high">High priority</option><option value="urgent">Urgent priority</option></select></div>}</div></div></header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">{loadingThread ? <div className="flex h-full items-center justify-center gap-2 text-xs text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading conversation…</div> : <div className="mx-auto max-w-3xl space-y-4">{timeline.map((item) => item.kind === 'event' ? <div key={`e-${item.event.id}`} className="flex items-center gap-3"><span className="h-px flex-1 bg-zinc-200" /><span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[10px] font-medium text-zinc-600">{eventText(item.event)} · {shortTime(item.event.created_at)}</span><span className="h-px flex-1 bg-zinc-200" /></div> : <div key={`m-${item.message.id}`} className={`flex ${item.message.direction === 'outbound' ? 'justify-end' : item.message.direction === 'internal' ? 'justify-center' : 'justify-start'}`}>{item.message.direction === 'internal' ? <div className="max-w-[85%] rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><div className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide"><StickyNote className="h-3.5 w-3.5" /> Internal note</div><div className="whitespace-pre-wrap">{item.message.body || '—'}</div><div className="mt-2 text-right font-mono text-[10px]">{shortTime(item.message.sent_at)}</div></div> : <div className={`max-w-[78%] rounded-lg px-4 py-3 text-sm leading-6 ${item.message.direction === 'outbound' ? 'bg-zinc-950 text-white' : 'border border-zinc-200 bg-white text-zinc-950'}`}><div className="whitespace-pre-wrap break-words">{item.message.body || 'Attachment'}</div><div className={`mt-2 text-right font-mono text-[10px] ${item.message.direction === 'outbound' ? 'text-zinc-300' : 'text-zinc-400'}`}>{shortTime(item.message.sent_at)}{item.message.delivery_status === 'failed' ? ' · Failed' : ''}</div></div>}</div>)}<div ref={endRef} /></div>}</div>
        <div className="shrink-0 border-t border-zinc-200 bg-white p-3"><div className="mx-auto max-w-3xl rounded-lg border border-zinc-200 bg-white focus-within:border-zinc-400"><div className="flex gap-1 border-b border-zinc-100 p-1.5"><button type="button" onClick={() => setReplyMode('outbound')} className={`rounded px-2.5 py-1 text-xs font-semibold ${replyMode === 'outbound' ? 'bg-zinc-950 text-white' : 'text-zinc-500'}`}>Reply</button><button type="button" onClick={() => setReplyMode('internal')} className={`rounded px-2.5 py-1 text-xs font-semibold ${replyMode === 'internal' ? 'bg-amber-100 text-amber-950' : 'text-zinc-500'}`}>Internal note</button>{replyMode === 'outbound' && !canReply && <span className="ml-auto self-center text-[10px] font-semibold text-amber-700">Provider reply window closed</span>}</div><textarea ref={composerRef} value={replyBody} onChange={(e) => setReplyBody(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} rows={3} disabled={replyMode === 'outbound' && !canReply} placeholder={replyMode === 'internal' ? 'Leave context for your team…' : 'Write a reply…'} className="w-full resize-none bg-transparent px-3.5 py-3 text-sm outline-none disabled:bg-zinc-50" /><div className="flex items-center justify-between border-t border-zinc-100 px-3 py-2"><div className="text-[10px] text-zinc-400">R reply · N note · [ / ] navigate</div><button type="button" onClick={() => void send()} disabled={sending || !replyBody.trim() || (replyMode === 'outbound' && !canReply)} className="button-primary button-sm">{sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}{replyMode === 'internal' ? 'Add note' : 'Send'}</button></div></div></div>
      </>}</section>

      <aside className="hidden min-h-0 border-l border-zinc-200 xl:block">{context}</aside>
    </div>

    {contextOpen && selected && <div className="fixed inset-0 z-40 flex justify-end bg-zinc-950/30 xl:hidden" onClick={() => setContextOpen(false)}><div className="h-full w-full max-w-sm" onClick={(e) => e.stopPropagation()}>{context}<button type="button" onClick={() => setContextOpen(false)} className="absolute right-2 top-2 rounded bg-white p-2 shadow"><X className="h-4 w-4" /></button></div></div>}

    {saveViewOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/35 p-4" onClick={() => setSaveViewOpen(false)}><div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}><div className="text-sm font-semibold">Save current Inbox view</div><input value={saveViewName} onChange={(e) => setSaveViewName(e.target.value)} placeholder="e.g. WhatsApp high priority" className="field mt-3" autoFocus /><label className="mt-3 flex items-center justify-between text-xs font-medium"><span>Share with team</span><input type="checkbox" checked={saveViewShared} onChange={(e) => setSaveViewShared(e.target.checked)} /></label><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setSaveViewOpen(false)} className="button-secondary">Cancel</button><button type="button" onClick={() => void createSavedView()} disabled={!saveViewName.trim()} className="button-primary">Save view</button></div></div></div>}

    {closeOpen && selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-4"><div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white shadow-xl"><div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3"><div className="text-sm font-semibold">Resolve conversation</div><button type="button" onClick={() => setCloseOpen(false)}><X className="h-4 w-4" /></button></div><div className="space-y-3 p-4"><select value={resolution} onChange={(e) => setResolution(e.target.value)} className="select-field w-full"><option value="resolved">Resolved</option><option value="qualified">Qualified</option><option value="converted">Converted</option><option value="not_interested">Not interested</option><option value="duplicate">Duplicate</option><option value="spam">Spam</option><option value="other">Other</option></select><textarea value={closingNote} onChange={(e) => setClosingNote(e.target.value)} rows={4} placeholder="Closing note / handoff context" className="field" /></div><div className="flex justify-end gap-2 border-t border-zinc-100 p-3"><button type="button" onClick={() => setCloseOpen(false)} className="button-secondary">Cancel</button><button type="button" disabled={saving} onClick={async () => { const updated = await patchConversation({ workflow_state: 'closed', resolution_code: resolution, closing_note: closingNote.trim() || null }); if (updated) { setCloseOpen(false); setClosingNote(''); } }} className="button-primary">Resolve</button></div></div></div>}

    <ConvertToLeadDrawer isOpen={convertOpen} onClose={() => setConvertOpen(false)} conversation={selected} onConverted={() => { setConvertOpen(false); if (selectedId) void loadThread(selectedId, true); }} />
  </div>;
}
