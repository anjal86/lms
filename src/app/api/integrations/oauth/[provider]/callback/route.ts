import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getProvider, type IntegrationProvider } from '@/lib/integrations/catalog';
import { integrationEnvStatus, publicAppUrl } from '@/lib/integrations/environment';
import { encryptIntegrationSecret, encryptSecretPayload } from '@/lib/integrations/secrets';

export const runtime = 'nodejs';

type OAuthCookie = { state: string; provider: string; userId: string };

type MetaPage = {
  id: string;
  name?: string;
  access_token?: string;
  instagram_business_account?: { id: string; username?: string; name?: string };
};

type WhatsAppPhone = {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  code_verification_status?: string;
};

type WorkspaceProfile = {
  role: string;
  is_active: boolean;
  workspace_id: string | null;
};

function redirectWith(appUrl: string, key: 'connected' | 'error', value: string) {
  const target = new URL('/connections', appUrl);
  target.searchParams.set(key, value);
  return NextResponse.redirect(target);
}

function parseCookie(value: string | undefined): OAuthCookie | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<OAuthCookie>;
    if (!parsed.state || !parsed.provider || !parsed.userId) return null;
    return parsed as OAuthCookie;
  } catch {
    return null;
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
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

async function saveConnection(input: {
  provider: IntegrationProvider;
  workspaceId: string;
  displayName: string;
  externalAccountId: string;
  capabilities: string[];
  config: Record<string, unknown>;
  userId: string;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
  secretPayload?: Record<string, unknown>;
}) {
  const admin = createSupabaseAdminClient();
  const { data: existing, error: existingError } = await admin
    .from('integration_connections')
    .select('id,workspace_id')
    .eq('provider', input.provider)
    .eq('external_account_id', input.externalAccountId)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing?.workspace_id && existing.workspace_id !== input.workspaceId) {
    throw new Error(`${input.provider} account ${input.externalAccountId} is already connected to another workspace.`);
  }

  const connectionPatch = {
    workspace_id: input.workspaceId,
    provider: input.provider,
    display_name: input.displayName,
    external_account_id: input.externalAccountId,
    status: 'connected',
    capabilities: input.capabilities,
    config: input.config,
    connected_by: input.userId,
    visibility_scope: 'workspace',
    last_sync_at: new Date().toISOString(),
    last_error: null,
  };

  let connectionId: string;
  if (existing?.id) {
    const { data, error } = await admin
      .from('integration_connections')
      .update(connectionPatch)
      .eq('workspace_id', input.workspaceId)
      .eq('id', existing.id)
      .select('id')
      .single();
    if (error) throw error;
    connectionId = data.id;
  } else {
    const { data, error } = await admin
      .from('integration_connections')
      .insert(connectionPatch)
      .select('id')
      .single();
    if (error) throw error;
    connectionId = data.id;
  }

  const { error: secretError } = await admin.from('integration_secrets').upsert({
    connection_id: connectionId,
    access_token: encryptIntegrationSecret(input.accessToken),
    refresh_token: encryptIntegrationSecret(input.refreshToken),
    token_expires_at: input.expiresAt || null,
    secret_payload: encryptSecretPayload(input.secretPayload || {}),
    updated_at: new Date().toISOString(),
  });
  if (secretError) throw secretError;
  return connectionId;
}

