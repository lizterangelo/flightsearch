import type { NextRequest } from "next/server";
import { toUSD } from "@/lib/currency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/price-calendar?origin=JFK&destination=MIA&month=2026-08
 * Cheapest one-way fare per departure date in the month, from the
 * Travelpayouts/Aviasales cache. Degrades to { available: false } without a
 * token (the UI then hides the calendar). "from" prices — indicative, cached.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const sp = req.nextUrl.searchParams;
  const origin = (sp.get("origin") ?? "").toUpperCase();
  const destination = (sp.get("destination") ?? "").toUpperCase();
  const month = sp.get("month") ?? "";

  if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination)) {
    return Response.json({ error: "Invalid origin/destination" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return Response.json({ error: "Invalid month (YYYY-MM)" }, { status: 400 });
  }

  const token = process.env.TRAVELPAYOUTS_TOKEN;
  if (!token) return Response.json({ available: false });

  const url = new URL("https://api.travelpayouts.com/aviasales/v3/prices_for_dates");
  url.searchParams.set("origin", origin);
  url.searchParams.set("destination", destination);
  url.searchParams.set("departure_at", month); // month prefix → whole month
  url.searchParams.set("one_way", "true");
  url.searchParams.set("currency", "usd"); // explicit — defaults to RUB
  url.searchParams.set("sorting", "price");
  url.searchParams.set("limit", "1000");
  url.searchParams.set("unique", "false");

  try {
    const res = await fetch(url, {
      headers: { "X-Access-Token": token },
      signal: req.signal,
      cache: "no-store",
    });
    if (!res.ok) return Response.json({ available: false });
    const body = (await res.json()) as {
      success?: boolean;
      currency?: string;
      data?: Array<{ departure_at?: string; price?: number }>;
    };
    if (body.success === false || !Array.isArray(body.data)) {
      return Response.json({ available: false });
    }

    const currency = (body.currency ?? "USD").toUpperCase();
    const days: Record<string, number> = {};
    for (const t of body.data) {
      const date = t.departure_at?.slice(0, 10);
      const price = typeof t.price === "number" ? toUSD(t.price, currency) : null;
      if (!date || price === null) continue;
      if (days[date] === undefined || price < days[date]) {
        days[date] = Math.round(price);
      }
    }

    return Response.json({ available: true, currency: "USD", days });
  } catch {
    return Response.json({ available: false });
  }
}
