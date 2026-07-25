/**
 * The core data contract. The Duffel mapper produces FlightOffer; everything
 * downstream (streaming, ranking, filtering, UI, checkout) consumes only
 * these shapes.
 */

export type TripType = "round_trip" | "one_way";

export type Cabin = "economy" | "premium_economy" | "business" | "first";

export const CABINS: Cabin[] = [
  "economy",
  "premium_economy",
  "business",
  "first",
];

export interface PassengerCounts {
  /** 1-8 */
  adults: number;
  /** One entry per child, each an age 2-17 at time of travel. */
  childAges: number[];
  /** Infants under 2 (lap infants); each maps to a Duffel age-1 passenger. */
  infants: number;
}

export function totalPassengers(p: PassengerCounts): number {
  return p.adults + p.childAges.length + p.infants;
}

export interface SearchQuery {
  /** IATA code, uppercase, e.g. "JFK". The primary (or only) airport. */
  origin: string;
  destination: string;
  /**
   * Set when the user picked a metro-level "Any airport" entry: the city key
   * (e.g. "tokyo-jp"); the server fans out one offer request per member
   * airport and `origin`/`destination` hold the representative airport.
   */
  originAny?: string;
  destinationAny?: string;
  /** "YYYY-MM-DD" */
  departDate: string;
  /** Required iff tripType === "round_trip" */
  returnDate?: string;
  tripType: TripType;
  passengers: PassengerCounts;
  cabin: Cabin;
  /** Flexible-dates window selected in the date picker (0 = exact). */
  flexDays?: 0 | 1 | 2 | 3 | 7 | 14;
}

/* ------------------------------------------------------------------ */
/* Offer shapes (mapped 1:1 from Duffel offers)                        */
/* ------------------------------------------------------------------ */

export interface OfferConditions {
  /** null = the airline didn't say. */
  refundable: boolean | null;
  refundPenaltyAmount: string | null;
  changeable: boolean | null;
  changePenaltyAmount: string | null;
  penaltyCurrency: string | null;
}

export interface SegmentAmenities {
  wifi: { available: boolean; cost: "free" | "paid" | "free or paid" | "n/a" } | null;
  power: { available: boolean } | null;
  /** pitch is inches when known ("30"), else Duffel's categorical value. */
  seat: { pitch: string | null; type: string | null } | null;
  /** Where this came from: Duffel's per-cabin data or our fleet table. */
  source: "duffel" | "fleet";
}

export interface OfferSegment {
  id: string;
  carrierCode: string;
  carrierName: string;
  carrierLogoUrl: string | null;
  /** Set only when the operating carrier differs (codeshare). */
  operatingCarrierName: string | null;
  /** "UA 33" */
  flightNumber: string;
  origin: string;
  originName: string;
  originTerminal: string | null;
  destination: string;
  destinationName: string;
  destinationTerminal: string | null;
  /**
   * ISO-8601 *local* wall time, no timezone offset ("2026-08-01T07:15").
   * Compared lexically — never parsed through Date with timezone math.
   */
  departure: string;
  arrival: string;
  durationMinutes: number;
  aircraftName: string | null;
  fareBasisCode: string | null;
  fareBrand: string | null;
  cabin: Cabin;
  cabinMarketingName: string | null;
  baggageCarryOn: number;
  baggageChecked: number;
  amenities: SegmentAmenities | null;
}

export interface OfferSlice {
  origin: string;
  originName: string;
  originCity: string;
  destination: string;
  destinationName: string;
  destinationCity: string;
  departure: string;
  arrival: string;
  durationMinutes: number;
  stops: number;
  stopAirports: string[];
  /** Calendar days the arrival lands after the departure (0, 1, 2...). */
  overnightDays: number;
  fareBrand: string | null;
  cabin: Cabin;
  ngsShelf: number | null;
  /** Duffel's hash for comparing equivalent slices across offers. */
  comparisonKey: string;
  conditions: OfferConditions & {
    advanceSeatSelection: boolean | null;
    priorityBoarding: boolean | null;
  };
  segments: OfferSegment[];
}

export interface FlightOffer {
  /** Duffel offer id ("off_..."). */
  id: string;
  /** The offer request that produced it ("orq_..."). */
  requestId: string;
  /** Join of slice comparison keys — equivalent itineraries collide. */
  dedupeKey: string;
  totalAmount: string;
  totalCurrency: string;
  baseAmount: string | null;
  taxAmount: string | null;
  /** Converted for ranking + display. */
  totalUSD: number;
  /** totalUSD minus the Undercut — the number the UI shows. */
  displayUSD: number;
  expiresAt: string;
  liveMode: boolean;
  passengerIdentityDocumentsRequired: boolean;
  totalEmissionsKg: number | null;
  conditions: OfferConditions;
  /** Marketing owner of the offer (the airline selling it). */
  ownerCode: string;
  ownerName: string;
  ownerLogoUrl: string | null;
  /** [outbound] or [outbound, return] — the round-trip price covers both. */
  slices: OfferSlice[];
}

/**
 * A purchasable ancillary on an offer (Duffel available_services), trimmed
 * to what the details panel and checkout need.
 */
