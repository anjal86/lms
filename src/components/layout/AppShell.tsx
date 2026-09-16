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
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400 [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400 [animation-delay:300ms]" />
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

  if (needsWorkspace && !isOnboarding) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50" role="status" aria-live="polite">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400" />
          Setting up workspace…
        </div>
      </div>
    );
  }

  // Onboarding is intentionally outside the business shell because a new account may
  // not have a workspace/configuration yet. Existing members may also use it to create
  // another company without leaking the current company's navigation into setup.
  if (isOnboarding) return <>{children}</>;

  if (redirectTarget) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50" role="status" aria-live="polite">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400" />
          Opening workspace…
        </div>
      </div>
    );
  }

  // Pages that render their own inner headers/tables need edge-to-edge layout
  // (no padding from app-main — they handle their own spacing internally)
  const isFullBleed = (
    pathname === '/inbox' ||
    pathname.startsWith('/inbox/') ||
    pathname === '/contacts' ||
    pathname.startsWith('/contacts/')
  );

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
              isFullBleed
                ? 'flex flex-1 min-w-0 min-h-0 overflow-hidden pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0 bg-white'
                : 'app-main'
            }
          >
            <div className={isFullBleed ? 'flex h-full w-full min-w-0 flex-1 overflow-hidden' : 'app-page-frame'}>
              {children}
            </div>
          </main>
          <MobileBottomNav />
        </div>
      </div>
    </WorkspaceProvider>
  );
}

