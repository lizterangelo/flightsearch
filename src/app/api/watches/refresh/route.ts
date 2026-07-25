import { getSessionUser } from "@/lib/auth";
import { refreshStaleWatches } from "@/lib/watches";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/watches/refresh — re-price stale watches (visit-triggered;
 * capped and serialized server-side).
 */
export async function POST(): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in" }, { status: 401 });
  const refreshed = await refreshStaleWatches();
  return Response.json({ refreshed });
}
