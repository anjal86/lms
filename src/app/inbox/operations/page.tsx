'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlarmClock,
  ArrowUpRight,
  CheckCircle2,
  CircleDot,
  Clock3,
  Inbox,
  Loader2,
  MessageSquare,
  PauseCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useApp } from '@/lib/store';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';

type QueueKey = 'mine' | 'unassigned' | 'open' | 'waiting' | 'snoozed' | 'unread' | 'closed';
type WorkflowState = 'open' | 'waiting' | 'snoozed' | 'closed';
type Priority = 'low' | 'normal' | 'high' | 'urgent';

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

type Conversation = {
  id: string;
  contact_id: string | null;
  lead_id: string | null;
  provider: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_avatar_url: string | null;
  last_message_preview: string | null;
  workflow_state: WorkflowState;
  priority: Priority;
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
  assigned_to: string | null;
  last_message_at: string | null;
  converted_at: string | null;
  contact: Contact | Contact[] | null;
  assigned_profile: { id: string; full_name: string | null; email: string; role: string; status?: string } | null;
};

type Metrics = {
  totalOpen: number;
  unassigned: number;
  waiting: number;
  snoozed: number;
  unread: number;
  slaOverdue: number;
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
  user: { id: string; full_name: string | null; email: string; role: string; status?: string } | null;
};

const EMPTY_METRICS: Metrics = { totalOpen: 0, unassigned: 0, waiting: 0, snoozed: 0, unread: 0, slaOverdue: 0 };

function contactOf(conversation: Conversation | null) {
  if (!conversation?.contact) return null;
  return Array.isArray(conversation.contact) ? conversation.contact[0] || null : conversation.contact;
}

