'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlarmClock,
  AlertTriangle,
  ArrowLeft,
  AtSign,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Clock3,
  Facebook,
  FileText,
  Globe,
  Image as ImageIcon,
  Inbox as InboxIcon,
  Instagram,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquare,
  MoreHorizontal,
  PanelRight,
  Paperclip,
  PauseCircle,
  Phone,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  StickyNote,
  UserCheck,
  UserPlus,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { useApp } from '@/lib/store';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';
import ConvertToLeadDrawer, { type ConversationForConversion } from '@/components/inbox/ConvertToLeadDrawer';

type QueueKey = 'all' | 'mine' | 'unassigned' | 'collaborations' | 'unread' | 'needs_reply' | 'sla_overdue' | 'high_priority' | 'has_phone' | 'waiting' | 'snoozed' | 'closed';
type WorkflowState = 'open' | 'waiting' | 'snoozed' | 'closed';
type Priority = 'low' | 'normal' | 'high' | 'urgent';
type DetailTab = 'details' | 'activity' | 'media' | 'crm';
type SortKey = 'newest' | 'oldest' | 'waiting' | 'sla';
type ReplyMode = 'outbound' | 'internal';
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
  last_seen_at: string | null;
};

type LeadSummary = {
  id: string;
  lead_code?: string | null;
  customer_name: string;
  customer_city?: string | null;
  customer_country?: string | null;
  destination?: string | null;
  stage: string;
  priority: string;
  assigned_to: string | null;
  created_at: string;
};

type Conversation = ConversationForConversion & {
  workspace_id?: string;
  contact_id: string | null;
  lead_id: string | null;
  connection_id?: string | null;
  external_thread_id?: string | null;
  external_contact_id?: string | null;
  customer_avatar_url: string | null;
  status?: 'open' | 'closed' | 'archived';
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
  team_key?: string | null;
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
  conversation_id: string;
  lead_id: string | null;
  provider: string;
  direction: 'inbound' | 'outbound' | 'internal';
  message_type: string;
  body: string | null;
  metadata?: UnknownRecord | null;
  delivery_status?: string | null;
  failure_message?: string | null;
  sent_at: string;
  created_at?: string;
  created_by: string | null;
  author_profile?: { id: string; full_name: string | null; avatar_url: string | null; role: string } | null;
};

type TimelineEvent = {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
  actor: { id: string; full_name: string | null; role: string } | null;
};

type Collaborator = {
  user_id: string;
  created_at: string;
  user: { id: string; full_name: string | null; email: string; avatar_url?: string | null; role: string; status?: string } | null;
};

type Metrics = {
  totalOpen: number;
  unassigned: number;
  collaborations: number;
  waiting: number;
  snoozed: number;
  unread: number;
  needsReply: number;
  slaOverdue: number;
  highPriority: number;
  hasPhone: number;
};

type MediaItem = { id: string; type: 'image' | 'file'; url: string; label: string };

const EMPTY_METRICS: Metrics = {
  totalOpen: 0,
  unassigned: 0,
  collaborations: 0,
  waiting: 0,
  snoozed: 0,
  unread: 0,
  needsReply: 0,
  slaOverdue: 0,
  highPriority: 0,
  hasPhone: 0,
};

const PROVIDER_ICONS: Record<string, typeof MessageSquare> = {
  facebook: Facebook,
  instagram: Instagram,
  whatsapp: MessageCircle,
  email: Mail,
  website: Globe,
};

const OPERATION_EVENT_TYPES = new Set(['state_changed', 'assigned', 'priority_changed', 'lifecycle_changed']);

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {};
}

function contactOf(conversation: Conversation | null) {
  if (!conversation?.contact) return null;
  return Array.isArray(conversation.contact) ? conversation.contact[0] || null : conversation.contact;
}

function leadOf(conversation: Conversation | null) {
  if (!conversation?.lead) return null;
  return Array.isArray(conversation.lead) ? conversation.lead[0] || null : conversation.lead;
}

function initials(value: string | null | undefined, fallback = 'C') {
  const parts = (value || fallback).trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || fallback;
}

function shortTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function relativeTime(value?: string | null) {
  if (!value) return '—';
  const diff = Date.now() - new Date(value).getTime();
  const absolute = Math.abs(diff);
  const minutes = Math.floor(absolute / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m ${diff >= 0 ? 'ago' : 'from now'}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${diff >= 0 ? 'ago' : 'from now'}`;
  return `${Math.floor(hours / 24)}d ${diff >= 0 ? 'ago' : 'from now'}`;
}

function lifecycleLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function stateLabel(state: WorkflowState) {
  if (state === 'waiting') return 'Waiting';
  if (state === 'snoozed') return 'Snoozed';
  if (state === 'closed') return 'Resolved';
  return 'Open';
}

function slaInfo(conversation: Conversation) {
  if (conversation.workflow_state === 'closed') return { label: 'Resolved', overdue: false };
  if (conversation.needs_reply && conversation.first_responded_at) return { label: 'Needs reply', overdue: false };
  if (conversation.first_responded_at) return { label: 'Responded', overdue: false };
  if (!conversation.first_response_due_at) return { label: 'No SLA', overdue: false };
  const ms = new Date(conversation.first_response_due_at).getTime() - Date.now();
  const overdue = ms < 0;
  const minutes = Math.max(1, Math.floor(Math.abs(ms) / 60_000));
  const amount = minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h`;
  return { label: overdue ? `${amount} overdue` : `${amount} left`, overdue };
}

function eventText(event: TimelineEvent) {
  if (event.event_type === 'assigned') return `Assigned to ${String(event.payload.assigned_to || 'team member')}`;
  if (event.event_type === 'priority_changed') return `Priority changed to ${String(event.payload.priority || 'updated')}`;
  if (event.event_type === 'lifecycle_changed') return `Lifecycle changed to ${lifecycleLabel(String(event.payload.lifecycle_key || 'updated'))}`;
  if (event.event_type === 'state_changed') return `Conversation ${String(event.payload.state || 'updated')}`;
  return event.event_type.replaceAll('_', ' ');
}

function mediaFromMessages(messages: Message[]): MediaItem[] {
  const output: MediaItem[] = [];
  for (const message of messages) {
    const metadata = message.metadata || {};
    const attachments = asRecord(metadata.attachments);
    const data = Array.isArray(attachments.data) ? attachments.data : [];
    data.forEach((entry, index) => {
      const item = asRecord(entry);
      const image = asRecord(item.image_data);
      const url = typeof image.url === 'string' ? image.url : typeof item.file_url === 'string' ? item.file_url : '';
      if (!url) return;
      const mime = typeof item.mime_type === 'string' ? item.mime_type : '';
      output.push({ id: `${message.id}-${index}`, type: mime.startsWith('image/') || Boolean(image.url) ? 'image' : 'file', url, label: typeof item.name === 'string' ? item.name : 'Attachment' });
    });
    const directUrl = typeof metadata.attachment_url === 'string' ? metadata.attachment_url : '';
    if (directUrl) output.push({ id: `${message.id}-direct`, type: message.message_type === 'image' ? 'image' : 'file', url: directUrl, label: 'Attachment' });
  }
  return output;
}

function queueFromParam(value: string | null): QueueKey {
  const valid: QueueKey[] = ['all', 'mine', 'unassigned', 'collaborations', 'unread', 'needs_reply', 'sla_overdue', 'high_priority', 'has_phone', 'waiting', 'snoozed', 'closed'];
  return valid.includes(value as QueueKey) ? value as QueueKey : 'mine';
}

export default function InboxPage() {
  const params = useSearchParams();
  const { currentUser, allProfiles, showToast } = useApp();
  const { term } = useWorkspace();
  const contactLabel = term('contact', 'Contact');
  const leadLabel = term('lead', 'Lead');
  const leadPlural = term('lead_plural', 'Leads');
  const canManage = currentUser.role === 'admin' || currentUser.role === 'manager';

  const [queue, setQueue] = useState<QueueKey>(() => queueFromParam(params.get('view')));
  const [provider, setProvider] = useState('all');
  const [sort, setSort] = useState<SortKey>('newest');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [metrics, setMetrics] = useState<Metrics>(EMPTY_METRICS);
  const [selectedId, setSelectedId] = useState<string | null>(() => params.get('conversationId'));
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [replyMode, setReplyMode] = useState<ReplyMode>('outbound');
  const [replyBody, setReplyBody] = useState('');
  const [detailTab, setDetailTab] = useState<DetailTab>('details');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [resolution, setResolution] = useState('resolved');
  const [closingNote, setClosingNote] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [collaboratorId, setCollaboratorId] = useState('');
  const [editLocation, setEditLocation] = useState(false);
  const [editCity, setEditCity] = useState('');
  const [editCountry, setEditCountry] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);

  const selectedListConversation = useMemo(() => conversations.find((conversation) => conversation.id === selectedId) || null, [conversations, selectedId]);
  const selected = activeConversation || selectedListConversation;
  const selectedContact = contactOf(selected);
  const selectedLead = leadOf(selected);
  const media = useMemo(() => mediaFromMessages(messages), [messages]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 220);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadList = useCallback(async (quiet = false) => {
    if (!quiet) setLoadingList(true);
    try {
      const query = new URLSearchParams({ filter: queue, provider, sort, limit: '300' });
      if (debouncedSearch) query.set('search', debouncedSearch);
      const response = await fetch(`/api/conversations?${query.toString()}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to load Inbox.');
      const rows = (payload.conversations || []) as Conversation[];
      setConversations(rows);
      setMetrics({ ...EMPTY_METRICS, ...(payload.metrics || {}) });
      setSelectedId((current) => current && rows.some((row) => row.id === current) ? current : (params.get('conversationId') || rows[0]?.id || null));
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to load Inbox.', 'error');
    } finally {
      if (!quiet) setLoadingList(false);
    }
  }, [debouncedSearch, params, provider, queue, showToast, sort]);

  const loadThread = useCallback(async (id: string, quiet = false) => {
    if (!quiet) setLoadingThread(true);
    try {
      const [conversationResponse, eventResponse, collaboratorResponse] = await Promise.all([
        fetch(`/api/conversations/${id}?messageLimit=1000`, { cache: 'no-store' }),
        fetch(`/api/conversations/${id}/events?limit=120`, { cache: 'no-store' }),
        fetch(`/api/conversations/${id}/collaborators`, { cache: 'no-store' }),
      ]);
      const payload = await conversationResponse.json();
      if (!conversationResponse.ok) throw new Error(payload.error || 'Unable to load conversation.');
      setActiveConversation(payload.conversation as Conversation);
      setMessages((payload.messages || []) as Message[]);
      if (eventResponse.ok) {
        const eventPayload = await eventResponse.json();
        setEvents((eventPayload.events || []) as TimelineEvent[]);
      }
      if (collaboratorResponse.ok) {
        const collaboratorPayload = await collaboratorResponse.json();
        setCollaborators((collaboratorPayload.collaborators || []) as Collaborator[]);
      }
      const conversation = payload.conversation as Conversation;
      const profile = asRecord(asRecord(conversation.metadata).customer_profile);
      setEditCity(typeof profile.city === 'string' ? profile.city : leadOf(conversation)?.customer_city || '');
      setEditCountry(typeof profile.country === 'string' ? profile.country : leadOf(conversation)?.customer_country || '');
      if (conversation.unread_count > 0) {
        void fetch(`/api/conversations/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mark_read: true }) });
      }
      window.setTimeout(() => endRef.current?.scrollIntoView({ block: 'end' }), 50);
    } catch (error) {
      if (!quiet) showToast(error instanceof Error ? error.message : 'Unable to load conversation.', 'error');
    } finally {
      if (!quiet) setLoadingThread(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) {
      setActiveConversation(null);
      setMessages([]);
      setEvents([]);
      setCollaborators([]);
      return;
    }
    void loadThread(selectedId);
  }, [loadThread, selectedId]);

  useEffect(() => {
    const listTimer = window.setInterval(() => void loadList(true), 12_000);
    const threadTimer = window.setInterval(() => { if (selectedId) void loadThread(selectedId, true); }, 5_000);
    return () => { window.clearInterval(listTimer); window.clearInterval(threadTimer); };
  }, [loadList, loadThread, selectedId]);

  const patchConversation = async (patch: Record<string, unknown>, successMessage?: string) => {
    if (!selectedId) return null;
    setSaving(true);
    try {
      const response = await fetch(`/api/conversations/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to update conversation.');
      const updated = payload.conversation as Conversation;
      setActiveConversation(updated);
      setConversations((current) => current.map((item) => item.id === updated.id ? updated : item));
      if (successMessage) showToast(successMessage, 'success');
      await Promise.all([loadList(true), loadThread(updated.id, true)]);
      return updated;
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to update conversation.', 'error');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const sendMessage = async () => {
    if (!selectedId || !replyBody.trim() || sending) return;
    const body = replyBody.trim();
    setSending(true);
    setReplyBody('');
    try {
      const clientRequestId = `${currentUser.id}:${selectedId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
      const response = await fetch(`/api/conversations/${selectedId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': clientRequestId },
        body: JSON.stringify({ body, direction: replyMode, clientRequestId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Message delivery failed.');
      await Promise.all([loadThread(selectedId, true), loadList(true)]);
      window.setTimeout(() => endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }), 30);
    } catch (error) {
      setReplyBody(body);
      showToast(error instanceof Error ? error.message : 'Message delivery failed.', 'error');
    } finally {
      setSending(false);
    }
  };

  const addCollaborator = async () => {
    if (!selectedId || !collaboratorId) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/conversations/${selectedId}/collaborators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: collaboratorId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to add collaborator.');
      setCollaboratorId('');
      await loadThread(selectedId, true);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to add collaborator.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const removeCollaborator = async (userId: string) => {
    if (!selectedId) return;
    const response = await fetch(`/api/conversations/${selectedId}/collaborators?userId=${encodeURIComponent(userId)}`, { method: 'DELETE' });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      showToast(payload.error || 'Unable to remove collaborator.', 'error');
      return;
    }
    await loadThread(selectedId, true);
  };

  const resolveConversation = async () => {
    const updated = await patchConversation({ workflow_state: 'closed', resolution_code: resolution, closing_note: closingNote.trim() || null });
    if (updated) {
      setCloseOpen(false);
      setClosingNote('');
      showToast('Conversation resolved.', 'success');
    }
  };

  const saveLocation = async () => {
    const updated = await patchConversation({ customer_city: editCity.trim(), customer_country: editCountry.trim() }, 'Contact location updated.');
    if (updated) setEditLocation(false);
  };

  const handleConverted = async () => {
    setConvertOpen(false);
    if (selectedId) await Promise.all([loadThread(selectedId, true), loadList(true)]);
  };

  const standardViews: { key: QueueKey; label: string; count?: number; icon: typeof InboxIcon }[] = [
    { key: 'all', label: 'All open', count: metrics.totalOpen, icon: InboxIcon },
    { key: 'mine', label: 'Mine', icon: UserCheck },
    { key: 'unassigned', label: 'Unassigned', count: metrics.unassigned, icon: Users },
    { key: 'collaborations', label: 'Collaborations', count: metrics.collaborations, icon: UserPlus },
  ];
  const savedViews: { key: QueueKey; label: string; count?: number; icon: typeof InboxIcon }[] = [
    { key: 'needs_reply', label: 'Needs reply', count: metrics.needsReply, icon: AtSign },
    { key: 'unread', label: 'Unread', count: metrics.unread, icon: MessageSquare },
    { key: 'sla_overdue', label: 'SLA overdue', count: metrics.slaOverdue, icon: ShieldAlert },
    { key: 'high_priority', label: 'High priority', count: metrics.highPriority, icon: AlertTriangle },
    { key: 'has_phone', label: 'Has phone', count: metrics.hasPhone, icon: Phone },
    { key: 'waiting', label: 'Waiting', count: metrics.waiting, icon: PauseCircle },
    { key: 'snoozed', label: 'Snoozed', count: metrics.snoozed, icon: Clock3 },
    { key: 'closed', label: 'Resolved', icon: CheckCircle2 },
  ];

  const availableCollaborators = allProfiles.filter((profile) => profile.is_active && !collaborators.some((item) => item.user_id === profile.id));
  const assignmentProfiles = allProfiles.filter((profile) => profile.is_active && ['agent', 'manager', 'admin'].includes(profile.role));
  const metadata = asRecord(selected?.metadata);
  const customerProfile = asRecord(metadata.customer_profile);
  const canReply = metadata.can_reply !== false;
  const timeline = useMemo(() => {
    const messageItems = messages.map((message) => ({ kind: 'message' as const, at: message.sent_at, message }));
    const eventItems = events.filter((event) => OPERATION_EVENT_TYPES.has(event.event_type)).map((event) => ({ kind: 'event' as const, at: event.created_at, event }));
    return [...messageItems, ...eventItems].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [events, messages]);

  const renderContext = () => {
    if (!selected) return null;
    return (
      <div className="flex h-full min-h-0 flex-col bg-white">
        <div className="flex h-12 items-center border-b border-zinc-200 px-3">
          <div className="grid w-full grid-cols-4 rounded-lg bg-zinc-100 p-1 text-[10px] font-semibold">
            {(['details', 'activity', 'media', 'crm'] as DetailTab[]).map((tab) => (
              <button key={tab} type="button" onClick={() => setDetailTab(tab)} className={`rounded-md px-1.5 py-1.5 capitalize ${detailTab === tab ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}`}>{tab}</button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {detailTab === 'details' && <div className="space-y-5">
            <section>
              <div className="text-[10px] font-bold uppercase tracking-[0.13em] text-zinc-400">{contactLabel}</div>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-100 text-xs font-bold text-zinc-700">
                  {selected.customer_avatar_url ? <img src={`/api/media/proxy?url=${encodeURIComponent(selected.customer_avatar_url)}`} alt="" className="h-full w-full object-cover" /> : initials(selected.customer_name, 'C')}
                </div>
                <div className="min-w-0"><div className="truncate text-sm font-semibold text-zinc-950">{selected.customer_name || contactLabel}</div><div className="mt-0.5 truncate text-[11px] text-zinc-500">{selected.customer_email || selected.customer_phone || 'No contact detail'}</div></div>
              </div>
              <dl className="mt-4 space-y-3 text-xs">
                <div className="flex justify-between gap-3"><dt className="text-zinc-500">Phone</dt><dd className="max-w-[170px] truncate font-mono font-medium text-zinc-900">{selected.customer_phone || selectedContact?.primary_phone || '—'}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-zinc-500">Email</dt><dd className="max-w-[170px] truncate font-medium text-zinc-900">{selected.customer_email || selectedContact?.primary_email || '—'}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-zinc-500">Channel</dt><dd className="font-semibold capitalize text-zinc-900">{selected.provider}</dd></div>
                <div className="flex items-start justify-between gap-3"><dt className="pt-2 text-zinc-500">Lifecycle</dt><dd><select value={selectedContact?.lifecycle_key || 'new'} disabled={!selectedContact || saving} onChange={(event) => void patchConversation({ lifecycle_key: event.target.value })} className="select-field h-8 w-36 text-xs"><option value="new">New</option><option value="qualified">Qualified</option><option value="opportunity">Opportunity</option><option value="customer">Customer</option><option value="lost">Lost</option></select></dd></div>
              </dl>
            </section>

            <section className="border-t border-zinc-100 pt-4">
              <div className="flex items-center justify-between"><div className="text-[10px] font-bold uppercase tracking-[0.13em] text-zinc-400">Location</div><button type="button" onClick={() => setEditLocation((value) => !value)} className="text-[10px] font-semibold text-blue-600">{editLocation ? 'Cancel' : 'Edit'}</button></div>
              {editLocation ? <div className="mt-3 space-y-2"><input value={editCity} onChange={(event) => setEditCity(event.target.value)} placeholder="City / town" className="field h-8 text-xs" /><input value={editCountry} onChange={(event) => setEditCountry(event.target.value)} placeholder="Country" className="field h-8 text-xs" /><button type="button" onClick={() => void saveLocation()} disabled={saving} className="button-primary button-sm w-full">Save location</button></div> : <div className="mt-2 text-xs font-medium text-zinc-700">{[typeof customerProfile.city === 'string' ? customerProfile.city : selectedLead?.customer_city, typeof customerProfile.country === 'string' ? customerProfile.country : selectedLead?.customer_country].filter(Boolean).join(', ') || 'Not set'}</div>}
            </section>

            <section className="border-t border-zinc-100 pt-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.13em] text-zinc-400">Assignment</div>
              <div className="mt-3 space-y-2">
                <select value={selected.assigned_to || ''} disabled={saving || (!canManage && Boolean(selected.assigned_to) && selected.assigned_to !== currentUser.id)} onChange={(event) => void patchConversation({ assigned_to: event.target.value || null })} className="select-field h-9 w-full text-xs"><option value="">Unassigned</option>{assignmentProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name}</option>)}</select>
                <div className="flex flex-wrap gap-1.5">{collaborators.map((item) => <button key={item.user_id} type="button" title="Remove collaborator" onClick={() => void removeCollaborator(item.user_id)} className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-medium text-zinc-700"><span className="flex h-4 w-4 items-center justify-center rounded-full bg-zinc-200 text-[8px]">{initials(item.user?.full_name, '?')}</span>{item.user?.full_name || 'Member'}<X className="h-2.5 w-2.5 text-zinc-400" /></button>)}</div>
                <div className="flex gap-1.5"><select value={collaboratorId} onChange={(event) => setCollaboratorId(event.target.value)} className="select-field h-8 min-w-0 flex-1 text-[11px]"><option value="">Add collaborator…</option>{availableCollaborators.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name}</option>)}</select><button type="button" disabled={!collaboratorId || saving} onClick={() => void addCollaborator()} className="button-secondary button-sm">Add</button></div>
              </div>
            </section>

            {Array.isArray(selectedContact?.tags) && selectedContact.tags.length > 0 && <section className="border-t border-zinc-100 pt-4"><div className="text-[10px] font-bold uppercase tracking-[0.13em] text-zinc-400">Tags</div><div className="mt-2 flex flex-wrap gap-1">{selectedContact.tags.map((tag) => <span key={String(tag)} className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-medium text-zinc-600">{String(tag)}</span>)}</div></section>}

            <Link href="/contacts" className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"><span>Review contact identity & duplicates</span><Users className="h-3.5 w-3.5" /></Link>
          </div>}

          {detailTab === 'activity' && <div><div className="mb-3 flex items-center justify-between"><div className="text-[10px] font-bold uppercase tracking-[0.13em] text-zinc-400">Activity</div><span className="font-mono text-[10px] text-zinc-400">{events.length}</span></div><div className="space-y-4">{events.length === 0 ? <div className="py-8 text-center text-xs text-zinc-400">No activity yet.</div> : events.map((event) => <div key={event.id} className="flex gap-2.5"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-zinc-300" /><div><div className="text-xs font-medium text-zinc-800">{eventText(event)}</div><div className="mt-0.5 text-[10px] text-zinc-400">{event.actor?.full_name || 'System'} · {relativeTime(event.created_at)}</div></div></div>)}</div></div>}

          {detailTab === 'media' && <div><div className="mb-3 flex items-center justify-between"><div className="text-[10px] font-bold uppercase tracking-[0.13em] text-zinc-400">Shared media</div><span className="font-mono text-[10px] text-zinc-400">{media.length}</span></div>{media.length === 0 ? <div className="py-8 text-center text-xs text-zinc-400"><Paperclip className="mx-auto mb-2 h-5 w-5" />No shared files yet.</div> : <div className="grid grid-cols-2 gap-2">{media.map((item) => item.type === 'image' ? <a key={item.id} href={`/api/media/proxy?url=${encodeURIComponent(item.url)}`} target="_blank" rel="noreferrer" className="aspect-square overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100"><img src={`/api/media/proxy?url=${encodeURIComponent(item.url)}`} alt={item.label} className="h-full w-full object-cover" /></a> : <a key={item.id} href={`/api/media/proxy?url=${encodeURIComponent(item.url)}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-zinc-200 p-3 text-xs font-medium text-zinc-700"><FileText className="h-4 w-4 text-zinc-400" /><span className="truncate">{item.label}</span></a>)}</div>}</div>}

          {detailTab === 'crm' && <div className="space-y-4"><div className="text-[10px] font-bold uppercase tracking-[0.13em] text-zinc-400">CRM</div>{selectedLead ? <div className="rounded-xl border border-zinc-200 p-4"><div className="text-sm font-semibold text-zinc-950">{selectedLead.customer_name || `${leadLabel} record`}</div>{selectedLead.lead_code && <div className="mt-1 font-mono text-[10px] text-zinc-400">{selectedLead.lead_code}</div>}<div className="mt-4 grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg bg-zinc-50 p-2.5"><div className="text-[10px] text-zinc-400">Stage</div><div className="mt-1 font-semibold capitalize">{selectedLead.stage.replaceAll('_', ' ')}</div></div><div className="rounded-lg bg-zinc-50 p-2.5"><div className="text-[10px] text-zinc-400">Priority</div><div className="mt-1 font-semibold capitalize">{selectedLead.priority}</div></div></div><Link href={`/leads/${selectedLead.id}/workspace`} className="button-primary mt-4 w-full">Open {leadLabel} workspace</Link></div> : <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-center"><UserCheck className="mx-auto h-5 w-5 text-zinc-400" /><div className="mt-2 text-sm font-semibold text-zinc-800">No {leadLabel.toLowerCase()} yet</div><p className="mt-1 text-xs leading-5 text-zinc-500">Create a CRM record only when this conversation becomes commercially relevant.</p><button type="button" onClick={() => setConvertOpen(true)} className="button-primary mt-4 w-full">Create {leadLabel}</button></div>}<Link href="/contacts" className="button-secondary w-full">Open {contactLabel} directory</Link></div>}
        </div>
      </div>
    );
  };

  return (
    <div className="h-[calc(100vh-4rem)] min-h-[560px] overflow-hidden bg-white">
      <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[330px_minmax(0,1fr)] lg:grid-cols-[180px_330px_minmax(0,1fr)] xl:grid-cols-[180px_330px_minmax(420px,1fr)_300px]">
        <aside className="hidden min-h-0 border-r border-zinc-200 bg-zinc-50/70 lg:flex lg:flex-col">
          <div className="flex h-14 items-center gap-2 border-b border-zinc-200 px-3"><InboxIcon className="h-4 w-4 text-zinc-900" /><span className="text-sm font-bold text-zinc-950">Inbox</span>{metrics.slaOverdue > 0 && <span className="ml-auto rounded-full bg-red-50 px-2 py-0.5 font-mono text-[10px] font-bold text-red-700">{metrics.slaOverdue}</span>}</div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
            <div className="px-2 pb-1 text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-400">Standard</div>
            {standardViews.map((item) => { const Icon = item.icon; const active = queue === item.key; return <button key={item.key} type="button" onClick={() => setQueue(item.key)} className={`mt-0.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium ${active ? 'bg-zinc-950 text-white' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950'}`}><Icon className="h-3.5 w-3.5" /><span className="flex-1">{item.label}</span>{item.count !== undefined && <span className={`font-mono text-[9px] ${active ? 'text-zinc-300' : 'text-zinc-400'}`}>{item.count}</span>}</button>; })}
            <div className="mt-5 px-2 pb-1 text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-400">Saved views</div>
            {savedViews.map((item) => { const Icon = item.icon; const active = queue === item.key; return <button key={item.key} type="button" onClick={() => setQueue(item.key)} className={`mt-0.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium ${active ? 'bg-white text-zinc-950 shadow-sm ring-1 ring-zinc-200' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950'}`}><Icon className={`h-3.5 w-3.5 ${item.key === 'sla_overdue' && item.count ? 'text-red-500' : ''}`} /><span className="flex-1">{item.label}</span>{item.count !== undefined && <span className={`font-mono text-[9px] ${item.key === 'sla_overdue' && item.count ? 'font-bold text-red-600' : 'text-zinc-400'}`}>{item.count}</span>}</button>; })}
          </div>
          {canManage && <div className="border-t border-zinc-200 p-2.5"><Link href="/settings/automations" className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-100"><Zap className="h-3.5 w-3.5" /> Automations</Link></div>}
        </aside>

        <section className={`${selectedId ? 'hidden md:flex' : 'flex'} min-h-0 min-w-0 flex-col border-r border-zinc-200 bg-white`}>
          <div className="border-b border-zinc-200 p-3">
            <div className="flex items-center gap-2 lg:hidden"><select value={queue} onChange={(event) => setQueue(event.target.value as QueueKey)} className="select-field h-9 flex-1 text-xs"><optgroup label="Standard">{standardViews.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</optgroup><optgroup label="Saved views">{savedViews.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</optgroup></select><button type="button" onClick={() => void loadList()} className="button-secondary button-sm h-9"><RefreshCw className="h-3.5 w-3.5" /></button></div>
            <div className="relative mt-2 lg:mt-0"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${contactLabel.toLowerCase()} or messages`} className="field h-9 pl-8 pr-3 text-xs" /></div>
            <div className="mt-2 flex gap-2"><select value={provider} onChange={(event) => setProvider(event.target.value)} className="select-field h-8 min-w-0 flex-1 text-[11px]"><option value="all">All channels</option><option value="facebook">Facebook</option><option value="instagram">Instagram</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="website">Website</option></select><select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} className="select-field h-8 min-w-0 flex-1 text-[11px]"><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="waiting">Longest waiting</option><option value="sla">SLA soonest</option></select></div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loadingList ? <div className="flex h-32 items-center justify-center gap-2 text-xs text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading Inbox…</div> : conversations.length === 0 ? <div className="px-6 py-16 text-center"><InboxIcon className="mx-auto h-6 w-6 text-zinc-300" /><div className="mt-2 text-sm font-semibold text-zinc-700">Nothing here</div><p className="mt-1 text-xs text-zinc-400">This view is clear.</p></div> : conversations.map((conversation) => {
              const active = selectedId === conversation.id;
              const Icon = PROVIDER_ICONS[conversation.provider] || MessageSquare;
              const sla = slaInfo(conversation);
              const lifecycle = contactOf(conversation)?.lifecycle_key || 'new';
              return <button key={conversation.id} type="button" onClick={() => { setSelectedId(conversation.id); setContextOpen(false); }} className={`w-full border-b border-zinc-100 px-3.5 py-3 text-left transition ${active ? 'bg-blue-50/55' : 'hover:bg-zinc-50'}`}>
                <div className="flex items-start gap-2.5">
                  <div className="relative shrink-0"><div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-zinc-100 text-[10px] font-bold text-zinc-700">{conversation.customer_avatar_url ? <img src={`/api/media/proxy?url=${encodeURIComponent(conversation.customer_avatar_url)}`} alt="" className="h-full w-full object-cover" /> : initials(conversation.customer_name, 'C')}</div><span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-zinc-900 text-white"><Icon className="h-2.5 w-2.5" /></span></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2"><span className="truncate text-xs font-bold text-zinc-950">{conversation.customer_name || contactLabel}</span>{conversation.unread_count > 0 && <span className="min-w-4 rounded-full bg-blue-600 px-1 text-center font-mono text-[9px] font-bold text-white">{conversation.unread_count}</span>}<span className="ml-auto shrink-0 font-mono text-[9px] text-zinc-400">{shortTime(conversation.last_message_at)}</span></div>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-zinc-600">{conversation.last_message_preview || 'No message preview'}</p>
                    <div className="mt-2 flex items-center gap-1.5 text-[9px] font-medium text-zinc-400"><span className="max-w-20 truncate">{conversation.assigned_profile?.full_name || 'Unassigned'}</span><span>·</span><span>{lifecycleLabel(lifecycle)}</span><span className="ml-auto" />{conversation.priority !== 'normal' && <span className={`rounded px-1.5 py-0.5 font-bold uppercase ${conversation.priority === 'urgent' ? 'bg-red-50 text-red-700' : conversation.priority === 'high' ? 'bg-amber-50 text-amber-700' : 'bg-zinc-100 text-zinc-500'}`}>{conversation.priority}</span>}<span className={`rounded px-1.5 py-0.5 ${sla.overdue ? 'bg-red-50 font-bold text-red-700' : conversation.needs_reply ? 'bg-blue-50 font-semibold text-blue-700' : 'text-zinc-400'}`}>{sla.label}</span></div>
                  </div>
                </div>
              </button>;
            })}
          </div>
        </section>

        <section className={`${selectedId ? 'flex' : 'hidden md:flex'} min-h-0 min-w-0 flex-col bg-zinc-50/60`}>
          {!selected ? <div className="flex h-full items-center justify-center p-8 text-center text-sm text-zinc-400">Select a conversation to start working.</div> : <>
            <header className="flex min-h-14 items-center justify-between gap-2 border-b border-zinc-200 bg-white px-3 md:px-4">
              <div className="flex min-w-0 items-center gap-2.5"><button type="button" onClick={() => setSelectedId(null)} className="button-ghost button-sm px-2 md:hidden"><ArrowLeft className="h-4 w-4" /></button><div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-100 text-xs font-bold text-zinc-700">{selected.customer_avatar_url ? <img src={`/api/media/proxy?url=${encodeURIComponent(selected.customer_avatar_url)}`} alt="" className="h-full w-full object-cover" /> : initials(selected.customer_name, 'C')}</div><div className="min-w-0"><div className="flex items-center gap-2"><h1 className="truncate text-sm font-bold text-zinc-950">{selected.customer_name || contactLabel}</h1><span className="hidden rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-zinc-500 sm:inline">{selected.provider}</span></div><div className="mt-0.5 flex items-center gap-2 text-[10px] text-zinc-500"><span className="truncate">{selected.assigned_profile?.full_name || 'Unassigned'}</span><span>·</span><span>{lifecycleLabel(selectedContact?.lifecycle_key || 'new')}</span></div></div></div>
              <div className="flex shrink-0 items-center gap-1.5"><span className={`hidden rounded-md px-2 py-1 text-[10px] font-semibold lg:inline-flex ${slaInfo(selected).overdue ? 'bg-red-50 text-red-700' : selected.needs_reply ? 'bg-blue-50 text-blue-700' : 'bg-zinc-100 text-zinc-600'}`}>{slaInfo(selected).label}</span>{!selected.assigned_to && <button type="button" disabled={saving} onClick={() => void patchConversation({ assigned_to: currentUser.id }, 'Conversation claimed.')} className="button-secondary button-sm"><UserCheck className="h-3.5 w-3.5" /><span className="hidden lg:inline">Claim</span></button>}<button type="button" onClick={() => setContextOpen(true)} className="button-secondary button-sm px-2 xl:hidden"><PanelRight className="h-3.5 w-3.5" /></button>{selected.workflow_state !== 'closed' && <button type="button" disabled={saving} onClick={() => setCloseOpen(true)} className="button-primary button-sm"><CheckCircle2 className="h-3.5 w-3.5" /><span className="hidden sm:inline">Resolve</span></button>}<div className="relative"><button type="button" onClick={() => setMoreOpen((value) => !value)} className="button-secondary button-sm px-2"><MoreHorizontal className="h-4 w-4" /></button>{moreOpen && <div className="absolute right-0 top-9 z-30 w-52 overflow-hidden rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl"><div className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-zinc-400">Conversation</div>{selected.workflow_state !== 'waiting' && <button type="button" onClick={() => { setMoreOpen(false); void patchConversation({ workflow_state: 'waiting' }); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-zinc-700 hover:bg-zinc-50"><PauseCircle className="h-3.5 w-3.5" /> Mark waiting</button>}<button type="button" onClick={() => { setMoreOpen(false); void patchConversation({ workflow_state: 'snoozed', snoozed_until: new Date(Date.now() + 60 * 60 * 1000).toISOString() }); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-zinc-700 hover:bg-zinc-50"><AlarmClock className="h-3.5 w-3.5" /> Snooze 1 hour</button><button type="button" onClick={() => { setMoreOpen(false); void patchConversation({ workflow_state: 'snoozed', snoozed_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-zinc-700 hover:bg-zinc-50"><Clock3 className="h-3.5 w-3.5" /> Snooze 24 hours</button>{selected.workflow_state !== 'open' && <button type="button" onClick={() => { setMoreOpen(false); void patchConversation({ workflow_state: 'open' }); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-zinc-700 hover:bg-zinc-50"><CircleDot className="h-3.5 w-3.5" /> Reopen</button>}<div className="my-1 border-t border-zinc-100" /><label className="block px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-zinc-400">Priority</label><select value={selected.priority} onChange={(event) => void patchConversation({ priority: event.target.value })} className="select-field mx-1 mb-1 h-8 w-[calc(100%-0.5rem)] text-xs"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></div>}</div></div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5">
              {loadingThread ? <div className="flex h-full min-h-48 items-center justify-center gap-2 text-xs text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading conversation…</div> : <div className="mx-auto max-w-3xl space-y-3">{timeline.map((item) => item.kind === 'event' ? <div key={`event-${item.event.id}`} className="flex items-center gap-2 py-1 text-[10px] text-zinc-400"><span className="h-px flex-1 bg-zinc-200" /><span className="max-w-[70%] truncate">{eventText(item.event)} · {item.event.actor?.full_name || 'System'} · {shortTime(item.event.created_at)}</span><span className="h-px flex-1 bg-zinc-200" /></div> : <div key={`message-${item.message.id}`} className={`flex ${item.message.direction === 'outbound' ? 'justify-end' : item.message.direction === 'internal' ? 'justify-center' : 'justify-start'}`}>{item.message.direction === 'internal' ? <div className="max-w-[85%] rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950"><div className="mb-1 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-amber-700"><StickyNote className="h-3 w-3" /> Internal note · {item.message.author_profile?.full_name || 'Team'}</div><div className="whitespace-pre-wrap leading-5">{item.message.body || '—'}</div><div className="mt-1 text-right font-mono text-[9px] text-amber-600">{shortTime(item.message.sent_at)}</div></div> : <div className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-xs shadow-sm ${item.message.direction === 'outbound' ? 'rounded-br-md bg-blue-600 text-white' : 'rounded-bl-md border border-zinc-200 bg-white text-zinc-900'}`}><div className="whitespace-pre-wrap leading-5">{item.message.body || (item.message.message_type === 'image' ? 'Shared an image' : 'Attachment')}</div><div className={`mt-1 text-right font-mono text-[9px] ${item.message.direction === 'outbound' ? 'text-blue-100' : 'text-zinc-400'}`}>{shortTime(item.message.sent_at)}{item.message.delivery_status === 'failed' ? ' · failed' : ''}</div>{item.message.failure_message && <div className="mt-1 text-[10px] text-red-200">{item.message.failure_message}</div>}</div>}</div>)}<div ref={endRef} /></div>}
            </div>

            <div className="border-t border-zinc-200 bg-white p-3 sm:p-4">
              <div className="mx-auto max-w-3xl rounded-xl border border-zinc-200 bg-white shadow-sm focus-within:border-zinc-300 focus-within:ring-2 focus-within:ring-zinc-100">
                <div className="flex items-center gap-1 border-b border-zinc-100 px-2 py-1.5"><button type="button" onClick={() => setReplyMode('outbound')} className={`rounded-md px-2.5 py-1 text-[10px] font-semibold ${replyMode === 'outbound' ? 'bg-zinc-950 text-white' : 'text-zinc-500 hover:bg-zinc-100'}`}>Reply</button><button type="button" onClick={() => setReplyMode('internal')} className={`rounded-md px-2.5 py-1 text-[10px] font-semibold ${replyMode === 'internal' ? 'bg-amber-100 text-amber-800' : 'text-zinc-500 hover:bg-zinc-100'}`}>Internal note</button>{replyMode === 'outbound' && !canReply && <span className="ml-auto rounded bg-amber-50 px-2 py-1 text-[9px] font-semibold text-amber-700">Provider reply window closed</span>}</div>
                <textarea value={replyBody} onChange={(event) => setReplyBody(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} rows={3} disabled={replyMode === 'outbound' && !canReply} placeholder={replyMode === 'internal' ? 'Leave context for your team…' : canReply ? 'Write a reply…' : 'Switch to Internal note to add context.'} className="w-full resize-none bg-transparent px-3.5 py-3 text-xs leading-5 text-zinc-950 outline-none placeholder:text-zinc-400 disabled:bg-zinc-50" />
                <div className="flex items-center justify-between border-t border-zinc-100 px-2.5 py-2"><div className="text-[9px] text-zinc-400">Enter to send · Shift + Enter for new line</div><button type="button" disabled={sending || !replyBody.trim() || (replyMode === 'outbound' && !canReply)} onClick={() => void sendMessage()} className="button-primary button-sm">{sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}{replyMode === 'internal' ? 'Add note' : 'Send'}</button></div>
              </div>
            </div>
          </>}
        </section>

        <aside className="hidden min-h-0 border-l border-zinc-200 bg-white xl:block">{renderContext()}</aside>
      </div>

      {contextOpen && selected && <div className="fixed inset-0 z-40 flex justify-end bg-zinc-950/30 xl:hidden" onClick={() => setContextOpen(false)}><div className="h-full w-full max-w-sm shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="absolute right-2 top-2 z-10"><button type="button" onClick={() => setContextOpen(false)} className="rounded-lg bg-white p-2 text-zinc-500 shadow"><X className="h-4 w-4" /></button></div>{renderContext()}</div></div>}

      {closeOpen && selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-4" role="dialog" aria-modal="true" aria-label="Resolve conversation"><div className="w-full max-w-md overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl"><div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3"><div><div className="text-sm font-semibold text-zinc-950">Resolve conversation</div><div className="mt-0.5 text-[11px] text-zinc-500">Close the active work while keeping the contact and history.</div></div><button type="button" onClick={() => setCloseOpen(false)} className="rounded p-1 text-zinc-400 hover:bg-zinc-100"><X className="h-4 w-4" /></button></div><div className="space-y-3 p-4"><label className="block text-xs font-medium text-zinc-700">Resolution<select value={resolution} onChange={(event) => setResolution(event.target.value)} className="select-field mt-1 w-full"><option value="resolved">Resolved</option><option value="qualified">Qualified</option><option value="converted">Converted</option><option value="not_interested">Not interested</option><option value="duplicate">Duplicate</option><option value="spam">Spam</option><option value="other">Other</option></select></label><label className="block text-xs font-medium text-zinc-700">Closing note<textarea value={closingNote} onChange={(event) => setClosingNote(event.target.value)} rows={4} placeholder="What was decided? What should the next person know?" className="mt-1 w-full rounded-md border border-zinc-200 p-2.5 text-xs leading-5 outline-none focus:border-zinc-400" /></label></div><div className="flex justify-end gap-2 border-t border-zinc-100 bg-zinc-50 px-4 py-3"><button type="button" onClick={() => setCloseOpen(false)} className="button-secondary">Cancel</button><button type="button" disabled={saving} onClick={() => void resolveConversation()} className="button-primary">{saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Resolve</button></div></div></div>}

      <ConvertToLeadDrawer isOpen={convertOpen} onClose={() => setConvertOpen(false)} conversation={selected} onConverted={() => void handleConverted()} />
    </div>
  );
}
