import { getSessionUser } from "@/lib/auth";
import { unseenWatchCount } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/me — the signed-in user (or null) + unseen watch-alert count. */
export async function GET(): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return Response.json({ user: null, unseenWatchAlerts: 0 });
  return Response.json({
    user: { id: user.id, identifier: user.identifier },
    unseenWatchAlerts: unseenWatchCount(user.id),
  });
}
