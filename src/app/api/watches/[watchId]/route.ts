import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { deleteWatch } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DELETE /api/watches/:id — stop watching. */
export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext<"/api/watches/[watchId]">,
): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in" }, { status: 401 });
  const { watchId } = await ctx.params;
  const id = Number(watchId);
  if (!Number.isInteger(id)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }
  deleteWatch(user.id, id);
  return Response.json({ ok: true });
}
