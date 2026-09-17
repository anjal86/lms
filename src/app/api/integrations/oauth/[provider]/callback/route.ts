import { NextResponse } from 'next/server';
import { invalidateRedisCache } from '@/lib/redis/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getProvider, type IntegrationProvider } from '@/lib/integrations/catalog';
import { integrationEnvStatus, publicAppUrl } from '@/lib/integrations/environment';
import { encryptIntegrationSecret, encryptSecretPayload } from '@/lib/integrations/secrets';

export const runtime = 'nodejs';

type OAuthCookie = {
  state: string;
  provider: string;
  userId: string;
  workspaceId: string;
};

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

function redirectWith(appUrl: string, key: 'connected' | 'error', value: string) {
  const target = new URL('/connections', appUrl);
  target.searchParams.set(key, value);
  return NextResponse.redirect(target);
}

function selectionRedirect(appUrl: string, provider: string, authorizationId: string) {
  const target = new URL('/connections/select', appUrl);
  target.searchParams.set('provider', provider);
  target.searchParams.set('authorization', authorizationId);
  return NextResponse.redirect(target);
}

function parseCookie(value: string | undefined): OAuthCookie | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<OAuthCookie>;
    if (!parsed.state || !parsed.provider || !parsed.userId || !parsed.workspaceId) return null;
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

async function saveAuthorization(input: {
  provider: IntegrationProvider;
  workspaceId: string;
  userId: string;
  externalAuthorizationId: string;
  displayName: string;
  config: Record<string, unknown>;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
  secretPayload?: Record<string, unknown>;
}) {
  const admin = createSupabaseAdminClient();
  const externalAccountId = `oauth:${input.workspaceId}:${input.externalAuthorizationId}`;
  const connectionPatch = {
    workspace_id: input.workspaceId,
    provider: input.provider,
    display_name: input.displayName,
    external_account_id: externalAccountId,
    status: 'connected',
    capabilities: [],
    config: {
      ...input.config,
      authorization_container: true,
      hidden_from_account_picker: true,
      connected_at: new Date().toISOString(),
    },
    connected_by: input.userId,
    visibility_scope: 'workspace',
    last_sync_at: new Date().toISOString(),
    last_error: null,
  };

  const { data: existing, error: existingError } = await admin
    .from('integration_connections')
    .select('id')
    .eq('workspace_id', input.workspaceId)
    .eq('provider', input.provider)
    .eq('external_account_id', externalAccountId)
    .maybeSingle();
  if (existingError) throw existingError;

  let authorizationId: string;
  if (existing?.id) {
    const { data, error } = await admin
      .from('integration_connections')
      .update(connectionPatch)
      .eq('id', existing.id)
      .eq('workspace_id', input.workspaceId)
      .select('id')
      .single();
    if (error) throw error;
    authorizationId = data.id;
  } else {
    const { data, error } = await admin
      .from('integration_connections')
      .insert(connectionPatch)
      .select('id')
      .single();
    if (error) throw error;
    authorizationId = data.id;
  }

  const { error: secretError } = await admin.from('integration_secrets').upsert({
    connection_id: authorizationId,
    access_token: encryptIntegrationSecret(input.accessToken),
    refresh_token: encryptIntegrationSecret(input.refreshToken),
    token_expires_at: input.expiresAt || null,
    secret_payload: encryptSecretPayload(input.secretPayload || {}),
    updated_at: new Date().toISOString(),
  });
  if (secretError) throw secretError;

  await invalidateRedisCache({ workspaceId: input.workspaceId, namespace: 'integrations:connections' });
  return authorizationId;
}

