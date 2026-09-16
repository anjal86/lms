'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useApp } from '@/lib/store';
import { WorkspaceProvider } from '@/lib/platform/WorkspaceContext';
import Sidebar from './Sidebar';
import Header from './Header';
import MobileBottomNav from './MobileBottomNav';

const PUBLIC_AUTH_PATHS = new Set(['/login', '/forgot-password', '/reset-password']);
const AGENT_REDIRECTS: Record<string, string> = {
  '/leads': '/my-work',
  '/follow-ups': '/my-follow-ups',
  '/analytics': '/dashboard',
  '/incentives': '/dashboard',
  '/team': '/dashboard',
  '/settings': '/dashboard',
  '/audit': '/dashboard',
  '/connections': '/dashboard',
};

function agentRedirect(pathname: string) {
  if (pathname.startsWith('/settings/')) return '/dashboard';
  return AGENT_REDIRECTS[pathname];
}

function legacyLeadTarget(pathname: string, role: string) {
  const match = pathname.match(/^\/leads\/([^/]+)$/);
  if (!match) return undefined;
  return role === 'agent' ? `/my-work/${match[1]}` : `/leads/${match[1]}/workspace`;
}

function frameMode(pathname: string) {
  if (
    pathname === '/leads' || pathname.startsWith('/leads/')
    || pathname === '/my-work' || pathname.startsWith('/my-work/')
    || pathname === '/work' || pathname.startsWith('/work/')
    || pathname === '/team' || pathname.startsWith('/team/')
  ) return 'page-frame-wide';

  if (
    pathname.startsWith('/settings/')
    || pathname === '/profile'
    || pathname === '/connections'
    || pathname === '/reports'
    || pathname.startsWith('/reports/')
  ) return 'page-frame-reading';

  return 'page-frame-standard';
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isHydrated, currentUser } = useApp();
  const isPublicAuthPage = PUBLIC_AUTH_PATHS.has(pathname);
  const isOnboarding = pathname === '/onboarding';
  const hasWorkspace = Boolean(currentUser.workspace_id);
  const needsWorkspace = isHydrated && isAuthenticated && !hasWorkspace;
  const redirectTarget = isHydrated && isAuthenticated && hasWorkspace && !isOnboarding
    ? (currentUser.role === 'agent' ? agentRedirect(pathname) : undefined) || legacyLeadTarget(pathname, currentUser.role)
    : undefined;

  useEffect(() => {
    if (needsWorkspace && !isOnboarding) {
      router.replace('/onboarding');
      return;
    }
    if (redirectTarget) router.replace(redirectTarget);
  }, [isOnboarding, needsWorkspace, redirectTarget, router]);

  if (isPublicAuthPage) return <>{children}</>;

  if (!isHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50" role="status" aria-live="polite">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400 [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-300 [animation-delay:300ms]" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center p-5">
        <div className="panel w-full max-w-sm p-6 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-sm font-semibold text-white">W</div>
          <h1 className="mt-4 text-lg font-semibold tracking-tight text-zinc-950">Your session has expired</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-500">Sign in again to continue from where you left off.</p>
          <a href={`/login?returnUrl=${encodeURIComponent(pathname)}`} className="button-primary mt-5 w-full">Sign in again</a>
        </div>
      </div>
    );
  }

  if (needsWorkspace && !isOnboarding) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50" role="status" aria-live="polite">
        <div className="flex items-center gap-2 text-sm text-zinc-500"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />Setting up workspace…</div>
      </div>
    );
  }

  if (isOnboarding) return <>{children}</>;

  if (redirectTarget) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50" role="status" aria-live="polite">
        <div className="flex items-center gap-2 text-sm text-zinc-500"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />Opening workspace…</div>
      </div>
    );
  }

  const isFullBleed = (
    pathname === '/inbox' || pathname.startsWith('/inbox/')
    || pathname === '/contacts' || pathname.startsWith('/contacts/')
  );
  const frameClass = isFullBleed
    ? 'flex h-full w-full min-w-0 flex-1 overflow-hidden'
    : `app-page-frame ${frameMode(pathname)}`;

  return (
    <WorkspaceProvider>
      <div className="app-shell flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Header />
          <main
            id="main-content"
            tabIndex={-1}
            className={isFullBleed
              ? 'flex min-h-0 min-w-0 flex-1 overflow-hidden bg-white pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0'
              : 'app-main'}
          >
            <div className={frameClass}>{children}</div>
          </main>
          <MobileBottomNav />
        </div>
      </div>
    </WorkspaceProvider>
  );
}
