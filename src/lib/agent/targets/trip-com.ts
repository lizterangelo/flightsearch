import { z } from "zod";
import { tripComLink } from "../../deeplinks";
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

// ScrapedFares plus the on-page pricing qualifier so we never guess whether
// list prices are per person or round-trip totals (Trip.com shows totals for
// all passengers on round-trip lists — but we verify, not assume).
const TripComExtraction = ScrapedFaresSchema.extend({
  pricingNote: z
    .string()
    .optional()
    .describe(
      "Exactly how prices are qualified on the page, e.g. 'total for all travelers, round trip' or 'per adult, one way'",
    ),
});

export const tripComProvider: FlightProvider = {
  id: "agent:trip-com",
  label: "Trip.com",
  tier: 2,
  timeoutMs: 90_000,
  cacheTtlMs: 1_200_000,
  enabled: () => Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY),

  async search(params, signal) {
    const url = tripComLink(params);
    return withStagehandPage(async (sh) => {
      try {
        assertNotAborted(signal);
        const page = await agentPage(sh);
        await page.goto(url, { waitUntil: "load", timeoutMs: 60_000 });
        await agentSleep(8_000, signal); // results stream in client-side
        const extracted = await sh.extract(
          "List every flight in the results list with airline, times, stops, duration, and the price exactly as displayed. In pricingNote, state verbatim how the page qualifies its prices (per person vs total, one way vs round trip).",
          TripComExtraction,
        );
        assertNotAborted(signal);
        return scrapedToOffers(
          extracted.fares,
          params,
          "agent:trip-com",
          url,
          pricingFromQualifier(extracted.pricingNote, params.tripType),
        );
      } catch (err) {
        await captureFailureScreenshot(sh, "trip-com");
        throw err;
      }
    });
  },
};
