"use client";

import type { FlightOffer } from "@/lib/types";
import Dropdown, { Chevron, MenuItem } from "../search/Dropdown";

export type TimeBucket = "early" | "morning" | "afternoon" | "evening";

export interface Filters {
  /** null = any; 0 = nonstop only; 1 = max 1 stop. */
  maxStops: number | null;
  /** null = all airlines; otherwise the allowed carrier codes. */
  airlines: Set<string> | null;
  /** null = any departure time. */
  timeBuckets: Set<TimeBucket> | null;
}

export const EMPTY_FILTERS: Filters = {
  maxStops: null,
  airlines: null,
  timeBuckets: null,
};

const BUCKET_LABELS: Record<TimeBucket, string> = {
  early: "Early (before 8 AM)",
  morning: "Morning (8 AM – 12 PM)",
  afternoon: "Afternoon (12 – 6 PM)",
  evening: "Evening (after 6 PM)",
};

export function departureBucket(offer: FlightOffer): TimeBucket {
  const hour = Number(offer.legs[0]?.departure.slice(11, 13) ?? 12);
  if (hour < 8) return "early";
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

export function offerCarriers(offer: FlightOffer): string[] {
  return [
    ...new Set(
      offer.legs.flatMap((leg) =>
        leg.segments.map((s) => s.carrierCode || s.carrierName),
      ),
    ),
  ];
}

export function applyFilters(
  offers: FlightOffer[],
  filters: Filters,
): FlightOffer[] {
  return offers.filter((offer) => {
    if (filters.maxStops !== null) {
      const worst = Math.max(...offer.legs.map((l) => l.stops));
      if (worst > filters.maxStops) return false;
    }
    if (filters.airlines) {
      if (!offerCarriers(offer).some((c) => filters.airlines!.has(c)))
        return false;
    }
    if (filters.timeBuckets && !filters.timeBuckets.has(departureBucket(offer)))
      return false;
    return true;
  });
}

function Check() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-4 text-accent-bright">
      <path
        d="M4 10.5l4 4 8-9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const pill = (active: boolean) =>
  `flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium ${
    active
      ? "border-accent/50 bg-accent/15 text-white"
      : "border-card-border bg-pill/80 text-slate-200"
  }`;

/** Stops / Airlines / Times filter dropdowns (all client-side). */
export default function FilterBar({
  offers,
  filters,
  onChange,
}: {
  /** Unfiltered offers — used to derive airline options with counts. */
  offers: FlightOffer[];
  filters: Filters;
  onChange: (filters: Filters) => void;
}) {
  const airlineCounts = new Map<string, { name: string; count: number }>();
  for (const offer of offers) {
    for (const code of offerCarriers(offer)) {
      const name =
        offer.legs
          .flatMap((l) => l.segments)
          .find((s) => (s.carrierCode || s.carrierName) === code)?.carrierName ??
        code;
      const entry = airlineCounts.get(code) ?? { name, count: 0 };
      entry.count += 1;
      airlineCounts.set(code, entry);
    }
  }
  const airlineOptions = [...airlineCounts.entries()].sort(
    (a, b) => b[1].count - a[1].count,
  );

  return (
    <div className="flex items-center gap-2.5">
      <Dropdown
        trigger={(open) => (
          <span className={pill(filters.maxStops !== null)}>
            Stops
            <Chevron open={open} />
          </span>
        )}
      >
        {(close) => (
          <>
            {[
              { value: null, label: "Any number of stops" },
              { value: 0, label: "Nonstop only" },
              { value: 1, label: "1 stop or fewer" },
            ].map(({ value, label }) => (
              <MenuItem
                key={String(value)}
                selected={filters.maxStops === value}
                onClick={() => {
                  onChange({ ...filters, maxStops: value });
                  close();
                }}
              >
                <span>{label}</span>
                {filters.maxStops === value && <Check />}
              </MenuItem>
            ))}
          </>
        )}
      </Dropdown>

      <Dropdown
        trigger={(open) => (
          <span className={pill(filters.airlines !== null)}>
            Airlines
            <Chevron open={open} />
          </span>
        )}
      >
        <div className="max-h-72 w-60 overflow-y-auto">
          <MenuItem
            selected={filters.airlines === null}
            onClick={() => onChange({ ...filters, airlines: null })}
          >
            <span>All airlines</span>
            {filters.airlines === null && <Check />}
          </MenuItem>
          {airlineOptions.map(([code, { name, count }]) => {
            const checked = filters.airlines?.has(code) ?? false;
            return (
              <MenuItem
                key={code}
                selected={checked}
                onClick={() => {
                  const next = new Set(filters.airlines ?? []);
                  if (checked) next.delete(code);
                  else next.add(code);
                  onChange({
                    ...filters,
                    airlines: next.size === 0 ? null : next,
                  });
                }}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{name}</span>
                  <span className="text-xs text-muted">({count})</span>
                </span>
                {checked && <Check />}
              </MenuItem>
            );
          })}
        </div>
      </Dropdown>

      <Dropdown
        trigger={(open) => (
          <span className={pill(filters.timeBuckets !== null)}>
            Times
            <Chevron open={open} />
          </span>
        )}
      >
        <div className="w-60">
          <MenuItem
            selected={filters.timeBuckets === null}
            onClick={() => onChange({ ...filters, timeBuckets: null })}
          >
            <span>Any departure time</span>
            {filters.timeBuckets === null && <Check />}
          </MenuItem>
          {(Object.keys(BUCKET_LABELS) as TimeBucket[]).map((bucket) => {
            const checked = filters.timeBuckets?.has(bucket) ?? false;
            return (
              <MenuItem
                key={bucket}
                selected={checked}
                onClick={() => {
                  const next = new Set(filters.timeBuckets ?? []);
                  if (checked) next.delete(bucket);
                  else next.add(bucket);
                  onChange({
                    ...filters,
                    timeBuckets: next.size === 0 ? null : next,
                  });
                }}
              >
                <span>{BUCKET_LABELS[bucket]}</span>
                {checked && <Check />}
              </MenuItem>
            );
          })}
        </div>
      </Dropdown>
    </div>
  );
}
