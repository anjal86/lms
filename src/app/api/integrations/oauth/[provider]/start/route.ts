import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getProvider, metaScopes, type IntegrationProvider } from '@/lib/integrations/catalog';
import { integrationEnvStatus, publicAppUrl } from '@/lib/integrations/environment';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider: rawProvider } = await context.params;
  const provider = rawProvider as IntegrationProvider;
  const definition = getProvider(provider);
  if (!definition || !['meta_oauth', 'tiktok_oauth'].includes(definition.connectMode)) {
    return NextResponse.json({ error: 'This provider does not use account sign-in.' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', request.url));

  const { data: profile } = await supabase.from('profiles').select('role,is_active').eq('id', user.id).maybeSingle();
  if (!profile?.is_active || !['admin', 'manager'].includes(profile.role)) {
    return NextResponse.json({ error: 'Manager access is required.' }, { status: 403 });
  }

  const appUrl = publicAppUrl(request.url);
  const callbackUrl = `${appUrl}/api/integrations/oauth/${provider}/callback`;
  const state = randomBytes(24).toString('hex');
  const envStatus = integrationEnvStatus(definition);
  if (!envStatus.configured) {
    const error = definition.connectMode === 'meta_oauth' ? 'meta_not_configured' : 'tiktok_not_configured';
    return NextResponse.redirect(new URL(`/connections?error=${error}&setup=${provider}`, appUrl));
  }
  let destination: string;

  if (definition.connectMode === 'meta_oauth') {
    const appId = process.env.META_APP_ID?.trim();
    const version = process.env.META_GRAPH_VERSION?.trim() || 'v26.0';
    const url = new URL(`https://www.facebook.com/${version}/dialog/oauth`);
    url.searchParams.set('client_id', appId || '');
    url.searchParams.set('redirect_uri', callbackUrl);
    url.searchParams.set('state', state);
    url.searchParams.set('scope', metaScopes(provider));
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('auth_type', 'rerequest');
    destination = url.toString();
  } else {
    const appId = process.env.TIKTOK_APP_ID?.trim();
    const url = new URL('https://business-api.tiktok.com/portal/auth');
    url.searchParams.set('app_id', appId || '');
    url.searchParams.set('state', state);
    url.searchParams.set('redirect_uri', callbackUrl);
    destination = url.toString();
  }

  const response = NextResponse.redirect(destination);
  response.cookies.set('wanderlust_integration_oauth', JSON.stringify({ state, provider, userId: user.id }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: `/api/integrations/oauth/${provider}/callback`,
    maxAge: 10 * 60,
  });
  return response;
}
