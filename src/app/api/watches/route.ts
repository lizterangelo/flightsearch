import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { listWatches, markWatchesSeen, upsertWatch } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateWatch = z.object({
  itineraryKey: z.string().min(3).max(400),
  searchUrl: z.string().min(1).max(600),
  label: z.string().min(1).max(120),
  cabin: z.string().min(1).max(30),
  priceUSD: z.number().min(0).nullable(),
});

/** GET /api/watches — the signed-in user's watches (marks alerts seen). */
export async function GET(): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in" }, { status: 401 });
  const watches = listWatches(user.id);
  markWatchesSeen(user.id);
  return Response.json({
    watches: watches.map((w) => ({
      id: w.id,
      label: w.label,
      searchUrl: w.search_url,
      cabin: w.cabin,
      lastPriceUSD: w.last_price_usd,
      lastCheckedAt: w.last_checked_at,
      deltaUSD: w.delta_usd,
    })),
  });
}

/** POST /api/watches — watch an itinerary. */
export async function POST(req: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in" }, { status: 401 });
  const parsed = CreateWatch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid watch" }, { status: 400 });
  }
  upsertWatch({
    userId: user.id,
    itineraryKey: parsed.data.itineraryKey,
    searchUrl: parsed.data.searchUrl,
    label: parsed.data.label,
    cabin: parsed.data.cabin,
    priceUSD: parsed.data.priceUSD,
  });
  return Response.json({ ok: true });
}
