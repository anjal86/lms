'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/lib/supabase/client';

export type ConversationPresenceMember = {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  typing: boolean;
  onlineAt: string;
};

type PresencePayload = {
  user_id?: string;
  name?: string;
  avatar_url?: string | null;
  typing?: boolean;
  online_at?: string;
};

type Args = {
  workspaceId?: string | null;
  conversationId?: string | null;
  user: { id: string; full_name?: string | null; avatar_url?: string | null };
};

export function useConversationPresence({ workspaceId, conversationId, user }: Args) {
  const [members, setMembers] = useState<ConversationPresenceMember[]>([]);
  const channelRef = useRef<ReturnType<ReturnType<typeof getSupabaseBrowserClient>['channel']> | null>(null);
  const typingTimer = useRef<number | null>(null);
  const typingRef = useRef(false);

  const basePayload = useMemo(() => ({
    user_id: user.id,
    name: user.full_name || 'Team member',
    avatar_url: user.avatar_url || null,
    online_at: new Date().toISOString(),
  }), [user.avatar_url, user.full_name, user.id]);

  const publishTyping = useCallback(async (typing: boolean) => {
    const channel = channelRef.current;
    if (!channel || typingRef.current === typing) return;
    typingRef.current = typing;
    await channel.track({ ...basePayload, typing, online_at: new Date().toISOString() });
  }, [basePayload]);

  const setTyping = useCallback((typing: boolean) => {
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    void publishTyping(typing);
    if (typing) {
      typingTimer.current = window.setTimeout(() => void publishTyping(false), 2500);
    }
  }, [publishTyping]);

  useEffect(() => {
    if (!workspaceId || !conversationId || !isSupabaseConfigured()) {
      setMembers([]);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const channel = supabase.channel(`conversation-presence:${workspaceId}:${conversationId}`, {
      config: { presence: { key: user.id } },
    });
    channelRef.current = channel;

    const syncPresence = () => {
      const state = channel.presenceState<PresencePayload>();
      const next = Object.values(state)
        .flat()
        .map((item) => ({
          userId: item.user_id || '',
          name: item.name || 'Team member',
          avatarUrl: item.avatar_url || null,
          typing: Boolean(item.typing),
          onlineAt: item.online_at || new Date().toISOString(),
        }))
        .filter((item) => item.userId && item.userId !== user.id);
      const unique = new Map(next.map((item) => [item.userId, item]));
      setMembers([...unique.values()]);
    };

    channel
      .on('presence', { event: 'sync' }, syncPresence)
      .on('presence', { event: 'join' }, syncPresence)
      .on('presence', { event: 'leave' }, syncPresence)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void channel.track({ ...basePayload, typing: false, online_at: new Date().toISOString() });
        }
      });

    return () => {
      if (typingTimer.current) window.clearTimeout(typingTimer.current);
      typingRef.current = false;
      channelRef.current = null;
      void channel.untrack();
      void supabase.removeChannel(channel);
      setMembers([]);
    };
  }, [basePayload, conversationId, user.id, workspaceId]);

  return {
    members,
    viewers: members.filter((member) => !member.typing),
    typingMembers: members.filter((member) => member.typing),
    setTyping,
  };
}
