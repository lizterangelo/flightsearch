import { toUSD } from "../currency";
import { dedupeKeyForLegs, hashId } from "../dedupe";
import { aviasalesLink } from "../deeplinks";
import type {
  FlightLeg,
  FlightOffer,
  FlightSegment,
  SearchParams,
} from "../types";
import type { FlightProvider } from "./provider";

/**
 * Travelpayouts / Aviasales Data API v3 — cheapest fares seen by Aviasales
 * users in the last ~48h. Thin cached source: one synthetic segment per leg,
 * no stop airports, per-person prices, economy only.
 */

const API_URL =
  "https://api.travelpayouts.com/aviasales/v3/prices_for_dates";

/** Common IATA carrier codes → display names; falls back to the raw code. */
const CARRIER_NAMES: Record<string, string> = {
  AA: "American",
  DL: "Delta",
  UA: "United",
  WN: "Southwest",
  B6: "JetBlue",
  NK: "Spirit",
  F9: "Frontier",
  AS: "Alaska",
  G4: "Allegiant",
  MX: "Breeze",
  XP: "Avelo",
  HA: "Hawaiian",
  PR: "Philippine Airlines",
  "5J": "Cebu Pacific",
  DG: "Cebgo",
  Z2: "AirAsia Philippines",
  AC: "Air Canada",
  AM: "Aeroméxico",
  Y4: "Volaris",
  VB: "Viva Aerobus",
  BA: "British Airways",
  AF: "Air France",
  KL: "KLM",
  LH: "Lufthansa",
  IB: "Iberia",
  TK: "Turkish Airlines",
  EK: "Emirates",
  QR: "Qatar Airways",
  JL: "Japan Airlines",
  NH: "ANA",
  KE: "Korean Air",
  OZ: "Asiana",
  SQ: "Singapore Airlines",
  CX: "Cathay Pacific",
  CI: "China Airlines",
  BR: "EVA Air",
  VN: "Vietnam Airlines",
  TG: "Thai Airways",
};

function carrierName(code: string): string {
  return CARRIER_NAMES[code] ?? code;
}

/** "2026-08-01T07:15:00+03:00" → "2026-08-01T07:15" (keep local wall time). */
function localWallTime(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso)) {
    throw new Error(`travelpayouts: unexpected datetime "${iso}"`);
  }
  return iso.slice(0, 16);
}

/**
 * Add minutes to a "YYYY-MM-DDTHH:mm" wall time via pure calendar arithmetic
 * (UTC accessors so the host timezone never leaks in). Ignores any offset
 * difference between endpoints — acceptable approximation for a cached source.
 */
