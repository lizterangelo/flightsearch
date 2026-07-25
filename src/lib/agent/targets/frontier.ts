import { frontierLink } from "../../deeplinks";
import { BlockedError, type FlightProvider } from "../../providers/provider";
import type { FlightOffer, SearchParams } from "../../types";
import { scrapedToOffers } from "../normalize";
import type { ScrapedFare } from "../schemas";
import { ScrapedFaresSchema } from "../schemas";
import {
  agentPage,
  agentSleep,
  assertNotAborted,
  captureFailureScreenshot,
  withStagehandPage,
} from "../stagehand";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : null;
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v)
    ? v
    : typeof v === "string" && /^\d+(\.\d+)?$/.test(v)
      ? Number(v)
      : null;

/** Balanced-brace JSON object starting at `from` (string-aware). */
function balancedJson(text: string, from: number): string | null {
  let depth = 0;
  let inStr = false;
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return text.slice(from, i + 1);
    }
  }
  return null;
}

/**
 * InternalSelect embeds the fare matrix as a JSON blob inside a script tag
 * (journeys[].flights[] with departureDate/arrivalDate/stopsText/duration/
 * standardFare/goWildFare — the shape the GoWild-search scrapers parse).
 */
function parseInternalSelect(html: string): ScrapedFare[] | null {
  const unescaped = html
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&");
  const marker = unescaped.indexOf('"journeys"');
  if (marker < 0) return null;
  const start = unescaped.lastIndexOf("{", marker);
  if (start < 0) return null;
  const raw = balancedJson(unescaped, start);
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const journeys = rec(parsed)?.journeys;
  if (!Array.isArray(journeys)) return null;
  const flights = rec(journeys[0])?.flights;
  if (!Array.isArray(flights)) return null;

  const fares: ScrapedFare[] = [];
  for (const f of flights.map(rec)) {
    if (!f) continue;
    const legs = Array.isArray(f.legs) ? f.legs.map(rec) : [];
    const depart = str(f.departureDate) ?? str(legs[0]?.departureDate);
    const arrive = str(f.arrivalDate) ?? str(legs[legs.length - 1]?.arrivalDate);
    // GoWild fares need a paid membership, so only standardFare is offered.
    const price = num(f.standardFare);
    if (!depart || !arrive || price === null) continue;
    const flightNo = str(f.flightNumber) ?? num(f.flightNumber)?.toString();
    fares.push({
      airline: "Frontier",
      flightNumber: flightNo ? `F9 ${flightNo.replace(/^F9\s*/i, "")}` : undefined,
      departTime: depart,
      arriveTime: arrive,
      stops: str(f.stopsText) ?? num(f.stops) ?? 0,
      durationText: str(f.duration) ?? undefined,
      price,
    });
  }
  return fares.length ? fares : null;
}

async function scrapeWithStagehand(
  url: string,
  params: SearchParams,
  signal: AbortSignal,
): Promise<FlightOffer[]> {
  return withStagehandPage(async (sh) => {
    try {
      assertNotAborted(signal);
      const page = await agentPage(sh);
      await page.goto(url, { waitUntil: "load", timeoutMs: 60_000 });
      await agentSleep(6_000, signal); // fare matrix renders client-side
      const extracted = await sh.extract(
        "List every flight with its cheapest standard fare and, if shown, its GoWild fare (note GoWild in fareBrand; put the standard fare in price). Copy times and prices exactly as displayed.",
        ScrapedFaresSchema,
      );
      assertNotAborted(signal);
      return scrapedToOffers(extracted.fares, params, "agent:frontier", url, {
        roundTripTotal: false,
        allPassengers: false,
      });
    } catch (err) {
      await captureFailureScreenshot(sh, "frontier");
      throw err;
    }
  });
}

export const frontierProvider: FlightProvider = {
  id: "agent:frontier",
  label: "Frontier direct",
  tier: 2,
  timeoutMs: 90_000,
  cacheTtlMs: 1_200_000,
  // Fetch-first path is keyless; Stagehand fallback engages only with the key.
  enabled: () => true,

  async search(params, signal) {
    // Frontier's round-trip matrix prices each direction separately per
    // person; we never see a round-trip total, so emitting anything for
    // round_trip params would be misleading (outbound × 2 is NOT the fare).
    // Frontier's value here is cheap one-way US domestic — skip otherwise.
    if (params.tripType === "round_trip") return [];

    const url = frontierLink(params);
    const canAgent = Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);

    let blockedStatus: number | null = null;
    try {
      const res = await fetch(url, {
        signal,
        headers: {
          "user-agent": UA,
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
        },
      });
      if (res.ok) {
        const fares = parseInternalSelect(await res.text());
        if (fares) {
          // Frontier prices are per person, one direction.
          return scrapedToOffers(fares, params, "agent:frontier", url, {
            roundTripTotal: false,
            allPassengers: false,
          });
        }
      } else if (res.status === 403 || res.status === 429) {
        blockedStatus = res.status;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      // network-level failure: fall through to the browser path
    }

    assertNotAborted(signal);
    if (!canAgent) {
      if (blockedStatus !== null) {
        throw new BlockedError(`Frontier returned HTTP ${blockedStatus}`);
      }
      throw new Error("Frontier page had no parseable fares (JS-rendered) and no agent key is set");
    }
    return scrapeWithStagehand(url, params, signal);
  },
};
