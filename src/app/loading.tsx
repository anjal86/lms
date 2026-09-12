export default function GlobalLoading() {
  return (
    <div className="app-page animate-pulse" role="status" aria-label="Loading workspace">
      <div className="page-header">
        <div className="space-y-2">
          <div className="h-2.5 w-16 rounded bg-zinc-200" />
          <div className="h-6 w-52 rounded bg-zinc-200" />
          <div className="h-3 w-80 max-w-full rounded bg-zinc-100" />
        </div>
        <div className="h-10 w-28 rounded-md bg-zinc-200" />
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="metric h-24">
            <div className="h-2.5 w-20 rounded bg-zinc-100" />
            <div className="mt-4 h-6 w-16 rounded bg-zinc-200" />
          </div>
        ))}
      </div>

      <div className="surface-flat overflow-hidden">
        <div className="border-b border-line p-4">
          <div className="h-4 w-36 rounded bg-zinc-200" />
          <div className="mt-2 h-3 w-64 max-w-full rounded bg-zinc-100" />
        </div>
        <div className="divide-y divide-line">
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="flex h-14 items-center gap-3 px-4">
              <div className="h-2 w-2 rounded-full bg-zinc-200" />
              <div className="h-3 flex-1 rounded bg-zinc-100" />
              <div className="h-3 w-24 rounded bg-zinc-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
