import { NextResponse } from 'next/server';
import { getApiActor, isManagement } from '@/lib/auth/api-actor';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Provider = 'facebook' | 'instagram' | 'whatsapp' | 'tiktok' | string;

type ConnectionRow = {
  id: string;
  provider: Provider;
  display_name: string;
  status: string;
  config: unknown;
  last_sync_at: string | null;
  connected_by: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function authorizationGroupKey(row: ConnectionRow) {
  const config = asRecord(row.config);
  const identity = asRecord(config.identity);
  const identityId = typeof identity.id === 'string' ? identity.id.trim() : '';
  if (['facebook', 'instagram', 'whatsapp'].includes(row.provider) && identityId) {
    return `meta:${identityId}`;
  }
  return `${row.provider}:${row.id}`;
}

function profileName(row: ConnectionRow) {
  const config = asRecord(row.config);
  const identity = asRecord(config.identity);
  const identityName = typeof identity.name === 'string' ? identity.name.trim() : '';
  if (identityName) return identityName;
  return row.provider === 'tiktok' ? 'TikTok Business account' : row.display_name.replace(/ authorization\s*[—-]\s*/i, '').trim();
}

export async function GET(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!isManagement(actor.profile)) {
    return NextResponse.json({ error: 'Workspace manager access is required.' }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('integration_connections')
    .select('id,provider,display_name,status,config,last_sync_at,connected_by')
    .eq('workspace_id', actor.profile.workspace_id)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Unable to list authorization profiles:', error.message);
    return NextResponse.json({ error: 'Unable to load authorized accounts.' }, { status: 500 });
  }

  const rows = (data || []) as ConnectionRow[];
  const authorizationRows = rows.filter((row) => {
    const config = asRecord(row.config);
    return config.authorization_container === true && config.hidden_from_account_picker === true;
  });

  const groups = new Map<string, {
    key: string;
    kind: 'meta' | 'tiktok' | 'provider';
    display_name: string;
    authorization_ids: string[];
    authorizations: Array<{ id: string; provider: string; status: string }>;
    connected_assets: number;
    total_assets: number;
    last_sync_at: string | null;
  }>();

  for (const authorization of authorizationRows) {
    const key = authorizationGroupKey(authorization);
    const kind = key.startsWith('meta:') ? 'meta' : authorization.provider === 'tiktok' ? 'tiktok' : 'provider';
    const existing = groups.get(key) || {
      key,
      kind,
      display_name: profileName(authorization),
      authorization_ids: [],
      authorizations: [],
      connected_assets: 0,
      total_assets: 0,
      last_sync_at: null,
    };
    existing.authorization_ids.push(authorization.id);
    existing.authorizations.push({ id: authorization.id, provider: authorization.provider, status: authorization.status });
    if (!existing.last_sync_at || (authorization.last_sync_at && authorization.last_sync_at > existing.last_sync_at)) {
      existing.last_sync_at = authorization.last_sync_at;
    }
    groups.set(key, existing);
  }

  for (const row of rows) {
    const config = asRecord(row.config);
    const authorizationId = typeof config.authorization_id === 'string' ? config.authorization_id : '';
    if (!authorizationId) continue;
    for (const group of groups.values()) {
      if (!group.authorization_ids.includes(authorizationId)) continue;
      group.total_assets += 1;
      if (row.status === 'connected' || row.status === 'paused') group.connected_assets += 1;
      break;
    }
  }

  const profiles = Array.from(groups.values())
    .filter((group) => group.authorizations.some((item) => item.status !== 'disconnected'))
    .sort((a, b) => a.display_name.localeCompare(b.display_name));

  return NextResponse.json({ profiles }, { headers: { 'Cache-Control': 'private, no-store' } });
}
