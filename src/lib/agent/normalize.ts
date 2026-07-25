import { toUSD } from "../currency";
import { dedupeKeyForLegs, hashId } from "../dedupe";
import type {
  FlightLeg,
  FlightOffer,
  FlightSegment,
  ProviderId,
  SearchParams,
  TripType,
} from "../types";
import type { ScrapedFare } from "./schemas";

/**
 * How the scraped page priced its fares. Agent targets set these from what
 * the page actually displayed (verified via the extraction instruction).
 */
export interface ScrapedPricing {
  /** Price shown covers the whole round trip (not one direction). */
  roundTripTotal?: boolean;
  /** Price shown already covers all passengers (skip the × adults step). */
  allPassengers?: boolean;
  /**
   * Whether the per-passenger dimension is actually known (the page's
   * qualifier resolved it). When false and adults > 1, we can't price the
   * offer safely and skip it rather than risk a fabricated "cheaper" fare.
   */
  scopeKnown?: boolean;
}

const CARRIER_CODES: Record<string, string> = {
  frontier: "F9",
  allegiant: "G4",
  spirit: "NK",
  southwest: "WN",
  delta: "DL",
  united: "UA",
  american: "AA",
  jetblue: "B6",
  alaska: "AS",
  breeze: "MX",
  "sun country": "SY",
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Parse a scraped time into ISO local "YYYY-MM-DDTHH:mm". Accepts clock
 * strings ("7:15 AM", "19:05") resolved against `date`, or full ISO local
 * datetimes ("2026-08-01T07:15:00") which carry their own date.
 */
function parseTime(text: string, date: string): string | null {
  const iso = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/.exec(text.trim());
  if (iso) return iso[1];
  const m = /(\d{1,2}):(\d{2})\s*([ap])\.?m?\.?/i.exec(text) ?? /(\d{1,2}):(\d{2})/.exec(text);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = m[3]?.toLowerCase();
  if (ap === "p" && h !== 12) h += 12;
  if (ap === "a" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${date}T${pad2(h)}:${pad2(min)}`;
}

/** Calendar-date shift; UTC used only as date arithmetic, never for display. */
function addDays(ymd: string, days: number): string {
  const [y, mo, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d + days)).toISOString().slice(0, 10);
}

function parsePrice(p: number | string): number | null {
  if (typeof p === "number") return Number.isFinite(p) && p > 0 ? p : null;
  const m = /([\d,]+(?:\.\d+)?)/.exec(p);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseStops(s: number | string): number {
  if (typeof s === "number") return Number.isFinite(s) ? Math.max(0, Math.floor(s)) : 0;
  const t = s.toLowerCase();
  if (/non.?stop|direct/.test(t)) return 0;
  const m = /(\d+)/.exec(t);
  return m ? parseInt(m[1], 10) : 0;
}

function parseDurationText(text: string | undefined): number | null {
  if (!text) return null;
  const h = /(\d+)\s*h/i.exec(text);
  const m = /(\d+)\s*m/i.exec(text);
  if (!h && !m) return null;
  const total = (h ? parseInt(h[1], 10) : 0) * 60 + (m ? parseInt(m[1], 10) : 0);
  return total > 0 ? total : null;
}

function minutesOf(isoLocal: string): number {
  return parseInt(isoLocal.slice(11, 13), 10) * 60 + parseInt(isoLocal.slice(14, 16), 10);
}

function carrierCodeFor(airline: string, flightNumber: string): string {
  const fromFlight = /^([A-Z][A-Z0-9])\s*\d/.exec(flightNumber.trim());
  if (fromFlight) return fromFlight[1];
  const lower = airline.toLowerCase();
  for (const [name, code] of Object.entries(CARRIER_CODES)) {
    if (lower.includes(name)) return code;
  }
  return "";
}

/**
 * Map a target's pricing-qualifier text (what the page said next to prices)
 * into ScrapedPricing. Defaults assume total-for-all-passengers round-trip
 * pricing (Trip.com/Google list behavior) unless the note contradicts it.
 */
export function pricingFromQualifier(
  note: string | undefined,
  tripType: TripType,
): ScrapedPricing {
  const t = (note ?? "").toLowerCase();
  const perPerson = /per\s+(person|adult|traveler|traveller|passenger)|\beach\b/.test(t);
  const allPax = /total|all\s+(passenger|traveler|traveller|guest)|for\s+\d+\s+(passenger|traveler|adult|guest)/.test(t);
  const eachWay = /each\s+way|one.?way|per\s+direction/.test(t);
  return {
    roundTripTotal: tripType === "round_trip" && !eachWay,
    allPassengers: perPerson ? false : allPax ? true : true,
    // The per-passenger dimension is only "known" if the note said so.
    scopeKnown: perPerson || allPax,
  };
}

/**
 * Convert LLM-scraped fares into FlightOffer[].
 *
 * Round-trip policy: agent targets scrape the OUTBOUND list only. When
 * params is round_trip we emit offers (returnLegPending, price = round-trip
 * total) ONLY if the page showed round-trip pricing (pricing.roundTripTotal).
 * If the page priced per direction, we emit NOTHING — doubling a one-way
 * fare or presenting it as the trip total would both be misleading. One-way
 * scraped fares become offers only when params itself is one_way.
 */
export function scrapedToOffers(
  fares: ScrapedFare[],
  params: SearchParams,
  source: ProviderId,
  deeplink: string,
  pricing: ScrapedPricing = {},
): FlightOffer[] {
  if (fares.length === 0) return [];
  if (params.tripType === "round_trip" && !pricing.roundTripTotal) return [];
  // Multi-passenger search with an unresolved per-person/total scope: any
  // price we compute could be off by a factor of `adults`, which would mint
  // false savings. Skip rather than guess. (adults === 1 is unaffected —
  // per-traveler equals the total.)
  if (params.adults > 1 && pricing.scopeKnown === false) return [];

  const offers: FlightOffer[] = [];

  for (const fare of fares) {
    const departure = parseTime(fare.departTime, params.departDate);
    let arrival = parseTime(fare.arriveTime, params.departDate);
    const priceShown = parsePrice(fare.price);
    if (!departure || !arrival || priceShown === null) continue;

    if (fare.nextDayArrival && arrival.slice(0, 10) === departure.slice(0, 10)) {
      arrival = addDays(arrival.slice(0, 10), 1) + arrival.slice(10);
    }

    // Wall-clock delta ignores timezone shift — acceptable ranking fallback
    // when the page gave no duration text. Negative deltas mean an unflagged
    // overnight arrival; roll forward a day.
    let durationMinutes = parseDurationText(fare.durationText) ?? 0;
    if (durationMinutes === 0) {
      const dayGap =
        (Date.parse(arrival.slice(0, 10)) - Date.parse(departure.slice(0, 10))) / 86_400_000;
      durationMinutes = dayGap * 1440 + minutesOf(arrival) - minutesOf(departure);
      if (durationMinutes <= 0) {
        arrival = addDays(arrival.slice(0, 10), 1) + arrival.slice(10);
        durationMinutes += 1440;
      }
      if (durationMinutes <= 0) continue;
    }

    const flightNumber = fare.flightNumber?.trim() ?? "";
    const segment: FlightSegment = {
      carrierCode: carrierCodeFor(fare.airline, flightNumber),
      carrierName: fare.airline,
      flightNumber,
      origin: params.origin,
      destination: params.destination,
      departure,
      arrival,
      durationMinutes,
    };
    const leg: FlightLeg = {
      segments: [segment],
      origin: params.origin,
      destination: params.destination,
      departure,
      arrival,
      durationMinutes,
      stops: parseStops(fare.stops),
      stopAirports:
        fare.stopAirports?.filter((a) => /^[A-Z]{3}$/.test(a.toUpperCase())).map((a) => a.toUpperCase()) ?? [],
      overnight: arrival.slice(0, 10) > departure.slice(0, 10),
    };

    const total = pricing.allPassengers ? priceShown : priceShown * params.adults;
    const legs = [leg];
    const dedupeKey = dedupeKeyForLegs(legs, false);
    offers.push({
      id: hashId(`${dedupeKey}:${source}`),
      dedupeKey,
      source,
      sources: [source],
      freshness: "live",
      price: {
        total,
        perTraveler: total / params.adults,
        currency: "USD",
        totalUSD: toUSD(total, "USD"),
      },
      legs,
      ...(params.tripType === "round_trip" ? { returnLegPending: true } : {}),
      deeplink,
    });
  }

  // Non-empty scrape that parses to nothing = extraction garbage, not an
  // empty market — surface it as an error rather than a quiet "empty".
  if (offers.length === 0) {
    throw new Error(`none of ${fares.length} scraped fares were parseable`);
  }
  return offers;
}