function addMinutesLocal(local: string, minutes: number): string {
  const [date, time] = local.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, hh, mm + minutes));
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}` +
    `T${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}`
  );
}

interface TpTicket {
  airline: string;
  flight_number: string;
  departure_at: string;
  return_at?: string;
  duration_to: number;
  duration_back?: number;
  transfers: number;
  return_transfers?: number;
  price: number;
  link?: string;
  origin_airport?: string;
  destination_airport?: string;
}

function asTicket(v: unknown): TpTicket {
  if (typeof v !== "object" || v === null) {
    throw new Error("travelpayouts: ticket is not an object");
  }
  const t = v as Record<string, unknown>;
  const flightNumber =
    typeof t.flight_number === "number"
      ? String(t.flight_number)
      : t.flight_number;
  const durationTo =
    typeof t.duration_to === "number" ? t.duration_to : t.duration;
  if (
    typeof t.airline !== "string" ||
    typeof flightNumber !== "string" ||
    typeof t.departure_at !== "string" ||
    typeof t.price !== "number" ||
    typeof durationTo !== "number"
  ) {
    throw new Error("travelpayouts: unrecognized ticket shape");
  }
  return {
    airline: t.airline,
    flight_number: flightNumber,
    departure_at: t.departure_at,
    return_at: typeof t.return_at === "string" ? t.return_at : undefined,
    duration_to: durationTo,
    duration_back:
      typeof t.duration_back === "number" ? t.duration_back : undefined,
    transfers: typeof t.transfers === "number" ? t.transfers : 0,
    return_transfers:
      typeof t.return_transfers === "number" ? t.return_transfers : undefined,
    price: t.price,
    link: typeof t.link === "string" ? t.link : undefined,
    origin_airport:
      typeof t.origin_airport === "string" ? t.origin_airport : undefined,
    destination_airport:
      typeof t.destination_airport === "string"
        ? t.destination_airport
        : undefined,
  };
}

function syntheticLeg(opts: {
  carrier: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departure: string;
  durationMinutes: number;
  stops: number;
}): FlightLeg {
  const arrival = addMinutesLocal(opts.departure, opts.durationMinutes);
  const segment: FlightSegment = {
    carrierCode: opts.carrier,
    carrierName: carrierName(opts.carrier),
    flightNumber: opts.flightNumber,
    origin: opts.origin,
    destination: opts.destination,
    departure: opts.departure,
    arrival,
    durationMinutes: opts.durationMinutes,
  };
  return {
    segments: [segment],
    origin: opts.origin,
    destination: opts.destination,
    departure: opts.departure,
    arrival,
    durationMinutes: opts.durationMinutes,
    stops: opts.stops,
    stopAirports: [],
    overnight: arrival.slice(0, 10) > opts.departure.slice(0, 10),
  };
}

export const travelpayoutsProvider: FlightProvider = {
  id: "travelpayouts",
  label: "Aviasales cache",
  tier: 1,
  timeoutMs: 8000,
  cacheTtlMs: 86_400_000,
  enabled: () => Boolean(process.env.TRAVELPAYOUTS_TOKEN),

  async search(params: SearchParams, signal: AbortSignal) {
    // The cache holds economy fares only; other cabins would misprice.
    if (params.cabin !== "economy") return [];

    const sp = new URLSearchParams({
      origin: params.origin,
      destination: params.destination,
      departure_at: params.departDate,
      one_way: params.tripType === "one_way" ? "true" : "false",
      currency: "usd", // API defaults to RUB
      sorting: "price",
      limit: "30",
      unique: "false",
    });
    if (params.tripType === "round_trip" && params.returnDate) {
      sp.set("return_at", params.returnDate);
    }

    const res = await fetch(`${API_URL}?${sp.toString()}`, {
      signal,
      headers: { "X-Access-Token": process.env.TRAVELPAYOUTS_TOKEN ?? "" },
    });
    if (!res.ok) throw new Error(`travelpayouts: HTTP ${res.status}`);

    const body: unknown = await res.json();
    if (typeof body !== "object" || body === null) {
      throw new Error("travelpayouts: response is not an object");
    }
    const { success, data, currency: rawCurrency } = body as {
      success?: unknown;
      data?: unknown;
      currency?: unknown;
    };
    if (success !== true) throw new Error("travelpayouts: success !== true");
    if (!Array.isArray(data)) {
      throw new Error("travelpayouts: data is not an array");
    }
    if (data.length === 0) return [];
    const currency =
      typeof rawCurrency === "string" ? rawCurrency.toUpperCase() : "USD";

    const offers: FlightOffer[] = [];
    for (const raw of data) {
      const t = asTicket(raw);

      const legs: FlightLeg[] = [
        syntheticLeg({
          carrier: t.airline,
          flightNumber: `${t.airline} ${t.flight_number}`,
          origin: t.origin_airport ?? params.origin,
          destination: t.destination_airport ?? params.destination,
          departure: localWallTime(t.departure_at),
          durationMinutes: t.duration_to,
          stops: t.transfers,
        }),
      ];
      if (params.tripType === "round_trip") {
        if (
          typeof t.return_at !== "string" ||
          typeof t.duration_back !== "number"
        ) {
          throw new Error(
            "travelpayouts: round-trip ticket missing return fields",
          );
        }
        legs.push(
          syntheticLeg({
            carrier: t.airline,
            // Return flight number is not exposed by this API; dedupe falls
            // back to carrier+time for this leg.
            flightNumber: "",
            origin: t.destination_airport ?? params.destination,
            destination: t.origin_airport ?? params.origin,
            departure: localWallTime(t.return_at),
            durationMinutes: t.duration_back,
            stops: t.return_transfers ?? 0,
          }),
        );
      }

      const total = t.price * params.adults; // API price is per person
      const dedupeKey = dedupeKeyForLegs(legs, false);
      offers.push({
        id: hashId(`${dedupeKey}:travelpayouts`),
        dedupeKey,
        source: "travelpayouts",
        sources: ["travelpayouts"],
        freshness: "cached",
        price: {
          total,
          perTraveler: total / params.adults,
          currency,
          totalUSD: toUSD(total, currency),
        },
        legs,
        deeplink: aviasalesLink(t.link),
      });
    }
    return offers;
  },
};
