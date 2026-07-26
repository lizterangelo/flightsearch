"use client";

import { useCurrency } from "@/components/CurrencyProvider";
import { formatDuration } from "@/lib/format";
import { sortOffers, type SortMode } from "@/lib/rank";
import { totalDurationMinutes, totalStops, type FlightOffer } from "@/lib/types";

/**
 * Settings → Summary Cards: "Compare the best, cheapest, and fastest
 * flights atop your results." Clicking a tile applies that sort.
 */

const TILES: { mode: SortMode; label: string }[] = [
  { mode: "best", label: "Best" },
  { mode: "cheapest", label: "Cheapest" },
  { mode: "fastest", label: "Fastest" },
];

export default function SummaryCards({
  offers,
  sortMode,
  onSort,
}: {
  offers: FlightOffer[];
  sortMode: SortMode;
  onSort: (mode: SortMode) => void;
}) {
  const { format: money } = useCurrency();
  if (offers.length < 2) return null;

  return (
    <div className="mb-5 flex gap-2.5 overflow-x-auto [scrollbar-width:none] sm:grid sm:grid-cols-3 sm:gap-3 [&::-webkit-scrollbar]:hidden">
      {TILES.map(({ mode, label }) => {
        const top = sortOffers(offers, mode)[0];
        if (!top) return null;
        const active = sortMode === mode;
        const stops = totalStops(top);
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onSort(mode)}
            className={`min-w-[9.5rem] shrink-0 cursor-pointer rounded-2xl border px-4 py-3 text-left transition sm:min-w-0 sm:shrink ${
              active
                ? "border-accent/60 bg-accent/10"
                : "border-card-border bg-card hover:border-white/20"
            }`}
          >
            <div
              className={`text-xs font-semibold tracking-wide ${
                active ? "text-accent-bright" : "text-muted"
              }`}
            >
              {label}
            </div>
            <div className="mt-1 text-lg font-bold text-white">
              {money(top.displayUSD)}
            </div>
            <div className="text-xs text-muted">
              {formatDuration(totalDurationMinutes(top))} ·{" "}
              {stops === 0 ? "Direct" : `${stops} stop${stops > 1 ? "s" : ""}`}
            </div>
          </button>
        );
      })}
    </div>
  );
}
