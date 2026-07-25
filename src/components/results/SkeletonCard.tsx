export default function SkeletonCard() {
  return (
    <div className="rounded-3xl border border-card-border bg-card p-6">
      <div className="flex items-center gap-6">
        <div className="flex w-28 shrink-0 flex-col items-center gap-2">
          <div className="shimmer size-11 rounded-lg" />
          <div className="shimmer h-3 w-16 rounded" />
        </div>
        <div className="flex-1 space-y-4">
          <div className="flex items-center gap-5">
            <div className="shimmer h-8 w-24 rounded" />
            <div className="shimmer h-px flex-1" />
            <div className="shimmer h-8 w-24 rounded" />
          </div>
          <div className="flex items-center gap-5">
            <div className="shimmer h-8 w-24 rounded" />
            <div className="shimmer h-px flex-1" />
            <div className="shimmer h-8 w-24 rounded" />
          </div>
        </div>
        <div className="flex w-40 shrink-0 flex-col items-end gap-3">
          <div className="shimmer h-8 w-28 rounded" />
          <div className="shimmer h-10 w-24 rounded-full" />
        </div>
      </div>
    </div>
  );
}
