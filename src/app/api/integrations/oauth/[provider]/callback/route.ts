import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getProvider, type IntegrationProvider } from '@/lib/integrations/catalog';

export const runtime = 'nodejs';

type OAuthCookie = { state: string; provider: string; userId: string };

type MetaPage = {
  id: string;
  name?: string;
  access_token?: string;
  instagram_business_account?: { id: string; username?: string; name?: string };
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
  const { data: existing } = await admin
    .from('integration_connections')
    .select('id')
    .eq('provider', input.provider)
    .eq('external_account_id', input.externalAccountId)
    .maybeSingle();

  const connectionPatch = {
    provider: input.provider,
    display_name: input.displayName,
    external_account_id: input.externalAccountId,
    status: 'connected',
    capabilities: input.capabilities,
    config: input.config,
    connected_by: input.userId,
    last_sync_at: new Date().toISOString(),
    last_error: null,
  };

  let connectionId: string;
  if (existing?.id) {
    const { data, error } = await admin
      .from('integration_connections')
      .update(connectionPatch)
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
    access_token: input.accessToken,
    refresh_token: input.refreshToken || null,
    token_expires_at: input.expiresAt || null,
    secret_payload: input.secretPayload || {},
    updated_at: new Date().toISOString(),
  });
  if (secretError) throw secretError;
  return connectionId;
}

async function completeMeta(provider: IntegrationProvider, code: string, callbackUrl: string, userId: string) {
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

  const pagesUrl = new URL(`https://graph.facebook.com/${version}/me/accounts`);
  pagesUrl.searchParams.set('fields', 'id,name,access_token,instagram_business_account{id,username,name}');
  pagesUrl.searchParams.set('limit', '100');
  pagesUrl.searchParams.set('access_token', token.access_token);
  let pages: MetaPage[] = [];
  try {
    const pagePayload = await fetchJson(pagesUrl) as { data?: MetaPage[] };
    pages = pagePayload.data || [];
  } catch (error) {
    console.warn('Meta page discovery was unavailable:', error);
  }

  const subscriptions: Array<{ id: string; ok: boolean }> = [];
  if (provider === 'facebook') {
    for (const page of pages) {
      if (!page.access_token) continue;
      try {
        const subscribeUrl = new URL(`https://graph.facebook.com/${version}/${page.id}/subscribed_apps`);
        subscribeUrl.searchParams.set('subscribed_fields', 'leadgen');
        subscribeUrl.searchParams.set('access_token', page.access_token);
        await fetchJson(subscribeUrl, { method: 'POST' });
        subscriptions.push({ id: page.id, ok: true });
      } catch (error) {
        console.warn(`Facebook lead subscription failed for page ${page.id}:`, error);
        subscriptions.push({ id: page.id, ok: false });
      }
    }
  }

  const businesses: Array<{ id: string; name?: string }> = [];
  const wabas: Array<{ id: string; name?: string; business_id?: string }> = [];
  if (provider === 'whatsapp') {
    try {
      const businessUrl = new URL(`https://graph.facebook.com/${version}/me/businesses`);
      businessUrl.searchParams.set('fields', 'id,name');
      businessUrl.searchParams.set('limit', '50');
      businessUrl.searchParams.set('access_token', token.access_token);
      const businessPayload = await fetchJson(businessUrl) as { data?: Array<{ id: string; name?: string }> };
      businesses.push(...(businessPayload.data || []));

      for (const business of businesses.slice(0, 20)) {
        try {
          const wabaUrl = new URL(`https://graph.facebook.com/${version}/${business.id}/owned_whatsapp_business_accounts`);
          wabaUrl.searchParams.set('fields', 'id,name');
          wabaUrl.searchParams.set('access_token', token.access_token);
          const wabaPayload = await fetchJson(wabaUrl) as { data?: Array<{ id: string; name?: string }> };
          for (const waba of wabaPayload.data || []) {
            wabas.push({ ...waba, business_id: business.id });
            try {
              const subscribeUrl = new URL(`https://graph.facebook.com/${version}/${waba.id}/subscribed_apps`);
              subscribeUrl.searchParams.set('access_token', token.access_token);
              await fetchJson(subscribeUrl, { method: 'POST' });
            } catch (error) {
              console.warn(`WhatsApp subscription failed for WABA ${waba.id}:`, error);
            }
          }
        } catch (error) {
          console.warn(`WhatsApp account discovery failed for business ${business.id}:`, error);
        }
      }
    } catch (error) {
      console.warn('Meta business discovery was unavailable:', error);
    }
  }

  const publicPages = pages.map(({ access_token: _token, ...page }) => page);
  const expiresAt = token.expires_in
    ? new Date(Date.now() + token.expires_in * 1000).toISOString()
    : null;

  await saveConnection({
    provider,
    displayName: `${definition.shortName} — ${identity.name || identity.id}`,
    externalAccountId: identity.id,
    capabilities: definition.capabilities,
    config: {
      graph_version: version,
      identity: { id: identity.id, name: identity.name || null },
      pages: publicPages,
      businesses,
      whatsapp_business_accounts: wabas,
      subscriptions,
      connected_at: new Date().toISOString(),
    },
    userId,
    accessToken: token.access_token,
    expiresAt,
    secretPayload: {
      page_access_tokens: pages.filter((page) => page.access_token).map((page) => ({ id: page.id, access_token: page.access_token })),
    },
  });
}

