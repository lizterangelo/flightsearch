import { getSessionUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/account/delete — self-service account deletion via the
 * SECURITY DEFINER delete_my_account() RPC (auth user row cascades to
 * every public table).
 */
export async function POST(): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in" }, { status: 401 });

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("delete_my_account");
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  await supabase.auth.signOut();
  return Response.json({ ok: true });
}
