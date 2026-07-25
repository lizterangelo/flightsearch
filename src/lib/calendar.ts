import { addDaysYmd, todayLocalYmd } from "./dates";
import { calendarWindow, upsertObservation } from "./db";
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
      upsertObservation({
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

export function buildCalendar(params: {
  origin: string;
  destination: string;
  cabin: string;
  start: string;
  end: string;
  scheduled: boolean;
}): CalendarPayload {
  const rows = calendarWindow(params);
  const average =
    rows.length > 0
      ? rows.reduce((sum, r) => sum + r.amount_usd, 0) / rows.length
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
    average_amount: average,
    threshold: THRESHOLD,
    cache_fill: {
      fetched: false,
      rows: rows.length,
      scheduled: params.scheduled,
    },
    prices: rows.map((r) => ({
      date: r.depart_date,
      amount: Math.round(r.amount_usd),
      currency: "USD" as const,
      source: r.source,
      observed_at: r.observed_at,
      expires_at: r.expires_at,
      tier: tierOf(r.amount_usd),
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
