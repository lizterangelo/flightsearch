import { airportByIata, distanceMiles } from "./airports";
import { addDaysYmd, todayLocalYmd } from "./dates";
import { calendarWindow, upsertObservation } from "./data";
import { runSearchStream } from "./duffel/search";
import { flags } from "./env";
import type { Cabin, FlightOffer } from "./types";

/**
 * The price-observation layer behind the calendar heatmap: every live
 * search feeds it, and (opt-in) a capped background fill runs one-way
 * searches for missing days.
 */

export function recordObservations(offers: FlightOffer[]): void {
  // Cheapest per (route, departure date, trip type) across this batch.
  const best = new Map<
    string,
    {
      origin: string;
      destination: string;
      date: string;
      tripType: string;
      amountUSD: number;
    }
  >();
  for (const offer of offers) {
    const tripType = offer.slices.length > 1 ? "round_trip" : "one_way";
    for (const slice of offer.slices) {
      const date = slice.departure.slice(0, 10);
      const key = `${slice.origin}|${slice.destination}|${date}|${tripType}`;
      // Round-trip totals halved per direction — approximate but useful.
      const amountUSD =
        offer.slices.length > 1 ? offer.displayUSD / 2 : offer.displayUSD;
      const existing = best.get(key);
      if (!existing || amountUSD < existing.amountUSD) {
        best.set(key, {
          origin: slice.origin,
          destination: slice.destination,
          date,
          tripType,
          amountUSD,
        });
      }
    }
  }
  for (const row of best.values()) {
    try {
      void upsertObservation({
        origin: row.origin,
        destination: row.destination,
        departDate: row.date,
        cabin: "economy",
        tripType: "one_way",
        amountUSD: Math.round(row.amountUSD),
        source: row.tripType === "round_trip" ? "rt_half" : "live_search",
      });
    } catch {
      // Observations are best-effort; never break a search over them.
    }
  }
}

export type Tier = "cheap" | "medium" | "expensive";

export interface CalendarPayload {
  origin: string;
  destination: string;
  start: string;
  end: string;
  cabin: Cabin | string;
  currency: "USD";
  average_amount: number | null;
  threshold: number;
  cache_fill: { fetched: boolean; rows: number; scheduled: boolean };
  prices: {
    date: string;
    amount: number;
    currency: "USD";
    source: string;
    observed_at: string;
    expires_at: string;
    tier: Tier;
  }[];
}

const THRESHOLD = 0.12;
const MAX_WINDOW_DAYS = 366;

/** FNV-1a → [0,1): stable per-day jitter so estimates never flicker. */
function hash01(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4294967296;
}

/** Day-of-week demand curve (Sun..Sat): weekends pricier, midweek dips. */
const DOW_FACTOR = [0.12, 0.02, -0.06, -0.05, 0.01, 0.1, 0.05];

/**
 * Anchor fare for a route when nothing was observed yet: distance-derived,
 * clamped to the band Duffel test fares live in.
 */
function heuristicBase(origin: string, destination: string): number | null {
  const o = airportByIata(origin);
  const d = airportByIata(destination);
  if (!o || !d) return null;
  const fare = 45 + distanceMiles(o, d) * 0.11;
  return Math.round(Math.min(899, Math.max(59, fare)));
}

/**
 * Their calendar tints every future day, not just searched ones: observed
 * fares where the cache has them, deterministic estimates everywhere else
 * (anchored to the route's observed median, or a distance heuristic).
 * Estimates are display-only — never persisted — and marked source:"estimate".
 */
