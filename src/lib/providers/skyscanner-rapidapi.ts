import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { toUSD } from "../currency";
import { dedupeKeyForLegs, hashId } from "../dedupe";
import type {
  FlightLeg,
  FlightOffer,
  FlightSegment,
  SearchParams,
} from "../types";
import { BlockedError, type FlightProvider } from "./provider";

/**
 * Skyscanner via the unofficial sky-scrapper RapidAPI proxy.
 * Two-step: searchAirport resolves IATA → {skyId, entityId} (cached in-process
 * and mirrored to .cache/skyscanner-entities.json), then searchFlights v2.
 */

const HOST = "sky-scrapper.p.rapidapi.com";
const ENTITY_CACHE_FILE = path.join(
  process.cwd(),
  ".cache",
  "skyscanner-entities.json",
);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function str(v: unknown, field: string): string {
  if (typeof v !== "string" || !v) throw new Error(`Skyscanner: bad ${field}`);
  return v;
}

function num(v: unknown, field: string): number {
  if (typeof v !== "number" || !Number.isFinite(v))
    throw new Error(`Skyscanner: bad ${field}`);
  return v;
}

/** "2026-08-01T07:15:00" (or with offset) → "2026-08-01T07:15" local wall time. */
function localMinutes(v: unknown, field: string): string {
  const s = str(v, field);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s))
    throw new Error(`Skyscanner: bad ${field} "${s}"`);
  return s.slice(0, 16);
}

/** Leg places use {id, displayCode}; segment places use {flightPlaceId, displayCode}. */
function placeCode(v: unknown, field: string): string {
  if (isRecord(v)) {
    for (const key of ["displayCode", "flightPlaceId", "id"]) {
      const code = v[key];
      if (typeof code === "string" && /^[A-Z0-9]{3}$/.test(code)) return code;
    }
  }
  throw new Error(`Skyscanner: bad ${field}`);
}

async function apiGet(
  pathname: string,
  query: Record<string, string>,
  signal: AbortSignal,
): Promise<unknown> {
  const res = await fetch(`https://${HOST}${pathname}?${new URLSearchParams(query)}`, {
    headers: {
      "X-RapidAPI-Key": process.env.RAPIDAPI_KEY ?? "",
      "X-RapidAPI-Host": HOST,
    },
    signal,
  });
  if (res.status === 429) throw new BlockedError("rate limited");
  if (!res.ok) throw new Error(`Skyscanner HTTP ${res.status}`);
  return (await res.json()) as unknown;
}

/* ------------------------------------------------------------------ */
/* IATA → {skyId, entityId} resolution with in-process + disk cache    */
/* ------------------------------------------------------------------ */

interface SkyPlace {
  skyId: string;
  entityId: string;
}

const entityCache = new Map<string, SkyPlace>();
let diskLoad: Promise<void> | null = null;

async function loadDiskCache(): Promise<void> {
  try {
    const raw: unknown = JSON.parse(await readFile(ENTITY_CACHE_FILE, "utf8"));
    if (!isRecord(raw)) return;
    for (const [iata, place] of Object.entries(raw)) {
      if (
        isRecord(place) &&
        typeof place.skyId === "string" &&
        typeof place.entityId === "string" &&
        !entityCache.has(iata)
      ) {
        entityCache.set(iata, { skyId: place.skyId, entityId: place.entityId });
      }
    }
  } catch {
    // Best effort — absent/corrupt file just means re-resolving.
  }
}

async function persistDiskCache(): Promise<void> {
  try {
    await mkdir(path.dirname(ENTITY_CACHE_FILE), { recursive: true });
    await writeFile(
      ENTITY_CACHE_FILE,
      JSON.stringify(Object.fromEntries(entityCache), null, 2),
    );
  } catch {
    // Best effort.
  }
}

async function resolvePlace(
  iata: string,
  signal: AbortSignal,
): Promise<SkyPlace> {
  if (!diskLoad) diskLoad = loadDiskCache();
  await diskLoad;
  const cached = entityCache.get(iata);
  if (cached) return cached;

  const json = await apiGet(
    "/api/v1/flights/searchAirport",
    { query: iata, locale: "en-US" },
    signal,
  );
  if (!isRecord(json) || !Array.isArray(json.data))
    throw new Error("Skyscanner searchAirport: unexpected response shape");

  for (const entry of json.data) {
    if (!isRecord(entry)) continue;
    // Airport-level entries carry the IATA as skyId (city entries differ).
    const skyId =
      typeof entry.skyId === "string"
        ? entry.skyId
        : isRecord(entry.navigation) &&
            isRecord(entry.navigation.relevantFlightParams) &&
            typeof entry.navigation.relevantFlightParams.skyId === "string"
          ? entry.navigation.relevantFlightParams.skyId
          : undefined;
    const entityId =
      typeof entry.entityId === "string"
        ? entry.entityId
        : typeof entry.entityId === "number"
          ? String(entry.entityId)
          : undefined;
    if (skyId === iata && entityId) {
      const place = { skyId, entityId };
      entityCache.set(iata, place);
      void persistDiskCache();
      return place;
    }
  }
  throw new Error(`Skyscanner: no airport match for ${iata}`);
}

/* ------------------------------------------------------------------ */
/* Response mapping                                                    */
/* ------------------------------------------------------------------ */

