import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ token: z.string().min(8).max(64) });

/**
 * POST /api/agent-link — claim an iMessage link token (minted by the
 * agent daemon when an unknown handle texts it). Signed-in users only;
 * the SECURITY DEFINER RPC binds the token's handle to auth.uid().
 */
export async function POST(req: Request): Promise<Response> {
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) {
    return Response.json({ error: "Sign in first" }, { status: 401 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid token" }, { status: 400 });
  }
  const { data, error } = await db.rpc("claim_agent_link", {
    p_token: parsed.data.token,
  });
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  const result = data as { error?: string; handle?: string };
  if (result.error) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json({ linked: true, handle: result.handle });
}
