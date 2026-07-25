import { hashId } from "./dedupe";
import { buildProviders } from "./providers";
import { runProvider } from "./providers/provider";
import type { FlightLeg, FlightOffer, SearchParams } from "./types";

/**
 * Split-ticketing: for a round trip, price the outbound and return as two
 * independent one-ways and combine the cheapest of EACH ACROSS ALL SOURCES.
 * The win comes from mixing carriers/sources — e.g. outbound cheapest on
 * Skiplagged, return cheapest on Google — which a single round-trip fare
 * (always one airline's bundle) can't match. The cost is two separate
 * bookings with no through-protection.
 *
 * Only "live" legs are eligible: cached prices are indicative and hidden-city
 * legs compound risk, so neither should anchor a savings claim.
 */

function cheapestLive(offers: FlightOffer[]): FlightOffer | null {
  const eligible = offers.filter(
    (o) => o.freshness === "live" && !o.splitTicket && o.legs.length === 1,
  );
  if (eligible.length === 0) return null;
  return eligible.reduce((min, o) =>
    o.price.totalUSD < min.price.totalUSD ? o : min,
  );
}

export async function findSplitTicket(
  params: SearchParams,
  signal: AbortSignal,
): Promise<FlightOffer | null> {
  if (params.tripType !== "round_trip" || !params.returnDate) return null;

  // Fast Tier-1 providers only — the browser agent is too slow to block on.
  const { tier1 } = buildProviders();
  if (tier1.length === 0) return null;

  const outboundParams: SearchParams = {
    ...params,
    tripType: "one_way",
    returnDate: undefined,
  };
  const returnParams: SearchParams = {
    ...params,
    origin: params.destination,
    destination: params.origin,
    departDate: params.returnDate,
    returnDate: undefined,
    tripType: "one_way",
  };

  const searchAll = async (p: SearchParams): Promise<FlightOffer[]> => {
    const results = await Promise.all(
      tier1.map((provider) => runProvider(provider, p, signal)),
    );
    return results.flatMap((r) => r.offers);
  };

  const [outOffers, retOffers] = await Promise.all([
    searchAll(outboundParams),
    searchAll(returnParams),
  ]);

  const out = cheapestLive(outOffers);
  const ret = cheapestLive(retOffers);
  if (!out || !ret) return null;

  const outLeg: FlightLeg = out.legs[0];
  const retLeg: FlightLeg = ret.legs[0];

  const totalUSD = out.price.totalUSD + ret.price.totalUSD;
  const total = out.price.total + ret.price.total;
  const legKey = (leg: FlightLeg) =>
    leg.segments.map((s) => s.flightNumber || s.carrierName).join(",");
  const dedupeKey = `SPLIT:${legKey(outLeg)}|${legKey(retLeg)}`;

  return {
    id: hashId(`${dedupeKey}:split`),
    dedupeKey,
    source: "split",
    sources: ["split"],
    freshness: "live",
    price: {
      total,
      perTraveler: total / params.adults,
      currency: "USD",
      totalUSD,
    },
    legs: [outLeg, retLeg],
    deeplink: out.deeplink,
    splitTicket: {
      outbound: { deeplink: out.deeplink, totalUSD: out.price.totalUSD },
      return: { deeplink: ret.deeplink, totalUSD: ret.price.totalUSD },
    },
  };
}
