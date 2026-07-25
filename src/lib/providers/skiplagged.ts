import {
  agentPage,
  agentSleep,
  assertNotAborted,
  withStagehandPage,
} from "../agent/stagehand";
import { toUSD } from "../currency";
import { dedupeKeyForLegs, hashId } from "../dedupe";
import { skiplaggedLink } from "../deeplinks";
import { activeProviders } from "../env";
import type {
  FlightLeg,
  FlightOffer,
  FlightSegment,
  SearchParams,
} from "../types";
import { BlockedError, type FlightProvider } from "./provider";

/**
 * Skiplagged unofficial JSON API.
 *
 * GET https://skiplagged.com/api/search.php
 *       ?from={O}&to={D}&depart={YYYY-MM-DD}[&return={YYYY-MM-DD}]
 *       &format=v3&sort=cost&counts[adults]={n}&counts[children]=0
 *
 * Implemented response shape (format=v3, per the Go structs in
 * github.com/minormending/go-skiplagged clients/city.go):
 *
 *   {
 *     airlines: { [code]: { name: string } },        // code → carrier name
 *     flights: {
 *       [key]: {
 *         segments: [{
 *           airline: string,                          // "AA"
 *           flight_number: number,
 *           departure: { time: string, airport: string },  // RFC3339 w/ local offset
 *           arrival:   { time: string, airport: string },
 *           duration: number,                         // seconds
 *         }],
 *         duration: number,                           // seconds
 *       },
 *     },
 *     itineraries: {
 *       outbound: [{ flight: key, one_way_price: cents, min_round_trip_price?: cents }],
 *       inbound:  [ same ],
 *     },
 *   }
 *
 * Legacy (no-format / v2) fallback, per skiplagged-node-api:
 *   depart / return: [ [ [cents], _, longKey, flightKey ], ... ]
 *   flights: { [key]: [ [ [flightCode, depAirport, depTime, arrAirport, arrTime], ... ], durationSeconds ] }
 *
 * Prices are PER PERSON in USD cents (some variants ship dollar values —
 * handled heuristically in priceDollars). Times carry the airport-local
 * offset; we keep only the local wall part ("YYYY-MM-DDTHH:mm").
 */

const MIN_INTERVAL_MS = 5000;
let lastRequestAt = 0;

/** Module-level throttle: at most one live request per 5s. Abort-aware. */
async function rateGate(signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, wait);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }
  lastRequestAt = Date.now();
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** "2026-08-01T07:15:00-04:00" → "2026-08-01T07:15" (local wall, no tz math). */
function wallTime(v: unknown): string | null {
  if (typeof v !== "string") return null;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) ? v.slice(0, 16) : null;
}

/**
 * Wall-clock diff, both ends treated as UTC. Only a fallback for missing
 * upstream durations (off by the tz delta on cross-zone segments); never
 * used for display times.
 */
function wallDiffMinutes(dep: string, arr: string): number {
  const diff = Math.round(
    (Date.parse(`${arr}:00Z`) - Date.parse(`${dep}:00Z`)) / 60000,
  );
  return Number.isFinite(diff) && diff > 0 ? diff : 0;
}

/**
 * cents-int vs dollars heuristic: arrays unwrap to their first element;
 * fractional values are already dollars; integers >= 100 are the documented
 * cents format; tiny integers (< 100 → under $1 as cents) read as dollars.
 */
function priceDollars(v: unknown): number | null {
  const n = Array.isArray(v) ? v[0] : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
  if (!Number.isInteger(n)) return n;
  return n >= 100 ? n / 100 : n;
}

function airlineName(airlines: unknown, code: string): string {
  if (isRecord(airlines)) {
    const entry = airlines[code];
    if (typeof entry === "string") return entry;
    if (isRecord(entry) && typeof entry.name === "string") return entry.name;
  }
  return code;
}

