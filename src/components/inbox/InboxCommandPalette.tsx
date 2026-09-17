'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlarmClock,
  BookOpen,
  Clock3,
  Inbox,
  MessageSquareReply,
  PlugZap,
  Route,
  Search,
  Settings2,
  UserCheck,
  UsersRound,
  X,
} from 'lucide-react';
import { useApp } from '@/lib/store';

type Command = {
  id: string;
  label: string;
  hint: string;
  keywords: string;
  icon: typeof Inbox;
  href?: string;
  teamKey?: string;
};
type RoutingTeam = { id: string; team_key: string; name: string; is_active: boolean };

const COMMANDS: Command[] = [
  { id: 'needs-reply', label: 'Needs reply', hint: 'Customers waiting on your team', keywords: 'reply waiting customer inbox', icon: MessageSquareReply, href: '/inbox?view=needs_reply' },
  { id: 'mine', label: 'My conversations', hint: 'Work currently assigned to you', keywords: 'mine assigned me owner', icon: UserCheck, href: '/inbox?view=mine' },
  { id: 'unassigned', label: 'Unassigned conversations', hint: 'Work that still needs an owner', keywords: 'unassigned claim routing owner', icon: Inbox, href: '/inbox?view=unassigned' },
  { id: 'sla', label: 'SLA overdue', hint: 'First responses already past target', keywords: 'sla overdue late response breach', icon: AlarmClock, href: '/inbox?view=sla_overdue' },
  { id: 'waiting', label: 'Waiting on customer', hint: 'Replies sent; customer action is next', keywords: 'waiting customer', icon: Clock3, href: '/inbox?view=waiting' },
  { id: 'snoozed', label: 'Snoozed conversations', hint: 'Deferred conversations with a wake-up time', keywords: 'snooze later deferred', icon: Clock3, href: '/inbox?view=snoozed' },
  { id: 'resolved', label: 'Resolved conversations', hint: 'Closed conversation history', keywords: 'closed resolved done', icon: Inbox, href: '/inbox?view=closed' },
  { id: 'saved-views', label: 'Custom inboxes', hint: 'Create and manage reusable operational views', keywords: 'saved custom views filters queues', icon: BookOpen, href: '/inbox/views' },
  { id: 'team', label: 'Team workload', hint: 'Availability, capacity and routing health', keywords: 'team agents capacity workload routing', icon: UsersRound, href: '/team' },
  { id: 'routing-teams', label: 'Routing teams', hint: 'Configure Sales, Support and other shared queues', keywords: 'routing teams sales support operations queue members', icon: Route, href: '/settings/routing-teams' },
  { id: 'connections', label: 'Connections', hint: 'WhatsApp, Meta and channel accounts', keywords: 'whatsapp facebook instagram channels accounts', icon: PlugZap, href: '/connections' },
  { id: 'service-levels', label: 'Service levels & routing', hint: 'Response targets and assignment strategy', keywords: 'sla service routing round robin balanced assignment', icon: Settings2, href: '/settings/service-levels' },
];

