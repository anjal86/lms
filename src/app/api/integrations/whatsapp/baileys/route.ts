import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor, isManagement } from '@/lib/auth/api-actor';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getProvider } from '@/lib/integrations/catalog';
import { whatsappBridgeRequest } from '@/lib/integrations/whatsapp-baileys';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ConnectSchema = z.object({
  displayName: z.string().trim().min(2).max(120).optional(),
  connectionId: uuidSchema.optional(),
  visibilityScope: z.enum(['personal', 'workspace']).optional(),
});

type BridgeStatus = {
  instanceId: string;
  status: string;
  connected?: boolean;
  phone?: string | null;
  qrDataUrl?: string | null;
  lastError?: string | null;
};

type ConnectionRow = {
  id: string;
  workspace_id: string | null;
  provider: string;
  display_name: string;
  external_account_id: string | null;
  status: string;
  capabilities: unknown;
  config: unknown;
  connected_by: string | null;
  visibility_scope: 'personal' | 'workspace';
  last_event_at: string | null;
  last_error: string | null;
};

const CONNECTION_SELECT = 'id,workspace_id,provider,display_name,external_account_id,status,capabilities,config,connected_by,visibility_scope,last_event_at,last_error';

function isBaileysConnection(connection: { config?: unknown }) {
  const config = connection.config && typeof connection.config === 'object' && !Array.isArray(connection.config)
    ? connection.config as Record<string, unknown>
    : {};
  return config.transport === 'baileys';
}

function canViewConnection(connection: ConnectionRow, userId: string, management: boolean) {
  return management || connection.visibility_scope === 'workspace' || connection.connected_by === userId;
}

function canManageConnection(connection: ConnectionRow, userId: string, management: boolean) {
  return management || connection.connected_by === userId;
}

async function listWorkspaceConnections(workspaceId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('integration_connections')
    .select(CONNECTION_SELECT)
    .eq('workspace_id', workspaceId)
    .eq('provider', 'whatsapp')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return ((data || []) as ConnectionRow[]).filter(isBaileysConnection);
}

async function syncConnectionStatus(connectionId: string, bridge: BridgeStatus) {
  const admin = createSupabaseAdminClient();
  const status = bridge.status === 'connected'
    ? 'connected'
    : bridge.status === 'qr' || bridge.status === 'connecting'
      ? 'pending'
      : bridge.status === 'disconnected'
        ? 'disconnected'
        : 'needs_attention';
  const patch: Record<string, unknown> = {
    status,
    last_error: bridge.lastError || null,
  };
  if (bridge.phone) patch.external_account_id = bridge.phone;
  if (bridge.status === 'connected') patch.last_sync_at = new Date().toISOString();
  await admin.from('integration_connections').update(patch).eq('id', connectionId);
}

async function bridgeStatus(connection: ConnectionRow) {
  try {
    const bridge = await whatsappBridgeRequest<BridgeStatus>(`/instances/${connection.id}/status`);
    await syncConnectionStatus(connection.id, bridge);
    return bridge;
  } catch (error) {
    return {
      instanceId: connection.id,
      status: 'error',
      connected: false,
      lastError: error instanceof Error ? error.message : 'WhatsApp bridge is unavailable.',
    } satisfies BridgeStatus;
  }
}