function segmentFromV3(raw: unknown, airlines: unknown): FlightSegment | null {
  if (!isRecord(raw)) return null;
  const code = typeof raw.airline === "string" ? raw.airline : null;
  const num =
    typeof raw.flight_number === "number" || typeof raw.flight_number === "string"
      ? String(raw.flight_number)
      : null;
  const dep = isRecord(raw.departure) ? raw.departure : null;
  const arr = isRecord(raw.arrival) ? raw.arrival : null;
  const depTime = wallTime(dep?.time);
  const arrTime = wallTime(arr?.time);
  const depAirport = typeof dep?.airport === "string" ? dep.airport : null;
  const arrAirport = typeof arr?.airport === "string" ? arr.airport : null;
  if (!code || !num || !depTime || !arrTime || !depAirport || !arrAirport) {
    return null;
  }
  const durSec = typeof raw.duration === "number" ? raw.duration : 0;
  return {
    carrierCode: code,
    carrierName: airlineName(airlines, code),
    flightNumber: `${code} ${num}`,
    origin: depAirport,
    destination: arrAirport,
    departure: depTime,
    arrival: arrTime,
    durationMinutes:
      durSec > 0 ? Math.round(durSec / 60) : wallDiffMinutes(depTime, arrTime),
  };
}

/** Legacy leg tuple: [flightCode, depAirport, depTime, arrAirport, arrTime]. */
function segmentFromV2(raw: unknown, airlines: unknown): FlightSegment | null {
  if (!Array.isArray(raw) || raw.length < 5) return null;
  const [codeRaw, depARaw, depTRaw, arrARaw, arrTRaw] = raw as unknown[];
  const flightCode = typeof codeRaw === "string" ? codeRaw : null;
  const depAirport = typeof depARaw === "string" ? depARaw : null;
  const arrAirport = typeof arrARaw === "string" ? arrARaw : null;
  const depTime = wallTime(depTRaw);
  const arrTime = wallTime(arrTRaw);
  if (!flightCode || !depAirport || !arrAirport || !depTime || !arrTime) {
    return null;
  }
  const code = flightCode.slice(0, 2);
  return {
    carrierCode: code,
    carrierName: airlineName(airlines, code),
    flightNumber: `${code} ${flightCode.slice(2)}`.trim(),
    origin: depAirport,
    destination: arrAirport,
    departure: depTime,
    arrival: arrTime,
    durationMinutes: wallDiffMinutes(depTime, arrTime),
  };
}

function legFromSegments(
  segments: FlightSegment[],
  durationSec: number | null,
): FlightLeg | null {
  const first = segments[0];
  const last = segments[segments.length - 1];
  if (!first || !last) return null;
  return {
    segments,
    origin: first.origin,
    destination: last.destination,
    departure: first.departure,
    arrival: last.arrival,
    durationMinutes:
      durationSec != null && durationSec > 0
        ? Math.round(durationSec / 60)
        : segments.reduce((sum, s) => sum + s.durationMinutes, 0),
    stops: segments.length - 1,
    stopAirports: segments.slice(0, -1).map((s) => s.destination),
    overnight: last.arrival.slice(0, 10) > first.departure.slice(0, 10),
  };
}

/** flights[key] → leg; supports both the v3 object and legacy tuple shapes. */
function legForKey(
  flights: Record<string, unknown>,
  key: string,
  airlines: unknown,
): FlightLeg | null {
  const entry = flights[key];
  if (isRecord(entry) && Array.isArray(entry.segments)) {
    const segments: FlightSegment[] = [];
    for (const s of entry.segments) {
      const seg = segmentFromV3(s, airlines);
      if (!seg) return null;
      segments.push(seg);
    }
    const durSec = typeof entry.duration === "number" ? entry.duration : null;
    return legFromSegments(segments, durSec);
  }
  if (Array.isArray(entry) && Array.isArray(entry[0])) {
    const segments: FlightSegment[] = [];
    for (const s of entry[0] as unknown[]) {
      const seg = segmentFromV2(s, airlines);
      if (!seg) return null;
      segments.push(seg);
    }
    const durSec = typeof entry[1] === "number" ? entry[1] : null;
    return legFromSegments(segments, durSec);
  }
  return null;
}

interface RawItinerary {
  flightKey: string;
  perPersonUSD: number;
}