async function completeTikTok(code: string, userId: string) {
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

  let advertisers: unknown[] = [];
  try {
    const advertiserUrl = new URL('https://business-api.tiktok.com/open_api/v1.3/oauth2/advertiser/get/');
    advertiserUrl.searchParams.set('app_id', appId);
    advertiserUrl.searchParams.set('secret', secret);
    const advertiserPayload = await fetchJson(advertiserUrl, {
      headers: { 'Access-Token': token.access_token },
    }) as { data?: { list?: unknown[] } | unknown[] };
    advertisers = Array.isArray(advertiserPayload.data)
      ? advertiserPayload.data
      : advertiserPayload.data?.list || [];
  } catch (error) {
    console.warn('TikTok advertiser discovery was unavailable:', error);
  }

  const externalId = advertiserIds[0] || `oauth-${userId}`;
  const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null;
  await saveConnection({
    provider: 'tiktok',
    displayName: advertiserIds.length ? `TikTok Ads — ${advertiserIds[0]}` : 'TikTok Ads',
    externalAccountId: externalId,
    capabilities: definition.capabilities,
    config: {
      advertiser_ids: advertiserIds,
      advertisers,
      scope: token.scope || null,
      connected_at: new Date().toISOString(),
    },
    userId,
    accessToken: token.access_token,
    refreshToken: token.refresh_token || null,
    expiresAt,
  });
}

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider: rawProvider } = await context.params;
  const provider = rawProvider as IntegrationProvider;
  const definition = getProvider(provider);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || new URL(request.url).origin;
  if (!definition || !['meta_oauth', 'tiktok_oauth'].includes(definition.connectMode)) {
    return redirectWith(appUrl, 'error', 'unsupported_provider');
  }

  const url = new URL(request.url);
  const state = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || url.searchParams.get('auth_code') || '';
  const providerError = url.searchParams.get('error') || url.searchParams.get('error_reason');
  const cookieHeader = request.headers.get('cookie') || '';
  const cookieValue = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('wanderlust_integration_oauth='))
    ?.slice('wanderlust_integration_oauth='.length);
  const oauthCookie = parseCookie(cookieValue ? decodeURIComponent(cookieValue) : undefined);

  if (providerError) return redirectWith(appUrl, 'error', `${provider}_authorization_cancelled`);
  if (!oauthCookie || oauthCookie.provider !== provider || oauthCookie.state !== state || !code) {
    return redirectWith(appUrl, 'error', 'invalid_oauth_state');
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== oauthCookie.userId) return redirectWith(appUrl, 'error', 'session_expired');
  const { data: profile } = await supabase.from('profiles').select('role,is_active').eq('id', user.id).maybeSingle();
  if (!profile?.is_active || !['admin', 'manager'].includes(profile.role)) {
    return redirectWith(appUrl, 'error', 'forbidden');
  }

  const callbackUrl = `${appUrl}/api/integrations/oauth/${provider}/callback`;
  try {
    if (definition.connectMode === 'meta_oauth') {
      await completeMeta(provider, code, callbackUrl, user.id);
    } else {
      await completeTikTok(code, user.id);
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
