"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, use, useEffect, useMemo, useState } from "react";
import DetailsPanel from "@/components/details/DetailsPanel";
import FilterBar, {
  applyFilters,
  EMPTY_FILTERS,
  type Filters,
} from "@/components/results/FilterBar";
import FlexDateStrip from "@/components/results/FlexDateStrip";
import FlightCard from "@/components/results/FlightCard";
import LoadingBar from "@/components/results/LoadingBar";
import ResultsHeader from "@/components/results/ResultsHeader";
import SkeletonCard from "@/components/results/SkeletonCard";
import SortMenu from "@/components/results/SortMenu";
import SummaryCards from "@/components/results/SummaryCards";
import SearchBar, { selectionsFromQuery } from "@/components/search/SearchBar";
import { useMe } from "@/components/auth/MeProvider";
import { useFlightSearch } from "@/hooks/useFlightSearch";
import type { SortMode } from "@/lib/rank";
import type { FlightOffer } from "@/lib/types";
import { buildFlightsPath, parseFlightsPath, type ParsedFlightsPath } from "@/lib/urls";

const PAGE_SIZE = 15;

function FlightsContent({
  origin,
  destination,
  slug,
}: {
  origin: string;
  destination: string;
  slug: string[] | undefined;
}) {
  const rawParams = useSearchParams();

  const { parsed, paramsError } = useMemo(() => {
    try {
      return {
        parsed: parseFlightsPath(
          origin,
          destination,
          slug,
          new URLSearchParams(rawParams.toString()),
        ) as ParsedFlightsPath | null,
        paramsError: null as string | null,
      };
    } catch (err) {
      return {
        parsed: null,
        paramsError: err instanceof Error ? err.message : "Invalid search",
      };
    }
  }, [origin, destination, slug, rawParams]);

  const router = useRouter();
  const { profile } = useMe();
  const query = parsed?.query ?? null;
  const offerId = parsed?.offerId;
  const [sortMode, setSortMode] = useState<SortMode>("best");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const { offers, isStreaming, error } = useFlightSearch(query, sortMode);

  const openDetails = (offer: FlightOffer) => {
    if (!query) return;
    const sp = new URLSearchParams(rawParams.toString());
    // Selection criteria: lets a shared/stale link re-resolve an equivalent
    // offer after this offer id expires.
    const seg = offer.slices[0]?.segments[0];
    if (seg) {
      sp.set("select_carrier", seg.carrierCode);
      sp.set("select_flight", seg.flightNumber.split(" ").pop() ?? "");
      sp.set("select_departure", seg.departure);
      sp.set("select_stops", String(offer.slices[0]?.stops ?? 0));
    }
    const path = buildFlightsPath(query, offer.id).split("?")[0];
    router.push(`${path}?${sp.toString()}`, { scroll: false });
  };

  const closeDetails = () => {
    if (!query) return;
    const sp = new URLSearchParams(rawParams.toString());
    for (const key of [...sp.keys()]) {
      if (key.startsWith("select_")) sp.delete(key);
    }
    const qs = sp.toString();
    const path = buildFlightsPath(query).split("?")[0];
    router.push(qs ? `${path}?${qs}` : path, { scroll: false });
  };

  const streamedOffer = useMemo(
    () => (offerId ? (offers.find((o) => o.id === offerId) ?? null) : null),
    [offerId, offers],
  );

  const filtered = useMemo(
    () => applyFilters(offers, filters),
    [offers, filters],
  );
  const visible = filtered.slice(0, visibleCount);

  const selections = useMemo(
    () => (query ? selectionsFromQuery(query) : null),
    [query],
  );

  // Plain-IATA labels ("CEB") upgrade to "Cebu (CEB)" once places resolve.
  const [labels, setLabels] = useState<Map<string, string>>(() => new Map());
  useEffect(() => {
    if (!selections) return;
    const bare = [selections.origin, selections.destination].filter(
      (s) => /^[A-Z]{3}$/.test(s.label) && !labels.has(s.iata),
    );
    if (bare.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        bare.map(async (s) => {
          try {
            const res = await fetch(`/api/places?q=${s.iata}`);
            const body = (await res.json()) as {
              places?: { kind: string; iata?: string; city?: string; name?: string }[];
            };
            const hit = body.places?.find(
              (p) => p.kind === "airport" && p.iata === s.iata,
            );
            return [
              s.iata,
              hit ? `${hit.city || hit.name} (${s.iata})` : s.label,
            ] as const;
          } catch {
            return [s.iata, s.label] as const;
          }
        }),
      );
      if (!cancelled) {
        setLabels((prev) => {
          const next = new Map(prev);
          for (const [iata, label] of entries) next.set(iata, label);
          return next;
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selections]);

  const upgradedSelections = useMemo(() => {
    if (!selections) return null;
    const upgrade = (s: NonNullable<typeof selections>["origin"]) =>
      labels.has(s.iata) && /^[A-Z]{3}$/.test(s.label)
        ? { ...s, label: labels.get(s.iata)! }
        : s;
    return {
      origin: upgrade(selections.origin),
      destination: upgrade(selections.destination),
    };
  }, [selections, labels]);

  if (paramsError || !query) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-24 text-center">
        <p className="text-lg text-slate-300">
          {paramsError ?? "Invalid search"}
        </p>
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
      <LoadingBar active={isStreaming} />
      <div className="sticky top-0 z-40 -mx-6 bg-gradient-to-b from-[#070f20] via-[#070f20]/95 to-transparent px-6 pt-4 pb-5">
        <SearchBar
          compact
          key={`${query.origin}-${query.destination}-${query.departDate}-${upgradedSelections?.origin.label}-${upgradedSelections?.destination.label}`}
          initial={query}
          initialSelections={upgradedSelections ?? undefined}
        />
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
              passengerCount={
                query.passengers.adults +
                query.passengers.childAges.length +
                query.passengers.infants
              }
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

          {query.flexDays ? <FlexDateStrip query={query} /> : null}

          {(profile?.summary_cards ?? true) && !isStreaming && (
            <SummaryCards
              offers={filtered}
              sortMode={sortMode}
              onSort={setSortMode}
            />
          )}

          <div className="space-y-4">
            {visible.map((offer, i) => (
              <FlightCard
                key={offer.dedupeKey}
                offer={offer}
                isBest={sortMode === "best" && i === 0 && !isStreaming}
                onOpen={openDetails}
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

      {offerId && query && (
        <DetailsPanel
          query={query}
          offerId={offerId}
          streamedOffer={streamedOffer}
          onClose={closeDetails}
        />
      )}
    </main>
  );
}

export default function FlightsPage({
  params,
}: PageProps<"/flights/[origin]/[destination]/[[...slug]]">) {
  const { origin, destination, slug } = use(params);
  return (
    <Suspense fallback={null}>
      <FlightsContent origin={origin} destination={destination} slug={slug} />
    </Suspense>
  );
}
