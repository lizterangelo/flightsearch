import { z } from "zod";
import { googleFlightsLink } from "../../deeplinks";
import type { FlightProvider } from "../../providers/provider";
import { pricingFromQualifier, scrapedToOffers } from "../normalize";
import { ScrapedFaresSchema } from "../schemas";
import {
  agentPage,
  agentSleep,
  assertNotAborted,
  captureFailureScreenshot,
  withStagehandPage,
} from "../stagehand";

const GoogleExtraction = ScrapedFaresSchema.extend({
  pricingNote: z
    .string()
    .optional()
    .describe(
      "Exactly how prices are qualified, e.g. 'round trip total for all passengers' or 'one way, per person'",
    ),
});

/**
 * Browser-scrape of the Google Flights results page. Fallback-only: the
 * registry uses this when both SerpAPI and fast-flights fail to produce a
 * Google baseline.
 */
export const googleFallbackProvider: FlightProvider = {
  id: "agent:google",
  label: "Google Flights (browser)",
  tier: 2,
  timeoutMs: 90_000,
  cacheTtlMs: 1_200_000,
  enabled: () => Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY),

  async search(params, signal) {
    const url = googleFlightsLink(params);
    return withStagehandPage(async (sh) => {
      try {
        assertNotAborted(signal);
        const page = await agentPage(sh);
        await page.goto(url, { waitUntil: "load", timeoutMs: 60_000 });
        // A consent wall may front the results; dismissal is trivial for the
        // agent and non-fatal if there is none (or it fails).
        try {
          await sh.act(
            "If a cookie/consent dialog is blocking the page, dismiss it by clicking 'Reject all' (or the closest equivalent).",
          );
        } catch {
          /* no consent wall, or dismissal failed — extraction will tell */
        }
        await agentSleep(6_000, signal);
        const extracted = await sh.extract(
          "List the top 10 flight results with airline, departure and arrival times, stops, duration, and the price exactly as displayed. In pricingNote, state verbatim how prices are qualified (per person vs total, one way vs round trip).",
          GoogleExtraction,
        );
        assertNotAborted(signal);
        return scrapedToOffers(
          extracted.fares.slice(0, 10),
          params,
          "agent:google",
          url,
          pricingFromQualifier(extracted.pricingNote, params.tripType),
        );
      } catch (err) {
        await captureFailureScreenshot(sh, "google");
        throw err;
      }
    });
  },
};