function itinerariesFromV3(list: unknown): RawItinerary[] | null {
  if (!Array.isArray(list)) return null;
  const out: RawItinerary[] = [];
  for (const item of list) {
    if (!isRecord(item) || typeof item.flight !== "string") continue;
    const price = priceDollars(
      item.one_way_price ?? item.data_cost ?? item.price ?? item.cost,
    );
    if (price === null) continue;
    out.push({ flightKey: item.flight, perPersonUSD: price });
  }
  return out;
}

/** Legacy tuple: [[cents], _, longKey, flightKey] — key found by flights lookup. */
function itinerariesFromV2(
  list: unknown,
  flights: Record<string, unknown>,
): RawItinerary[] | null {
  if (!Array.isArray(list)) return null;
  const out: RawItinerary[] = [];
  for (const item of list) {
    if (!Array.isArray(item)) continue;
    const price = priceDollars(item[0]);
    const key = [...item]
      .reverse()
      .find((el): el is string => typeof el === "string" && el in flights);
    if (price === null || !key) continue;
    out.push({ flightKey: key, perPersonUSD: price });
  }
  return out;
}

interface PricedLeg {
  leg: FlightLeg;
  perPersonUSD: number;
}

function resolveLegs(
  itins: RawItinerary[],
  flights: Record<string, unknown>,
  airlines: unknown,
  limit: number,
): PricedLeg[] {
  const out: PricedLeg[] = [];
  for (const itin of [...itins].sort((a, b) => a.perPersonUSD - b.perPersonUSD)) {
    const leg = legForKey(flights, itin.flightKey, airlines);
    if (leg) out.push({ leg, perPersonUSD: itin.perPersonUSD });
    if (out.length >= limit) break;
  }
  return out;
}

function buildOffer(
  params: SearchParams,
  legs: FlightLeg[],
  perPersonUSD: number,
): FlightOffer {
  // Hidden-city: a bound that lands somewhere other than the searched-for
  // endpoint (outbound → destination, return → origin). Ticketed destination
  // reported from the outbound when it deviates, else the return.
  const outbound = legs[0];
  const inbound = legs[1];
  const outboundHidden =
    outbound !== undefined && outbound.destination !== params.destination;
  const inboundHidden =
    inbound !== undefined && inbound.destination !== params.origin;
  const hidden = outboundHidden || inboundHidden;
  const ticketedDestination =
    outboundHidden && outbound ? outbound.destination : inbound?.destination;

  const total = perPersonUSD * params.adults;
  const dedupeKey = dedupeKeyForLegs(legs, hidden);
  return {
    id: hashId(`${dedupeKey}:skiplagged`),
    dedupeKey,
    source: "skiplagged",
    sources: ["skiplagged"],
    freshness: hidden ? "hidden-city" : "live",
    price: {
      total,
      perTraveler: total / params.adults,
      currency: "USD",
      totalUSD: toUSD(total, "USD"),
    },
    legs,
    deeplink: skiplaggedLink(params),
    ...(hidden && ticketedDestination
      ? { hiddenCity: { ticketedDestination } }
      : {}),
  };
}

const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";

async function fetchDirect(url: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(url, {
    signal,
    cache: "no-store",
    headers: {
      "User-Agent": CHROME_UA,
      Accept: "application/json",
      "Accept-Language": "en-US",
      Referer: "https://skiplagged.com/",
    },
  });

  const contentType = res.headers.get("content-type") ?? "";
  if (res.status === 403 || res.status === 503 || contentType.includes("text/html")) {
    throw new BlockedError("Cloudflare");
  }
  if (!res.ok) throw new Error(`Skiplagged HTTP ${res.status}`);

  try {
    return await res.json();
  } catch {
    throw new Error("Skiplagged: unparseable JSON response");
  }
}

/**
 * Cloudflare TLS-fingerprints Node's fetch (403 even with browser headers),
 * so when the browser agent is available we load the JSON API URL in the
 * pooled real Chrome instead. No LLM involved — the response is raw JSON
 * read out of the rendered document.
 */