export interface OfferService {
  id: string;
  type: "baggage" | "cancel_for_any_reason" | string;
  totalAmount: string;
  totalCurrency: string;
  totalUSD: number;
  maximumQuantity: number;
  /** For baggage: checked vs carry_on + weight when the airline says. */
  baggage?: {
    type: "checked" | "carry_on";
    maximumWeightKg: number | null;
  };
  passengerIds: string[];
  segmentIds: string[];
}

/* ------------------------------------------------------------------ */
/* SSE stream event vocabulary (/api/search/stream)                    */
/* ------------------------------------------------------------------ */

export type StreamEvent =
  | {
      type: "created";
      requestId: string;
      origin: string;
      destination: string;
      slices: { origin: string; destination: string; date: string }[];
      totalBatches: number;
      remainingBatches: number;
      liveMode: boolean;
    }
  | {
      type: "batch";
      requestId: string;
      batchIndex: number;
      rawCount: number;
      newCount: number;
      seenCount: number;
      remainingBatches: number;
      elapsedMs: number;
    }
  | { type: "offer"; offer: FlightOffer }
  | {
      type: "request_done";
      requestId: string;
      status: "ok" | "empty" | "error" | "timeout";
      message?: string;
    }
  | { type: "done"; elapsedMs: number; offerCount: number };

/* ------------------------------------------------------------------ */
/* Helpers over the contract                                           */
/* ------------------------------------------------------------------ */

export function totalDurationMinutes(offer: FlightOffer): number {
  return offer.slices.reduce((sum, s) => sum + s.durationMinutes, 0);
}

export function totalStops(offer: FlightOffer): number {
  return offer.slices.reduce((sum, s) => sum + s.stops, 0);
}

export function searchQueryKey(q: SearchQuery): string {
  return [
    q.origin,
    q.destination,
    q.originAny ?? "-",
    q.destinationAny ?? "-",
    q.departDate,
    q.returnDate ?? "-",
    q.tripType,
    q.passengers.adults,
    q.passengers.childAges.join("."),
    q.passengers.infants,
    q.cabin,
  ].join("|");
}

const IATA = /^[A-Z]{3}$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse/validate URL search params into a SearchQuery; throws on invalid.
 * Accepts `children` as comma-separated ages ("5,9") and `infants` as a count.
 */
export function parseSearchQuery(sp: URLSearchParams): SearchQuery {
  const origin = (sp.get("origin") ?? "").toUpperCase();
  const destination = (sp.get("destination") ?? "").toUpperCase();
  const departDate = sp.get("departDate") ?? "";
  const returnDate = sp.get("returnDate") || undefined;
  const tripType = (sp.get("tripType") ??
    (returnDate ? "round_trip" : "one_way")) as TripType;
  const cabin = (sp.get("cabin") ?? "economy") as Cabin;

  const adults = Number(sp.get("adults") ?? 1);
  if (!Number.isInteger(adults) || adults < 1 || adults > 8) {
    throw new Error(`Invalid adults "${sp.get("adults")}"`);
  }
  const childAges = (sp.get("children") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number);
  if (childAges.some((a) => !Number.isInteger(a) || a < 2 || a > 17)) {
    throw new Error(`Invalid children ages "${sp.get("children")}"`);
  }
  const infants = Number(sp.get("infants") ?? 0);
  if (!Number.isInteger(infants) || infants < 0 || infants > adults) {
    throw new Error(`Invalid infants "${sp.get("infants")}"`);
  }

  if (!IATA.test(origin)) throw new Error(`Invalid origin "${origin}"`);
  if (!IATA.test(destination))
    throw new Error(`Invalid destination "${destination}"`);
  if (origin === destination)
    throw new Error("Origin and destination are the same");
  if (!YMD.test(departDate)) throw new Error("Invalid departDate");
  if (tripType === "round_trip" && (!returnDate || !YMD.test(returnDate)))
    throw new Error("Round trip requires a valid returnDate");
  if (!["round_trip", "one_way"].includes(tripType))
    throw new Error("Invalid tripType");
  if (!CABINS.includes(cabin)) throw new Error("Invalid cabin");

  const flexRaw = Number(sp.get("flex") ?? 0);
  const flexDays = ([0, 1, 2, 3, 7, 14] as const).includes(
    flexRaw as 0 | 1 | 2 | 3 | 7 | 14,
  )
    ? (flexRaw as 0 | 1 | 2 | 3 | 7 | 14)
    : 0;

  return {
    origin,
    destination,
    originAny: sp.get("origin_any") || undefined,
    destinationAny: sp.get("destination_any") || undefined,
    departDate,
    returnDate: tripType === "round_trip" ? returnDate : undefined,
    tripType,
    passengers: { adults, childAges, infants },
    cabin,
    flexDays,
  };
}

export function toQueryString(q: SearchQuery): string {
  const sp = new URLSearchParams({
    origin: q.origin,
    destination: q.destination,
    departDate: q.departDate,
    tripType: q.tripType,
    adults: String(q.passengers.adults),
    cabin: q.cabin,
  });
  if (q.returnDate) sp.set("returnDate", q.returnDate);
  if (q.passengers.childAges.length)
    sp.set("children", q.passengers.childAges.join(","));
  if (q.passengers.infants) sp.set("infants", String(q.passengers.infants));
  if (q.originAny) sp.set("origin_any", q.originAny);
  if (q.destinationAny) sp.set("destination_any", q.destinationAny);
  if (q.flexDays) sp.set("flex", String(q.flexDays));
  return sp.toString();
}
