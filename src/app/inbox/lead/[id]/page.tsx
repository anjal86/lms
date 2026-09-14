'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, MessageSquare } from 'lucide-react';

export default function OpportunityConversationBridgePage() {
  const params = useParams();
  const router = useRouter();
  const leadId = params.id as string;
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const response = await fetch(`/api/conversations/by-lead/${leadId}`, { cache: 'no-store' });
        const payload = await response.json();
        if (!active) return;
        if (response.ok && payload.conversationId) {
          router.replace(`/inbox?conversationId=${encodeURIComponent(payload.conversationId)}`);
          return;
        }
      } catch {
        // Fall through to the explicit no-conversation state.
      }
      if (active) setMissing(true);
    };
    void run();
    return () => { active = false; };
  }, [leadId, router]);

  if (!missing) {
    return <div className="flex min-h-[50vh] items-center justify-center gap-2 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Opening customer conversation…</div>;
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-20 text-center">
      <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-zinc-100 text-zinc-600"><MessageSquare className="h-5 w-5" /></span>
      <h1 className="mt-4 text-lg font-semibold text-zinc-950">No linked conversation yet</h1>
      <p className="mt-2 text-sm leading-6 text-zinc-500">This opportunity does not have an Inbox conversation connected to it yet. Keep customer messaging in Inbox once a channel conversation exists.</p>
      <div className="mt-5 flex justify-center gap-2">
        <Link href="/inbox" className="button-primary">Open Inbox</Link>
        <Link href={`/my-work/${leadId}`} className="button-secondary">Back to opportunity</Link>
      </div>
    </div>
  );
}
