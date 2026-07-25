import { cookies } from "next/headers";
import { endSession, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(): Promise<Response> {
  await endSession();
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
