import airportsData from "@/data/airports.json";
import citiesData from "@/data/cities.json";

/**
 * Server-side airport/metro dataset access: autocomplete scoring, metro
 * ("Any airport") groups, and nearby-airport suggestions by distance.
 * The enriched dataset (coords) stays out of the client bundle — the client
 * talks to /api/places instead.
 */

export interface Airport {
  iata: string;
  name: string;
  city: string;
  country: string;
  size: "large" | "medium";
  lat: number;
  lon: number;
}

export interface CityGroup {
  key: string;
  name: string;
  country: string;
  airports: { iata: string; isHub: boolean }[];
}

const airports = airportsData as Airport[];
const cities = citiesData as CityGroup[];

const byIata = new Map(airports.map((a) => [a.iata, a]));
const cityByKey = new Map(cities.map((c) => [c.key, c]));

export function airportByIata(iata: string): Airport | undefined {
  return byIata.get(iata.toUpperCase());
}

export function cityGroupByKey(key: string): CityGroup | undefined {
  return cityByKey.get(key.toLowerCase());
}

/** The airports a metro search fans out to (hubs first, capped). */
export function cityAirports(key: string, cap = 2): Airport[] {
  const group = cityGroupByKey(key);
  if (!group) return [];
  return group.airports
    .slice(0, cap)
    .map((m) => byIata.get(m.iata))
    .filter((a): a is Airport => Boolean(a));
}

const EARTH_RADIUS_MI = 3958.8;

export function distanceMiles(a: Airport, b: Airport): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_MI * Math.asin(Math.sqrt(h)));
}

function score(airport: Airport, q: string): number {
  const query = q.toLowerCase();
  const iata = airport.iata.toLowerCase();
  const city = airport.city?.toLowerCase() ?? "";
  const name = airport.name.toLowerCase();

  let s = 0;
  if (iata === query) s = 100;
  else if (iata.startsWith(query)) s = 80;
  else if (city.startsWith(query)) s = 60;
  else if (name.startsWith(query)) s = 50;
  else if (city.includes(query)) s = 45;
  else if (name.includes(query)) s = 40;
  else return 0;

  if (airport.size === "large") s += 10;
  return s;
}

export interface PlaceCity {
  kind: "city";
  key: string;
  name: string;
  country: string;
  airportCount: number;
  /** Representative (first hub) airport for calendar/fallback purposes. */
  primary: string;
}

export interface PlaceAirport {
  kind: "airport";
  iata: string;
  name: string;
  city: string;
  country: string;
  isHub: boolean;
}

export interface PlaceNearby extends Omit<PlaceAirport, "kind"> {
  kind: "nearby";
  distanceMiles: number;
  /** The matched city the distance is measured from. */
  fromCity: string;
}

export type Place = PlaceCity | PlaceAirport | PlaceNearby;

/**
 * Autocomplete search: a city-level "Any airport" entry when the best match
 * is a multi-airport metro, its member airports, other matches, and nearby
 * airports (with distance) around the top city match.
 */
export function searchPlaces(q: string, limit = 8): Place[] {
  const query = q.trim();
  if (query.length < 2) return [];

  const matches = airports
    .map((a) => ({ a, s: score(a, query) }))
    .filter(({ s }) => s > 0)
    .sort((x, y) => y.s - x.s)
    .slice(0, limit * 2);
  if (matches.length === 0) return [];

  const out: Place[] = [];
  const usedIatas = new Set<string>();

  // City group for the best match: emit "Any airport" + its members first.
  const top = matches[0].a;
  const topCityKey = cities.find((c) =>
    c.airports.some((m) => m.iata === top.iata),
  )?.key;
  const topGroup = topCityKey ? cityByKey.get(topCityKey) : undefined;
  const cityNameMatches =
    topGroup &&
    (topGroup.name.toLowerCase().startsWith(query.toLowerCase()) ||
      matches.filter(({ a }) =>
        topGroup.airports.some((m) => m.iata === a.iata),
      ).length >= 2);

  if (topGroup && cityNameMatches) {
    out.push({
      kind: "city",
      key: topGroup.key,
      name: topGroup.name,
      country: topGroup.country,
      airportCount: topGroup.airports.length,
      primary: topGroup.airports[0].iata,
    });
    for (const member of topGroup.airports) {
      const airport = byIata.get(member.iata);
      if (!airport || usedIatas.has(airport.iata)) continue;
      usedIatas.add(airport.iata);
      out.push({
        kind: "airport",
        iata: airport.iata,
        name: airport.name,
        city: airport.city,
        country: airport.country,
        isHub: airport.size === "large",
      });
    }
  }

  for (const { a } of matches) {
    if (out.length >= limit) break;
    if (usedIatas.has(a.iata)) continue;
    usedIatas.add(a.iata);
    out.push({
      kind: "airport",
      iata: a.iata,
      name: a.name,
      city: a.city,
      country: a.country,
      isHub: a.size === "large",
    });
  }

  // Nearby suggestions around the top match (large airports within 300 mi).
  const anchor = top;
  const nearby = airports
    .filter(
      (a) =>
        a.iata !== anchor.iata &&
        !usedIatas.has(a.iata) &&
        a.size === "large" &&
        Math.abs(a.lat - anchor.lat) < 5 &&
        Math.abs(a.lon - anchor.lon) < 6,
    )
    .map((a) => ({ a, d: distanceMiles(anchor, a) }))
    .filter(({ d }) => d > 20 && d <= 300)
    .sort((x, y) => x.d - y.d)
    .slice(0, 2);
  for (const { a, d } of nearby) {
    usedIatas.add(a.iata);
    out.push({
      kind: "nearby",
      iata: a.iata,
      name: a.name,
      city: a.city,
      country: a.country,
      isHub: true,
      distanceMiles: d,
      fromCity: anchor.city || anchor.name,
    });
  }

  return out.slice(0, limit + 3);
}

/** Nearest large airport to a coordinate (geolocated default origin). */
export function nearestAirport(lat: number, lon: number): Airport | null {
  let best: Airport | null = null;
  let bestD = Infinity;
  const probe = { lat, lon } as Airport;
  for (const a of airports) {
    if (a.size !== "large") continue;
    if (Math.abs(a.lat - lat) > 8 || Math.abs(a.lon - lon) > 10) continue;
    const d = distanceMiles(probe, a);
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}