async function authorizeMeta(
  provider: IntegrationProvider,
  code: string,
  callbackUrl: string,
  userId: string,
  workspaceId: string
) {
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

    const discoveredAccounts = pages.flatMap((page) => {
      if (provider === 'facebook') {
        return [{
          id: page.id,
          kind: 'facebook_page',
          name: page.name || page.id,
          page_id: page.id,
          page_name: page.name || null,
        }];
      }
      const instagram = page.instagram_business_account;
      if (!instagram?.id) return [];
      return [{
        id: instagram.id,
        kind: 'instagram_business',
        name: instagram.username ? `@${instagram.username}` : instagram.name || instagram.id,
        username: instagram.username || null,
        page_id: page.id,
        page_name: page.name || null,
        instagram_business_account_id: instagram.id,
      }];
    });

    if (discoveredAccounts.length === 0) {
      throw new Error(provider === 'facebook'
        ? 'No Facebook Pages were found for this account.'
        : 'No Instagram Business accounts were found for this account.');
    }

    return saveAuthorization({
      provider,
      workspaceId,
      userId,
      externalAuthorizationId: identity.id,
      displayName: `${provider === 'facebook' ? 'Meta' : 'Instagram'} authorization — ${identity.name || identity.id}`,
      config: {
        transport: 'meta',
        graph_version: version,
        identity: { id: identity.id, name: identity.name || null },
        discovered_accounts: discoveredAccounts,
      },
      accessToken: token.access_token,
      expiresAt,
      secretPayload: {
        oauth_user_id: identity.id,
        page_access_tokens: pages
          .filter((page) => page.access_token)
          .map((page) => ({ id: page.id, access_token: page.access_token })),
      },
    });
  }

  if (provider === 'whatsapp') {
    const businessUrl = new URL(`https://graph.facebook.com/${version}/me/businesses`);
    businessUrl.searchParams.set('fields', 'id,name');
    businessUrl.searchParams.set('limit', '50');
    businessUrl.searchParams.set('access_token', token.access_token);
    const businessPayload = await fetchJson(businessUrl) as { data?: Array<{ id: string; name?: string }> };
    const businesses = businessPayload.data || [];
    const discoveredAccounts: Array<Record<string, unknown>> = [];

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
        const phoneUrl = new URL(`https://graph.facebook.com/${version}/${waba.id}/phone_numbers`);
        phoneUrl.searchParams.set('fields', 'id,display_phone_number,verified_name,quality_rating,code_verification_status');
        phoneUrl.searchParams.set('access_token', token.access_token);
        try {
          const phonePayload = await fetchJson(phoneUrl) as { data?: WhatsAppPhone[] };
          for (const phone of phonePayload.data || []) {
            discoveredAccounts.push({
              id: phone.id,
              kind: 'whatsapp_phone',
              name: phone.verified_name || phone.display_phone_number || phone.id,
              business_id: business.id,
              business_name: business.name || null,
              waba_id: waba.id,
              waba_name: waba.name || null,
              phone_number_id: phone.id,
              display_phone_number: phone.display_phone_number || null,
              verified_name: phone.verified_name || null,
              quality_rating: phone.quality_rating || null,
              code_verification_status: phone.code_verification_status || null,
            });
          }
        } catch (error) {
          console.warn(`WhatsApp phone discovery failed for WABA ${waba.id}:`, error);
        }
      }
    }

    if (discoveredAccounts.length === 0) throw new Error('No WhatsApp Business phone number was found for this Meta account.');

    return saveAuthorization({
      provider: 'whatsapp',
      workspaceId,
      userId,
      externalAuthorizationId: identity.id,
      displayName: `WhatsApp authorization — ${identity.name || identity.id}`,
      config: {
        transport: 'cloud',
        graph_version: version,
        identity: { id: identity.id, name: identity.name || null },
        discovered_accounts: discoveredAccounts,
      },
      accessToken: token.access_token,
      expiresAt,
      secretPayload: { oauth_user_id: identity.id },
    });
  }

  throw new Error('Unsupported Meta product.');
}

async function authorizeTikTok(code: string, userId: string, workspaceId: string) {
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

  const discoveredAccounts = advertiserIds.map((advertiserId) => {
    const advertiser = advertisers.map(record).find((item) => String(item.advertiser_id || item.id || '') === advertiserId);
    const advertiserName = typeof advertiser?.advertiser_name === 'string'
      ? advertiser.advertiser_name
      : typeof advertiser?.name === 'string'
        ? advertiser.name
        : advertiserId;
    return {
      id: advertiserId,
      kind: 'tiktok_advertiser',
      name: advertiserName,
      advertiser_id: advertiserId,
    };
  });

  const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null;
  return saveAuthorization({
    provider: 'tiktok',
    workspaceId,
    userId,
    externalAuthorizationId: userId,
    displayName: 'TikTok Business authorization',
    config: {
      transport: 'tiktok_business',
      scope: token.scope || null,
      discovered_accounts: discoveredAccounts,
    },
    accessToken: token.access_token,
    refreshToken: token.refresh_token || null,
    expiresAt,
  });
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

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('is_active')
    .eq('id', user.id)
    .maybeSingle();
  const { data: membership } = await admin
    .from('workspace_members')
    .select('role,is_active')
    .eq('workspace_id', oauthCookie.workspaceId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!profile?.is_active || !membership?.is_active || !['owner', 'admin', 'manager'].includes(membership.role)) {
    return redirectWith(appUrl, 'error', 'forbidden');
  }

  const callbackUrl = `${appUrl}/api/integrations/oauth/${provider}/callback`;
  try {
    const authorizationId = definition.connectMode === 'meta_oauth'
      ? await authorizeMeta(provider, code, callbackUrl, user.id, oauthCookie.workspaceId)
      : await authorizeTikTok(code, user.id, oauthCookie.workspaceId);

    const response = selectionRedirect(appUrl, provider, authorizationId);
    response.cookies.delete('wanderlust_integration_oauth');
    return response;
  } catch (error) {
    console.error(`${provider} OAuth authorization failed:`, error);
    const response = redirectWith(appUrl, 'error', `${provider}_authorization_failed`);
    response.cookies.delete('wanderlust_integration_oauth');
    return response;
  }
}
