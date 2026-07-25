"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import FilterBar, {
  applyFilters,
  EMPTY_FILTERS,
  type Filters,
} from "@/components/results/FilterBar";
import FlightCard from "@/components/results/FlightCard";
import ResultsHeader from "@/components/results/ResultsHeader";
import SkeletonCard from "@/components/results/SkeletonCard";
import SortMenu from "@/components/results/SortMenu";
import SearchBar from "@/components/search/SearchBar";
import { useFlightSearch } from "@/hooks/useFlightSearch";
import type { SortMode } from "@/lib/rank";
import { parseSearchQuery, totalPassengers } from "@/lib/types";

const PAGE_SIZE = 15;

function ResultsContent() {
  const rawParams = useSearchParams();

  const { query, paramsError } = useMemo(() => {
    try {
      return {
        query: parseSearchQuery(new URLSearchParams(rawParams.toString())),
        paramsError: null as string | null,
      };
    } catch (err) {
      return {
        query: null,
        paramsError: err instanceof Error ? err.message : "Invalid search",
      };
    }
  }, [rawParams]);

  const [sortMode, setSortMode] = useState<SortMode>("best");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const { offers, isStreaming, error } = useFlightSearch(query, sortMode);

  const filtered = useMemo(
    () => applyFilters(offers, filters),
    [offers, filters],
  );
  const visible = filtered.slice(0, visibleCount);

  if (paramsError) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-24 text-center">
        <p className="text-lg text-slate-300">{paramsError}</p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-full bg-accent px-6 py-3 font-semibold text-white"
        >
          New search
        </Link>
      </main>
    );
  }

  const showSkeletons =
    isStreaming && filtered.length < 3 ? Math.max(1, 5 - filtered.length) : 0;

  return (
    <main className="mx-auto w-full max-w-6xl px-6 pb-24">
      <div className="sticky top-0 z-40 -mx-6 bg-gradient-to-b from-[#070f20] via-[#070f20]/95 to-transparent px-6 pt-5 pb-6">
        <div className="flex items-center gap-4">
          <Link href="/" className="shrink-0 text-white" title="New search">
            <svg viewBox="0 0 32 32" fill="none" className="size-8">
              <path
                d="M4 22l24-10-9 12-3-6-6 2 3-4-9 6z"
                fill="currentColor"
              />
            </svg>
          </Link>
          <div className="flex-1">
            <SearchBar compact initial={query ?? undefined} />
          </div>
        </div>
      </div>

      {error ? (
        <div className="py-16 text-center text-slate-300">
          Search failed: {error}
        </div>
      ) : (
        <>
          <div className="mt-2 mb-5 flex flex-wrap items-center justify-between gap-3">
            <ResultsHeader
              count={filtered.length}
              passengerCount={query ? totalPassengers(query.passengers) : 1}
              isStreaming={isStreaming}
            />
            <div className="flex flex-wrap items-center gap-2.5">
              <FilterBar
                offers={offers}
                filters={filters}
                onChange={setFilters}
              />
              <SortMenu
                offers={filtered}
                sortMode={sortMode}
                onChange={setSortMode}
              />
            </div>
          </div>

          <div className="space-y-4">
            {visible.map((offer, i) => (
              <FlightCard
                key={offer.dedupeKey}
                offer={offer}
                isBest={sortMode === "best" && i === 0 && !isStreaming}
              />
            ))}
            {Array.from({ length: showSkeletons }).map((_, i) => (
              <SkeletonCard key={`skeleton-${i}`} />
            ))}
          </div>

          {filtered.length > visibleCount && (
            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                className="cursor-pointer rounded-full border border-card-border bg-pill/80 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:bg-pill"
              >
                Load more flights
              </button>
            </div>
          )}

          {!isStreaming && filtered.length === 0 && (
            <div className="py-16 text-center text-slate-300">
              No flights found
              {offers.length > 0 ? " matching your filters" : ""}.
            </div>
          )}
        </>
      )}
    </main>
  );
}

export default function ResultsPage() {
  return (
    <Suspense fallback={null}>
      <ResultsContent />
    </Suspense>
  );
}
