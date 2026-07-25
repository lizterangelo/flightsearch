import { recordWatchPrice, staleWatches, type WatchRow } from "./db";
import { runSearchStream } from "./duffel/search";
import { itineraryKeyFor, parseSearchQuery } from "./types";
import type { FlightOffer } from "./types";

/**
 * Price watches: a watch pins an itinerary (flight numbers + dates + cabin)
 * and its last seen price; refresh re-searches and records the delta.
 */

/** Re-price one watch: search its saved URL and match by itinerary key. */
async function refreshWatch(watch: WatchRow): Promise<void> {
  const url = new URL(watch.search_url, "http://localhost");
  // Saved as /flights/o/d/date[/date]?... — rebuild the query from it.
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 4 || parts[0] !== "flights") return;
  const [, origin, destination, out, ret] = parts;
  const sp = new URLSearchParams(url.search);
  sp.set("origin", origin.toUpperCase());
  sp.set("destination", destination.toUpperCase());
  sp.set("departDate", `20${out.slice(0, 2)}-${out.slice(2, 4)}-${out.slice(4, 6)}`);
  if (ret && /^\d{6}$/.test(ret)) {
    sp.set("returnDate", `20${ret.slice(0, 2)}-${ret.slice(2, 4)}-${ret.slice(4, 6)}`);
    sp.set("tripType", "round_trip");
  } else {
    sp.set("tripType", "one_way");
  }

  let offers: FlightOffer[] = [];
  try {
    const query = parseSearchQuery(sp);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    try {
      offers = await runSearchStream(
        query,
        [{ origin: query.origin, destination: query.destination }],
        () => {},
        controller.signal,
      );
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return; // Past dates / invalid → leave the watch untouched.
  }
  if (offers.length === 0) return;

  const exact = offers.find((o) => itineraryKeyFor(o) === watch.itinerary_key);
  // Fall back to the cheapest offer on the route as a proxy price.
  const price = exact?.displayUSD ?? Math.min(...offers.map((o) => o.displayUSD));
  recordWatchPrice(watch.id, Math.round(price));
}

const STALE_MINUTES = 30;
const MAX_PER_REFRESH = 5;
let refreshInFlight = false;

/** Refresh up to MAX_PER_REFRESH stale watches; serialized globally. */
export async function refreshStaleWatches(): Promise<number> {
  if (refreshInFlight) return 0;
  refreshInFlight = true;
  try {
    const stale = staleWatches(MAX_PER_REFRESH, STALE_MINUTES);
    for (const watch of stale) {
      await refreshWatch(watch);
    }
    return stale.length;
  } finally {
    refreshInFlight = false;
  }
}
