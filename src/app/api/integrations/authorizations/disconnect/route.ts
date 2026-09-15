import { NextResponse } from 'next/server';
import { z } from 'zod';
import { uuidSchema } from '@/lib/validation';
import { getApiActor, isManagement } from '@/lib/auth/api-actor';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const META_PROVIDERS = new Set(['facebook', 'instagram', 'whatsapp']);
const DisconnectSchema = z.object({
  authorizationIds: z.array(uuidSchema).min(1).max(10),
});

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isAuthorizationContainer(config: Record<string, unknown>) {
  if (config.authorization_container === true || config.legacy_container === true) return true;
  if (config.hidden_from_account_picker !== true) return false;
  return Array.isArray(config.discovered_accounts)
    || Array.isArray(config.pages)
    || Array.isArray(config.whatsapp_business_accounts)
    || Array.isArray(config.advertisers);
}

export async function POST(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!isManagement(actor.profile)) {
    return NextResponse.json({ error: 'Workspace manager access is required.' }, { status: 403 });
  }

  const parsed = DisconnectSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'A valid authorization profile is required.' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const ids = Array.from(new Set(parsed.data.authorizationIds));
  const { data: authorizations, error: authorizationError } = await admin
    .from('integration_connections')
    .select('id,workspace_id,provider,config')
    .eq('workspace_id', actor.profile.workspace_id)
    .in('id', ids);

  if (authorizationError) {
    console.error('Authorization disconnect lookup failed:', authorizationError.message);
    return NextResponse.json({ error: 'Unable to disconnect this authorization.' }, { status: 500 });
  }

  if (!authorizations || authorizations.length !== ids.length) {
    return NextResponse.json({ error: 'Authorization profile was not found in this workspace.' }, { status: 404 });
  }

  for (const authorization of authorizations) {
    if (!isAuthorizationContainer(asRecord(authorization.config))) {
      return NextResponse.json({ error: 'One of the selected records is not an authorization profile.' }, { status: 400 });
    }
  }

  const identityIds = authorizations
    .filter((authorization) => META_PROVIDERS.has(authorization.provider))
    .map((authorization) => {
      const config = asRecord(authorization.config);
      const identity = asRecord(config.identity);
      return typeof identity.id === 'string' ? identity.id.trim() : '';
    })
    .filter(Boolean);

  const { data: workspaceConnections, error: childLookupError } = await admin
    .from('integration_connections')
    .select('id,provider,config')
    .eq('workspace_id', actor.profile.workspace_id);

  if (childLookupError) {
    console.error('Authorization child lookup failed:', childLookupError.message);
    return NextResponse.json({ error: 'Unable to disconnect linked channel accounts.' }, { status: 500 });
  }

  const childIds = (workspaceConnections || [])
    .filter((connection) => {
      if (ids.includes(connection.id)) return false;
      const config = asRecord(connection.config);
      const authId = config.authorization_id || config.legacy_parent_id;
      if (typeof authId === 'string' && ids.includes(authId)) return true;
      if (!META_PROVIDERS.has(connection.provider)) return false;
      const childIdentityId = asRecord(config.identity).id;
      return typeof childIdentityId === 'string' && identityIds.includes(childIdentityId);
    })
    .map((connection) => connection.id);

  const now = new Date().toISOString();
  if (childIds.length > 0) {
    const { error: childUpdateError } = await admin
      .from('integration_connections')
      .update({ status: 'disconnected', last_error: null, updated_at: now })
      .eq('workspace_id', actor.profile.workspace_id)
      .in('id', childIds);
    if (childUpdateError) {
      console.error('Authorization child disconnect failed:', childUpdateError.message);
      return NextResponse.json({ error: 'Unable to disconnect linked channel accounts.' }, { status: 500 });
    }
  }

  for (const authorization of authorizations) {
    const config = asRecord(authorization.config);
    const { error: parentUpdateError } = await admin
      .from('integration_connections')
      .update({
        status: 'disconnected',
        last_error: null,
        last_sync_at: now,
        config: {
          ...config,
          selected_account_ids: [],
          disconnected_at: now,
        },
        updated_at: now,
      })
      .eq('workspace_id', actor.profile.workspace_id)
      .eq('id', authorization.id);
    if (parentUpdateError) {
      console.error('Authorization profile disconnect failed:', parentUpdateError.message);
      return NextResponse.json({ error: 'Unable to disconnect the authorization profile.' }, { status: 500 });
    }
  }

  const secretIds = [...ids, ...childIds];
  if (secretIds.length > 0) {
    const { error: secretError } = await admin
      .from('integration_secrets')
      .delete()
      .in('connection_id', secretIds);
    if (secretError) {
      console.error('Authorization credential cleanup failed:', secretError.message);
      return NextResponse.json({ error: 'Accounts were disconnected, but credential cleanup failed.' }, { status: 500 });
    }
  }

  return NextResponse.json({
    disconnectedAuthorizations: ids.length,
    disconnectedAccounts: childIds.length,
  });
}
