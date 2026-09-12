'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, Home, RotateCcw } from 'lucide-react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Unhandled CRM runtime error:', error);
  }, [error]);

  return (
    <div className="app-shell flex min-h-screen items-center justify-center p-5">
      <div className="surface-flat w-full max-w-md p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
          <div>
            <p className="text-sm font-semibold text-zinc-950">Something went wrong</p>
            <p className="mt-1 text-sm leading-6 text-zinc-500">This screen could not finish loading. Try it again, or return to Today.</p>
            {error.digest && <p className="mt-2 font-mono text-[10px] text-zinc-400">Reference {error.digest}</p>}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
          <button type="button" onClick={reset} className="button-primary"><RotateCcw className="h-4 w-4" /> Try again</button>
          <Link href="/dashboard" className="button-secondary"><Home className="h-4 w-4" /> Today</Link>
        </div>
      </div>
    </div>
  );
}