export async function POST(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  const raw = await request.json().catch(() => ({}));
  const parsed = ConnectSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid WhatsApp connection details.' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const provider = getProvider('whatsapp');
  if (!provider) return NextResponse.json({ error: 'WhatsApp provider is unavailable.' }, { status: 500 });

  const management = isManagement(actor.profile);
  const workspaceId = actor.profile.workspace_id;
  const userId = actor.user.id;
  let connection: ConnectionRow | null = null;

  if (parsed.data.connectionId) {
    const { data, error } = await admin
      .from('integration_connections')
      .select(CONNECTION_SELECT)
      .eq('id', parsed.data.connectionId)
      .eq('workspace_id', workspaceId)
      .eq('provider', 'whatsapp')
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data || !isBaileysConnection(data as ConnectionRow)) {
      return NextResponse.json({ error: 'WhatsApp linked-device connection not found.' }, { status: 404 });
    }

    connection = data as ConnectionRow;
    if (!canManageConnection(connection, userId, management)) {
      return NextResponse.json({ error: 'You can only reconnect your own WhatsApp account.' }, { status: 403 });
    }

    await admin
      .from('integration_connections')
      .update({ status: 'pending', last_error: null })
      .eq('id', connection.id);
  } else {
    const id = randomUUID();
    const visibilityScope = management ? parsed.data.visibilityScope || 'personal' : 'personal';
    const { data, error } = await admin
      .from('integration_connections')
      .insert({
        id,
        workspace_id: workspaceId,
        provider: 'whatsapp',
        display_name: parsed.data.displayName || 'My WhatsApp',
        external_account_id: null,
        status: 'pending',
        capabilities: provider.capabilities,
        config: { transport: 'baileys', instance_id: id, mode: 'linked_device' },
        connected_by: userId,
        visibility_scope: visibilityScope,
      })
      .select(CONNECTION_SELECT)
      .single();

    if (error || !data) {
      console.error('Baileys WhatsApp connection create failed:', error?.message);
      return NextResponse.json({ error: 'Unable to create the WhatsApp linked-device connection.' }, { status: 500 });
    }
    connection = data as ConnectionRow;
  }

  try {
    const bridge = await whatsappBridgeRequest<BridgeStatus>(`/instances/${connection.id}/connect`, {
      method: 'POST',
      body: '{}',
    });
    await syncConnectionStatus(connection.id, bridge);
    return NextResponse.json({
      connection: {
        ...connection,
        status: bridge.connected ? 'connected' : 'pending',
        can_manage: true,
        is_owner: connection.connected_by === userId,
      },
      bridge,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'WhatsApp bridge is unavailable.';
    await admin
      .from('integration_connections')
      .update({ status: 'needs_attention', last_error: message })
      .eq('id', connection.id);
    return NextResponse.json({ error: message, connection }, { status: 503 });
  }
}

export async function GET(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  const idParam = new URL(request.url).searchParams.get('id');
  if (idParam && !uuidSchema.safeParse(idParam).success) {
    return NextResponse.json({ error: 'Invalid connection ID.' }, { status: 400 });
  }

  const management = isManagement(actor.profile);
  const userId = actor.user.id;
  let connections: ConnectionRow[];
  try {
    connections = await listWorkspaceConnections(actor.profile.workspace_id);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load WhatsApp accounts.' }, { status: 500 });
  }

  connections = connections.filter((item) => canViewConnection(item, userId, management));
  if (idParam) connections = connections.filter((item) => item.id === idParam);

  const hydrated = await Promise.all(connections.map(async (connection) => ({
    ...connection,
    can_manage: canManageConnection(connection, userId, management),
    is_owner: connection.connected_by === userId,
    bridge: await bridgeStatus(connection),
  })));

  const first = hydrated[0] || null;
  return NextResponse.json({
    connections: hydrated,
    connection: first,
    bridge: first?.bridge || null,
  });
}

export async function DELETE(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  const id = new URL(request.url).searchParams.get('id');
  if (!id || !uuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid connection ID.' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('integration_connections')
    .select(CONNECTION_SELECT)
    .eq('id', id)
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('provider', 'whatsapp')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || !isBaileysConnection(data as ConnectionRow)) {
    return NextResponse.json({ error: 'WhatsApp linked-device connection not found.' }, { status: 404 });
  }

  const connection = data as ConnectionRow;
  if (!canManageConnection(connection, actor.user.id, isManagement(actor.profile))) {
    return NextResponse.json({ error: 'You can only disconnect your own WhatsApp account.' }, { status: 403 });
  }

  try {
    await whatsappBridgeRequest(`/instances/${id}/session`, { method: 'DELETE' });
  } catch (bridgeError) {
    console.warn('Unable to log out Baileys bridge session:', bridgeError instanceof Error ? bridgeError.message : bridgeError);
  }

  await admin
    .from('integration_connections')
    .update({ status: 'disconnected', external_account_id: null, last_error: null })
    .eq('id', id);
  return NextResponse.json({ ok: true, id, status: 'disconnected' });
}
