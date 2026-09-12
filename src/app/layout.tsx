import type { Metadata } from 'next';
import './globals.css';
import { AppProvider } from '@/lib/store';
import AppShell from '@/components/layout/AppShell';
import ToastContainer from '@/components/layout/ToastContainer';

export const metadata: Metadata = {
  title: {
    template: '%s | Wanderlust CRM',
    default: 'Wanderlust CRM — High-Velocity Travel Lead Management',
  },
  description: 'High-density travel lead management and pipeline operations system for agency teams.',
  robots: {
    index: false, // Internal CRM by default
    follow: false,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased bg-zinc-50 text-zinc-900" suppressHydrationWarning>
        <AppProvider>
          {/* WCAG 2.2 AA Skip to Content Link */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-1.5 focus:bg-zinc-900 focus:text-white focus:text-xs focus:font-medium focus:rounded-md focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-zinc-400"
          >
            Skip to main content
          </a>

          <AppShell>
            {children}
          </AppShell>

          {/* Global Notification Toast */}
          <ToastContainer />
        </AppProvider>
      </body>
    </html>
  );
}
