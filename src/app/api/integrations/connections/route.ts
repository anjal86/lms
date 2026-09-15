import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor, isManagement } from '@/lib/auth/api-actor';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getProvider } from '@/lib/integrations/catalog';
import { buildIntegrationSetup, integrationCatalogWithEnvStatus, publicAppUrl } from '@/lib/integrations/environment';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ManualConnectionSchema = z.object({
  provider: z.enum(['email', 'website', 'api']),
  display_name: z.string().trim().min(2).max(120),
  external_account_id: z.string().trim().max(240).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

const PatchSchema = z.object({
  id: uuidSchema,
  action: z.enum(['pause', 'resume', 'disconnect']),
});

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function GET(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  const { data, error } = await actor.supabase
    .from('integration_connections')
    .select('id,workspace_id,provider,display_name,external_account_id,status,capabilities,config,visibility_scope,connected_by,last_sync_at,last_event_at,last_error,created_at,updated_at')
    .eq('workspace_id', actor.profile.workspace_id)
    .order('provider', { ascending: true })
    .order('display_name', { ascending: true });

  const appUrl = publicAppUrl(request.url);
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
    return config.hidden_from_account_picker !== true;
  });

  return NextResponse.json({ connections, catalog, setup, migrationRequired: false });
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
    .select('id,workspace_id')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', parsed.data.id)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: 'Connection not found.' }, { status: 404 });

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
  const { data: target } = await admin
    .from('integration_connections')
    .select('id,workspace_id,provider,display_name')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', parsed.data.id)
    .maybeSingle();

  if (!target) {
    return NextResponse.json({ error: 'Connection not found in this workspace.' }, { status: 404 });
  }

  // 1. Remove secret if present
  await admin.from('integration_secrets').delete().eq('connection_id', target.id);

  // 2. Delete the connection record
  const { error: deleteError } = await admin
    .from('integration_connections')
    .delete()
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', target.id);

  if (deleteError) {
    console.error('Failed to delete integration connection:', deleteError.message);
    return NextResponse.json({ error: 'Unable to delete connection.' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    deletedId: target.id,
    display_name: target.display_name,
  });
}
