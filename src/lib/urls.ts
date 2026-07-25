import type { SearchQuery } from "./types";
import { parseSearchQuery } from "./types";

/**
 * Pretty flight URLs:
 *   /flights/ceb/hnd/260812/           (one-way)
 *   /flights/ceb/hnd/260812/260819/    (round trip)
 *   /flights/ceb/hnd/260812/260819/off_ABC123   (details overlay)
 * with query params: origin_any / destination_any / adults / children /
 * infants / cabin / flex / select_*.
 */

/** "2026-08-12" → "260812". */
export function isoToYymmdd(iso: string): string {
  return iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10);
}

/** "260812" → "2026-08-12" (assumes 20xx). */
export function yymmddToIso(yymmdd: string): string {
  return `20${yymmdd.slice(0, 2)}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
}

const YYMMDD = /^\d{6}$/;
const OFFER_ID = /^off_[A-Za-z0-9]+$/;

/** Build the /flights path (+query string) for a search. */
export function buildFlightsPath(q: SearchQuery, offerId?: string): string {
  const parts = [
    "/flights",
    q.origin.toLowerCase(),
    q.destination.toLowerCase(),
    isoToYymmdd(q.departDate),
  ];
  if (q.tripType === "round_trip" && q.returnDate) {
    parts.push(isoToYymmdd(q.returnDate));
  }
  if (offerId) parts.push(offerId);

  const sp = new URLSearchParams();
  if (q.originAny) sp.set("origin_any", q.originAny);
  if (q.destinationAny) sp.set("destination_any", q.destinationAny);
  if (q.passengers.adults !== 1) sp.set("adults", String(q.passengers.adults));
  if (q.passengers.childAges.length)
    sp.set("children", q.passengers.childAges.join(","));
  if (q.passengers.infants) sp.set("infants", String(q.passengers.infants));
  if (q.cabin !== "economy") sp.set("cabin", q.cabin);
  if (q.flexDays) sp.set("flex", String(q.flexDays));

  const qs = sp.toString();
  return `${parts.join("/")}/${qs ? `?${qs}` : ""}`;
}

export interface ParsedFlightsPath {
  query: SearchQuery;
  /** Present when the path ends in an offer id (details overlay open). */
  offerId?: string;
}

/**
 * Parse the catch-all segments + query params of /flights/[origin]/[destination]/[[...slug]].
 * Throws on malformed input (caller renders the error state).
 */
export function parseFlightsPath(
  origin: string,
  destination: string,
  slug: string[] | undefined,
  searchParams: URLSearchParams,
): ParsedFlightsPath {
  const parts = (slug ?? []).filter(Boolean);

  let offerId: string | undefined;
  if (parts.length && OFFER_ID.test(parts[parts.length - 1])) {
    offerId = parts.pop();
  }
  if (parts.length < 1 || parts.length > 2 || parts.some((p) => !YYMMDD.test(p))) {
    throw new Error("Invalid dates in URL");
  }
  const [outYymmdd, retYymmdd] = parts;

  // Reuse the query-string validator by synthesizing its input.
  const sp = new URLSearchParams(searchParams);
  sp.set("origin", origin.toUpperCase());
  sp.set("destination", destination.toUpperCase());
  sp.set("departDate", yymmddToIso(outYymmdd));
  if (retYymmdd) {
    sp.set("returnDate", yymmddToIso(retYymmdd));
    sp.set("tripType", "round_trip");
  } else {
    sp.delete("returnDate");
    sp.set("tripType", "one_way");
  }
  return { query: parseSearchQuery(sp), offerId };
}
