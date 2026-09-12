'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useApp } from '@/lib/store';
import Sidebar from './Sidebar';
import Header from './Header';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isHydrated } = useApp();

  const isLoginPage = pathname === '/login';

  // Client-side route protection
  useEffect(() => {
    if (isHydrated && !isAuthenticated && !isLoginPage) {
      router.push(`/login?returnUrl=${encodeURIComponent(pathname)}`);
    }
  }, [isHydrated, isAuthenticated, isLoginPage, pathname, router]);

  // Render standalone page without CRM chrome for /login
  if (isLoginPage) {
    return <>{children}</>;
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