export async function buildCalendar(params: {
  origin: string;
  destination: string;
  cabin: string;
  start: string;
  end: string;
  scheduled: boolean;
}): Promise<CalendarPayload> {
  const rows = await calendarWindow(params);
  const observed = new Map(rows.map((r) => [r.depart_date, r]));

  const sorted = rows.map((r) => r.amount_usd).sort((a, b) => a - b);
  const base =
    sorted.length > 0
      ? sorted[Math.floor(sorted.length / 2)]
      : heuristicBase(params.origin, params.destination);

  const today = todayLocalYmd();
  const first = params.start > today ? params.start : today;
  const nowIso = new Date().toISOString();

  const merged: {
    date: string;
    amount: number;
    source: string;
    observed_at: string;
    expires_at: string;
  }[] = [];
  for (
    let date = first, i = 0;
    date <= params.end && i < MAX_WINDOW_DAYS;
    date = addDaysYmd(date, 1), i++
  ) {
    const row = observed.get(date);
    if (row) {
      merged.push({
        date,
        amount: Math.round(row.amount_usd),
        source: row.source,
        observed_at: row.observed_at,
        expires_at: row.expires_at,
      });
      continue;
    }
    if (base === null) continue;
    const [y, m, d] = date.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    const dayOfYear =
      (dt.getTime() - new Date(y, 0, 1).getTime()) / 86400000 + 1;
    const seasonal = Math.sin((dayOfYear / 365) * Math.PI * 2) * 0.04;
    const jitter =
      (hash01(
        `${params.origin}|${params.destination}|${date}|${params.cabin}`,
      ) -
        0.5) *
      0.32;
    const factor = 1 + DOW_FACTOR[dt.getDay()] + seasonal + jitter;
    merged.push({
      date,
      amount: Math.max(1, Math.round(base * factor)),
      source: "estimate",
      observed_at: nowIso,
      expires_at: nowIso,
    });
  }

  const average =
    merged.length > 0
      ? merged.reduce((sum, r) => sum + r.amount, 0) / merged.length
      : null;

  const tierOf = (amount: number): Tier => {
    if (average === null) return "medium";
    if (amount <= average * (1 - THRESHOLD)) return "cheap";
    if (amount >= average * (1 + THRESHOLD)) return "expensive";
    return "medium";
  };

  return {
    origin: params.origin,
    destination: params.destination,
    start: params.start,
    end: params.end,
    cabin: params.cabin,
    currency: "USD",
    average_amount: average === null ? null : Math.round(average),
    threshold: THRESHOLD,
    cache_fill: {
      fetched: false,
      rows: rows.length,
      scheduled: params.scheduled,
    },
    prices: merged.map((r) => ({
      date: r.date,
      amount: r.amount,
      currency: "USD" as const,
      source: r.source,
      observed_at: r.observed_at,
      expires_at: r.expires_at,
      tier: tierOf(r.amount),
    })),
  };
}

/* ------------------------- opt-in background fill ------------------------ */

const FILL_SEARCHES_PER_TRIGGER = 5;
const FILL_COOLDOWN_MS = 6 * 3600_000;
const fillCooldowns = new Map<string, number>();
let fillInFlight = false;

/**
 * Fire-and-forget: run a few one-way searches spread over the next months
 * to seed the calendar for a route. Caps + cooldown protect rate limits.
 */
export function maybeScheduleFill(origin: string, destination: string): boolean {
  if (!flags.calendarFill()) return false;
  const key = `${origin}-${destination}`;
  const last = fillCooldowns.get(key) ?? 0;
  if (fillInFlight || Date.now() - last < FILL_COOLDOWN_MS) return false;

  fillCooldowns.set(key, Date.now());
  fillInFlight = true;

  const today = todayLocalYmd();
  const offsets = [10, 30, 60, 100, 150].slice(0, FILL_SEARCHES_PER_TRIGGER);

  void (async () => {
    try {
      for (const offset of offsets) {
        const departDate = addDaysYmd(today, offset);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 45_000);
        try {
          const offers = await runSearchStream(
            {
              origin,
              destination,
              departDate,
              tripType: "one_way",
              passengers: { adults: 1, childAges: [], infants: 0 },
              cabin: "economy",
            },
            [{ origin, destination }],
            () => {},
            controller.signal,
          );
          recordObservations(offers);
        } catch {
          // Fill is best-effort.
        } finally {
          clearTimeout(timer);
        }
      }
    } finally {
      fillInFlight = false;
    }
  })();
  return true;
}
