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
  const title = members.map((member) => `${member.name}${member.typing ? ' — typing' : ' — viewing'}`).join('\n');

  return (
    <div
      aria-live="polite"
      aria-label={typingNames.length ? `${typingNames.join(', ')} typing` : `${members.length} team member${members.length === 1 ? '' : 's'} viewing`}
      title={title}
      className="flex min-w-0 items-center gap-2 rounded-full border border-zinc-200 bg-white px-1.5 py-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
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
              <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-zinc-100 text-[8px] font-bold text-zinc-700">
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
        {typingNames.length ? (
          <div className="flex items-center gap-1.5 whitespace-nowrap text-[10px] font-semibold text-blue-600">
            <span className="max-w-[96px] truncate">{typingNames.slice(0, 2).join(', ')}</span>
            <span>typing</span>
            <span className="flex items-center gap-0.5" aria-hidden="true">
              <span className="h-1 w-1 animate-bounce rounded-full bg-blue-500 [animation-delay:-0.3s]" />
              <span className="h-1 w-1 animate-bounce rounded-full bg-blue-500 [animation-delay:-0.15s]" />
              <span className="h-1 w-1 animate-bounce rounded-full bg-blue-500" />
            </span>
          </div>
        ) : (
          <div className="whitespace-nowrap text-[10px] font-semibold text-zinc-500">
            {members.length === 1 ? '1 viewing' : `${members.length} viewing`}
          </div>
        )}
      </div>
    </div>
  );
}
