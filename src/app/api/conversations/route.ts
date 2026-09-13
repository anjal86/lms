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
  const requestedState = url.searchParams.get('state') || '';
  const priority = url.searchParams.get('priority') || '';
  const sort = url.searchParams.get('sort') || 'newest';
  const search = sanitizeSearchTerm(url.searchParams.get('search') || '');
  const { accountId, accountProvider } = selectedAccountScope(request, url);
  const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit')) || 500));
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);

  await actor.supabase.rpc('wake_due_conversations', { p_workspace_id: actor.profile.workspace_id });

  const { data: collaboratorRows } = await actor.supabase
    .from('conversation_collaborators')
    .select('conversation_id')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('user_id', actor.user.id);
  const collaboratorIds = (collaboratorRows || []).map((row) => row.conversation_id);

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
      needs_reply,
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
  else if (filter === 'mine') query = query.eq('assigned_to', actor.user.id).neq('workflow_state', 'closed');
  else if (filter === 'unassigned') query = query.is('assigned_to', null).neq('workflow_state', 'closed');
  else if (filter === 'collaborations') query = collaboratorIds.length ? query.in('id', collaboratorIds).neq('workflow_state', 'closed') : query.eq('id', '00000000-0000-0000-0000-000000000000');
  else if (filter === 'has_phone') query = query.not('metadata->detected_phone', 'is', null).neq('workflow_state', 'closed');
  else if (filter === 'unread') query = query.gt('unread_count', 0).neq('workflow_state', 'closed');
  else if (filter === 'needs_reply') query = query.eq('needs_reply', true).neq('workflow_state', 'closed');
  else if (filter === 'sla_overdue') query = query.is('first_responded_at', null).neq('workflow_state', 'closed').lt('first_response_due_at', new Date().toISOString());
  else if (filter === 'high_priority') query = query.in('priority', ['high', 'urgent']).neq('workflow_state', 'closed');
  else if (['open', 'waiting', 'snoozed', 'closed'].includes(filter)) query = query.eq('workflow_state', filter);
  else if (filter === 'all') query = query.neq('workflow_state', 'closed');

  if (['open', 'waiting', 'snoozed', 'closed'].includes(requestedState)) query = query.eq('workflow_state', requestedState);
  if (['low', 'normal', 'high', 'urgent'].includes(priority)) query = query.eq('priority', priority);
  if (provider !== 'all') query = query.eq('provider', provider);
  if (accountId && accountProvider === 'facebook') query = query.eq('metadata->>meta_page_id', accountId);
  else if (accountId && accountProvider === 'instagram') query = query.eq('metadata->>instagram_business_account_id', accountId);

  if (search) {
    const pattern = `%${search}%`;
    query = query.or(`customer_name.ilike.${pattern},customer_phone.ilike.${pattern},customer_email.ilike.${pattern},last_message_preview.ilike.${pattern}`);
  }

  if (sort === 'oldest') {
    query = query.order('last_message_at', { ascending: true, nullsFirst: false });
  } else if (sort === 'waiting') {
    query = query.order('needs_reply', { ascending: false }).order('last_inbound_at', { ascending: true, nullsFirst: false });
  } else if (sort === 'sla') {
    query = query.order('first_response_due_at', { ascending: true, nullsFirst: false }).order('last_message_at', { ascending: false, nullsFirst: false });
  } else {
    query = query.order('last_message_at', { ascending: false, nullsFirst: false });
  }
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) {
    console.error('Conversation list failed:', error.message);
    return NextResponse.json({ error: 'Unable to load conversations.' }, { status: 500 });
  }

  let unconvertedCountQuery = actor.supabase.from('lead_conversations').select('id', { count: 'exact', head: true }).eq('workspace_id', actor.profile.workspace_id).is('lead_id', null).neq('workflow_state', 'closed');
  let allOpenQuery = actor.supabase.from('lead_conversations').select('id', { count: 'exact', head: true }).eq('workspace_id', actor.profile.workspace_id).neq('workflow_state', 'closed');
  let hasPhoneQuery = actor.supabase.from('lead_conversations').select('id', { count: 'exact', head: true }).eq('workspace_id', actor.profile.workspace_id).not('metadata->detected_phone', 'is', null).neq('workflow_state', 'closed');
  let unassignedQuery = actor.supabase.from('lead_conversations').select('id', { count: 'exact', head: true }).eq('workspace_id', actor.profile.workspace_id).is('assigned_to', null).neq('workflow_state', 'closed');
  let waitingQuery = actor.supabase.from('lead_conversations').select('id', { count: 'exact', head: true }).eq('workspace_id', actor.profile.workspace_id).eq('workflow_state', 'waiting');
  let snoozedQuery = actor.supabase.from('lead_conversations').select('id', { count: 'exact', head: true }).eq('workspace_id', actor.profile.workspace_id).eq('workflow_state', 'snoozed');
  let unreadQuery = actor.supabase.from('lead_conversations').select('id', { count: 'exact', head: true }).eq('workspace_id', actor.profile.workspace_id).gt('unread_count', 0).neq('workflow_state', 'closed');
  let needsReplyQuery = actor.supabase.from('lead_conversations').select('id', { count: 'exact', head: true }).eq('workspace_id', actor.profile.workspace_id).eq('needs_reply', true).neq('workflow_state', 'closed');
  let overdueQuery = actor.supabase.from('lead_conversations').select('id', { count: 'exact', head: true }).eq('workspace_id', actor.profile.workspace_id).is('first_responded_at', null).neq('workflow_state', 'closed').lt('first_response_due_at', new Date().toISOString());
  let highPriorityQuery = actor.supabase.from('lead_conversations').select('id', { count: 'exact', head: true }).eq('workspace_id', actor.profile.workspace_id).in('priority', ['high', 'urgent']).neq('workflow_state', 'closed');

  if (provider !== 'all') {
    unconvertedCountQuery = unconvertedCountQuery.eq('provider', provider);
    allOpenQuery = allOpenQuery.eq('provider', provider);
    hasPhoneQuery = hasPhoneQuery.eq('provider', provider);
    unassignedQuery = unassignedQuery.eq('provider', provider);
    waitingQuery = waitingQuery.eq('provider', provider);
    snoozedQuery = snoozedQuery.eq('provider', provider);
    unreadQuery = unreadQuery.eq('provider', provider);
    needsReplyQuery = needsReplyQuery.eq('provider', provider);
    overdueQuery = overdueQuery.eq('provider', provider);
    highPriorityQuery = highPriorityQuery.eq('provider', provider);
  }

  if (accountId && accountProvider === 'facebook') {
    unconvertedCountQuery = unconvertedCountQuery.eq('metadata->>meta_page_id', accountId);
    allOpenQuery = allOpenQuery.eq('metadata->>meta_page_id', accountId);
    hasPhoneQuery = hasPhoneQuery.eq('metadata->>meta_page_id', accountId);
    unassignedQuery = unassignedQuery.eq('metadata->>meta_page_id', accountId);
    waitingQuery = waitingQuery.eq('metadata->>meta_page_id', accountId);
    snoozedQuery = snoozedQuery.eq('metadata->>meta_page_id', accountId);
    unreadQuery = unreadQuery.eq('metadata->>meta_page_id', accountId);
    needsReplyQuery = needsReplyQuery.eq('metadata->>meta_page_id', accountId);
    overdueQuery = overdueQuery.eq('metadata->>meta_page_id', accountId);
    highPriorityQuery = highPriorityQuery.eq('metadata->>meta_page_id', accountId);
  } else if (accountId && accountProvider === 'instagram') {
    unconvertedCountQuery = unconvertedCountQuery.eq('metadata->>instagram_business_account_id', accountId);
    allOpenQuery = allOpenQuery.eq('metadata->>instagram_business_account_id', accountId);
    hasPhoneQuery = hasPhoneQuery.eq('metadata->>instagram_business_account_id', accountId);
    unassignedQuery = unassignedQuery.eq('metadata->>instagram_business_account_id', accountId);
    waitingQuery = waitingQuery.eq('metadata->>instagram_business_account_id', accountId);
    snoozedQuery = snoozedQuery.eq('metadata->>instagram_business_account_id', accountId);
    unreadQuery = unreadQuery.eq('metadata->>instagram_business_account_id', accountId);
    needsReplyQuery = needsReplyQuery.eq('metadata->>instagram_business_account_id', accountId);
    overdueQuery = overdueQuery.eq('metadata->>instagram_business_account_id', accountId);
    highPriorityQuery = highPriorityQuery.eq('metadata->>instagram_business_account_id', accountId);
  }

  const [unconvertedCountRes, allOpenRes, hasPhoneRes, unassignedRes, waitingRes, snoozedRes, unreadRes, needsReplyRes, overdueRes, highPriorityRes] = await Promise.all([
    unconvertedCountQuery,
    allOpenQuery,
    hasPhoneQuery,
    unassignedQuery,
    waitingQuery,
    snoozedQuery,
    unreadQuery,
    needsReplyQuery,
    overdueQuery,
    highPriorityQuery,
  ]);

  let collaborations = 0;
  if (collaboratorIds.length) {
    let collaborationCountQuery = actor.supabase
      .from('lead_conversations')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', actor.profile.workspace_id)
      .in('id', collaboratorIds)
      .neq('workflow_state', 'closed');
    if (provider !== 'all') collaborationCountQuery = collaborationCountQuery.eq('provider', provider);
    if (accountId && accountProvider === 'facebook') collaborationCountQuery = collaborationCountQuery.eq('metadata->>meta_page_id', accountId);
    else if (accountId && accountProvider === 'instagram') collaborationCountQuery = collaborationCountQuery.eq('metadata->>instagram_business_account_id', accountId);
    const collaborationRes = await collaborationCountQuery;
    collaborations = collaborationRes.count || 0;
  }

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
      collaborations,
      waiting: waitingRes.count || 0,
      snoozed: snoozedRes.count || 0,
      unread: unreadRes.count || 0,
      needsReply: needsReplyRes.count || 0,
      slaOverdue: overdueRes.count || 0,
      highPriority: highPriorityRes.count || 0,
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
