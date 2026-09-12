export default function AnalyticsLoading() {
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto animate-pulse bg-zinc-50 min-h-screen">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200">
        <div className="space-y-1.5">
          <div className="h-6 w-44 bg-zinc-200 rounded" />
          <div className="h-3.5 w-72 bg-zinc-100 rounded" />
        </div>
        <div className="h-8 w-40 bg-zinc-200 rounded-md" />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="p-4 bg-white border border-zinc-200 rounded-lg space-y-3 shadow-sm"
          >
            <div className="h-3 w-24 bg-zinc-200 rounded" />
            <div className="h-7 w-28 bg-zinc-300 rounded" />
            <div className="h-2.5 w-36 bg-zinc-100 rounded" />
          </div>
        ))}
      </div>

      {/* Chart Rows */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-4 bg-white border border-zinc-200 rounded-lg h-72 flex flex-col justify-between shadow-sm">
          <div className="h-4 w-32 bg-zinc-200 rounded" />
          <div className="h-48 bg-zinc-50 rounded border border-dashed border-zinc-200" />
        </div>
        <div className="p-4 bg-white border border-zinc-200 rounded-lg h-72 flex flex-col justify-between shadow-sm">
          <div className="h-4 w-32 bg-zinc-200 rounded" />
          <div className="h-48 bg-zinc-50 rounded border border-dashed border-zinc-200" />
        </div>
      </div>
    </div>
  );
}
