export default function LeadsLoading() {
  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto animate-pulse bg-zinc-50 min-h-screen">
      {/* Top Banner Skeleton */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200">
        <div className="space-y-1.5">
          <div className="h-6 w-36 bg-zinc-200 rounded" />
          <div className="h-3.5 w-64 bg-zinc-100 rounded" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-24 bg-zinc-200 rounded-md" />
          <div className="h-8 w-28 bg-zinc-900/10 rounded-md" />
        </div>
      </div>

      {/* Filter Bar Skeleton */}
      <div className="flex items-center justify-between gap-3 p-2 bg-white border border-zinc-200 rounded-lg shadow-sm">
        <div className="h-8 w-64 bg-zinc-100 rounded-md" />
        <div className="flex items-center gap-2">
          <div className="h-8 w-24 bg-zinc-100 rounded-md border border-zinc-200" />
          <div className="h-8 w-24 bg-zinc-100 rounded-md border border-zinc-200" />
          <div className="h-8 w-16 bg-zinc-100 rounded-md border border-zinc-200" />
        </div>
      </div>

      {/* Metric Cards Skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[1, 2, 3, 4, 5].map((idx) => (
          <div
            key={idx}
            className="p-3 bg-white border border-zinc-200 rounded-lg space-y-2 shadow-sm"
          >
            <div className="h-3 w-16 bg-zinc-200 rounded" />
            <div className="h-6 w-20 bg-zinc-300 rounded" />
          </div>
        ))}
      </div>

      {/* Table / Kanban area skeleton */}
      <div className="bg-white border border-zinc-200 rounded-lg p-4 min-h-[500px] shadow-sm">
        <div className="h-7 w-48 bg-zinc-200 rounded mb-4" />
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((row) => (
            <div
              key={row}
              className="h-10 bg-zinc-50 rounded border border-zinc-200/70"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
