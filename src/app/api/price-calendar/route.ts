import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/price-calendar?origin=CEB&destination=HND&start=...&end=...&cabin=economy
 *
 * Cheapest observed fare per departure date, tiered against the rolling
 * average. Served from the price_observations store once the DB lands
 * (Phase 6); until then it returns an empty calendar with the final shape so
 * the date picker renders without price tints.
 */
export interface CalendarDay {
  date: string;
  amount: number;
  currency: string;
  source: string;
  observed_at: string;
  expires_at: string;
  tier: "cheap" | "medium" | "expensive";
}

export async function GET(req: NextRequest): Promise<Response> {
  const sp = req.nextUrl.searchParams;
  const origin = (sp.get("origin") ?? "").toUpperCase();
  const destination = (sp.get("destination") ?? "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination)) {
    return Response.json({ error: "Invalid route" }, { status: 400 });
  }

  return Response.json({
    origin,
    destination,
    start: sp.get("start"),
    end: sp.get("end"),
    cabin: sp.get("cabin") ?? "economy",
    currency: "USD",
    average_amount: null,
    threshold: 0.12,
    cache_fill: { fetched: false, rows: 0, scheduled: false },
    prices: [] as CalendarDay[],
  });
}
