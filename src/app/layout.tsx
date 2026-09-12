import type { Metadata } from 'next';
import { JetBrains_Mono, Manrope } from 'next/font/google';
import './globals.css';
import { AppProvider } from '@/lib/store';
import AppShell from '@/components/layout/AppShell';
import ToastContainer from '@/components/layout/ToastContainer';

const manrope = Manrope({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-app-sans',
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-app-mono',
});

export const metadata: Metadata = {
  title: {
    template: '%s | Wanderlust CRM',
    default: 'Wanderlust CRM — High-Velocity Travel Lead Management',
  },
  description: 'High-density travel lead management and pipeline operations system for agency teams.',
  robots: {
    index: false,
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
      <body
        className={`${manrope.variable} ${jetBrainsMono.variable} bg-zinc-50 text-zinc-950 antialiased`}
        suppressHydrationWarning
      >
        <AppProvider>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-zinc-950 focus:px-3.5 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-white focus:shadow-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Skip to main content
          </a>

          <AppShell>{children}</AppShell>
          <ToastContainer />
        </AppProvider>
      </body>
    </html>
  );
}