async function completeMeta(
  provider: IntegrationProvider,
  code: string,
  callbackUrl: string,
  userId: string,
  workspaceId: string
) {
  const definition = getProvider(provider);
  if (!definition) throw new Error('Unsupported Meta product.');
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  if (!appId || !appSecret) throw new Error('Meta app credentials are not configured.');
  const version = process.env.META_GRAPH_VERSION?.trim() || 'v26.0';

  const tokenUrl = new URL(`https://graph.facebook.com/${version}/oauth/access_token`);
  tokenUrl.searchParams.set('client_id', appId);
  tokenUrl.searchParams.set('client_secret', appSecret);
  tokenUrl.searchParams.set('redirect_uri', callbackUrl);
  tokenUrl.searchParams.set('code', code);
  const token = await fetchJson(tokenUrl) as { access_token?: string; expires_in?: number };
  if (!token.access_token) throw new Error('Meta did not return an access token.');

  const identityUrl = new URL(`https://graph.facebook.com/${version}/me`);
  identityUrl.searchParams.set('fields', 'id,name');
  identityUrl.searchParams.set('access_token', token.access_token);
  const identity = await fetchJson(identityUrl) as { id: string; name?: string };
  const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null;

  if (provider === 'facebook' || provider === 'instagram') {
    const pagesUrl = new URL(`https://graph.facebook.com/${version}/me/accounts`);
    pagesUrl.searchParams.set('fields', 'id,name,access_token,instagram_business_account{id,username,name}');
    pagesUrl.searchParams.set('limit', '100');
    pagesUrl.searchParams.set('access_token', token.access_token);
    const pagePayload = await fetchJson(pagesUrl) as { data?: MetaPage[] };
    const pages = pagePayload.data || [];
    let saved = 0;

    for (const page of pages) {
      if (!page.access_token) continue;
      const instagram = page.instagram_business_account;
      if (provider === 'instagram' && !instagram?.id) continue;

      const fields = provider === 'facebook'
        ? 'leadgen,messages,messaging_postbacks'
        : 'messages,messaging_postbacks';
      let subscribed = false;
      try {
        const subscribeUrl = new URL(`https://graph.facebook.com/${version}/${page.id}/subscribed_apps`);
        subscribeUrl.searchParams.set('subscribed_fields', fields);
        subscribeUrl.searchParams.set('access_token', page.access_token);
        await fetchJson(subscribeUrl, { method: 'POST' });
        subscribed = true;
      } catch (error) {
        console.warn(`${provider} subscription failed for page ${page.id}:`, error);
      }

      const publicPage: MetaPage = {
        id: page.id,
        name: page.name,
        ...(instagram ? { instagram_business_account: instagram } : {}),
      };
      const externalAccountId = provider === 'facebook' ? page.id : instagram!.id;
      const displayName = provider === 'facebook'
        ? `Facebook — ${page.name || page.id}`
        : `Instagram — ${instagram?.username ? `@${instagram.username}` : instagram?.name || instagram?.id}`;

      await saveConnection({
        provider,
        workspaceId,
        displayName,
        externalAccountId,
        capabilities: definition.capabilities,
        config: {
          transport: 'meta',
          graph_version: version,
          identity: { id: identity.id, name: identity.name || null },
          page_id: page.id,
          page_name: page.name || null,
          instagram_business_account_id: instagram?.id || null,
          instagram_username: instagram?.username || null,
          pages: [publicPage],
          subscriptions: [{ id: page.id, ok: subscribed, fields }],
          connected_at: new Date().toISOString(),
        },
        userId,
        accessToken: page.access_token,
        expiresAt,
        secretPayload: {
          page_access_tokens: [{ id: page.id, access_token: page.access_token }],
          oauth_user_id: identity.id,
        },
      });
      saved += 1;
    }

    if (saved === 0) {
      throw new Error(provider === 'facebook'
        ? 'No Facebook Page with the required access was found.'
        : 'No Instagram Business account with the required access was found.');
    }
    return saved;
  }

  if (provider === 'whatsapp') {
    const businessUrl = new URL(`https://graph.facebook.com/${version}/me/businesses`);
    businessUrl.searchParams.set('fields', 'id,name');
    businessUrl.searchParams.set('limit', '50');
    businessUrl.searchParams.set('access_token', token.access_token);
    const businessPayload = await fetchJson(businessUrl) as { data?: Array<{ id: string; name?: string }> };
    const businesses = businessPayload.data || [];
    let saved = 0;

    for (const business of businesses.slice(0, 20)) {
      const wabaUrl = new URL(`https://graph.facebook.com/${version}/${business.id}/owned_whatsapp_business_accounts`);
      wabaUrl.searchParams.set('fields', 'id,name');
      wabaUrl.searchParams.set('access_token', token.access_token);
      let wabas: Array<{ id: string; name?: string }> = [];
      try {
        const wabaPayload = await fetchJson(wabaUrl) as { data?: Array<{ id: string; name?: string }> };
        wabas = wabaPayload.data || [];
      } catch (error) {
        console.warn(`WhatsApp account discovery failed for business ${business.id}:`, error);
        continue;
      }

      for (const waba of wabas) {
        try {
          const subscribeUrl = new URL(`https://graph.facebook.com/${version}/${waba.id}/subscribed_apps`);
          subscribeUrl.searchParams.set('access_token', token.access_token);
          await fetchJson(subscribeUrl, { method: 'POST' });
        } catch (error) {
          console.warn(`WhatsApp subscription failed for WABA ${waba.id}:`, error);
        }

        const phoneUrl = new URL(`https://graph.facebook.com/${version}/${waba.id}/phone_numbers`);
        phoneUrl.searchParams.set('fields', 'id,display_phone_number,verified_name,quality_rating,code_verification_status');
        phoneUrl.searchParams.set('access_token', token.access_token);
        let phoneNumbers: WhatsAppPhone[] = [];
        try {
          const phonePayload = await fetchJson(phoneUrl) as { data?: WhatsAppPhone[] };
          phoneNumbers = phonePayload.data || [];
        } catch (error) {
          console.warn(`WhatsApp phone discovery failed for WABA ${waba.id}:`, error);
        }

        for (const phone of phoneNumbers) {
          await saveConnection({
            provider: 'whatsapp',
            workspaceId,
            displayName: `WhatsApp — ${phone.verified_name || phone.display_phone_number || phone.id}`,
            externalAccountId: phone.id,
            capabilities: definition.capabilities,
            config: {
              transport: 'cloud',
              graph_version: version,
              identity: { id: identity.id, name: identity.name || null },
              business_id: business.id,
              business_name: business.name || null,
              waba_id: waba.id,
              waba_name: waba.name || null,
              phone_number_id: phone.id,
              display_phone_number: phone.display_phone_number || null,
              verified_name: phone.verified_name || null,
              whatsapp_business_accounts: [{
                id: waba.id,
                name: waba.name || null,
                business_id: business.id,
                phone_numbers: [phone],
              }],
              connected_at: new Date().toISOString(),
            },
            userId,
            accessToken: token.access_token,
            expiresAt,
            secretPayload: { oauth_user_id: identity.id },
          });
          saved += 1;
        }
      }
    }

    if (saved === 0) throw new Error('No WhatsApp Business phone number was found for this Meta account.');
    return saved;
  }

  throw new Error('Unsupported Meta product.');
}

