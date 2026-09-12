'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Facebook,
  Instagram,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  RefreshCw,
  Send,
  StickyNote,
} from 'lucide-react';
import type { ActivityLog, Profile } from '@/lib/types';

type ChannelMessage = {
  id: string;
  provider: string;
  direction: 'inbound' | 'outbound' | 'internal';
  message_type: string;
  body?: string | null;
  metadata?: Record<string, unknown>;
  sent_at: string;
  created_by?: string | null;
};

type TimelineItem = {
  id: string;
  provider: string;
  direction: 'inbound' | 'outbound' | 'internal';
  title: string;
  body?: string | null;
  sentAt: string;
  author?: string | null;
  kind: 'message' | 'activity';
};

const TONES: Record<string, string> = {
  facebook: 'bg-blue-50 text-blue-700 border-blue-200',
  instagram: 'bg-pink-50 text-pink-700 border-pink-200',
  whatsapp: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  tiktok: 'bg-zinc-100 text-zinc-900 border-zinc-300',
  email: 'bg-amber-50 text-amber-700 border-amber-200',
  call: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  note: 'bg-violet-50 text-violet-700 border-violet-200',
  system: 'bg-zinc-50 text-zinc-600 border-zinc-200',
};

function ProviderIcon({ provider }: { provider: string }) {
  if (provider === 'facebook') return <Facebook className="h-3.5 w-3.5" />;
  if (provider === 'instagram') return <Instagram className="h-3.5 w-3.5" />;
  if (provider === 'whatsapp') return <MessageCircle className="h-3.5 w-3.5" />;
  if (provider === 'tiktok') return <Send className="h-3.5 w-3.5" />;
  if (provider === 'email') return <Mail className="h-3.5 w-3.5" />;
  if (provider === 'call') return <Phone className="h-3.5 w-3.5" />;
  if (provider === 'note') return <StickyNote className="h-3.5 w-3.5" />;
  return <MessageSquare className="h-3.5 w-3.5" />;
}

function providerLabel(provider: string) {
  const labels: Record<string, string> = {
    facebook: 'Facebook',
    instagram: 'Instagram',
    whatsapp: 'WhatsApp',
    tiktok: 'TikTok',
    email: 'Email',
    call: 'Call',
    note: 'Note',
    system: 'System',
  };
  return labels[provider] || provider.replaceAll('_', ' ');
}

export default function UnifiedCommunicationTimeline({
  leadId,
  activities,
  profiles,
  formatDate,
}: {
  leadId: string;
  activities: ActivityLog[];
  profiles: Profile[];
  formatDate: (date: string) => string;
}) {
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/leads/${leadId}/messages`, { cache: 'no-store', signal: controller.signal });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Could not load channel messages.');
        setMessages(Array.isArray(payload.messages) ? payload.messages : []);
        setMigrationRequired(Boolean(payload.migrationRequired));
        setError(null);
      } catch (loadError) {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : 'Could not load channel messages.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [leadId, refreshToken]);

  const timeline = useMemo<TimelineItem[]>(() => {
    const messageItems = messages.map<TimelineItem>((message) => ({
      id: `message-${message.id}`,
      provider: message.provider,
      direction: message.direction,
      title: `${providerLabel(message.provider)} ${message.direction === 'inbound' ? 'message received' : message.direction === 'outbound' ? 'message sent' : 'note'}`,
      body: message.body,
      sentAt: message.sent_at,
      author: message.created_by ? profiles.find((profile) => profile.id === message.created_by)?.full_name : null,
      kind: 'message',
    }));

    const activityItems = activities.map<TimelineItem>((activity) => ({
      id: `activity-${activity.id}`,
      provider: activity.activity_type,
      direction: activity.activity_type === 'note' ? 'internal' : 'outbound',
      title: activity.title,
      body: activity.notes,
      sentAt: activity.created_at,
      author: activity.agent_id ? profiles.find((profile) => profile.id === activity.agent_id)?.full_name : 'System',
      kind: 'activity',
    }));

    return [...messageItems, ...activityItems]
      .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())
      .slice(0, 120);
  }, [activities, messages, profiles]);

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="section-heading">Conversation timeline</div>
          <div className="section-description">Calls, WhatsApp, email, social messages, notes and system activity in one chronological history.</div>
        </div>
        <button type="button" onClick={() => setRefreshToken((value) => value + 1)} className="button-secondary button-sm" disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {migrationRequired && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">Apply database migration 013 to store provider conversations. Existing CRM activity is still shown below.</div>
      )}
      {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

      <div className="mt-3 divide-y divide-zinc-100 border-y border-zinc-100">
        {timeline.length === 0 && !loading ? (
          <div className="py-10 text-center text-xs text-zinc-500">No communication has been recorded yet.</div>
        ) : timeline.map((item) => {
          const tone = TONES[item.provider] || TONES.system;
          return (
            <article key={item.id} className="grid gap-3 py-3 sm:grid-cols-[8.5rem_minmax(0,1fr)_8rem] sm:items-start">
              <div className="flex items-center gap-2">
                <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border ${tone}`}><ProviderIcon provider={item.provider} /></span>
                <div>
                  <div className="text-[11px] font-semibold capitalize text-zinc-700">{providerLabel(item.provider)}</div>
                  <div className="text-[10px] capitalize text-zinc-400">{item.direction}</div>
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-zinc-800">{item.title}</div>
                {item.body && <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-zinc-600">{item.body}</p>}
                {item.author && <div className="mt-1 text-[10px] text-zinc-400">{item.author}</div>}
              </div>
              <time className="font-mono text-[10px] text-zinc-400 sm:text-right">{formatDate(item.sentAt)}</time>
            </article>
          );
        })}
      </div>
    </section>
  );
}