function relativeTime(value?: string | null) {
  if (!value) return '—';
  const diff = Date.now() - new Date(value).getTime();
  const abs = Math.abs(diff);
  const minutes = Math.floor(abs / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m ${diff >= 0 ? 'ago' : 'from now'}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${diff >= 0 ? 'ago' : 'from now'}`;
  return `${Math.floor(hours / 24)}d ${diff >= 0 ? 'ago' : 'from now'}`;
}

function slaLabel(conversation: Conversation) {
  if (conversation.first_responded_at) return { text: 'Responded', overdue: false };
  if (!conversation.first_response_due_at || conversation.workflow_state === 'closed') return { text: 'No SLA', overdue: false };
  const ms = new Date(conversation.first_response_due_at).getTime() - Date.now();
  const overdue = ms < 0;
  const minutes = Math.max(1, Math.floor(Math.abs(ms) / 60000));
  const value = minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h`;
  return { text: overdue ? `${value} overdue` : `${value} left`, overdue };
}

function stateLabel(state: WorkflowState) {
  return state === 'open' ? 'Open' : state === 'waiting' ? 'Waiting' : state === 'snoozed' ? 'Snoozed' : 'Closed';
}

function eventLabel(type: string) {
  const labels: Record<string, string> = {
    message_received: 'Customer message received',
    reply_sent: 'Reply sent',
    note_added: 'Internal note added',
    state_changed: 'Conversation state changed',
    assigned: 'Conversation assigned',
    priority_changed: 'Priority changed',
    lifecycle_changed: 'Lifecycle changed',
  };
  return labels[type] || type.replaceAll('_', ' ');
}

export default function ConversationOperationsPage() {
  const { currentUser, allProfiles, showToast } = useApp();
  const { term } = useWorkspace();
  const leadLabel = term('lead', 'Lead');
  const contactLabel = term('contact', 'Contact');
  const canManage = currentUser.role === 'admin' || currentUser.role === 'manager';

  const [queue, setQueue] = useState<QueueKey>('mine');
  const [search, setSearch] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [metrics, setMetrics] = useState<Metrics>(EMPTY_METRICS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [resolution, setResolution] = useState('resolved');
  const [closingNote, setClosingNote] = useState('');
  const [collaboratorId, setCollaboratorId] = useState('');

  const selected = useMemo(() => conversations.find((item) => item.id === selectedId) || null, [conversations, selectedId]);
  const selectedContact = contactOf(selected);

  const loadConversations = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const params = new URLSearchParams({ filter: queue, limit: '250' });
      if (search.trim()) params.set('search', search.trim());
      const response = await fetch(`/api/conversations?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to load queue.');
      const rows = (payload.conversations || []) as Conversation[];
      setConversations(rows);
      setMetrics({ ...EMPTY_METRICS, ...(payload.metrics || {}) });
      setSelectedId((current) => current && rows.some((row) => row.id === current) ? current : rows[0]?.id || null);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to load queue.', 'error');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [queue, search, showToast]);

  const loadContext = useCallback(async (conversationId: string | null) => {
    if (!conversationId) {
      setEvents([]);
      setCollaborators([]);
      return;
    }
    const [eventResponse, collaboratorResponse] = await Promise.all([
      fetch(`/api/conversations/${conversationId}/events?limit=60`, { cache: 'no-store' }),
      fetch(`/api/conversations/${conversationId}/collaborators`, { cache: 'no-store' }),
    ]);
    if (eventResponse.ok) {
      const payload = await eventResponse.json();
      setEvents(payload.events || []);
    }
    if (collaboratorResponse.ok) {
      const payload = await collaboratorResponse.json();
      setCollaborators(payload.collaborators || []);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadConversations(), 180);
    return () => window.clearTimeout(timer);
  }, [loadConversations]);

  useEffect(() => {
    void loadContext(selectedId);
  }, [loadContext, selectedId]);

  useEffect(() => {
    const interval = window.setInterval(() => void loadConversations(true), 12000);
    return () => window.clearInterval(interval);
  }, [loadConversations]);

  const updateConversation = async (patch: Record<string, unknown>) => {
    if (!selected) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/conversations/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to update conversation.');
      setConversations((current) => current.map((item) => item.id === selected.id ? payload.conversation : item));
      await Promise.all([loadContext(selected.id), loadConversations(true)]);
      return payload.conversation as Conversation;
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to update conversation.', 'error');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const addCollaborator = async () => {
    if (!selected || !collaboratorId) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/conversations/${selected.id}/collaborators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: collaboratorId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to add collaborator.');
      setCollaboratorId('');
      await loadContext(selected.id);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to add collaborator.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const submitClose = async () => {
    const updated = await updateConversation({
      workflow_state: 'closed',
      resolution_code: resolution,
      closing_note: closingNote.trim() || null,
    });
    if (updated) {
      setCloseOpen(false);
      setClosingNote('');
      showToast('Conversation closed.', 'success');
    }
  };

  const queues: { key: QueueKey; label: string; count?: number; icon: typeof Inbox }[] = [
    { key: 'mine', label: 'Mine', icon: UserCheck },
    { key: 'unassigned', label: 'Unassigned', count: metrics.unassigned, icon: Users },
    { key: 'open', label: 'Open', count: metrics.totalOpen, icon: CircleDot },
    { key: 'waiting', label: 'Waiting', count: metrics.waiting, icon: PauseCircle },
    { key: 'snoozed', label: 'Snoozed', count: metrics.snoozed, icon: Clock3 },
    { key: 'unread', label: 'Unread', count: metrics.unread, icon: MessageSquare },
    { key: 'closed', label: 'Closed', icon: CheckCircle2 },
  ];

  const availableCollaborators = allProfiles.filter((profile) => profile.is_active && !collaborators.some((item) => item.user_id === profile.id));

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-zinc-50/70">
      <div className="border-b border-zinc-200 bg-white px-4 py-4 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-950"><Inbox className="h-4 w-4" /> Work Queue</div>
            <p className="mt-1 text-xs text-zinc-500">Assign, prioritize, snooze, resolve and track customer conversations.</p>
          </div>
          <div className="flex items-center gap-2">
            {metrics.slaOverdue > 0 && <span className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700"><ShieldAlert className="h-3.5 w-3.5" /> {metrics.slaOverdue} SLA overdue</span>}
            <button type="button" onClick={() => void loadConversations()} className="button-secondary"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
          </div>
        </div>
      </div>

      <div className="grid min-h-[calc(100vh-8.6rem)] grid-cols-1 lg:grid-cols-[180px_minmax(280px,390px)_minmax(0,1fr)]">
        <aside className="border-r border-zinc-200 bg-white p-3">
          <div className="space-y-1">
            {queues.map((item) => {
              const Icon = item.icon;
              const active = queue === item.key;
              return <button key={item.key} type="button" onClick={() => setQueue(item.key)} className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-medium ${active ? 'bg-zinc-950 text-white' : 'text-zinc-600 hover:bg-zinc-100'}`}><Icon className="h-3.5 w-3.5" /><span className="flex-1">{item.label}</span>{item.count !== undefined && <span className={`font-mono text-[10px] ${active ? 'text-zinc-300' : 'text-zinc-400'}`}>{item.count}</span>}</button>;
            })}
          </div>
          <div className="mt-4 border-t border-zinc-100 pt-3">
            <div className="px-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Health</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="rounded-md border border-zinc-200 p-2"><div className="text-[10px] text-zinc-500">Unread</div><div className="mt-1 font-mono text-sm font-semibold">{metrics.unread}</div></div>
              <div className="rounded-md border border-zinc-200 p-2"><div className="text-[10px] text-zinc-500">Overdue</div><div className={`mt-1 font-mono text-sm font-semibold ${metrics.slaOverdue ? 'text-red-600' : ''}`}>{metrics.slaOverdue}</div></div>
            </div>
          </div>
        </aside>

        <section className="border-r border-zinc-200 bg-white">
          <div className="border-b border-zinc-100 p-3">
            <div className="flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-2"><Search className="h-3.5 w-3.5 text-zinc-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${contactLabel.toLowerCase()} or message…`} className="min-w-0 flex-1 bg-transparent text-xs outline-none" /></div>
          </div>
          <div className="max-h-[calc(100vh-12rem)] overflow-y-auto">
            {loading ? <div className="flex items-center justify-center gap-2 py-12 text-xs text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading queue…</div> : conversations.length === 0 ? <div className="px-5 py-12 text-center text-xs text-zinc-500">Nothing in this queue.</div> : conversations.map((conversation) => {
              const sla = slaLabel(conversation);
              const active = selectedId === conversation.id;
              return <button key={conversation.id} type="button" onClick={() => setSelectedId(conversation.id)} className={`w-full border-b border-zinc-100 px-4 py-3 text-left transition ${active ? 'bg-blue-50/60' : 'hover:bg-zinc-50'}`}>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-semibold text-zinc-700">{(conversation.customer_name || contactLabel).slice(0, 2).toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2"><span className="truncate text-xs font-semibold text-zinc-950">{conversation.customer_name || contactLabel}</span>{conversation.unread_count > 0 && <span className="min-w-4 rounded-full bg-blue-600 px-1 text-center font-mono text-[9px] text-white">{conversation.unread_count}</span>}<span className={`ml-auto rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${conversation.priority === 'urgent' ? 'bg-red-50 text-red-700' : conversation.priority === 'high' ? 'bg-amber-50 text-amber-700' : 'bg-zinc-100 text-zinc-500'}`}>{conversation.priority}</span></div>
                    <div className="mt-1 truncate text-[11px] text-zinc-500">{conversation.last_message_preview || 'No message preview'}</div>
                    <div className="mt-2 flex items-center gap-2 text-[10px] text-zinc-400"><span className="capitalize">{conversation.provider}</span><span>•</span><span>{stateLabel(conversation.workflow_state)}</span><span>•</span><span className={sla.overdue ? 'font-semibold text-red-600' : ''}>{sla.text}</span></div>
                  </div>
                </div>
              </button>;
            })}
          </div>
        </section>

        <section className="min-w-0 bg-zinc-50/50">
          {!selected ? <div className="flex h-full min-h-[420px] items-center justify-center text-sm text-zinc-400">Select a conversation to work it.</div> : <div className="mx-auto max-w-4xl p-4 md:p-6">
            <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><h1 className="truncate text-base font-semibold text-zinc-950">{selected.customer_name || contactLabel}</h1><span className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] capitalize text-zinc-600">{selected.provider}</span></div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500"><span>{selected.customer_phone || 'No phone'}</span><span>{selected.customer_email || 'No email'}</span><span>{selected.assigned_profile?.full_name || 'Unassigned'}</span></div>
                </div>
                <Link href={`/inbox?conversationId=${selected.id}`} className="button-primary"><MessageSquare className="h-3.5 w-3.5" /> Open conversation <ArrowUpRight className="h-3.5 w-3.5" /></Link>
              </div>

              <div className="grid gap-4 p-4 xl:grid-cols-[1fr_290px]">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <label className="space-y-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Priority<select value={selected.priority} disabled={saving} onChange={(event) => void updateConversation({ priority: event.target.value })} className="select-field h-9 w-full text-xs normal-case"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
                    <div className="rounded-md border border-zinc-200 p-2.5"><div className="text-[10px] font-semibold uppercase text-zinc-400">State</div><div className="mt-1 text-xs font-semibold">{stateLabel(selected.workflow_state)}</div></div>
                    <div className="rounded-md border border-zinc-200 p-2.5"><div className="text-[10px] font-semibold uppercase text-zinc-400">SLA</div><div className={`mt-1 text-xs font-semibold ${slaLabel(selected).overdue ? 'text-red-600' : ''}`}>{slaLabel(selected).text}</div></div>
                    <div className="rounded-md border border-zinc-200 p-2.5"><div className="text-[10px] font-semibold uppercase text-zinc-400">Last message</div><div className="mt-1 text-xs font-semibold">{relativeTime(selected.last_message_at)}</div></div>
                  </div>

                  <div className="rounded-lg border border-zinc-200 p-3">
                    <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Actions</div>
                    <div className="flex flex-wrap gap-2">
                      {!selected.assigned_to && <button disabled={saving} onClick={() => void updateConversation({ assigned_to: currentUser.id })} className="button-secondary"><UserCheck className="h-3.5 w-3.5" /> Claim</button>}
                      {canManage && <button disabled={saving} onClick={() => void updateConversation({ assign_strategy: 'least_open' })} className="button-secondary"><Sparkles className="h-3.5 w-3.5" /> Auto-assign</button>}
                      <button disabled={saving} onClick={() => void updateConversation({ workflow_state: 'waiting' })} className="button-secondary"><PauseCircle className="h-3.5 w-3.5" /> Waiting</button>
                      <button disabled={saving} onClick={() => void updateConversation({ workflow_state: 'snoozed', snoozed_until: new Date(Date.now() + 60 * 60 * 1000).toISOString() })} className="button-secondary"><AlarmClock className="h-3.5 w-3.5" /> Snooze 1h</button>
                      <button disabled={saving} onClick={() => void updateConversation({ workflow_state: 'snoozed', snoozed_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() })} className="button-secondary"><Clock3 className="h-3.5 w-3.5" /> Tomorrow</button>
                      {selected.workflow_state !== 'open' && <button disabled={saving} onClick={() => void updateConversation({ workflow_state: 'open' })} className="button-secondary"><CircleDot className="h-3.5 w-3.5" /> Reopen</button>}
                      {selected.workflow_state !== 'closed' && <button disabled={saving} onClick={() => setCloseOpen(true)} className="button-primary"><CheckCircle2 className="h-3.5 w-3.5" /> Resolve</button>}
                    </div>
                  </div>

                  <div className="rounded-lg border border-zinc-200 p-3">
                    <div className="mb-3 flex items-center justify-between"><div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Activity timeline</div><span className="text-[10px] text-zinc-400">{events.length} events</span></div>
                    <div className="space-y-3">
                      {events.length === 0 ? <div className="py-4 text-center text-xs text-zinc-400">No operational events yet.</div> : events.slice(0, 30).map((event) => <div key={event.id} className="flex gap-2.5"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-zinc-300" /><div className="min-w-0"><div className="text-xs font-medium text-zinc-800">{eventLabel(event.event_type)}</div><div className="mt-0.5 text-[10px] text-zinc-400">{event.actor?.full_name || 'System'} · {relativeTime(event.created_at)}</div></div></div>)}
                    </div>
                  </div>
                </div>

                <aside className="space-y-4">
                  <div className="rounded-lg border border-zinc-200 p-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{contactLabel} 360</div>
                    <div className="mt-3 space-y-2 text-xs">
                      <div><div className="text-[10px] text-zinc-400">Lifecycle</div><select value={selectedContact?.lifecycle_key || 'new'} disabled={!selectedContact || saving} onChange={(event) => void updateConversation({ lifecycle_key: event.target.value })} className="select-field mt-1 h-9 w-full text-xs"><option value="new">New</option><option value="qualified">Qualified</option><option value="opportunity">Opportunity</option><option value="customer">Customer</option><option value="lost">Lost</option></select></div>
                      <div className="grid grid-cols-2 gap-2"><div className="rounded-md bg-zinc-50 p-2"><div className="text-[10px] text-zinc-400">CRM</div><div className="mt-0.5 font-medium">{selected.lead_id ? leadLabel : `No ${leadLabel}`}</div></div><div className="rounded-md bg-zinc-50 p-2"><div className="text-[10px] text-zinc-400">Seen</div><div className="mt-0.5 font-medium">{relativeTime(selectedContact?.last_seen_at)}</div></div></div>
                      {Array.isArray(selectedContact?.tags) && selectedContact.tags.length > 0 && <div className="flex flex-wrap gap-1">{selectedContact.tags.map((tag) => <span key={String(tag)} className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600">{String(tag)}</span>)}</div>}
                    </div>
                  </div>

                  <div className="rounded-lg border border-zinc-200 p-3">
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400"><UserPlus className="h-3 w-3" /> Collaborators</div>
                    <div className="mt-3 space-y-2">{collaborators.length === 0 ? <div className="text-xs text-zinc-400">No collaborators.</div> : collaborators.map((item) => <div key={item.user_id} className="flex items-center gap-2 text-xs"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-100 text-[9px] font-semibold">{(item.user?.full_name || '?').slice(0, 2).toUpperCase()}</span><span className="min-w-0 flex-1 truncate font-medium">{item.user?.full_name || item.user_id}</span></div>)}</div>
                    {(canManage || !collaborators.some((item) => item.user_id === currentUser.id)) && <div className="mt-3 flex gap-1.5"><select value={collaboratorId} onChange={(event) => setCollaboratorId(event.target.value)} className="select-field h-8 min-w-0 flex-1 text-[11px]"><option value="">Add person…</option>{availableCollaborators.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name}</option>)}</select><button type="button" disabled={!collaboratorId || saving} onClick={() => void addCollaborator()} className="button-secondary h-8 px-2">Add</button></div>}
                  </div>
                </aside>
              </div>
            </div>
          </div>}
        </section>
      </div>

      {closeOpen && selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-4" role="dialog" aria-modal="true" aria-label="Resolve conversation"><div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white shadow-xl"><div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3"><div className="text-sm font-semibold">Resolve conversation</div><button type="button" onClick={() => setCloseOpen(false)} className="rounded p-1 text-zinc-400 hover:bg-zinc-100"><X className="h-4 w-4" /></button></div><div className="space-y-3 p-4"><label className="block text-xs font-medium text-zinc-700">Resolution<select value={resolution} onChange={(event) => setResolution(event.target.value)} className="select-field mt-1 w-full"><option value="resolved">Resolved</option><option value="qualified">Qualified</option><option value="converted">Converted</option><option value="not_interested">Not interested</option><option value="duplicate">Duplicate</option><option value="spam">Spam</option><option value="other">Other</option></select></label><label className="block text-xs font-medium text-zinc-700">Closing note<textarea value={closingNote} onChange={(event) => setClosingNote(event.target.value)} rows={4} placeholder="What was decided or what should the next person know?" className="mt-1 w-full rounded-md border border-zinc-200 p-2 text-xs outline-none focus:border-zinc-400" /></label></div><div className="flex justify-end gap-2 border-t border-zinc-100 bg-zinc-50 px-4 py-3"><button type="button" onClick={() => setCloseOpen(false)} className="button-secondary">Cancel</button><button type="button" disabled={saving} onClick={() => void submitClose()} className="button-primary">{saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Resolve</button></div></div></div>}
    </div>
  );
}
