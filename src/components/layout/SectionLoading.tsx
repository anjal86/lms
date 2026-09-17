export default function SectionLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-48 items-center justify-center" role="status" aria-live="polite" aria-label={`Loading ${label}`}>
      <div className="flex items-center gap-2 text-sm font-medium text-zinc-600">
        <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-500" aria-hidden="true" />
        Loading {label}…
      </div>
    </div>
  );
}
