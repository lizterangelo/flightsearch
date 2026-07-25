export default function ResultsHeader({
  count,
  passengerCount,
  isStreaming,
}: {
  count: number;
  passengerCount: number;
  isStreaming: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="text-lg text-slate-300">
        <span className="font-bold text-white tabular-nums">{count}</span>{" "}
        Flight{count === 1 ? "" : "s"}
        {isStreaming && (
          <span className="ml-2 inline-block size-2 animate-pulse rounded-full bg-accent align-middle" />
        )}
      </div>
      <span className="flex items-center gap-2 rounded-full border border-dashed border-white/25 px-3.5 py-1.5 text-sm font-medium text-slate-200">
        <svg viewBox="0 0 20 20" fill="none" className="size-4 text-slate-300">
          <path
            d="M10 4v12m-6-6h12"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        {passengerCount > 1 ? `${passengerCount} Passengers` : "Bring Friends"}
      </span>
    </div>
  );
}
