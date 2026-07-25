import type { NextRequest } from "next/server";
import { nearestAirport, searchPlaces } from "@/lib/airports";

export const runtime = "nodejs";

/**
 * GET /api/places?q=tokyo — autocomplete: metro "Any airport" entries,
 * airports, and nearby-airport suggestions with distance.
 * GET /api/places?lat=..&lon=.. — nearest large airport (geolocated origin).
 */
export async function GET(req: NextRequest): Promise<Response> {
  const sp = req.nextUrl.searchParams;

  const latRaw = sp.get("lat");
  const lonRaw = sp.get("lon");
  const lat = latRaw === null ? NaN : Number(latRaw);
  const lon = lonRaw === null ? NaN : Number(lonRaw);
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    const airport = nearestAirport(lat, lon);
    return Response.json({
      airport: airport
        ? {
            iata: airport.iata,
            name: airport.name,
            city: airport.city,
            country: airport.country,
          }
        : null,
    });
  }

  const q = sp.get("q") ?? "";
  return Response.json({ places: searchPlaces(q) });
}
