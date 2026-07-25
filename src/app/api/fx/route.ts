import type { NextRequest } from "next/server";
import { APPROX_USD_RATES } from "@/lib/currency";

export const runtime = "nodejs";

/**
 * GET /api/fx?base=USD — the display-conversion rate table. Static
 * approximate rates (this build never shows converted prices as quotes;
 * they exist for ranking and display normalization).
 */
export async function GET(req: NextRequest): Promise<Response> {
  const base = (req.nextUrl.searchParams.get("base") ?? "USD").toUpperCase();
  if (base !== "USD") {
    return Response.json(
      { error: "Only base=USD is supported" },
      { status: 400 },
    );
  }
  return Response.json(
    { base, asOf: "static-approximate", rates: APPROX_USD_RATES },
    { headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
