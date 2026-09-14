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

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isHydrated, currentUser } = useApp();
  const isPublicAuthPage = PUBLIC_AUTH_PATHS.has(pathname);
  const redirectTarget = isHydrated && isAuthenticated
    ? (currentUser.role === 'agent' ? agentRedirect(pathname) : undefined) || legacyLeadTarget(pathname, currentUser.role)
    : undefined;

  useEffect(() => {
    if (redirectTarget) router.replace(redirectTarget);
  }, [redirectTarget, router]);

  if (isPublicAuthPage) return <>{children}</>;

  if (!isHydrated) {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center" role="status" aria-live="polite">
        <div className="surface-flat flex items-center gap-3 px-4 py-3 text-sm font-medium text-zinc-600">
          <span className="h-2 w-2 animate-pulse rounded-full bg-blue-600" />
          Loading workspace…
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center p-5">
        <div className="panel w-full max-w-sm p-6 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-950 text-sm font-bold text-white">W</div>
          <h1 className="mt-4 text-lg font-semibold tracking-tight text-zinc-950">Your session has expired</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-500">Sign in again to continue from where you left off.</p>
          <a href={`/login?returnUrl=${encodeURIComponent(pathname)}`} className="button-primary mt-5 w-full">Sign in again</a>
        </div>
      </div>
    );
  }

  if (redirectTarget) {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center" role="status" aria-live="polite">
        <div className="flex items-center gap-3 text-sm font-medium text-zinc-500">
          <span className="h-2 w-2 animate-pulse rounded-full bg-blue-600" />
          Opening your workspace…
        </div>
      </div>
    );
  }

  const isInbox = pathname === '/inbox';

  return (
    <WorkspaceProvider>
      <div className="app-shell flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Header />
          <main
            id="main-content"
            tabIndex={-1}
            className={
              isInbox
                ? 'flex flex-1 min-w-0 min-h-0 overflow-hidden pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0 bg-white'
                : 'app-main'
            }
          >
            <div className={isInbox ? 'flex h-full w-full min-w-0 flex-1 overflow-hidden' : 'app-page-frame'}>
              {children}
            </div>
          </main>
          <MobileBottomNav />
        </div>
      </div>
    </WorkspaceProvider>
  );
}
