import {
  type FlightOffer,
  totalDurationMinutes,
  totalStops,
} from "./types";

export type SortMode = "best" | "cheapest" | "fastest";

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Best score (lower = better):
 *   0.55·priceN + 0.30·durN + 0.15·(min(stops,2)/2) + penalties
 * priceN/durN normalized min→P90 of the *current* result set (P90 not max so
 * one outlier doesn't flatten the scale). Penalties: +0.15 hidden-city,
 * +0.05 cached freshness, +0.05 returnLegPending.
 */
export function scoreBest(
  offer: FlightOffer,
  ctx: { minPrice: number; p90Price: number; minDur: number; p90Dur: number },
): number {
  const price = offer.price.totalUSD;
  const dur = totalDurationMinutes(offer);
  const priceSpan = Math.max(1, ctx.p90Price - ctx.minPrice);
  const durSpan = Math.max(1, ctx.p90Dur - ctx.minDur);

  let score =
    0.55 * clamp01((price - ctx.minPrice) / priceSpan) +
    0.3 * clamp01((dur - ctx.minDur) / durSpan) +
    0.15 * (Math.min(totalStops(offer), 2) / 2);

  if (offer.freshness === "hidden-city") score += 0.15;
  if (offer.freshness === "cached") score += 0.05;
  if (offer.returnLegPending) score += 0.05;
  // Split tickets are two bookings with no through-protection — a slight
  // demerit in Best, though they still win outright on Cheapest.
  if (offer.splitTicket) score += 0.08;
  // Sandbox fares sink to the bottom of Best — their prices are fiction.
  if (offer.bookable?.testData) score += 1;
  return score;
}

// Duffel sandbox fares have fabricated prices/durations; they must never
// outrank a real offer in any mode (Best handles this via a score penalty).
const testRank = (o: FlightOffer): number => (o.bookable?.testData ? 1 : 0);

export function sortOffers(
  offers: FlightOffer[],
  mode: SortMode,
): FlightOffer[] {
  const list = [...offers];
  if (mode === "cheapest") {
    return list.sort(
      (a, b) =>
        testRank(a) - testRank(b) ||
        a.price.totalUSD - b.price.totalUSD ||
        totalDurationMinutes(a) - totalDurationMinutes(b),
    );
  }
  if (mode === "fastest") {
    return list.sort(
      (a, b) =>
        testRank(a) - testRank(b) ||
        totalDurationMinutes(a) - totalDurationMinutes(b) ||
        a.price.totalUSD - b.price.totalUSD,
    );
  }
  // best — normalize over the current set, recomputed each call.
  const prices = list.map((o) => o.price.totalUSD).sort((x, y) => x - y);
  const durs = list.map(totalDurationMinutes).sort((x, y) => x - y);
  const ctx = {
    minPrice: prices[0] ?? 0,
    p90Price: percentile(prices, 0.9),
    minDur: durs[0] ?? 0,
    p90Dur: percentile(durs, 0.9),
  };
  return list.sort((a, b) => scoreBest(a, ctx) - scoreBest(b, ctx));
}
