import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

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
  const db = await supabaseServer();
  await db.from("watches").delete().eq("id", watchId);
  return Response.json({ ok: true });
}
