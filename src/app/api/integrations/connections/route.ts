import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor, isManagement } from '@/lib/auth/api-actor';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getProvider } from '@/lib/integrations/catalog';
import { buildIntegrationSetup, integrationCatalogWithEnvStatus, publicAppUrl } from '@/lib/integrations/environment';
import { discoverMetaConversationHistory } from '@/lib/integrations/meta-history';
import { enqueueMetaHistorySyncJob } from '@/lib/redis/integration-sync-queue';
import { isRedisConfigured } from '@/lib/redis/client';
import { cacheResponseHeaders, readRedisJson, redisCacheKey, writeRedisJson, type RedisCacheStatus } from '@/lib/redis/cache';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CONNECTIONS_CACHE_TTL_SECONDS = 15;

type ConnectionsPayload = {
  connections: unknown[];
  catalog: unknown[];
  setup: unknown;
  migrationRequired: boolean;
  message?: string;
};

const ManualConnectionSchema = z.object({
  provider: z.enum(['email', 'website', 'api']),
  display_name: z.string().trim().min(2).max(120),
  external_account_id: z.string().trim().max(240).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

const PatchSchema = z.object({
  id: uuidSchema,
  action: z.enum(['pause', 'resume', 'disconnect', 'sync']),
});

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function GET(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  const requestUrl = new URL(request.url);
  const forceRefresh = requestUrl.searchParams.get('refresh') === '1';
  const workspaceId = actor.profile.workspace_id;
  const appUrl = publicAppUrl(request.url);
  const cacheKey = redisCacheKey({
    workspaceId,
    namespace: 'integrations:connections',
    dimensions: { appUrl },
  });

  let cacheStatus: RedisCacheStatus = 'BYPASS';
  if (!forceRefresh) {
    const cached = await readRedisJson<ConnectionsPayload>(cacheKey);
    cacheStatus = cached.status;
    if (cached.value) {
      return NextResponse.json(cached.value, { headers: cacheResponseHeaders('HIT') });
    }
  }

  const { data, error } = await actor.supabase
    .from('integration_connections')
    .select('id,workspace_id,provider,display_name,external_account_id,status,capabilities,config,visibility_scope,connected_by,last_sync_at,last_event_at,last_error,created_at,updated_at')
    .eq('workspace_id', workspaceId)
    .order('provider', { ascending: true })
    .order('display_name', { ascending: true });

  const catalog = integrationCatalogWithEnvStatus();
  const setup = buildIntegrationSetup(appUrl);

  if (error) {
    if (error.code === '42P01' || error.message.toLowerCase().includes('integration_connections')) {
      return NextResponse.json({
        connections: [],
        catalog,
        setup,
        migrationRequired: true,
        message: 'Apply the omnichannel database migration to enable connections.',
      });
    }
    console.error('Integration connection read failed:', error.message);
    return NextResponse.json({ error: 'Unable to load connections.' }, { status: 500 });
  }

  const connections = (data || []).filter((connection) => {
    const config = asRecord(connection.config);
    return config.hidden_from_account_picker !== true && config.removed_from_connections_ui !== true;
  });

  const payload: ConnectionsPayload = { connections, catalog, setup, migrationRequired: false };
  await writeRedisJson(cacheKey, payload, CONNECTIONS_CACHE_TTL_SECONDS);
  return NextResponse.json(payload, { headers: cacheResponseHeaders(forceRefresh ? 'BYPASS' : cacheStatus) });
}

export async function POST(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!isManagement(actor.profile)) {
    return NextResponse.json({ error: 'Workspace manager access is required.' }, { status: 403 });
  }

  const parsed = ManualConnectionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed.', fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const provider = getProvider(parsed.data.provider);
  if (!provider) return NextResponse.json({ error: 'Unsupported provider.' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const config = {
    ...(parsed.data.config || {}),
    transport: parsed.data.provider === 'email'
      ? (typeof parsed.data.config?.transport === 'string' ? parsed.data.config.transport : 'unconfigured')
      : parsed.data.provider === 'website'
        ? 'webhook'
        : 'api',
  };
  const { data, error } = await admin
    .from('integration_connections')
    .insert({
      workspace_id: actor.profile.workspace_id,
      provider: parsed.data.provider,
      display_name: parsed.data.display_name,
      external_account_id: parsed.data.external_account_id || null,
      status: 'connected',
      capabilities: provider.capabilities,
      config,
      connected_by: actor.user.id,
      visibility_scope: 'workspace',
      last_sync_at: new Date().toISOString(),
    })
    .select('id,workspace_id,provider,display_name,external_account_id,status,capabilities,config,visibility_scope,connected_by,last_sync_at,last_event_at,last_error,created_at,updated_at')
    .single();

  if (error) {
    console.error('Manual integration connection failed:', error.message);
    return NextResponse.json({ error: 'Unable to save this connection.' }, { status: 500 });
  }

  return NextResponse.json({ connection: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!isManagement(actor.profile)) {
    return NextResponse.json({ error: 'Workspace manager access is required.' }, { status: 403 });
  }

  const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid connection action.' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: target } = await admin
    .from('integration_connections')
    .select('id,workspace_id,provider,status')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', parsed.data.id)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: 'Connection not found.' }, { status: 404 });

  if (parsed.data.action === 'sync') {
    if (!['facebook', 'instagram'].includes(target.provider)) {
      return NextResponse.json({ error: 'Manual history sync is currently available for Facebook and Instagram.' }, { status: 400 });
    }
    if (!['connected', 'token_expiring', 'paused'].includes(target.status)) {
      return NextResponse.json({ error: 'Reconnect this account before syncing its history.' }, { status: 409 });
    }

    try {
      if (isRedisConfigured()) {
        // Keep the request fast enough to provide immediate visible progress, then let
        // the Redis worker continue discovery/backfill until the saved cursor is done.
        const historySync = await discoverMetaConversationHistory({
          connectionIds: [target.id],
          maxPages: 1,
        });
        const backgroundSync = await enqueueMetaHistorySyncJob({
          workspaceId: actor.profile.workspace_id,
          connectionId: target.id,
          requestedBy: actor.user.id,
        });
        const now = new Date().toISOString();
        const firstError = historySync.errors[0] || null;
        await admin
          .from('integration_connections')
          .update({ last_sync_at: now, last_error: firstError })
          .eq('workspace_id', actor.profile.workspace_id)
          .eq('id', target.id);
        return NextResponse.json({
          success: historySync.errors.length === 0,
          historySync,
          backgroundSync,
          queued: backgroundSync.queued,
        }, { status: backgroundSync.queued ? 202 : 200 });
      }

      // Safe fallback for installations that have not enabled Redis yet.
      const historySync = await discoverMetaConversationHistory({
        connectionIds: [target.id],
        maxPages: 8,
      });
      const now = new Date().toISOString();
      const firstError = historySync.errors[0] || null;
      await admin
        .from('integration_connections')
        .update({ last_sync_at: now, last_error: firstError })
        .eq('workspace_id', actor.profile.workspace_id)
        .eq('id', target.id);
      return NextResponse.json({
        success: historySync.errors.length === 0,
        historySync,
        queued: false,
      });
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : 'Unable to sync channel history.';
      await admin
        .from('integration_connections')
        .update({ last_error: message })
        .eq('workspace_id', actor.profile.workspace_id)
        .eq('id', target.id);
      console.error('Meta history sync failed:', syncError);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const status = parsed.data.action === 'pause' ? 'paused' : parsed.data.action === 'resume' ? 'connected' : 'disconnected';
  const { data, error } = await admin
    .from('integration_connections')
    .update({ status, last_error: null })
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', parsed.data.id)
    .select('id,provider,display_name,status,updated_at')
    .single();

  if (error) {
    console.error('Integration connection update failed:', error.message);
    return NextResponse.json({ error: 'Unable to update this connection.' }, { status: 500 });
  }

  if (parsed.data.action === 'disconnect') {
    await admin.from('integration_secrets').delete().eq('connection_id', parsed.data.id);
  }

  return NextResponse.json({ connection: data });
}

const DeleteConnectionSchema = z.object({
  id: uuidSchema,
});

export async function DELETE(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!isManagement(actor.profile)) {
    return NextResponse.json({ error: 'Workspace manager access is required.' }, { status: 403 });
  }

  const url = new URL(request.url);
  const idFromQuery = url.searchParams.get('id');
  const body = await request.json().catch(() => ({}));
  const idToParse = body.id || idFromQuery;

  const parsed = DeleteConnectionSchema.safeParse({ id: idToParse });
  if (!parsed.success) {
    return NextResponse.json({ error: 'A valid connection ID is required.' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: target, error: targetError } = await admin
    .from('integration_connections')
    .select('id,workspace_id,provider,display_name,config')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', parsed.data.id)
    .maybeSingle();

  if (targetError) {
    console.error('Connection removal lookup failed:', targetError.message);
    return NextResponse.json({ error: 'Unable to load this connection.' }, { status: 500 });
  }
  if (!target) {
    return NextResponse.json({ error: 'Connection not found in this workspace.' }, { status: 404 });
  }

  const now = new Date().toISOString();
  const config = asRecord(target.config);

  // Erase credentials, but keep the connection row as a tombstone. Conversations,
  // messages and audit history retain their exact source-account foreign key.
  const { error: secretError } = await admin.from('integration_secrets').delete().eq('connection_id', target.id);
  if (secretError) {
    console.error('Connection credential removal failed:', secretError.message);
    return NextResponse.json({ error: 'Unable to remove stored connection credentials.' }, { status: 500 });
  }

  const { error: updateError } = await admin
    .from('integration_connections')
    .update({
      status: 'disconnected',
      last_error: null,
      config: {
        ...config,
        removed_from_connections_ui: true,
        removed_at: now,
        removed_by: actor.user.id,
      },
      updated_at: now,
    })
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', target.id);

  if (updateError) {
    console.error('Failed to remove integration connection:', updateError.message);
    return NextResponse.json({ error: 'Unable to remove connection.' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    removedId: target.id,
    display_name: target.display_name,
    historyPreserved: true,
  });
}