async function fetchViaBrowser(
  url: string,
  signal: AbortSignal,
): Promise<unknown> {
  return withStagehandPage(async (sh) => {
    assertNotAborted(signal);
    const page = await agentPage(sh);
    await page.goto(url, { waitUntil: "domcontentloaded" });

    const read = async (): Promise<unknown | null> => {
      const text = await page.evaluate<string>(
        () => document.body?.innerText ?? "",
      );
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return null;
      }
    };

    let json = await read();
    if (json === null) {
      // Likely a Cloudflare interstitial — give the challenge time to clear.
      await agentSleep(6000, signal);
      json = await read();
    }
    if (json === null) {
      throw new BlockedError("Cloudflare (browser challenge unresolved)");
    }
    return json;
  });
}

async function searchSkiplagged(
  params: SearchParams,
  signal: AbortSignal,
): Promise<FlightOffer[]> {
  await rateGate(signal);

  const sp = new URLSearchParams({
    from: params.origin,
    to: params.destination,
    depart: params.departDate,
    sort: "cost",
    format: "v3",
    "counts[adults]": String(params.adults),
    "counts[children]": "0",
  });
  if (params.tripType === "round_trip" && params.returnDate) {
    sp.set("return", params.returnDate);
  }
  const url = `https://skiplagged.com/api/search.php?${sp}`;

  let root: unknown;
  try {
    root = await fetchDirect(url, signal);
  } catch (err) {
    if (err instanceof BlockedError && activeProviders().browserFetch) {
      root = await fetchViaBrowser(url, signal);
    } else {
      throw err;
    }
  }
  if (!isRecord(root)) throw new Error("Skiplagged: unrecognized response shape");

  const flights = isRecord(root.flights) ? root.flights : null;
  const airlines = root.airlines;

  const v3 = isRecord(root.itineraries) ? root.itineraries : null;
  let outboundItins: RawItinerary[] | null = null;
  let inboundItins: RawItinerary[] | null = null;
  if (v3) {
    outboundItins = itinerariesFromV3(v3.outbound ?? v3.depart);
    inboundItins = itinerariesFromV3(v3.inbound ?? v3.return);
  } else if (flights) {
    outboundItins = itinerariesFromV2(root.depart, flights);
    inboundItins = itinerariesFromV2(root.return, flights);
  }
  if (!flights || outboundItins === null) {
    throw new Error("Skiplagged: unrecognized response shape");
  }
  if (outboundItins.length === 0) return [];

  const offers: FlightOffer[] = [];
  const seen = new Set<string>();
  const push = (legs: FlightLeg[], perPersonUSD: number) => {
    const offer = buildOffer(params, legs, perPersonUSD);
    if (seen.has(offer.dedupeKey)) return;
    seen.add(offer.dedupeKey);
    offers.push(offer);
  };

  if (params.tripType === "round_trip") {
    // Skiplagged prices round trips per direction. Policy: pair each of the
    // top ~10 cheapest outbound itineraries with THE single cheapest return
    // itinerary; offer price = sum of the two one-way per-person prices.
    const outbounds = resolveLegs(outboundItins, flights, airlines, 10);
    const returns = resolveLegs(inboundItins ?? [], flights, airlines, 1);
    const cheapestReturn = returns[0];
    if (!cheapestReturn) return [];
    for (const out of outbounds) {
      push(
        [out.leg, cheapestReturn.leg],
        out.perPersonUSD + cheapestReturn.perPersonUSD,
      );
    }
  } else {
    for (const out of resolveLegs(outboundItins, flights, airlines, 20)) {
      push([out.leg], out.perPersonUSD);
    }
  }

  return offers;
}

export const skiplaggedProvider: FlightProvider = {
  id: "skiplagged",
  label: "Skiplagged",
  tier: 1,
  // Generous budget: the Cloudflare-blocked path relaunches through the
  // pooled Chrome (browser start + challenge wait). Results still stream
  // independently, so the slow path never delays other providers.
  timeoutMs: 45000,
  cacheTtlMs: 1200000,
  enabled: () => process.env.SKIPLAGGED_ENABLED !== "false",
  search: searchSkiplagged,
};
