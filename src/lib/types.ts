/**
 * The core data contract. Every provider — API or browser agent — maps its
 * results into FlightOffer; everything downstream (dedupe, ranking, UI)
 * consumes only these shapes.
 */

export type ProviderId =
  | "serpapi"
  | "fast-flights"
  | "travelpayouts"
  | "skiplagged"
  | "skyscanner"
  | "duffel"
  | "split"
  | "agent:frontier"
  | "agent:trip-com"
  | "agent:google"
  | "agent:navitaire";

export type Freshness = "live" | "cached" | "hidden-city";

export type TripType = "round_trip" | "one_way";

export type Cabin = "economy" | "premium_economy" | "business" | "first";

export interface SearchParams {
  /** IATA code, uppercase, e.g. "JFK" */
  origin: string;
  destination: string;
  /** "YYYY-MM-DD" */
  departDate: string;
  /** Required iff tripType === "round_trip" */
  returnDate?: string;
  tripType: TripType;
  /** 1-8 */
  adults: number;
  cabin: Cabin;
  /** Request currency. Per-offer currency is still preserved on each offer. */
  currency: "USD";
}

export interface FlightSegment {
  /** "F9" */
  carrierCode: string;
  /** "Frontier" */
  carrierName: string;
  /** "F9 1234" */
  flightNumber: string;
  origin: string;
  destination: string;
  /**
   * ISO-8601 *local* wall time, no timezone offset ("2026-08-01T07:15").
   * Compared lexically — never parsed through Date with timezone math.
   */
  departure: string;
  arrival: string;
  durationMinutes: number;
  operatedBy?: string;
}

/** One bound (outbound or return). */
export interface FlightLeg {
  /** May be a single synthetic segment for thin sources (e.g. Travelpayouts). */
  segments: FlightSegment[];
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  durationMinutes: number;
  stops: number;
  /** [] when unknown (thin sources). */
  stopAirports: string[];
  /** Arrival calendar date is after departure date → render "+1". */
  overnight: boolean;
}

export interface OfferPrice {
  /** Total for ALL passengers — the source of truth. */
  total: number;
  /** total / adults; the headline number in the UI. */
  perTraveler: number;
  /** Currency as returned by the provider ("USD", "PHP", ...). */
  currency: string;
  /** Used for ALL comparison, ranking, and baseline math. */
  totalUSD: number;
}

export interface FlightOffer {
  /** hash(dedupeKey + source) — stable per source. */
  id: string;
  /**
   * legs → segments → `${flightNumber}@${departure through minutes}` joined
   * with "|" between legs. Prefixed "HC:" for hidden-city so those never
   * merge with normal fares.
   */
  dedupeKey: string;
  /** Provider that produced this offer instance. */
  source: ProviderId;
  /** Starts as [source]; dedupe merge unions all agreeing sources. */
  sources: ProviderId[];
  freshness: Freshness;
  price: OfferPrice;
  /** [outbound] or [outbound, return]. */
  legs: FlightLeg[];
  /**
   * True when a round trip is priced at the round-trip total but only the
   * outbound leg is materialized (return chosen on the target site) —
   * SerpAPI/Google default mode.
   */
  returnLegPending?: boolean;
  /** Where the Book button goes (opens in a new tab). */
  deeplink: string;
  /** Set iff freshness === "hidden-city". */
  hiddenCity?: { ticketedDestination: string };
  /**
   * Present when this offer can be ticketed in-site (Duffel). testData marks
   * offers priced by Duffel's sandbox (fake fares): they are labeled in the
   * UI, never merged with real offers, and never earn savings badges.
   */
  bookable?: { offerId: string; testData: boolean };
  /**
   * Present when this is a split-ticket combo: two separately-booked one-ways
   * (outbound + return) whose summed price beats the round-trip fare. Each
   * leg is booked at its own deeplink; there's no single itinerary.
   */
  splitTicket?: {
    outbound: { deeplink: string; totalUSD: number };
    return: { deeplink: string; totalUSD: number };
  };
}

