import { Duffel } from "@duffel/api";
import type { Offer, OfferSliceSegment } from "@duffel/api/types";
import { toUSD } from "../currency";
import { dedupeKeyForLegs, hashId } from "../dedupe";
import type {
  Cabin,
  FlightLeg,
  FlightOffer,
  FlightSegment,
  SearchParams,
} from "../types";
import type { FlightProvider } from "./provider";

/**
 * Duffel — the bookable provider. Offers carry `bookable.offerId` so the UI
 * routes Book to the in-site checkout instead of a deep link.
 *
 * Test tokens (duffel_test_*) return sandbox fares ("Duffel Airways" and
 * airline sandboxes) with FAKE prices: those offers are namespaced in the
 * dedupe key so they can never merge with (or undercut) real offers, and the
 * UI labels them as test fares.
 */

let client: Duffel | null = null;

export function duffelClient(): Duffel {
  const token = process.env.DUFFEL_API_TOKEN;
  if (!token) throw new Error("DUFFEL_API_TOKEN missing");
  if (!client) client = new Duffel({ token });
  return client;
}

export function duffelTestMode(): boolean {
  return (process.env.DUFFEL_API_TOKEN ?? "").startsWith("duffel_test");
}

/** Duffel SDK errors carry an `errors[]` array; surface the first message. */
export function duffelErrorMessage(err: unknown): string {
  if (
    typeof err === "object" &&
    err !== null &&
    "errors" in err &&
    Array.isArray((err as { errors: unknown }).errors)
  ) {
    const first = (
      err as { errors: Array<{ message?: string; title?: string }> }
    ).errors[0];
    if (first?.message || first?.title) {
      return first.message ?? first.title ?? "Duffel error";
    }
  }
  return err instanceof Error ? err.message : "Duffel error";
}

/** "PT2H30M" → minutes; tolerates missing parts. */
function isoDurationMinutes(iso: string | null | undefined): number {
  if (!iso) return 0;
  const m = iso.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return 0;
  return (
    Number(m[1] ?? 0) * 24 * 60 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
  );
}

/** Duffel departing_at/arriving_at are local ISO without offset. */
function wall(t: string): string {
  return t.slice(0, 16);
}

function mapSegment(seg: OfferSliceSegment): FlightSegment | null {
  const carrier = seg.marketing_carrier ?? seg.operating_carrier;
  if (!carrier || !seg.origin?.iata_code || !seg.destination?.iata_code) {
    return null;
  }
  const flightNumber = seg.marketing_carrier_flight_number
    ? `${carrier.iata_code} ${seg.marketing_carrier_flight_number}`
    : "";
  return {
    carrierCode: carrier.iata_code ?? "",
    carrierName: carrier.name ?? carrier.iata_code ?? "Unknown",
    flightNumber,
    origin: seg.origin.iata_code,
    destination: seg.destination.iata_code,
    departure: wall(seg.departing_at),
    arrival: wall(seg.arriving_at),
    durationMinutes: isoDurationMinutes(seg.duration),
    ...(seg.operating_carrier &&
    seg.operating_carrier.name !== seg.marketing_carrier?.name
      ? { operatedBy: seg.operating_carrier.name ?? undefined }
      : {}),
  };
}

function mapOffer(
  offer: Omit<Offer, "available_services">,
  params: SearchParams,
  testData: boolean,
): FlightOffer | null {
  const legs: FlightLeg[] = [];
  for (const slice of offer.slices) {
    const segments: FlightSegment[] = [];
    for (const seg of slice.segments) {
      const mapped = mapSegment(seg);
      if (!mapped) return null;
      segments.push(mapped);
    }
    if (segments.length === 0) return null;
    const first = segments[0];
    const last = segments[segments.length - 1];
    legs.push({
      segments,
      origin: first.origin,
      destination: last.destination,
      departure: first.departure,
      arrival: last.arrival,
      durationMinutes:
        isoDurationMinutes(slice.duration) ||
        segments.reduce((sum, s) => sum + s.durationMinutes, 0),
      stops: segments.length - 1,
      stopAirports: segments.slice(0, -1).map((s) => s.destination),
      overnight: last.arrival.slice(0, 10) > first.departure.slice(0, 10),
    });
  }
  if (legs.length === 0) return null;

  const total = Number(offer.total_amount);
  if (!Number.isFinite(total) || total <= 0) return null;
  const currency = offer.total_currency ?? "USD";

  // Namespace sandbox offers so fake prices never merge with real ones.
  const baseKey = dedupeKeyForLegs(legs, false);
  const dedupeKey = testData ? `DTEST:${baseKey}` : baseKey;

  return {
    id: hashId(`${dedupeKey}:duffel`),
    dedupeKey,
    source: "duffel",
    sources: ["duffel"],
    freshness: "live",
    price: {
      total,
      perTraveler: total / params.adults,
      currency,
      totalUSD: toUSD(total, currency),
    },
    legs,
    deeplink: `/book/${offer.id}`,
    bookable: { offerId: offer.id, testData },
  };
}

const CABIN_MAP: Record<Cabin, "economy" | "premium_economy" | "business" | "first"> = {
  economy: "economy",
  premium_economy: "premium_economy",
  business: "business",
  first: "first",
};

async function searchDuffel(
  params: SearchParams,
  signal: AbortSignal,
): Promise<FlightOffer[]> {
  const slices = [
    {
      origin: params.origin,
      destination: params.destination,
      departure_date: params.departDate,
      departure_time: null,
      arrival_time: null,
    },
  ];
  if (params.tripType === "round_trip" && params.returnDate) {
    slices.push({
      origin: params.destination,
      destination: params.origin,
      departure_date: params.returnDate,
      departure_time: null,
      arrival_time: null,
    });
  }

  // The SDK has no AbortSignal support; race it so the guard's timeout and
  // user cancellation still settle this promise promptly.
  const abortPromise = new Promise<never>((_, reject) => {
    const onAbort = () =>
      reject(new DOMException("Aborted", "AbortError"));
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });

  const res = await Promise.race([
    duffelClient().offerRequests.create({
      slices,
      passengers: Array.from({ length: params.adults }, () => ({
        type: "adult" as const,
      })),
      cabin_class: CABIN_MAP[params.cabin],
      return_offers: true,
      supplier_timeout: 20000,
    }),
    abortPromise,
  ]);

  const offers = res.data.offers ?? [];
  const testData = duffelTestMode();
  const out: FlightOffer[] = [];
  const seen = new Set<string>();
  for (const offer of offers) {
    const mapped = mapOffer(offer, params, testData);
    if (!mapped || seen.has(mapped.dedupeKey)) continue;
    // Keep the cheapest per dedupe key (offers arrive roughly price-sorted,
    // but don't rely on it).
    seen.add(mapped.dedupeKey);
    out.push(mapped);
  }
  return out.sort((a, b) => a.price.totalUSD - b.price.totalUSD).slice(0, 30);
}

export const duffelProvider: FlightProvider = {
  id: "duffel",
  label: "Duffel (bookable)",
  tier: 1,
  timeoutMs: 30000,
  // Short TTL on purpose: Duffel offer ids perish (some LCC offers within
  // minutes). Keeping the cache well under offer lifetime means a cached
  // offer is still bookable when served, and a re-search after an offer
  // expires returns fresh ids instead of looping on a dead one. Just long
  // enough to absorb rapid duplicate searches (refresh, double-submit).
  cacheTtlMs: 60 * 1000,
  enabled: () => Boolean(process.env.DUFFEL_API_TOKEN),
  search: searchDuffel,
};
