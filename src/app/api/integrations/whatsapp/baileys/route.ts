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
});

type BridgeStatus = {
  instanceId: string;
  status: string;
  connected?: boolean;
  phone?: string | null;
  qrDataUrl?: string | null;
  lastError?: string | null;
};

function isBaileysConnection(connection: { config?: unknown }) {
  const config = connection.config && typeof connection.config === 'object' && !Array.isArray(connection.config)
    ? connection.config as Record<string, unknown>
    : {};
  return config.transport === 'baileys';
}

async function managementActor(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor;
  if (!isManagement(actor.profile)) {
    return { error: NextResponse.json({ error: 'Manager access is required.' }, { status: 403 }) } as const;
  }
  return actor;
}

async function findConnection(id?: string | null) {
  const admin = createSupabaseAdminClient();
  if (id) {
    const { data } = await admin
      .from('integration_connections')
      .select('id,provider,display_name,external_account_id,status,capabilities,config,last_event_at,last_error')
      .eq('id', id)
      .eq('provider', 'whatsapp')
      .maybeSingle();
    return data && isBaileysConnection(data) ? data : null;
  }

  const { data } = await admin
    .from('integration_connections')
    .select('id,provider,display_name,external_account_id,status,capabilities,config,last_event_at,last_error')
    .eq('provider', 'whatsapp')
    .order('created_at', { ascending: false });
  return (data || []).find(isBaileysConnection) || null;
}

async function syncConnectionStatus(connectionId: string, bridge: BridgeStatus) {
  const admin = createSupabaseAdminClient();
  const status = bridge.status === 'connected'
    ? 'connected'
    : bridge.status === 'qr' || bridge.status === 'connecting'
      ? 'pending'
      : 'needs_attention';
  const patch: Record<string, unknown> = {
    status,
    last_error: bridge.lastError || null,
  };
  if (bridge.phone) patch.external_account_id = bridge.phone;
  if (bridge.status === 'connected') patch.last_sync_at = new Date().toISOString();
  await admin.from('integration_connections').update(patch).eq('id', connectionId);
}

export async function POST(request: Request) {
  const actor = await managementActor(request);
  if ('error' in actor) return actor.error;

  const raw = await request.json().catch(() => ({}));
  const parsed = ConnectSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid WhatsApp connection details.' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const provider = getProvider('whatsapp');
  if (!provider) return NextResponse.json({ error: 'WhatsApp provider is unavailable.' }, { status: 500 });

  let connection = await findConnection();
  if (!connection) {
    const id = randomUUID();
    const { data, error } = await admin
      .from('integration_connections')
      .insert({
        id,
        provider: 'whatsapp',
        display_name: parsed.data.displayName || 'WhatsApp Business — Linked Device',
        external_account_id: null,
        status: 'pending',
        capabilities: provider.capabilities,
        config: { transport: 'baileys', instance_id: id, mode: 'linked_device' },
        connected_by: actor.user.id,
      })
      .select('id,provider,display_name,external_account_id,status,capabilities,config,last_event_at,last_error')
      .single();
    if (error || !data) {
      console.error('Baileys WhatsApp connection create failed:', error?.message);
      return NextResponse.json({ error: 'Unable to create the WhatsApp linked-device connection.' }, { status: 500 });
    }
    connection = data;
  } else {
    await admin
      .from('integration_connections')
      .update({ status: 'pending', last_error: null, connected_by: actor.user.id })
      .eq('id', connection.id);
  }

  try {
    const bridge = await whatsappBridgeRequest<BridgeStatus>(`/instances/${connection.id}/connect`, { method: 'POST', body: '{}' });
    await syncConnectionStatus(connection.id, bridge);
    return NextResponse.json({ connection: { ...connection, status: bridge.connected ? 'connected' : 'pending' }, bridge }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'WhatsApp bridge is unavailable.';
    await admin.from('integration_connections').update({ status: 'needs_attention', last_error: message }).eq('id', connection.id);
    return NextResponse.json({ error: message, connection }, { status: 503 });
  }
}

export async function GET(request: Request) {
  const actor = await managementActor(request);
  if ('error' in actor) return actor.error;

  const idParam = new URL(request.url).searchParams.get('id');
  if (idParam && !uuidSchema.safeParse(idParam).success) {
    return NextResponse.json({ error: 'Invalid connection ID.' }, { status: 400 });
  }
  const connection = await findConnection(idParam);
  if (!connection) return NextResponse.json({ connection: null, bridge: null });

  try {
    const bridge = await whatsappBridgeRequest<BridgeStatus>(`/instances/${connection.id}/status`);
    await syncConnectionStatus(connection.id, bridge);
    return NextResponse.json({ connection, bridge });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'WhatsApp bridge is unavailable.';
    return NextResponse.json({ connection, bridge: { instanceId: connection.id, status: 'error', lastError: message } }, { status: 200 });
  }
}

export async function DELETE(request: Request) {
  const actor = await managementActor(request);
  if ('error' in actor) return actor.error;
  const id = new URL(request.url).searchParams.get('id');
  if (!id || !uuidSchema.safeParse(id).success) return NextResponse.json({ error: 'Invalid connection ID.' }, { status: 400 });

  const connection = await findConnection(id);
  if (!connection) return NextResponse.json({ error: 'WhatsApp linked-device connection not found.' }, { status: 404 });

  try {
    await whatsappBridgeRequest(`/instances/${id}/session`, { method: 'DELETE' });
  } catch (error) {
    console.warn('Unable to log out Baileys bridge session:', error instanceof Error ? error.message : error);
  }

  const admin = createSupabaseAdminClient();
  await admin
    .from('integration_connections')
    .update({ status: 'disconnected', external_account_id: null, last_error: null })
    .eq('id', id);
  return NextResponse.json({ ok: true, id, status: 'disconnected' });
}