/* ------------------------------------------------------------------ */
/* Provider status + SSE stream event vocabulary                       */
/* ------------------------------------------------------------------ */

export type ProviderStatus =
  | "pending"
  | "disabled"
  | "ok"
  | "empty"
  | "error"
  | "timeout"
  | "blocked"
  | "captcha";

export interface ProviderMeta {
  id: ProviderId;
  /** Human label: "Google Flights", "Aviasales cache", ... */
  label: string;
  tier: 1 | 2;
  status: ProviderStatus;
}

export type SSEEvent =
  | { type: "providers"; providers: ProviderMeta[] }
  | { type: "provider_added"; provider: ProviderMeta }
  | {
      type: "results";
      provider: ProviderId;
      offers: FlightOffer[];
      fromCache: boolean;
      tookMs: number;
    }
  | {
      type: "baseline";
      totalUSD: number;
      perTravelerUSD: number;
      source: ProviderId;
    }
  | {
      type: "provider_done";
      provider: ProviderId;
      status: Exclude<ProviderStatus, "pending" | "disabled">;
      count: number;
      message?: string;
    }
  | { type: "done"; elapsedMs: number };

/* ------------------------------------------------------------------ */
/* Helpers over the contract                                           */
/* ------------------------------------------------------------------ */

export function totalDurationMinutes(offer: FlightOffer): number {
  return offer.legs.reduce((sum, leg) => sum + leg.durationMinutes, 0);
}

export function totalStops(offer: FlightOffer): number {
  return offer.legs.reduce((sum, leg) => sum + leg.stops, 0);
}

export function searchParamsKey(p: SearchParams): string {
  return [
    p.origin,
    p.destination,
    p.departDate,
    p.returnDate ?? "-",
    p.tripType,
    p.adults,
    p.cabin,
  ].join("|");
}

/** Parse/validate URL search params into SearchParams; throws on invalid. */
export function parseSearchParams(sp: URLSearchParams): SearchParams {
  const origin = (sp.get("origin") ?? "").toUpperCase();
  const destination = (sp.get("destination") ?? "").toUpperCase();
  const departDate = sp.get("departDate") ?? "";
  const returnDate = sp.get("returnDate") || undefined;
  const tripType = (sp.get("tripType") ?? "round_trip") as TripType;
  const adultsRaw = Number(sp.get("adults") ?? 1);
  if (!Number.isInteger(adultsRaw) || adultsRaw < 1 || adultsRaw > 8) {
    throw new Error(`Invalid adults "${sp.get("adults")}"`);
  }
  const adults = adultsRaw;
  const cabin = (sp.get("cabin") ?? "economy") as Cabin;

  const iata = /^[A-Z]{3}$/;
  const ymd = /^\d{4}-\d{2}-\d{2}$/;
  if (!iata.test(origin)) throw new Error(`Invalid origin "${origin}"`);
  if (!iata.test(destination))
    throw new Error(`Invalid destination "${destination}"`);
  if (origin === destination)
    throw new Error("Origin and destination are the same");
  if (!ymd.test(departDate)) throw new Error(`Invalid departDate`);
  if (tripType === "round_trip" && (!returnDate || !ymd.test(returnDate)))
    throw new Error("Round trip requires a valid returnDate");
  if (!["round_trip", "one_way"].includes(tripType))
    throw new Error(`Invalid tripType`);
  if (!["economy", "premium_economy", "business", "first"].includes(cabin))
    throw new Error(`Invalid cabin`);

  return {
    origin,
    destination,
    departDate,
    returnDate: tripType === "round_trip" ? returnDate : undefined,
    tripType,
    adults,
    cabin,
    currency: "USD",
  };
}

export function toQueryString(p: SearchParams): string {
  const sp = new URLSearchParams({
    origin: p.origin,
    destination: p.destination,
    departDate: p.departDate,
    tripType: p.tripType,
    adults: String(p.adults),
    cabin: p.cabin,
  });
  if (p.returnDate) sp.set("returnDate", p.returnDate);
  return sp.toString();
}
