import { NextResponse } from 'next/server';
import { getApiActor, isManagement } from '@/lib/auth/api-actor';
import { listChatwootInboxes, type ChatwootInbox } from '@/lib/integrations/chatwoot-client';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function scalar(value: unknown) {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function providerForChannel(channelType?: string | null) {
  switch (channelType) {
    case 'Channel::FacebookPage': return 'facebook';
    case 'Channel::Instagram': return 'instagram';
    case 'Channel::Whatsapp': return 'whatsapp';
    case 'Channel::Email': return 'email';
    case 'Channel::WebWidget': return 'website';
    case 'Channel::Api': return 'api';
    case 'Channel::Tiktok': return 'tiktok';
    case 'Channel::Telegram': return 'telegram';
    case 'Channel::Line': return 'line';
    case 'Channel::TwilioSms': return 'sms';
    default: return 'other';
  }
}

function publicIdentity(inbox: ChatwootInbox) {
  return scalar(inbox.page_id)
    ?? scalar(inbox.instagram_id)
    ?? scalar(inbox.business_id)
    ?? scalar(inbox.phone_number)
    ?? scalar(inbox.email)
    ?? scalar(inbox.website_url);
}

function safeInboxMetadata(inbox: ChatwootInbox) {
  return {
    crm_provider: providerForChannel(inbox.channel_type),
    provider_name: scalar(inbox.provider_name),
    provider: scalar(inbox.provider),
    external_identity: publicIdentity(inbox),
    page_id: scalar(inbox.page_id),
    instagram_id: scalar(inbox.instagram_id),
    business_id: scalar(inbox.business_id),
    phone_number: scalar(inbox.phone_number),
    email: scalar(inbox.email),
    website_url: scalar(inbox.website_url),
  };
}

const SAFE_SELECT = 'id,workspace_id,chatwoot_account_link_id,integration_connection_id,chatwoot_inbox_id,name,channel_type,status,metadata,last_synced_at,created_at,updated_at';

export async function GET(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  const { data, error } = await actor.supabase
    .from('chatwoot_inboxes')
    .select(SAFE_SELECT)
    .eq('workspace_id', actor.profile.workspace_id)
    .order('name', { ascending: true });

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json({ inboxes: [], migrationRequired: true });
    }
    console.error('Chatwoot inbox mapping read failed:', error.message);
    return NextResponse.json({ error: 'Unable to load Chatwoot inboxes.' }, { status: 500 });
  }

  return NextResponse.json({ inboxes: data || [], migrationRequired: false });
}

export async function POST(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!isManagement(actor.profile)) {
    return NextResponse.json({ error: 'Workspace manager access is required.' }, { status: 403 });
  }

  const { data: accountLink, error: accountError } = await actor.supabase
    .from('chatwoot_accounts')
    .select('id,chatwoot_account_id,status')
    .eq('workspace_id', actor.profile.workspace_id)
    .maybeSingle();

  if (accountError) {
    console.error('Chatwoot account mapping read failed:', accountError.message);
    return NextResponse.json({ error: 'Unable to load Chatwoot account mapping.' }, { status: 500 });
  }
  if (!accountLink || accountLink.status !== 'active') {
    return NextResponse.json({ error: 'Map an active Chatwoot account to this workspace first.' }, { status: 409 });
  }

  let discovered: ChatwootInbox[];
  try {
    discovered = await listChatwootInboxes(Number(accountLink.chatwoot_account_id));
  } catch (error) {
    console.error('Chatwoot inbox discovery failed:', error);
    return NextResponse.json({ error: 'Unable to discover Chatwoot inboxes.' }, { status: 502 });
  }

  const now = new Date().toISOString();
  const valid = discovered.filter((inbox) => Number.isSafeInteger(inbox.id) && inbox.id > 0);
  const rows = valid.map((inbox) => ({
    workspace_id: actor.profile.workspace_id,
    chatwoot_account_link_id: accountLink.id,
    chatwoot_inbox_id: inbox.id,
    name: scalar(inbox.name) || `Inbox ${inbox.id}`,
    channel_type: scalar(inbox.channel_type),
    status: 'active',
    metadata: safeInboxMetadata(inbox),
    last_synced_at: now,
    updated_at: now,
  }));

  const admin = createSupabaseAdminClient();
  if (rows.length) {
    const { error: upsertError } = await admin
      .from('chatwoot_inboxes')
      .upsert(rows, { onConflict: 'chatwoot_account_link_id,chatwoot_inbox_id' });
    if (upsertError) {
      console.error('Chatwoot inbox mapping upsert failed:', upsertError.message);
      return NextResponse.json({ error: 'Unable to save discovered Chatwoot inboxes.' }, { status: 500 });
    }
  }

  const discoveredIds = new Set(valid.map((inbox) => Number(inbox.id)));
  const { data: existing, error: existingError } = await admin
    .from('chatwoot_inboxes')
    .select('id,chatwoot_inbox_id,status')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('chatwoot_account_link_id', accountLink.id);

  if (existingError) {
    console.error('Chatwoot inbox reconciliation read failed:', existingError.message);
    return NextResponse.json({ error: 'Unable to reconcile Chatwoot inboxes.' }, { status: 500 });
  }

  const staleIds = (existing || [])
    .filter((row) => !discoveredIds.has(Number(row.chatwoot_inbox_id)) && row.status !== 'disabled')
    .map((row) => row.id);
  if (staleIds.length) {
    const { error: disableError } = await admin
      .from('chatwoot_inboxes')
      .update({ status: 'disabled', updated_at: now })
      .in('id', staleIds);
    if (disableError) {
      console.error('Chatwoot stale inbox disable failed:', disableError.message);
      return NextResponse.json({ error: 'Unable to reconcile removed Chatwoot inboxes.' }, { status: 500 });
    }
  }

  const { data: saved, error: savedError } = await admin
    .from('chatwoot_inboxes')
    .select(SAFE_SELECT)
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('chatwoot_account_link_id', accountLink.id)
    .order('name', { ascending: true });

  if (savedError) {
    console.error('Chatwoot synced inbox read failed:', savedError.message);
    return NextResponse.json({ error: 'Chatwoot inboxes synced but could not be reloaded.' }, { status: 500 });
  }

  return NextResponse.json({ inboxes: saved || [], discovered: valid.length, disabled: staleIds.length });
}