async function completeTikTok(code: string, userId: string, workspaceId: string) {
  const definition = getProvider('tiktok');
  if (!definition) throw new Error('TikTok provider is unavailable.');
  const appId = process.env.TIKTOK_APP_ID?.trim();
  const secret = process.env.TIKTOK_APP_SECRET?.trim();
  if (!appId || !secret) throw new Error('TikTok app credentials are not configured.');

  const tokenPayload = await fetchJson('https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, secret, auth_code: code }),
  }) as {
    code?: number;
    message?: string;
    data?: { access_token?: string; refresh_token?: string; advertiser_ids?: string[]; scope?: string; expires_in?: number };
  };

  if (tokenPayload.code && tokenPayload.code !== 0) throw new Error(tokenPayload.message || 'TikTok authorization failed.');
  const token = tokenPayload.data || {};
  if (!token.access_token) throw new Error('TikTok did not return an access token.');
  const advertiserIds = token.advertiser_ids || [];
  if (advertiserIds.length === 0) throw new Error('No TikTok advertiser account was returned by authorization.');

  let advertisers: unknown[] = [];
  try {
    const advertiserUrl = new URL('https://business-api.tiktok.com/open_api/v1.3/oauth2/advertiser/get/');
    advertiserUrl.searchParams.set('app_id', appId);
    advertiserUrl.searchParams.set('secret', secret);
    const advertiserPayload = await fetchJson(advertiserUrl, { headers: { 'Access-Token': token.access_token } }) as { data?: { list?: unknown[] } | unknown[] };
    advertisers = Array.isArray(advertiserPayload.data) ? advertiserPayload.data : advertiserPayload.data?.list || [];
  } catch (error) {
    console.warn('TikTok advertiser discovery was unavailable:', error);
  }

  const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null;
  for (const advertiserId of advertiserIds) {
    const advertiser = advertisers.map(record).find((item) =>
      String(item.advertiser_id || item.id || '') === advertiserId
    );
    const advertiserName = typeof advertiser?.advertiser_name === 'string'
      ? advertiser.advertiser_name
      : typeof advertiser?.name === 'string'
        ? advertiser.name
        : advertiserId;

    await saveConnection({
      provider: 'tiktok',
      workspaceId,
      displayName: `TikTok Ads — ${advertiserName}`,
      externalAccountId: advertiserId,
      capabilities: definition.capabilities,
      config: {
        transport: 'tiktok_business',
        advertiser_id: advertiserId,
        advertiser_ids: [advertiserId],
        advertisers: advertiser ? [advertiser] : [],
        scope: token.scope || null,
        connected_at: new Date().toISOString(),
      },
      userId,
      accessToken: token.access_token,
      refreshToken: token.refresh_token || null,
      expiresAt,
    });
  }

  return advertiserIds.length;
}

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider: rawProvider } = await context.params;
  const provider = rawProvider as IntegrationProvider;
  const definition = getProvider(provider);
  const appUrl = publicAppUrl(request.url);
  if (!definition || !['meta_oauth', 'tiktok_oauth'].includes(definition.connectMode)) {
    return redirectWith(appUrl, 'error', 'unsupported_provider');
  }
  const envStatus = integrationEnvStatus(definition);
  if (!envStatus.configured) {
    return redirectWith(appUrl, 'error', definition.connectMode === 'meta_oauth' ? 'meta_not_configured' : 'tiktok_not_configured');
  }

  const url = new URL(request.url);
  const state = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || url.searchParams.get('auth_code') || '';
  const providerError = url.searchParams.get('error') || url.searchParams.get('error_reason');
  const cookieHeader = request.headers.get('cookie') || '';
  const cookieValue = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith('wanderlust_integration_oauth='))?.slice('wanderlust_integration_oauth='.length);
  const oauthCookie = parseCookie(cookieValue ? decodeURIComponent(cookieValue) : undefined);

  if (providerError) return redirectWith(appUrl, 'error', `${provider}_authorization_cancelled`);
  if (!oauthCookie || oauthCookie.provider !== provider || oauthCookie.state !== state || !code) {
    return redirectWith(appUrl, 'error', 'invalid_oauth_state');
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== oauthCookie.userId) return redirectWith(appUrl, 'error', 'session_expired');
  const { data: profile } = await supabase
    .from('profiles')
    .select('role,is_active,workspace_id')
    .eq('id', user.id)
    .maybeSingle() as { data: WorkspaceProfile | null };
  if (!profile?.is_active || !['admin', 'manager'].includes(profile.role)) return redirectWith(appUrl, 'error', 'forbidden');
  if (!profile.workspace_id) return redirectWith(appUrl, 'error', 'workspace_missing');

  const callbackUrl = `${appUrl}/api/integrations/oauth/${provider}/callback`;
  try {
    if (definition.connectMode === 'meta_oauth') {
      await completeMeta(provider, code, callbackUrl, user.id, profile.workspace_id);
    } else {
      await completeTikTok(code, user.id, profile.workspace_id);
    }
    const response = redirectWith(appUrl, 'connected', provider);
    response.cookies.delete('wanderlust_integration_oauth');
    return response;
  } catch (error) {
    console.error(`${provider} OAuth callback failed:`, error);
    const response = redirectWith(appUrl, 'error', `${provider}_connection_failed`);
    response.cookies.delete('wanderlust_integration_oauth');
    return response;
  }
}
