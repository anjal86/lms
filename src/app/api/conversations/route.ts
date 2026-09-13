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

function applyAccountScope<T extends { eq: (column: string, value: string) => T }>(
  query: T,
  accountId: string,
  accountProvider: string,
) {
  if (accountId && accountProvider === 'facebook') return query.eq('metadata->>meta_page_id', accountId);
  if (accountId && accountProvider === 'instagram') return query.eq('metadata->>instagram_business_account_id', accountId);
  return query;
}

export async function GET(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  const url = new URL(request.url);
  const filter = url.searchParams.get('filter') || 'all';
  const provider = url.searchParams.get('provider') || 'all';
  const requestedState = url.searchParams.get('state') || '';
  const priority = url.searchParams.get('priority') || '';
  const search = sanitizeSearchTerm(url.searchParams.get('search') || '');
  const { accountId, accountProvider } = selectedAccountScope(request, url);
  const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit')) || 500));
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);

  // Snoozed work becomes visible again without requiring a cron just to flip state.
  await actor.supabase.rpc('wake_due_conversations', { p_workspace_id: actor.profile.workspace_id });

  let query = actor.supabase
    .from('lead_conversations')
    .select(`
      id,
      workspace_id,
      contact_id,
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
      workflow_state,
      priority,
      snoozed_until,
      first_response_due_at,
      next_action_at,
      first_responded_at,
      last_inbound_at,
      last_outbound_at,
      closed_at,
      resolution_code,
      closing_note,
      team_key,
      unread_count,
      assigned_to,
      last_message_at,
      created_at,
      updated_at,
      converted_at,
      metadata,
      contact:contacts(id, display_name, primary_phone, primary_email, lifecycle_key, owner_id, tags, custom_data, last_seen_at),
      lead:leads(id, lead_code, customer_name, customer_city, customer_country, destination, stage, priority, assigned_to, created_at),
      assigned_profile:profiles!lead_conversations_assigned_to_fkey(id, full_name, email, role, status)
    `, { count: 'exact' })
    .eq('workspace_id', actor.profile.workspace_id);

  if (filter === 'unconverted') query = query.is('lead_id', null);
  else if (filter === 'converted') query = query.not('lead_id', 'is', null);
  else if (filter === 'mine') query = query.eq('assigned_to', actor.user.id);
  else if (filter === 'unassigned') query = query.is('assigned_to', null);
  else if (filter === 'has_phone') query = query.not('metadata->detected_phone', 'is', null);
  else if (filter === 'unread') query = query.gt('unread_count', 0);
  else if (['open', 'waiting', 'snoozed', 'closed'].includes(filter)) query = query.eq('workflow_state', filter);

  if (['open', 'waiting', 'snoozed', 'closed'].includes(requestedState)) {
    query = query.eq('workflow_state', requestedState);
  }
  if (['low', 'normal', 'high', 'urgent'].includes(priority)) query = query.eq('priority', priority);
  if (provider !== 'all') query = query.eq('provider', provider);
  query = applyAccountScope(query, accountId, accountProvider);

  if (search) {
    const pattern = `%${search}%`;
    query = query.or(`customer_name.ilike.${pattern},customer_phone.ilike.${pattern},customer_email.ilike.${pattern},last_message_preview.ilike.${pattern}`);
  }

  query = query
    .order('priority', { ascending: false })
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) {
    console.error('Conversation list failed:', error.message);
    return NextResponse.json({ error: 'Unable to load conversations.' }, { status: 500 });
  }

  const scopedCount = () => actor.supabase
    .from('lead_conversations')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', actor.profile.workspace_id);

  let unconvertedCountQuery = scopedCount().is('lead_id', null).neq('workflow_state', 'closed');
  let allOpenQuery = scopedCount().neq('workflow_state', 'closed');
  let hasPhoneQuery = scopedCount().not('metadata->detected_phone', 'is', null);
  let unassignedQuery = scopedCount().is('assigned_to', null).neq('workflow_state', 'closed');
  let waitingQuery = scopedCount().eq('workflow_state', 'waiting');
  let snoozedQuery = scopedCount().eq('workflow_state', 'snoozed');
  let unreadQuery = scopedCount().gt('unread_count', 0).neq('workflow_state', 'closed');
  let overdueQuery = scopedCount()
    .is('first_responded_at', null)
    .neq('workflow_state', 'closed')
    .lt('first_response_due_at', new Date().toISOString());

  if (provider !== 'all') {
    unconvertedCountQuery = unconvertedCountQuery.eq('provider', provider);
    allOpenQuery = allOpenQuery.eq('provider', provider);
    hasPhoneQuery = hasPhoneQuery.eq('provider', provider);
    unassignedQuery = unassignedQuery.eq('provider', provider);
    waitingQuery = waitingQuery.eq('provider', provider);
    snoozedQuery = snoozedQuery.eq('provider', provider);
    unreadQuery = unreadQuery.eq('provider', provider);
    overdueQuery = overdueQuery.eq('provider', provider);
  }

  unconvertedCountQuery = applyAccountScope(unconvertedCountQuery, accountId, accountProvider);
  allOpenQuery = applyAccountScope(allOpenQuery, accountId, accountProvider);
  hasPhoneQuery = applyAccountScope(hasPhoneQuery, accountId, accountProvider);
  unassignedQuery = applyAccountScope(unassignedQuery, accountId, accountProvider);
  waitingQuery = applyAccountScope(waitingQuery, accountId, accountProvider);
  snoozedQuery = applyAccountScope(snoozedQuery, accountId, accountProvider);
  unreadQuery = applyAccountScope(unreadQuery, accountId, accountProvider);
  overdueQuery = applyAccountScope(overdueQuery, accountId, accountProvider);

  const [unconvertedCountRes, allOpenRes, hasPhoneRes, unassignedRes, waitingRes, snoozedRes, unreadRes, overdueRes] = await Promise.all([
    unconvertedCountQuery,
    allOpenQuery,
    hasPhoneQuery,
    unassignedQuery,
    waitingQuery,
    snoozedQuery,
    unreadQuery,
    overdueQuery,
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
      unassigned: unassignedRes.count || 0,
      waiting: waitingRes.count || 0,
      snoozed: snoozedRes.count || 0,
      unread: unreadRes.count || 0,
      slaOverdue: overdueRes.count || 0,
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
