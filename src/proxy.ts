import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
  '/api/leads/webhook',
  '/api/integrations/webhooks',
  '/api/conversations/sync',
  '/api/cron',
];

const MODULE_PATHS: Array<{ moduleKey: string; paths: string[] }> = [
  { moduleKey: 'inbox', paths: ['/inbox', '/contacts', '/settings/automations', '/api/conversations', '/api/contacts', '/api/automations'] },
  { moduleKey: 'leads', paths: ['/leads', '/my-work', '/api/leads'] },
  { moduleKey: 'tasks', paths: ['/follow-ups', '/my-follow-ups'] },
  { moduleKey: 'documents', paths: ['/api/documents'] },
];

const safeInternalPath = (value: string | null, fallback = '/leads') =>
  value && value.startsWith('/') && !value.startsWith('//') ? value : fallback;

const pathMatches = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

const moduleForPath = (pathname: string) =>
  MODULE_PATHS.find((rule) => rule.paths.some((prefix) => pathMatches(pathname, prefix)))?.moduleKey ?? null;

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    if (process.env.NODE_ENV === 'production') {
      return new NextResponse('Application authentication is not configured.', { status: 503 });
    }
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const serviceRole = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const safeBearerToken = bearerToken && (!serviceRole || bearerToken !== serviceRole) ? bearerToken : null;
  const { data: { user } } = safeBearerToken
    ? await supabase.auth.getUser(safeBearerToken)
    : await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  if (!user && !isPublic) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('returnUrl', `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (user && !isPublic) {
    const moduleKey = moduleForPath(pathname);
    if (moduleKey) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('workspace_id,is_active')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError || !profile?.workspace_id || !profile.is_active) {
        if (pathname.startsWith('/api/')) {
          return NextResponse.json({ error: 'Unable to verify workspace access.' }, { status: 403 });
        }
        return new NextResponse('Unable to verify workspace access.', { status: 403 });
      }

      const { data: workspaceModule, error: moduleError } = await supabase
        .from('workspace_modules')
        .select('is_enabled')
        .eq('workspace_id', profile.workspace_id)
        .eq('module_key', moduleKey)
        .maybeSingle();

      if (moduleError) {
        if (pathname.startsWith('/api/')) {
          return NextResponse.json({ error: 'Unable to verify module access.' }, { status: 503 });
        }
        return new NextResponse('Unable to verify module access.', { status: 503 });
      }

      if (workspaceModule?.is_enabled === false) {
        if (pathname.startsWith('/api/')) {
          return NextResponse.json({ error: 'This module is disabled for the active workspace.' }, { status: 403 });
        }
        const dashboardUrl = request.nextUrl.clone();
        dashboardUrl.pathname = '/dashboard';
        dashboardUrl.search = '';
        dashboardUrl.searchParams.set('moduleDisabled', moduleKey);
        return NextResponse.redirect(dashboardUrl);
      }
    }
  }

  if (user && pathname === '/login') {
    const target = safeInternalPath(request.nextUrl.searchParams.get('returnUrl'));
    return NextResponse.redirect(new URL(target, request.url));
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
