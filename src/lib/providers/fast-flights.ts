import {
  CaptchaError,
  createQuery,
  getFlights,
  HttpError,
  Passengers,
} from "fast-flights-ts";
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
import {
  BlockedError,
  CaptchaChallengeError,
  type FlightProvider,
} from "./provider";

/**
 * Zero-key Google Flights source via fast-flights-ts (direct RPC to
 * GetShoppingResults). The package's lenient parser defaults missing fields
 * to 0/"" instead of failing, so everything it returns is re-validated here
 * before mapping — schema mismatch throws, zeroed-out rows are dropped.
 */

const IATA = /^[A-Z]{3}$/;

const simpleDatetimeSchema = z.object({
  // date comes straight off Google's payload: [year, month(1-12), day, ...].
  date: z.array(z.number()).min(3),
  time: z.tuple([z.number(), z.number()]),
});

const segmentSchema = z.object({
  from_airport: z.object({ code: z.string(), name: z.string() }),
  to_airport: z.object({ code: z.string(), name: z.string() }),
  departure: simpleDatetimeSchema,
  arrival: simpleDatetimeSchema,
  duration: z.number(),
});

const itinerarySchema = z.object({
  // Despite the name, `type` carries the itinerary's IATA carrier code
  // ("AA", "B6" — verified live). Cosmetic only, so tolerate drift.
  type: z.string().catch(""),
  price: z.number(),
  airlines: z.array(z.string()),
  flights: z.array(segmentSchema),
});

const resultsSchema = z.array(itinerarySchema);

type RawDatetime = z.infer<typeof simpleDatetimeSchema>;
type RawItinerary = z.infer<typeof itinerarySchema>;

const SEAT: Record<Cabin, "economy" | "premium-economy" | "business" | "first"> =
  {
    economy: "economy",
    premium_economy: "premium-economy",
    business: "business",
    first: "first",
  };

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

function isoLocal(dt: RawDatetime): string {
  const [y, mo, d] = dt.date;
  const [h, mi] = dt.time;
  return `${pad(y, 4)}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}`;
}

/**
 * Fixed-frame minute count. Only ever diffed between times at the SAME
 * airport (layovers), where the timezone cancels out — never for display.
 */
function wallMinutes(dt: RawDatetime): number {
  const [y, mo, d] = dt.date;
  const [h, mi] = dt.time;
  return Date.UTC(y, mo - 1, d, h, mi) / 60_000;
}

function plausible(dt: RawDatetime): boolean {
  const [y, mo, d] = dt.date;
  const [h, mi] = dt.time;
  return (
    y >= 2000 && y <= 2100 &&
    mo >= 1 && mo <= 12 &&
    d >= 1 && d <= 31 &&
    h >= 0 && h <= 23 &&
    mi >= 0 && mi <= 59
  );
}

/** null → row is partial/garbage (dropped), not shape drift. */
function toLeg(row: RawItinerary): FlightLeg | null {
  if (row.price <= 0 || row.flights.length === 0 || row.airlines.length === 0)
    return null;
  for (const f of row.flights) {
    if (!plausible(f.departure) || !plausible(f.arrival)) return null;
    if (!IATA.test(f.from_airport.code) || !IATA.test(f.to_airport.code))
      return null;
  }

  // No per-segment flight numbers in this feed; carrierName carries the
  // airline(s) so dedupeKeyForLegs falls back to it.
  const carrierName = row.airlines.join(" / ");
  const carrierCode = /^[A-Z0-9]{2}$/.test(row.type) ? row.type : "";
  const segments: FlightSegment[] = row.flights.map((f) => ({
    carrierCode,
    carrierName,
    flightNumber: "",
    origin: f.from_airport.code,
    destination: f.to_airport.code,
    departure: isoLocal(f.departure),
    arrival: isoLocal(f.arrival),
    durationMinutes: Math.max(0, Math.round(f.duration)),
  }));

  const first = segments[0];
  const last = segments[segments.length - 1];
  // A leg that loops back to its origin means the row bundled both bounds —
  // not a shape we can trust as an outbound leg.
  if (first.origin === last.destination) return null;

  // Air time + layovers (each layover is a same-airport wall-time diff).
  let durationMinutes = segments.reduce((s, seg) => s + seg.durationMinutes, 0);
  for (let i = 1; i < row.flights.length; i++) {
    durationMinutes += Math.max(
      0,
      wallMinutes(row.flights[i].departure) -
        wallMinutes(row.flights[i - 1].arrival),
    );
  }

  return {
    segments,
    origin: first.origin,
    destination: last.destination,
    departure: first.departure,
    arrival: last.arrival,
    durationMinutes,
    stops: segments.length - 1,
    stopAirports: segments.slice(0, -1).map((s) => s.destination),
    overnight: last.arrival.slice(0, 10) > first.departure.slice(0, 10),
  };
}

