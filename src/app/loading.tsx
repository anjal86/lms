export default function GlobalLoading() {
  return (
    <div className="min-h-screen bg-zinc-50 p-6 flex flex-col gap-6 animate-pulse">
      {/* Header skeleton */}
      <div className="h-14 bg-white border border-zinc-200 rounded-lg flex items-center justify-between px-6 shadow-sm">
        <div className="h-5 w-32 bg-zinc-200 rounded" />
        <div className="flex items-center gap-3">
          <div className="h-8 w-24 bg-zinc-100 rounded-md border border-zinc-200" />
          <div className="h-8 w-8 rounded-full bg-zinc-200" />
        </div>
      </div>

      {/* Main metrics skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-28 bg-white border border-zinc-200 rounded-lg p-4 flex flex-col justify-between shadow-sm"
          >
            <div className="h-3 w-20 bg-zinc-200 rounded" />
            <div className="h-6 w-16 bg-zinc-300 rounded" />
          </div>
        ))}
      </div>

      {/* Table / Board placeholder */}
      <div className="flex-1 min-h-[400px] bg-white border border-zinc-200 rounded-lg p-6 shadow-sm">
        <div className="h-4 w-48 bg-zinc-200 rounded mb-6" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6].map((row) => (
            <div
              key={row}
              className="h-10 bg-zinc-50 rounded border border-zinc-200/80"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
