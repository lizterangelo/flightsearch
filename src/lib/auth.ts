import { supabaseServer } from "./supabase/server";

/**
 * Server-side identity via Supabase Auth (Google OAuth). Route handlers and
 * server components call these; RLS scopes every query to the user.
 */

export interface SessionUser {
  id: string;
  email: string | null;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { id: user.id, email: user.email ?? null };
}
