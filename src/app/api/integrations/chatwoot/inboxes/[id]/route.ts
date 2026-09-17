import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor, isManagement } from '@/lib/auth/api-actor';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MappingSchema = z.object({
  connectionId: uuidSchema.nullable(),
});

function metadataProvider(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const provider = (value as Record<string, unknown>).crm_provider;
  return typeof provider === 'string' ? provider : null;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!isManagement(actor.profile)) {
    return NextResponse.json({ error: 'Workspace manager access is required.' }, { status: 403 });
  }

  const { id } = await context.params;
  const parsedId = uuidSchema.safeParse(id);
  const parsed = MappingSchema.safeParse(await request.json().catch(() => null));
  if (!parsedId.success || !parsed.success) {
    return NextResponse.json({ error: 'Invalid Chatwoot inbox mapping request.' }, { status: 400 });
  }

  const { data: inbox, error: inboxError } = await actor.supabase
    .from('chatwoot_inboxes')
    .select('id,workspace_id,chatwoot_inbox_id,name,channel_type,status,metadata,integration_connection_id')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', parsedId.data)
    .maybeSingle();

  if (inboxError) {
    console.error('Chatwoot inbox mapping lookup failed:', inboxError.message);
    return NextResponse.json({ error: 'Unable to load Chatwoot inbox.' }, { status: 500 });
  }
  if (!inbox) return NextResponse.json({ error: 'Chatwoot inbox not found.' }, { status: 404 });
  if (inbox.status !== 'active' && parsed.data.connectionId) {
    return NextResponse.json({ error: 'A disabled Chatwoot inbox cannot be mapped.' }, { status: 409 });
  }

  if (parsed.data.connectionId) {
    const { data: connection, error: connectionError } = await actor.supabase
      .from('integration_connections')
      .select('id,provider,display_name,external_account_id,status')
      .eq('workspace_id', actor.profile.workspace_id)
      .eq('id', parsed.data.connectionId)
      .maybeSingle();

    if (connectionError) {
      console.error('CRM connection mapping lookup failed:', connectionError.message);
      return NextResponse.json({ error: 'Unable to load CRM channel connection.' }, { status: 500 });
    }
    if (!connection) return NextResponse.json({ error: 'CRM channel connection not found.' }, { status: 404 });
    if (connection.status === 'disconnected' || connection.status === 'disabled') {
      return NextResponse.json({ error: 'Connect or enable the CRM channel before mapping it to Chatwoot.' }, { status: 409 });
    }

    const expectedProvider = metadataProvider(inbox.metadata);
    const comparableProviders = new Set(['facebook', 'instagram', 'whatsapp', 'tiktok', 'email', 'website', 'api']);
    if (expectedProvider && comparableProviders.has(expectedProvider) && connection.provider !== expectedProvider) {
      return NextResponse.json(
        { error: `This Chatwoot inbox is ${expectedProvider}, but the selected CRM connection is ${connection.provider}.` },
        { status: 400 }
      );
    }
  }

  const admin = createSupabaseAdminClient();
  const { data: updated, error: updateError } = await admin
    .from('chatwoot_inboxes')
    .update({
      integration_connection_id: parsed.data.connectionId,
      traffic_mode: 'shadow',
      updated_at: new Date().toISOString(),
    })
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', parsedId.data)
    .select('id,workspace_id,chatwoot_account_link_id,integration_connection_id,chatwoot_inbox_id,name,channel_type,status,traffic_mode,metadata,last_synced_at,created_at,updated_at')
    .single();

  if (updateError) {
    if (updateError.code === '23505') {
      return NextResponse.json({ error: 'That CRM channel is already mapped to another Chatwoot inbox.' }, { status: 409 });
    }
    console.error('Chatwoot inbox mapping update failed:', updateError.message);
    return NextResponse.json({ error: 'Unable to save Chatwoot inbox mapping.' }, { status: 500 });
  }

  return NextResponse.json({ inbox: updated });
}
