import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor, isManagement } from '@/lib/auth/api-actor';
import {
  chatwootConfigured,
  chatwootServerConfig,
  listChatwootAgents,
} from '@/lib/integrations/chatwoot-client';
import { publicAppUrl } from '@/lib/integrations/environment';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AccountSchema = z.object({
  accountId: z.number().int().positive(),
  name: z.string().trim().min(1).max(160).optional(),
});

export async function GET(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  const { data: mapping, error } = await actor.supabase
    .from('chatwoot_accounts')
    .select('id,workspace_id,chatwoot_account_id,name,status,last_verified_at,created_at,updated_at')
    .eq('workspace_id', actor.profile.workspace_id)
    .maybeSingle();

  if (error && error.code !== '42P01') {
    console.error('Chatwoot mapping read failed:', error.message);
    return NextResponse.json({ error: 'Unable to load Chatwoot mapping.' }, { status: 500 });
  }

  const configured = chatwootConfigured();
  let baseUrl: string | null = null;
  if (configured) {
    try { baseUrl = chatwootServerConfig().baseUrl; } catch { baseUrl = null; }
  }

  return NextResponse.json({
    configured,
    baseUrl,
    webhookUrl: `${publicAppUrl(request.url)}/api/integrations/webhooks/chatwoot`,
    mapping: mapping || null,
    migrationRequired: error?.code === '42P01',
  });
}

export async function POST(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!isManagement(actor.profile)) {
    return NextResponse.json({ error: 'Workspace manager access is required.' }, { status: 403 });
  }

  const parsed = AccountSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed.', fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  if (!chatwootConfigured()) {
    return NextResponse.json({ error: 'Chatwoot server configuration is incomplete.' }, { status: 503 });
  }

  let agents: Array<Record<string, unknown>>;
  try {
    agents = await listChatwootAgents(parsed.data.accountId);
  } catch (error) {
    console.error('Chatwoot account verification failed:', error);
    return NextResponse.json(
      { error: 'Unable to verify access to that Chatwoot account. Check the account ID, base URL and API access token.' },
      { status: 502 }
    );
  }

  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data: existing } = await admin
    .from('chatwoot_accounts')
    .select('id,chatwoot_account_id')
    .eq('workspace_id', actor.profile.workspace_id)
    .maybeSingle();

  const row = {
    workspace_id: actor.profile.workspace_id,
    chatwoot_account_id: parsed.data.accountId,
    name: parsed.data.name || `Chatwoot Account ${parsed.data.accountId}`,
    status: 'active',
    last_verified_at: now,
    updated_at: now,
  };

  const write = existing
    ? admin
        .from('chatwoot_accounts')
        .update(row)
        .eq('id', existing.id)
        .select('id,workspace_id,chatwoot_account_id,name,status,last_verified_at,created_at,updated_at')
        .single()
    : admin
        .from('chatwoot_accounts')
        .insert(row)
        .select('id,workspace_id,chatwoot_account_id,name,status,last_verified_at,created_at,updated_at')
        .single();

  const { data: mapping, error: writeError } = await write;
  if (writeError) {
    if (writeError.code === '23505') {
      return NextResponse.json({ error: 'That Chatwoot account is already mapped to another CRM workspace.' }, { status: 409 });
    }
    console.error('Chatwoot mapping write failed:', writeError.message);
    return NextResponse.json({ error: 'Unable to save Chatwoot account mapping.' }, { status: 500 });
  }

  return NextResponse.json({ mapping, verifiedAgentCount: agents.length });
}
