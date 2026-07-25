import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import { todayLocalYmd } from "@/lib/dates";

export const runtime = "nodejs";

const ParsedQuery = z.object({
  origin: z
    .string()
    .describe("IATA airport code for the origin, e.g. JFK. Pick the main international airport for a city."),
  destination: z.string().describe("IATA airport code for the destination"),
  departDate: z.string().describe("YYYY-MM-DD"),
  returnDate: z
    .string()
    .nullable()
    .describe("YYYY-MM-DD, or null for one-way trips"),
  adults: z.number().int().min(1).max(8),
  cabin: z.enum(["economy", "premium_economy", "business", "first"]),
});

/**
 * POST { query: "nyc to miami next weekend, 2 people" } →
 * structured SearchParams fields. Pure enhancement — the app never depends
 * on this endpoint.
 */
export async function POST(req: Request): Promise<Response> {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return Response.json(
      { error: "Natural-language search needs GOOGLE_GENERATIVE_AI_API_KEY" },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => null)) as { query?: string } | null;
  const query = body?.query?.trim();
  if (!query) {
    return Response.json({ error: "Missing query" }, { status: 400 });
  }

  // Local date, not UTC — "tomorrow" must be relative to the user's calendar
  // day (this app runs locally, so server-local === user-local).
  const today = todayLocalYmd();
  try {
    const { object } = await generateObject({
      model: google(process.env.NL_MODEL ?? "gemini-2.5-flash"),
      schema: ParsedQuery,
      prompt: `Today is ${today}. Parse this flight search request into structured fields. Resolve relative dates against today; if no dates are given, assume departing one week from today, returning two weeks from today. Default 1 adult, economy. Round trip unless the request implies one-way.\n\nRequest: ${query}`,
    });

    return Response.json({
      ...object,
      tripType: object.returnDate ? "round_trip" : "one_way",
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Parse failed" },
      { status: 502 },
    );
  }
}
