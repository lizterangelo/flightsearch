import type { FlightOffer, ProviderId } from "./types";

/**
 * The "Google baseline" — the cheapest total a Google-sourced provider
 * returned for this search. Offers at least $1 below it earn the
 * "Cheaper than Google Flights" badge.
 */

const GOOGLE_SOURCES: ProviderId[] = ["serpapi", "fast-flights", "agent:google"];

export function isGoogleSource(source: ProviderId): boolean {
  return GOOGLE_SOURCES.includes(source);
}

export function baselineFromOffers(
  offers: FlightOffer[],
  source: ProviderId,
): { totalUSD: number; perTravelerUSD: number; source: ProviderId } | null {
  if (!isGoogleSource(source) || offers.length === 0) return null;
  const cheapest = offers.reduce((min, o) =>
    o.price.totalUSD < min.price.totalUSD ? o : min,
  );
  return {
    totalUSD: cheapest.price.totalUSD,
    perTravelerUSD:
      cheapest.price.totalUSD /
      Math.max(1, cheapest.price.total / Math.max(cheapest.price.perTraveler, 1)),
    source,
  };
}

export function savingsVsBaseline(
  offer: FlightOffer,
  baselineUSD: number | null,
): number | null {
  if (baselineUSD === null) return null;
  const savings = baselineUSD - offer.price.totalUSD;
  return savings >= 1 ? savings : null;
}
