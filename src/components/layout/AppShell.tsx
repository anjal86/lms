'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { useApp } from '@/lib/store';
import Sidebar from './Sidebar';
import Header from './Header';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated, isHydrated } = useApp();
  const isPublicAuthPage = pathname === '/login';

  if (isPublicAuthPage) return <>{children}</>;

  if (!isHydrated) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center" role="status" aria-live="polite">
        <div className="text-xs font-medium text-zinc-500">Loading secure workspace…</div>
      </div>
    );
  }

  // Server-side proxy is authoritative. This fallback prevents protected UI from
  // rendering if the session expires between navigation and hydration.
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <a href={`/login?returnUrl=${encodeURIComponent(pathname)}`} className="text-sm font-medium text-zinc-700 underline">
          Session expired — sign in again
        </a>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header />
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-4 bg-zinc-50">
          {children}
        </main>
      </div>
    </div>
  );
}
