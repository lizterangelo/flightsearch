import type { FlightLeg, FlightOffer, ProviderId } from "./types";

/**
 * Dedupe key: carrier + origin + departure minute per segment, "|" between
 * legs. Deliberately NOT the flight number — sources differ in fidelity
 * (Google's RPC feed omits flight numbers entirely), and one carrier cannot
 * depart the same airport at the same minute twice, so this structural key
 * lets thin and rich sources merge onto the same physical flight. Hidden-city
 * offers are namespaced "HC:" so they never merge with normal fares.
 */
export function dedupeKeyForLegs(
  legs: FlightLeg[],
  hiddenCity: boolean,
): string {
  const key = legs
    .map((leg) =>
      leg.segments
        .map((s) => {
          const carrier = (s.carrierCode || s.carrierName || s.flightNumber)
            .replace(/\s+/g, "")
            .toUpperCase();
          return `${carrier}@${s.origin}@${s.departure.slice(0, 16)}`;
        })
        .join(","),
    )
    .join("|");
  return hiddenCity ? `HC:${key}` : key;
}

/** Cheap stable hash for offer ids. */
export function hashId(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = (h * 33) ^ input.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

const FRESHNESS_RANK: Record<FlightOffer["freshness"], number> = {
  live: 0,
  "hidden-city": 1,
  cached: 2,
};

/**
 * Merge an incoming offer into the accumulated map. Same dedupeKey → keep the
 * cheaper totalUSD (and its deeplink/source), union the sources list, prefer
 * the fresher freshness label, and keep the richer leg detail (more segments
 * beats synthetic single-segment legs).
 */
export function mergeOffer(
  map: Map<string, FlightOffer>,
  incoming: FlightOffer,
): void {
  const existing = map.get(incoming.dedupeKey);
  if (!existing) {
    map.set(incoming.dedupeKey, {
      ...incoming,
      sources: [...new Set(incoming.sources)],
    });
    return;
  }

  const sources = [...new Set<ProviderId>([...existing.sources, ...incoming.sources])];
  const cheaperIncoming = incoming.price.totalUSD < existing.price.totalUSD;
  const base = cheaperIncoming ? incoming : existing;
  const other = cheaperIncoming ? existing : incoming;

  const richerLegs =
    other.legs.reduce((n, l) => n + l.segments.length, 0) >
    base.legs.reduce((n, l) => n + l.segments.length, 0)
      ? other.legs
      : base.legs;

  map.set(incoming.dedupeKey, {
    ...base,
    legs: richerLegs,
    sources,
    freshness:
      FRESHNESS_RANK[base.freshness] <= FRESHNESS_RANK[other.freshness]
        ? base.freshness
        : other.freshness,
  });
}
