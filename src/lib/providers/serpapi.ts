import { getJson } from "serpapi";
import { z } from "zod";
import { toUSD } from "../currency";
import { dedupeKeyForLegs, hashId } from "../dedupe";
import { googleFlightsLink } from "../deeplinks";
import type {
  Cabin,
  FlightLeg,
  FlightOffer,
  FlightSegment,
  SearchParams,
} from "../types";
import type { FlightProvider } from "./provider";

const TIMEOUT_MS = 25_000;

const CABIN_CODE: Record<Cabin, number> = {
  economy: 1,
  premium_economy: 2,
  business: 3,
  first: 4,
};

/* ------------------------------------------------------------------ */
/* Upstream response schema (subset we consume)                        */
/* ------------------------------------------------------------------ */

// Times arrive as "2026-08-01 07:15" local wall time (occasionally with
// seconds); we only ever slice to the minute.
const timeString = z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);

const endpointSchema = z.object({
  id: z.string(),
  time: timeString,
});

const flightSchema = z.object({
  departure_airport: endpointSchema,
  arrival_airport: endpointSchema,
  duration: z.number(),
  airline: z.string(),
  flight_number: z.string(),
  plane_and_crew_by: z.string().optional(),
});

const itinerarySchema = z.object({
  flights: z.array(flightSchema).min(1),
  layovers: z.array(z.object({ id: z.string() })).optional(),
  total_duration: z.number().optional(),
  // Rarely absent ("price unavailable" itineraries) — those are skipped.
  price: z.number().optional(),
});

const responseSchema = z.object({
  search_metadata: z.object({ status: z.string() }).optional(),
  error: z.string().optional(),
  best_flights: z.array(itinerarySchema).optional(),
  other_flights: z.array(itinerarySchema).optional(),
});

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** "2026-08-01 07:15" → "2026-08-01T07:15" (stays local wall time). */
function toLocalIso(t: string): string {
  return t.replace(" ", "T").slice(0, 16);
}

/**
 * The serpapi client rides on node:https and takes no AbortSignal, so honor
 * ours by racing it; the guard recognizes the DOMException as an abort.
 */
function raceAbort<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(resolve, reject).finally(() =>
      signal.removeEventListener("abort", onAbort),
    );
  });
}

/** On non-200 the serpapi client rejects with the raw body string. */
function normalizeUpstreamError(err: unknown): Error {
  if (err instanceof Error) return err;
  if (typeof err === "string") {
    try {
      const body: unknown = JSON.parse(err);
      const msg = z.object({ error: z.string() }).safeParse(body);
      if (msg.success) return new Error(`SerpAPI: ${msg.data.error}`);
    } catch {
      /* not JSON */
    }
    return new Error(`SerpAPI: ${err.slice(0, 200)}`);
  }
  return new Error(String(err));
}

function mapItinerary(
  it: z.infer<typeof itinerarySchema>,
  params: SearchParams,
): FlightOffer | null {
  if (typeof it.price !== "number") return null;

  const segments: FlightSegment[] = it.flights.map((f) => ({
    // flight_number is "F9 1234" — the prefix is the IATA carrier code.
    carrierCode: f.flight_number.trim().split(/\s+/)[0] ?? "",
    carrierName: f.airline,
    flightNumber: f.flight_number,
    origin: f.departure_airport.id,
    destination: f.arrival_airport.id,
    departure: toLocalIso(f.departure_airport.time),
    arrival: toLocalIso(f.arrival_airport.time),
    durationMinutes: f.duration,
    operatedBy: f.plane_and_crew_by,
  }));
  const first = segments[0];
  const last = segments[segments.length - 1];

  const leg: FlightLeg = {
    segments,
    origin: first.origin,
    destination: last.destination,
    departure: first.departure,
    arrival: last.arrival,
    durationMinutes:
      it.total_duration ?? segments.reduce((n, s) => n + s.durationMinutes, 0),
    stops: segments.length - 1,
    stopAirports: (it.layovers ?? []).map((l) => l.id),
    overnight: last.arrival.slice(0, 10) > first.departure.slice(0, 10),
  };
  const legs = [leg];

  // Price semantics: SerpAPI docs only say "this ticket price in the selected
  // currency", but the API mirrors the Google Flights UI, which quotes the
  // total for ALL travelers when adults > 1 — so `price` is the all-pax total.
  const total = it.price;
  const dedupeKey = dedupeKeyForLegs(legs, false);

  return {
    id: hashId(`${dedupeKey}:serpapi`),
    dedupeKey,
    source: "serpapi",
    sources: ["serpapi"],
    freshness: "live",
    price: {
      total,
      perTraveler: total / params.adults,
      currency: "USD",
      totalUSD: toUSD(total, "USD"),
    },
    legs,
    // Round-trip results are outbound options priced at the round-trip total;
    // the return leg is picked on Google via departure_token.
    ...(params.tripType === "round_trip" ? { returnLegPending: true } : {}),
    deeplink: googleFlightsLink(params),
  };
}

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

export const serpApiProvider: FlightProvider = {
  id: "serpapi",
  label: "Google Flights",
  tier: 1,
  timeoutMs: TIMEOUT_MS,
  cacheTtlMs: 3_600_000,

  enabled() {
    return Boolean(process.env.SERPAPI_KEY);
  },

  async search(params, signal) {
    const apiKey = process.env.SERPAPI_KEY;
    if (!apiKey) throw new Error("SERPAPI_KEY not configured");

    const request: Record<string, unknown> = {
      engine: "google_flights",
      api_key: apiKey,
      departure_id: params.origin,
      arrival_id: params.destination,
      outbound_date: params.departDate,
      type: params.tripType === "round_trip" ? 1 : 2,
      adults: params.adults,
      travel_class: CABIN_CODE[params.cabin],
      currency: "USD",
      hl: "en",
      gl: "us",
      deep_search: true,
      // Client-side socket timeout; kept above ours so the abort wins.
      timeout: TIMEOUT_MS + 5_000,
    };
    if (params.tripType === "round_trip") {
      request.return_date = params.returnDate;
    }

    let raw: unknown;
    try {
      raw = await raceAbort(getJson(request), signal);
    } catch (err) {
      if (err instanceof DOMException) throw err;
      throw normalizeUpstreamError(err);
    }

    const parsed = responseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error("SerpAPI: unrecognized response shape");
    }
    const json = parsed.data;
    if (json.error) throw new Error(`SerpAPI: ${json.error}`);
    const status = json.search_metadata?.status;
    if (status !== "Success") {
      throw new Error(`SerpAPI: search status "${status ?? "missing"}"`);
    }

    const itineraries = [
      ...(json.best_flights ?? []),
      ...(json.other_flights ?? []),
    ];
    const offers: FlightOffer[] = [];
    for (const it of itineraries) {
      const offer = mapItinerary(it, params);
      if (offer) offers.push(offer);
    }
    return offers;
  },
};