export const fastFlightsProvider: FlightProvider = {
  id: "fast-flights",
  label: "Google (direct)",
  tier: 1,
  timeoutMs: 20_000,
  cacheTtlMs: 1_800_000,

  // Zero-key provider; the registry decides when it actually runs.
  enabled: () => true,

  async search(params: SearchParams, signal: AbortSignal): Promise<FlightOffer[]> {
    const roundTrip = params.tripType === "round_trip" && Boolean(params.returnDate);
    const flights = [
      {
        date: params.departDate,
        from_airport: params.origin,
        to_airport: params.destination,
      },
    ];
    if (roundTrip && params.returnDate) {
      flights.push({
        date: params.returnDate,
        from_airport: params.destination,
        to_airport: params.origin,
      });
    }

    const query = createQuery({
      flights,
      seat: SEAT[params.cabin],
      trip: roundTrip ? "round-trip" : "one-way",
      passengers: new Passengers({ adults: params.adults }),
      currency: "USD",
    });

    let raw: unknown;
    try {
      // Library timeout kept above our 20s budget so the guard's abort (a
      // real AbortError) fires first — the lib's TimeoutError would be
      // misclassified as "error" instead of "timeout".
      raw = await getFlights(query, { signal, timeout: 25_000 });
    } catch (err) {
      if (err instanceof CaptchaError)
        throw new CaptchaChallengeError(err.message);
      if (err instanceof HttpError && (err.status === 403 || err.status === 429))
        throw new BlockedError(err.message);
      throw err; // incl. AbortError from our signal — must propagate untouched
    }

    const parsed = resultsSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new Error(
        `fast-flights shape drift: ${
          issue ? `${issue.path.join(".")}: ${issue.message}` : "unrecognized result"
        }`,
      );
    }

    const byKey = new Map<string, FlightOffer>();
    for (const row of parsed.data) {
      const leg = toLeg(row);
      if (!leg) continue;

      const legs = [leg];
      const dedupeKey = dedupeKeyForLegs(legs, false);
      // Passenger counts are encoded into the RPC request (buildRpcPayload
      // pax array) and Google prices each option for the whole party, so
      // `price` is already the all-passenger total in the requested currency.
      const total = row.price;

      const offer: FlightOffer = {
        id: hashId(`${dedupeKey}:fast-flights`),
        dedupeKey,
        source: "fast-flights",
        sources: ["fast-flights"],
        freshness: "live",
        price: {
          total,
          perTraveler: total / params.adults,
          currency: "USD",
          totalUSD: toUSD(total, "USD"),
        },
        legs,
        deeplink: googleFlightsLink(params),
      };
      // Google convention: round-trip results are outbound options priced at
      // the round-trip total; the return leg is chosen on Google itself.
      if (roundTrip) offer.returnLegPending = true;

      const existing = byKey.get(dedupeKey);
      if (!existing || offer.price.totalUSD < existing.price.totalUSD) {
        byKey.set(dedupeKey, offer);
      }
    }

    // Rows arrived but none survived sanity checks → systematic drift, not
    // a legitimately empty market.
    if (byKey.size === 0 && parsed.data.length > 0) {
      throw new Error(
        `fast-flights shape drift: all ${parsed.data.length} rows failed sanity checks`,
      );
    }
    return [...byKey.values()];
  },
};
