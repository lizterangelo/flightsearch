import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

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
  const db = await supabaseServer();
  const { data } = await db
    .from("watches")
    .select("*")
    .order("created_at", { ascending: false });
  await db.from("watches").update({ seen: true }).eq("seen", false);
  const watches = (data ?? []) as {
    id: string;
    label: string;
    search_url: string;
    cabin: string;
    last_price_usd: number | null;
    last_checked_at: string | null;
    delta_usd: number;
  }[];
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
  const db = await supabaseServer();
  const { error } = await db.from("watches").upsert(
    {
      user_id: user.id,
      itinerary_key: parsed.data.itineraryKey,
      search_url: parsed.data.searchUrl,
      label: parsed.data.label,
      cabin: parsed.data.cabin,
      last_price_usd: parsed.data.priceUSD,
      last_checked_at: new Date().toISOString(),
    },
    { onConflict: "user_id,itinerary_key" },
  );
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}
