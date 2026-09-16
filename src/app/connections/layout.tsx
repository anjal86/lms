import { Suspense } from 'react';
import ConsumeConnectionEntryParams from './ConsumeConnectionEntryParams';

export default function ConnectionsLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="app-page" role="status" aria-label="Loading connections">
          <div className="h-20 animate-pulse rounded-xl bg-blue-50" />
          <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-48 animate-pulse rounded-xl border border-zinc-100 bg-white" />
            ))}
          </div>
        </div>
      }
    >
      <ConsumeConnectionEntryParams />
      {children}
    </Suspense>
  );
}
