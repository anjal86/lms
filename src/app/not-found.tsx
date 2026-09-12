import Link from 'next/link';
import { ArrowLeft, Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-zinc-50 text-zinc-900">
      <div className="w-full max-w-md text-center bg-white p-8 rounded-lg border border-zinc-200 shadow-sm">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-lg bg-zinc-100 text-zinc-800 mb-6 border border-zinc-200">
          <Compass className="w-7 h-7" />
        </div>
        
        <p className="text-xs font-mono font-medium tracking-wider text-zinc-500 uppercase mb-2">
          404 · Page Not Found
        </p>
        
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 mb-3">
          Lost in Destination
        </h1>
        
        <p className="text-xs text-zinc-600 mb-8 leading-relaxed">
          The pipeline route or resource you are looking for has been moved or does not exist in the CRM ledger.
        </p>
        
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/leads"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium rounded-md bg-zinc-900 text-zinc-50 hover:bg-zinc-800 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Return to Pipeline
          </Link>
          <Link
            href="/analytics"
            className="inline-flex items-center justify-center px-4 py-2 text-xs font-medium rounded-md bg-white text-zinc-700 hover:bg-zinc-100 transition-colors border border-zinc-200 shadow-sm"
          >
            View Analytics
          </Link>
        </div>
      </div>
    </div>
  );
}