function mapSegment(raw: unknown): FlightSegment {
  if (!isRecord(raw)) throw new Error("Skyscanner: bad segment");
  const marketing = isRecord(raw.marketingCarrier) ? raw.marketingCarrier : {};
  const carrierCode =
    typeof marketing.displayCode === "string" && marketing.displayCode
      ? marketing.displayCode
      : typeof marketing.alternateId === "string"
        ? marketing.alternateId
        : "";
  const carrierName = str(marketing.name, "segment.marketingCarrier.name");
  const rawFlightNumber =
    typeof raw.flightNumber === "string"
      ? raw.flightNumber
      : typeof raw.flightNumber === "number"
        ? String(raw.flightNumber)
        : "";
  const operating = isRecord(raw.operatingCarrier) ? raw.operatingCarrier : {};
  const operatedBy =
    typeof operating.name === "string" && operating.name !== carrierName
      ? operating.name
      : undefined;
  return {
    carrierCode,
    carrierName,
    flightNumber: `${carrierCode} ${rawFlightNumber}`.trim(),
    origin: placeCode(raw.origin, "segment.origin"),
    destination: placeCode(raw.destination, "segment.destination"),
    departure: localMinutes(raw.departure, "segment.departure"),
    arrival: localMinutes(raw.arrival, "segment.arrival"),
    durationMinutes: num(raw.durationInMinutes, "segment.durationInMinutes"),
    operatedBy,
  };
}

function mapLeg(raw: unknown): FlightLeg {
  if (!isRecord(raw)) throw new Error("Skyscanner: bad leg");
  if (!Array.isArray(raw.segments) || raw.segments.length === 0)
    throw new Error("Skyscanner: leg without segments");
  const segments = raw.segments.map(mapSegment);
  const departure = localMinutes(raw.departure, "leg.departure");
  const arrival = localMinutes(raw.arrival, "leg.arrival");
  return {
    segments,
    origin: placeCode(raw.origin, "leg.origin"),
    destination: placeCode(raw.destination, "leg.destination"),
    departure,
    arrival,
    durationMinutes: num(raw.durationInMinutes, "leg.durationInMinutes"),
    stops:
      typeof raw.stopCount === "number"
        ? raw.stopCount
        : Math.max(0, segments.length - 1),
    stopAirports: segments.slice(1).map((s) => s.origin),
    overnight: arrival.slice(0, 10) > departure.slice(0, 10),
  };
}

function mapItinerary(raw: unknown, adults: number): FlightOffer {
  if (!isRecord(raw)) throw new Error("Skyscanner: bad itinerary");
  const price = isRecord(raw.price) ? raw.price : {};
  // Skyscanner results price is the *average per person* for multi-traveller
  // searches (help.skyscanner.net article 201151342), so total = raw × adults.
  const perTraveler = num(price.raw, "itinerary.price.raw");
  const total = Math.round(perTraveler * adults * 100) / 100;
  if (!Array.isArray(raw.legs) || raw.legs.length === 0)
    throw new Error("Skyscanner: itinerary without legs");
  const legs = raw.legs.map(mapLeg);
  const dedupeKey = dedupeKeyForLegs(legs, false);
  const deeplink =
    typeof raw.deeplink === "string" && raw.deeplink.startsWith("http")
      ? raw.deeplink
      : "https://www.skyscanner.com";
  return {
    id: hashId(`${dedupeKey}:skyscanner`),
    dedupeKey,
    source: "skyscanner",
    sources: ["skyscanner"],
    freshness: "live",
    price: {
      total,
      perTraveler,
      currency: "USD",
      totalUSD: toUSD(total, "USD"),
    },
    legs,
    deeplink,
  };
}

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

export const skyscannerProvider: FlightProvider = {
  id: "skyscanner",
  label: "Skyscanner",
  tier: 1,
  timeoutMs: 20_000,
  cacheTtlMs: 86_400_000,

  enabled() {
    return (
      process.env.ENABLE_SKYSCANNER === "true" &&
      Boolean(process.env.RAPIDAPI_KEY)
    );
  },

  async search(params: SearchParams, signal: AbortSignal) {
    const [origin, destination] = await Promise.all([
      resolvePlace(params.origin, signal),
      resolvePlace(params.destination, signal),
    ]);

    const query: Record<string, string> = {
      originSkyId: origin.skyId,
      destinationSkyId: destination.skyId,
      originEntityId: origin.entityId,
      destinationEntityId: destination.entityId,
      date: params.departDate,
      adults: String(params.adults),
      // Cabin values match the API's cabinClass vocabulary exactly.
      cabinClass: params.cabin,
      currency: "USD",
      sortBy: "price_low",
      market: "en-US",
      countryCode: "US",
    };
    if (params.tripType === "round_trip" && params.returnDate)
      query.returnDate = params.returnDate;

    const json = await apiGet("/api/v2/flights/searchFlights", query, signal);
    if (!isRecord(json))
      throw new Error("Skyscanner searchFlights: unexpected response shape");
    if (json.status === false)
      throw new Error("Skyscanner searchFlights: request rejected");
    if (!isRecord(json.data) || !Array.isArray(json.data.itineraries))
      throw new Error("Skyscanner searchFlights: unexpected response shape");

    return json.data.itineraries.map((it) => mapItinerary(it, params.adults));
  },
};
