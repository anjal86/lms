import Link from 'next/link';
import { ArrowLeft, SearchX } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="app-shell flex min-h-screen items-center justify-center p-5">
      <div className="surface-flat w-full max-w-md p-6 text-center">
        <SearchX className="mx-auto h-5 w-5 text-zinc-400" />
        <p className="mt-4 font-mono text-[10px] font-semibold uppercase tracking-wide text-zinc-400">404</p>
        <h1 className="mt-1 text-lg font-semibold tracking-tight text-zinc-950">Page not found</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-500">This page may have moved or the link is no longer available.</p>
        <div className="mt-5 flex justify-center gap-2 border-t border-line pt-4">
          <Link href="/dashboard" className="button-primary"><ArrowLeft className="h-4 w-4" /> Back to Today</Link>
          <Link href="/leads" className="button-secondary">Open leads</Link>
        </div>
      </div>
    </div>
  );
}
