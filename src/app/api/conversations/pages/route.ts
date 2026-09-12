import { NextResponse } from 'next/server';
import { getApiActor } from '@/lib/auth/api-actor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PageSummary = {
  key: string;
  provider: 'facebook' | 'instagram';
  accountId: string;
  name: string;
  conversations: number;
  newConversations: number;
  unreadMessages: number;
  lastMessageAt: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function GET(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  // Read all RLS-visible Meta conversations in bounded pages. The old single
  // .limit(2000) summary silently undercounted busy Pages once the combined
  // inbox grew past that threshold.
  const pageSize = 1000;
  const rows: Array<{
    provider: string;
    lead_id: string | null;
    status: string;
    unread_count: number | null;
    last_message_at: string | null;
    metadata: unknown;
  }> = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await actor.supabase
      .from('lead_conversations')
      .select('provider,lead_id,status,unread_count,last_message_at,metadata')
      .in('provider', ['facebook', 'instagram'])
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error('Page inbox options failed:', error.message);
      return NextResponse.json({ error: 'Unable to load connected Page inboxes.' }, { status: 500 });
    }

    const batch = data || [];
    rows.push(...batch);
    if (batch.length < pageSize) break;

    // Defensive ceiling: this endpoint only builds summary counts. If an
    // installation grows beyond 50k visible conversations we should replace
    // this scan with a grouped SQL/RPC aggregate rather than creating an
    // unbounded HTTP response workload.
    if (rows.length >= 50_000) {
      console.warn('Page inbox summary reached 50,000-row safety ceiling.');
      break;
    }
  }

  const pages = new Map<string, PageSummary>();

  for (const conversation of rows) {
    const metadata = asRecord(conversation.metadata);
    const provider = conversation.provider === 'instagram' ? 'instagram' : 'facebook';
    const accountId = provider === 'facebook'
      ? String(metadata.meta_page_id || '').trim()
      : String(metadata.instagram_business_account_id || '').trim();

    if (!accountId) continue;

    const key = `${provider}:${accountId}`;
    const fallbackName = provider === 'facebook' ? 'Facebook Page' : 'Instagram Account';
    const name = provider === 'facebook'
      ? String(metadata.meta_page_name || fallbackName)
      : String(metadata.account_name || metadata.instagram_username || fallbackName);

    const current = pages.get(key) || {
      key,
      provider,
      accountId,
      name,
      conversations: 0,
      newConversations: 0,
      unreadMessages: 0,
      lastMessageAt: null,
    };

    current.conversations += 1;
    if (!conversation.lead_id && conversation.status === 'open') current.newConversations += 1;
    current.unreadMessages += Math.max(0, Number(conversation.unread_count) || 0);
    if (!current.lastMessageAt && conversation.last_message_at) current.lastMessageAt = conversation.last_message_at;
    if (current.name === fallbackName && name !== fallbackName) current.name = name;
    pages.set(key, current);
  }

  return NextResponse.json(
    { pages: Array.from(pages.values()) },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
