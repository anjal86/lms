import { NextResponse } from 'next/server';
import { getApiActor } from '@/lib/auth/api-actor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sanitizeSearchTerm(value: string) {
  return value.replace(/[,%()'"\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function sanitizeAccountId(value: string | null) {
  const trimmed = value?.trim() || '';
  return /^[A-Za-z0-9:_-]{1,128}$/.test(trimmed) ? trimmed : '';
}

function readCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get('cookie') || '';
  for (const pair of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = pair.trim().split('=');
    if (rawName === name) {
      try {
        return decodeURIComponent(rawValue.join('='));
      } catch {
        return rawValue.join('=');
      }
    }
  }
  return '';
}

function selectedAccountScope(request: Request, url: URL) {
  const explicitAccountId = sanitizeAccountId(url.searchParams.get('accountId'));
  const explicitProvider = url.searchParams.get('accountProvider');
  if (explicitAccountId && (explicitProvider === 'facebook' || explicitProvider === 'instagram')) {
    return { accountId: explicitAccountId, accountProvider: explicitProvider } as const;
  }

  const cookieValue = readCookie(request, 'inbox_page_filter');
  if (!cookieValue || cookieValue === 'all') return { accountId: '', accountProvider: '' } as const;
  const separator = cookieValue.indexOf(':');
  if (separator <= 0) return { accountId: '', accountProvider: '' } as const;
  const accountProvider = cookieValue.slice(0, separator);
  const accountId = sanitizeAccountId(cookieValue.slice(separator + 1));
  if (!accountId || !['facebook', 'instagram'].includes(accountProvider)) {
    return { accountId: '', accountProvider: '' } as const;
  }
  return { accountId, accountProvider } as const;
}

export async function GET(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  const url = new URL(request.url);
  const filter = url.searchParams.get('filter') || 'all';
  const provider = url.searchParams.get('provider') || 'all';
  const search = sanitizeSearchTerm(url.searchParams.get('search') || '');
  const { accountId, accountProvider } = selectedAccountScope(request, url);
  // The inbox is intentionally scroll-based today. The current production queue
  // already exceeds 300 conversations, so return 500 by default instead of
  // silently hiding older clients. Keep a hard cap until cursor pagination lands.
  const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit')) || 500));
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);

  let query = actor.supabase
    .from('lead_conversations')
    .select(`
      id,
      lead_id,
      connection_id,
      provider,
      external_thread_id,
      external_contact_id,
      customer_name,
      customer_phone,
      customer_email,
      customer_avatar_url,
      last_message_preview,
      status,
      unread_count,
      assigned_to,
      last_message_at,
      created_at,
      updated_at,
      converted_at,
      metadata,
      lead:leads(id, lead_code, customer_name, customer_city, customer_country, destination, stage, priority, assigned_to, created_at),
      assigned_profile:profiles!lead_conversations_assigned_to_fkey(id, full_name, email, role)
    `, { count: 'exact' });

  if (filter === 'unconverted') query = query.is('lead_id', null);
  else if (filter === 'converted') query = query.not('lead_id', 'is', null);
  else if (filter === 'mine') query = query.eq('assigned_to', actor.user.id);
  else if (filter === 'has_phone') query = query.not('metadata->detected_phone', 'is', null);

  if (provider !== 'all') query = query.eq('provider', provider);

  // Keep connected Meta Page / Instagram account inboxes isolated when requested.
  if (accountId && accountProvider === 'facebook') {
    query = query.eq('metadata->>meta_page_id', accountId);
  } else if (accountId && accountProvider === 'instagram') {
    query = query.eq('metadata->>instagram_business_account_id', accountId);
  }

  if (search) {
    const pattern = `%${search}%`;
    query = query.or(`customer_name.ilike.${pattern},customer_phone.ilike.${pattern},customer_email.ilike.${pattern},last_message_preview.ilike.${pattern}`);
  }

  query = query.order('last_message_at', { ascending: false, nullsFirst: false }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) {
    console.error('Conversation list failed:', error.message);
    return NextResponse.json({ error: 'Unable to load conversations.' }, { status: 500 });
  }

  // Metrics use the same Page/account scope as the visible inbox so the counters
  // describe the inbox the agent is actually working, not all connected Pages.
  let unconvertedCountQuery = actor.supabase
    .from('lead_conversations')
    .select('id', { count: 'exact', head: true })
    .is('lead_id', null)
    .eq('status', 'open');
  let allOpenQuery = actor.supabase
    .from('lead_conversations')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open');
  let hasPhoneQuery = actor.supabase
    .from('lead_conversations')
    .select('id', { count: 'exact', head: true })
    .not('metadata->detected_phone', 'is', null);

  if (provider !== 'all') {
    unconvertedCountQuery = unconvertedCountQuery.eq('provider', provider);
    allOpenQuery = allOpenQuery.eq('provider', provider);
    hasPhoneQuery = hasPhoneQuery.eq('provider', provider);
  }

  if (accountId && accountProvider === 'facebook') {
    unconvertedCountQuery = unconvertedCountQuery.eq('metadata->>meta_page_id', accountId);
    allOpenQuery = allOpenQuery.eq('metadata->>meta_page_id', accountId);
    hasPhoneQuery = hasPhoneQuery.eq('metadata->>meta_page_id', accountId);
  } else if (accountId && accountProvider === 'instagram') {
    unconvertedCountQuery = unconvertedCountQuery.eq('metadata->>instagram_business_account_id', accountId);
    allOpenQuery = allOpenQuery.eq('metadata->>instagram_business_account_id', accountId);
    hasPhoneQuery = hasPhoneQuery.eq('metadata->>instagram_business_account_id', accountId);
  }

  const [unconvertedCountRes, allOpenRes, hasPhoneRes] = await Promise.all([
    unconvertedCountQuery,
    allOpenQuery,
    hasPhoneQuery,
  ]);

  return NextResponse.json({
    conversations: data || [],
    total: count || 0,
    hasMore: offset + (data?.length || 0) < (count || 0),
    scope: accountId && accountProvider ? { accountId, accountProvider } : null,
    metrics: {
      unconvertedOpen: unconvertedCountRes.count || 0,
      totalOpen: allOpenRes.count || 0,
      hasPhone: hasPhoneRes.count || 0,
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