export default function InboxCommandPalette() {
  const router = useRouter();
  const { currentUser, showToast } = useApp();
  const canManage = currentUser.role === 'admin' || currentUser.role === 'manager';
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [teams, setTeams] = useState<RoutingTeam[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const commands = useMemo(() => {
    if (!canManage || !conversationId) return COMMANDS;
    const routeCommands: Command[] = teams.filter((team) => team.is_active).map((team) => ({
      id: `route-team-${team.id}`,
      label: `Route to ${team.name}`,
      hint: 'Set team queue and assign an eligible agent',
      keywords: `route team queue ${team.name} ${team.team_key}`,
      icon: Route,
      teamKey: team.team_key,
    }));
    return routeCommands.length ? [...routeCommands, ...COMMANDS] : COMMANDS;
  }, [canManage, conversationId, teams]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return commands;
    return commands.filter((command) => `${command.label} ${command.hint} ${command.keywords}`.toLowerCase().includes(normalized));
  }, [commands, query]);

  const runCommand = async (command: Command) => {
    if (running) return;
    if (command.teamKey) {
      if (!conversationId) {
        showToast('Select a conversation before routing it to a team.', 'error');
        return;
      }
      setRunning(true);
      try {
        const response = await fetch(`/api/conversations/${conversationId}/team`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ team_key: command.teamKey, route: true, strategy: 'workload_balanced' }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Unable to route conversation.');
        showToast(`${command.label.replace('Route to ', '')} queue assigned.`, 'success');
        window.dispatchEvent(new CustomEvent('crm:data-mutated'));
        setOpen(false);
        setQuery('');
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Unable to route conversation.', 'error');
      } finally {
        setRunning(false);
      }
      return;
    }
    if (command.href) {
      setOpen(false);
      setQuery('');
      router.push(command.href);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
        return;
      }
      if (!open) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((current) => Math.min(current + 1, Math.max(0, filtered.length - 1)));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((current) => Math.max(0, current - 1));
        return;
      }
      if (event.key === 'Enter' && filtered[activeIndex]) {
        event.preventDefault();
        void runCommand(filtered[activeIndex]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  useEffect(() => {
    if (!open) return;
    setActiveIndex(0);
    const params = new URLSearchParams(window.location.search);
    setConversationId(params.get('conversationId') || params.get('id') || params.get('conversation'));
    if (canManage) {
      void fetch('/api/routing/teams', { cache: 'no-store' })
        .then(async (response) => response.ok ? response.json() : { teams: [] })
        .then((payload) => setTeams(Array.isArray(payload.teams) ? payload.teams : []))
        .catch(() => setTeams([]));
    }
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [canManage, open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="fixed bottom-20 right-4 z-30 hidden min-h-9 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-[11px] font-medium text-zinc-500 shadow-sm hover:border-zinc-300 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20 lg:inline-flex" aria-label="Open Inbox command palette"><Search className="h-3.5 w-3.5" /> Commands <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[9px] text-zinc-400">⌘K</kbd></button>;
  }

  return <div className="fixed inset-0 z-[80] flex items-start justify-center bg-zinc-950/30 px-4 pt-[12vh] backdrop-blur-[1px]" role="dialog" aria-modal="true" aria-label="Inbox commands" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
    <div className="w-full max-w-xl overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl">
      <div className="flex items-center gap-2 border-b border-zinc-200 px-3">
        <Search className="h-4 w-4 shrink-0 text-zinc-400" />
        <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Jump to a queue or operation…" className="h-12 min-w-0 flex-1 bg-transparent text-sm text-zinc-950 outline-none placeholder:text-zinc-400" aria-label="Search Inbox commands" />
        <button type="button" onClick={() => setOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800" aria-label="Close commands"><X className="h-4 w-4" /></button>
      </div>
      <div className="max-h-[56vh] overflow-y-auto p-1.5">
        {filtered.map((command, index) => {
          const Icon = command.icon;
          return <button key={command.id} type="button" disabled={running} onMouseEnter={() => setActiveIndex(index)} onClick={() => void runCommand(command)} className={`flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left transition disabled:opacity-50 ${index === activeIndex ? 'bg-blue-50' : 'hover:bg-zinc-50'}`}>
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${index === activeIndex ? 'bg-blue-100 text-blue-700' : 'bg-zinc-100 text-zinc-500'}`}><Icon className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold text-zinc-900">{command.label}</span><span className="mt-0.5 block truncate text-[11px] text-zinc-500">{command.hint}</span></span>
          </button>;
        })}
        {filtered.length === 0 && <div className="px-4 py-10 text-center text-sm text-zinc-400">No matching command.</div>}
      </div>
      <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50/70 px-3 py-2 text-[10px] text-zinc-400"><span>↑↓ navigate · Enter open · Esc close</span><span>{conversationId ? 'Conversation selected' : 'Inbox operations'}</span></div>
    </div>
  </div>;
}
