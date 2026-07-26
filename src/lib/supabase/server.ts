import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Cookie-bound Supabase client for route handlers and server components.
 * Queries run as the signed-in user (RLS applies); anonymous requests get
 * the anon role (enough for the public price-observation cache).
 */
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server components can't set cookies — middleware-free setup
            // refreshes sessions in route handlers instead.
          }
        },
      },
    },
  );
}
