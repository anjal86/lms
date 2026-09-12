'use client';

import React, { useEffect } from 'react';
import { AlertCircle, RotateCcw, Home } from 'lucide-react';
import Link from 'next/link';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled CRM Runtime Error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-zinc-50 text-zinc-900">
      <div className="w-full max-w-md p-6 rounded-lg bg-white border border-zinc-200 shadow-sm text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-md bg-red-50 text-red-600 mb-4 border border-red-200">
          <AlertCircle className="w-6 h-6" />
        </div>
        
        <p className="text-xs font-mono font-medium tracking-wider text-red-600 uppercase mb-1">
          System Execution Boundary
        </p>
        
        <h2 className="text-xl font-semibold tracking-tight text-zinc-950 mb-2">
          An unexpected error occurred
        </h2>
        
        <p className="text-xs text-zinc-600 mb-6 leading-relaxed">
          {error?.message || 'The application state encountered an unhandled exception. Details have been captured.'}
          {error?.digest && (
            <span className="block mt-1 font-mono text-[10px] text-zinc-400">
              Digest ID: {error.digest}
            </span>
          )}
        </p>
        
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => reset()}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium rounded-md bg-zinc-900 text-zinc-50 hover:bg-zinc-800 transition-colors shadow-sm cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Try again
          </button>
          <Link
            href="/leads"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium rounded-md bg-zinc-100 text-zinc-700 hover:bg-zinc-200 transition-colors border border-zinc-200"
          >
            <Home className="w-3.5 h-3.5" />
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
