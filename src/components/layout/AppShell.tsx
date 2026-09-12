'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { useApp } from '@/lib/store';
import Sidebar from './Sidebar';
import Header from './Header';

const PUBLIC_AUTH_PATHS = new Set(['/login', '/forgot-password', '/reset-password']);

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated, isHydrated } = useApp();
  const isPublicAuthPage = PUBLIC_AUTH_PATHS.has(pathname);

  if (isPublicAuthPage) return <>{children}</>;

  if (!isHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f7f9]" role="status" aria-live="polite">
        <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-600 shadow-sm">
          <span className="h-2 w-2 animate-pulse rounded-full bg-blue-600" />
          Loading secure workspace…
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f7f9] p-5">
        <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-panel">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-950 text-sm font-bold text-white">W</div>
          <h1 className="mt-4 text-lg font-semibold tracking-tight text-zinc-950">Your session has expired</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-500">Sign in again to continue from where you left off.</p>
          <a
            href={`/login?returnUrl=${encodeURIComponent(pathname)}`}
            className="button-primary mt-5 w-full"
          >
            Sign in again
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#f6f7f9]">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header />
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto bg-[#f6f7f9] px-4 py-5 sm:px-6 sm:py-6 xl:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
