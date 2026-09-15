import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor, isManagement } from '@/lib/auth/api-actor';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getProvider, type IntegrationProvider } from '@/lib/integrations/catalog';
import { decryptIntegrationSecret, decryptSecretPayload, encryptIntegrationSecret, encryptSecretPayload } from '@/lib/integrations/secrets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const uuid = z.string().uuid();
const SelectionSchema = z.object({
  authorizationId: uuid,
  accountIds: z.array(z.string().trim().min(1).max(240)).min(1).max(50),
});

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asAccounts(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(asRecord).filter((item) => typeof item.id === 'string' && item.id);
}

async function fetchJson(url: string | URL, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `Provider request failed (${response.status}).`;
    throw new Error(message);
  }
  return payload;
}

async function authorizationForWorkspace(authorizationId: string, workspaceId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('integration_connections')
    .select('id,workspace_id,provider,display_name,external_account_id,status,config,connected_by')
    .eq('id', authorizationId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const config = asRecord(data.config);
  if (config.authorization_container !== true || config.hidden_from_account_picker !== true) return null;
  return { ...data, config };
}

function accountDisplayName(provider: IntegrationProvider, account: Record<string, unknown>) {
  const name = typeof account.name === 'string' && account.name.trim() ? account.name.trim() : String(account.id || 'Account');
  if (provider === 'facebook') return `Facebook — ${name}`;
  if (provider === 'instagram') return `Instagram — ${name}`;
  if (provider === 'whatsapp') return `WhatsApp — ${name}`;
  if (provider === 'tiktok') return `TikTok Ads — ${name}`;
  return name;
}

function childConfig(provider: IntegrationProvider, account: Record<string, unknown>, authorizationId: string, parentConfig: Record<string, unknown>) {
  const common = {
    authorization_id: authorizationId,
    hidden_from_account_picker: false,
    connected_at: new Date().toISOString(),
  };

  if (provider === 'facebook') {
    return {
      ...common,
      transport: 'meta',
      graph_version: parentConfig.graph_version || 'v26.0',
      identity: parentConfig.identity || null,
      page_id: account.page_id || account.id,
      page_name: account.page_name || account.name || null,
    };
  }
  if (provider === 'instagram') {
    return {
      ...common,
      transport: 'meta',
      graph_version: parentConfig.graph_version || 'v26.0',
      identity: parentConfig.identity || null,
      page_id: account.page_id || null,
      page_name: account.page_name || null,
      instagram_business_account_id: account.instagram_business_account_id || account.id,
      instagram_username: account.username || null,
    };
  }
  if (provider === 'whatsapp') {
    return {
      ...common,
      transport: 'cloud',
      graph_version: parentConfig.graph_version || 'v26.0',
      identity: parentConfig.identity || null,
      business_id: account.business_id || null,
      business_name: account.business_name || null,
      waba_id: account.waba_id || null,
      waba_name: account.waba_name || null,
      phone_number_id: account.phone_number_id || account.id,
      display_phone_number: account.display_phone_number || null,
      verified_name: account.verified_name || null,
      whatsapp_business_accounts: [{
        id: account.waba_id || null,
        name: account.waba_name || null,
        business_id: account.business_id || null,
        phone_numbers: [account],
      }],
    };
  }
  if (provider === 'tiktok') {
    return {
      ...common,
      transport: 'tiktok_business',
      advertiser_id: account.advertiser_id || account.id,
      advertiser_ids: [account.advertiser_id || account.id],
      advertisers: [account],
      scope: parentConfig.scope || null,
    };
  }
  return common;
}

async function subscribeSelectedAccount(
  provider: IntegrationProvider,
  account: Record<string, unknown>,
  accessToken: string,
  pageAccessToken: string | null,
  parentConfig: Record<string, unknown>
) {
  if (provider === 'facebook' || provider === 'instagram') {
    const pageId = String(account.page_id || '');
    if (!pageId || !pageAccessToken) throw new Error(`A Page access token is unavailable for ${account.name || pageId}.`);
    const version = typeof parentConfig.graph_version === 'string' ? parentConfig.graph_version : 'v26.0';
    const fields = provider === 'facebook' ? 'leadgen,messages,messaging_postbacks' : 'messages,messaging_postbacks';
    const url = new URL(`https://graph.facebook.com/${version}/${pageId}/subscribed_apps`);
    url.searchParams.set('subscribed_fields', fields);
    url.searchParams.set('access_token', pageAccessToken);
    await fetchJson(url, { method: 'POST' });
    return;
  }

  if (provider === 'whatsapp') {
    const wabaId = String(account.waba_id || '');
    if (!wabaId) throw new Error('WhatsApp Business Account ID is unavailable.');
    const version = typeof parentConfig.graph_version === 'string' ? parentConfig.graph_version : 'v26.0';
    const url = new URL(`https://graph.facebook.com/${version}/${wabaId}/subscribed_apps`);
    url.searchParams.set('access_token', accessToken);
    await fetchJson(url, { method: 'POST' });
  }
}

export async function GET(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!isManagement(actor.profile)) return NextResponse.json({ error: 'Workspace manager access is required.' }, { status: 403 });

  const url = new URL(request.url);
  const parsedId = uuid.safeParse(url.searchParams.get('authorization'));
  if (!parsedId.success) return NextResponse.json({ error: 'Valid authorization is required.' }, { status: 400 });

  try {
    const authorization = await authorizationForWorkspace(parsedId.data, actor.profile.workspace_id);
    if (!authorization) return NextResponse.json({ error: 'Authorization not found.' }, { status: 404 });

    const provider = authorization.provider as IntegrationProvider;
    const accounts = asAccounts(authorization.config.discovered_accounts);
    const accountIds = accounts.map((account) => String(account.id));
    const admin = createSupabaseAdminClient();
    let ownershipRows: Array<{ id: string; external_account_id: string | null; workspace_id: string; display_name: string }> = [];
    if (accountIds.length > 0) {
      const { data, error } = await admin
        .from('integration_connections')
        .select('id,external_account_id,workspace_id,display_name')
        .eq('provider', provider)
        .in('external_account_id', accountIds);
      if (error) throw error;
      ownershipRows = data || [];
    }

    const normalized = accounts.map((account) => {
      const accountId = String(account.id);
      const owner = ownershipRows.find((row) => row.external_account_id === accountId);
      return {
        ...account,
        id: accountId,
        connected: Boolean(owner && owner.workspace_id === actor.profile.workspace_id),
        unavailable: Boolean(owner && owner.workspace_id !== actor.profile.workspace_id),
        connectedWorkspace: owner?.workspace_id === actor.profile.workspace_id ? actor.profile.workspace_id : null,
      };
    });

    return NextResponse.json({
      authorization: { id: authorization.id, provider, display_name: authorization.display_name },
      accounts: normalized,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Unable to load provider authorization:', error);
    return NextResponse.json({ error: 'Unable to load available accounts.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!isManagement(actor.profile)) return NextResponse.json({ error: 'Workspace manager access is required.' }, { status: 403 });

  const parsed = SelectionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid account selection.' }, { status: 400 });

  try {
    const authorization = await authorizationForWorkspace(parsed.data.authorizationId, actor.profile.workspace_id);
    if (!authorization) return NextResponse.json({ error: 'Authorization not found.' }, { status: 404 });

    const provider = authorization.provider as IntegrationProvider;
    const definition = getProvider(provider);
    if (!definition) return NextResponse.json({ error: 'Provider is unavailable.' }, { status: 400 });

    const discovered = asAccounts(authorization.config.discovered_accounts);
    const selected = parsed.data.accountIds.map((id) => discovered.find((account) => String(account.id) === id)).filter(Boolean) as Array<Record<string, unknown>>;
    if (selected.length !== parsed.data.accountIds.length) {
      return NextResponse.json({ error: 'One or more selected accounts are no longer available.' }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data: storedSecret, error: secretError } = await admin
      .from('integration_secrets')
      .select('access_token,refresh_token,token_expires_at,secret_payload')
      .eq('connection_id', authorization.id)
      .maybeSingle();
    if (secretError) throw secretError;
    if (!storedSecret?.access_token) throw new Error('Authorization credentials are unavailable.');

    const accessToken = decryptIntegrationSecret(storedSecret.access_token);
    const refreshToken = decryptIntegrationSecret(storedSecret.refresh_token);
    if (!accessToken) throw new Error('Authorization access token is unavailable.');
    const secretPayload = asRecord(decryptSecretPayload(storedSecret.secret_payload));
    const pageTokens = Array.isArray(secretPayload.page_access_tokens)
      ? secretPayload.page_access_tokens.map(asRecord)
      : [];

    const created = [];
    for (const account of selected) {
      const accountId = String(account.id);
      const { data: existing, error: existingError } = await admin
        .from('integration_connections')
        .select('id,workspace_id,display_name')
        .eq('provider', provider)
        .eq('external_account_id', accountId)
        .maybeSingle();
      if (existingError) throw existingError;

      if (existing?.workspace_id && existing.workspace_id !== actor.profile.workspace_id) {
        return NextResponse.json({
          error: `${accountDisplayName(provider, account)} is already connected to another workspace. Disconnect or move it there first.`,
          code: 'account_owned_by_another_workspace',
          accountId,
        }, { status: 409 });
      }

      const pageId = String(account.page_id || '');
      const pageTokenRecord = pageTokens.find((item) => String(item.id || '') === pageId);
      const pageAccessToken = typeof pageTokenRecord?.access_token === 'string' ? pageTokenRecord.access_token : null;
      await subscribeSelectedAccount(provider, account, accessToken, pageAccessToken, authorization.config);

      const config = childConfig(provider, account, authorization.id, authorization.config);
      const connectionPayload = {
        workspace_id: actor.profile.workspace_id,
        provider,
        display_name: accountDisplayName(provider, account),
        external_account_id: accountId,
        status: 'connected',
        capabilities: definition.capabilities,
        config,
        connected_by: actor.user.id,
        visibility_scope: 'workspace',
        last_sync_at: new Date().toISOString(),
        last_error: null,
      };

      let connectionId: string;
      if (existing?.id) {
        const { data, error } = await admin
          .from('integration_connections')
          .update(connectionPayload)
          .eq('id', existing.id)
          .eq('workspace_id', actor.profile.workspace_id)
          .select('id')
          .single();
        if (error) throw error;
        connectionId = data.id;
      } else {
        const { data, error } = await admin
          .from('integration_connections')
          .insert(connectionPayload)
          .select('id')
          .single();
        if (error) throw error;
        connectionId = data.id;
      }

      const childAccessToken = provider === 'facebook' || provider === 'instagram'
        ? pageAccessToken
        : accessToken;
      if (!childAccessToken) throw new Error('Provider account token is unavailable.');

      const { error: childSecretError } = await admin.from('integration_secrets').upsert({
        connection_id: connectionId,
        access_token: encryptIntegrationSecret(childAccessToken),
        refresh_token: encryptIntegrationSecret(provider === 'tiktok' ? refreshToken : null),
        token_expires_at: storedSecret.token_expires_at || null,
        secret_payload: encryptSecretPayload({ authorization_id: authorization.id }),
        updated_at: new Date().toISOString(),
      });
      if (childSecretError) throw childSecretError;
      created.push({ id: connectionId, accountId, provider, display_name: connectionPayload.display_name });
    }

    const selectedIds = selected.map((account) => String(account.id));
    const alreadySelected = Array.isArray(authorization.config.selected_account_ids)
      ? authorization.config.selected_account_ids.map(String)
      : [];
    await admin
      .from('integration_connections')
      .update({
        config: {
          ...authorization.config,
          selected_account_ids: Array.from(new Set([...alreadySelected, ...selectedIds])),
        },
        last_sync_at: new Date().toISOString(),
      })
      .eq('id', authorization.id)
      .eq('workspace_id', actor.profile.workspace_id);

    return NextResponse.json({ connections: created }, { status: 201 });
  } catch (error) {
    console.error('Provider account selection failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to connect selected accounts.' }, { status: 500 });
  }
}
