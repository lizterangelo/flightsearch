import type { NextRequest } from "next/server";
import { buildCalendar, maybeScheduleFill } from "@/lib/calendar";
import { addDaysYmd, todayLocalYmd } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/price-calendar?origin=CEB&destination=HND&start=...&end=...&cabin=economy
 *
 * Cheapest observed fare per departure date, tiered against the window
 * average (cheap / medium / expensive). Fed by live searches; optionally
 * backfilled with capped one-way searches when CALENDAR_FILL=1.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const sp = req.nextUrl.searchParams;
  const origin = (sp.get("origin") ?? "").toUpperCase();
  const destination = (sp.get("destination") ?? "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination)) {
    return Response.json({ error: "Invalid route" }, { status: 400 });
  }
  const today = todayLocalYmd();
  const ymd = /^\d{4}-\d{2}-\d{2}$/;
  const start = ymd.test(sp.get("start") ?? "") ? sp.get("start")! : today;
  const end = ymd.test(sp.get("end") ?? "")
    ? sp.get("end")!
    : addDaysYmd(today, 330);
  const cabin = sp.get("cabin") ?? "economy";

  const payload = await buildCalendar({
    origin,
    destination,
    cabin,
    start,
    end,
    scheduled: false,
  });

  // Sparse window → optionally seed it in the background.
  if (payload.prices.length < 6) {
    payload.cache_fill.scheduled = maybeScheduleFill(origin, destination);
  }

  return Response.json(payload);
}
