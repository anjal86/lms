'use client';

import type { ConversationPresenceMember } from '@/lib/inbox/use-conversation-presence';

type Props = {
  members: ConversationPresenceMember[];
  typingMembers: ConversationPresenceMember[];
};

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'TM';
}

export default function ConversationPresenceIndicator({ members, typingMembers }: Props) {
  if (!members.length) return null;

  const visibleMembers = members.slice(0, 3);
  const extraCount = Math.max(0, members.length - visibleMembers.length);
  const typingNames = typingMembers.map((member) => member.name);
  const isTyping = typingNames.length > 0;
  const title = members.map((member) => `${member.name}${member.typing ? ' — typing' : ' — viewing'}`).join('\n');

  return (
    <div
      aria-live="polite"
      aria-label={isTyping ? `${typingNames.join(', ')} typing` : `${members.length} team member${members.length === 1 ? '' : 's'} viewing`}
      title={title}
      className={`flex max-w-[190px] shrink-0 items-center gap-2 rounded-full border px-1.5 py-1 transition-colors ${isTyping ? 'border-blue-100 bg-blue-50/80' : 'border-zinc-200 bg-zinc-50/80'}`}
    >
      <div className="flex -space-x-1.5" aria-hidden="true">
        {visibleMembers.map((member) => (
          <div key={member.userId} className="relative h-6 w-6 shrink-0">
            {member.avatarUrl ? (
              <img
                src={member.avatarUrl}
                alt=""
                className="h-6 w-6 rounded-full border-2 border-white object-cover"
              />
            ) : (
              <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-white text-[8px] font-bold text-zinc-700 shadow-sm">
                {initials(member.name)}
              </div>
            )}
            <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full border-2 border-white bg-emerald-500" />
          </div>
        ))}
        {extraCount > 0 && (
          <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-zinc-100 text-[8px] font-bold text-zinc-600">
            +{extraCount}
          </div>
        )}
      </div>

      <div className="hidden min-w-0 pr-1 sm:block">
        {isTyping ? (
          <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[10px] font-semibold text-blue-700">
            <span className="max-w-[88px] truncate">{typingNames.slice(0, 2).join(', ')}</span>
            <span className="shrink-0">typing</span>
            <span className="flex shrink-0 items-center gap-0.5" aria-hidden="true">
              <span className="h-1 w-1 animate-bounce rounded-full bg-blue-500 [animation-delay:-0.3s]" />
              <span className="h-1 w-1 animate-bounce rounded-full bg-blue-500 [animation-delay:-0.15s]" />
              <span className="h-1 w-1 animate-bounce rounded-full bg-blue-500" />
            </span>
          </div>
        ) : (
          <div className="whitespace-nowrap text-[10px] font-semibold text-zinc-600">
            {members.length === 1 ? '1 viewing' : `${members.length} viewing`}
          </div>
        )}
      </div>
    </div>
  );
}
