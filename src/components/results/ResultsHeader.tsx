import type { ProviderMeta } from "@/lib/types";
import SourcesIndicator from "./SourcesIndicator";

export default function ResultsHeader({
  count,
  adults,
  providers,
  isStreaming,
}: {
  count: number;
  adults: number;
  providers: ProviderMeta[];
  isStreaming: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="text-lg text-slate-300">
          <span className="font-bold text-white">{count}</span> Flight
          {count === 1 ? "" : "s"}
        </div>
        <span className="flex items-center gap-2 rounded-full border border-dashed border-white/25 px-3.5 py-1.5 text-sm font-medium text-slate-200">
          <svg viewBox="0 0 20 20" fill="none" className="size-4 text-slate-300">
            <circle cx="10" cy="6.5" r="3" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M4 16.5c0-2.8 2.7-4.5 6-4.5s6 1.7 6 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          {adults} Passenger{adults > 1 ? "s" : ""}
        </span>
      </div>
      <SourcesIndicator providers={providers} isStreaming={isStreaming} />
    </div>
  );
}
