import type { FlightProvider } from "../../providers/provider";
import { scrapedToOffers } from "../normalize";
import { ScrapedFaresSchema } from "../schemas";
import {
  agentPage,
  agentSleep,
  assertNotAborted,
  captureFailureScreenshot,
  withStagehandPage,
} from "../stagehand";

/**
 * Experimental Allegiant (Navitaire booking stack) attempt: drive the
 * homepage search form with act() and extract whatever fares render.
 * Expected to fail often — off by default (AGENT_TARGETS opt-in).
 */
export const navitaireProvider: FlightProvider = {
  id: "agent:navitaire",
  label: "Allegiant (experimental)",
  tier: 2,
  timeoutMs: 90_000,
  cacheTtlMs: 1_200_000,
  enabled: () => Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY),

  async search(params, signal) {
    // Allegiant prices per person per direction; same policy as Frontier —
    // no honest round-trip total to emit, so only one_way is attempted.
    if (params.tripType === "round_trip") return [];

    return withStagehandPage(async (sh) => {
      try {
        assertNotAborted(signal);
        const page = await agentPage(sh);
        await page.goto("https://www.allegiantair.com", {
          waitUntil: "load",
          timeoutMs: 60_000,
        });
        await agentSleep(3_000, signal);
        await sh.act("Select one-way trip in the flight search form");
        await sh.act(`Set the departure airport to ${params.origin}`);
        assertNotAborted(signal);
        await sh.act(`Set the destination airport to ${params.destination}`);
        await sh.act(`Set the departure date to ${params.departDate}`);
        await sh.act("Submit the flight search");
        assertNotAborted(signal);
        await agentSleep(8_000, signal);
        const extracted = await sh.extract(
          "List every flight shown with its departure and arrival times and the cheapest fare price exactly as displayed.",
          ScrapedFaresSchema,
        );
        assertNotAborted(signal);
        return scrapedToOffers(
          extracted.fares,
          params,
          "agent:navitaire",
          "https://www.allegiantair.com",
          { roundTripTotal: false, allPassengers: false },
        );
      } catch (err) {
        await captureFailureScreenshot(sh, "navitaire");
        throw err;
      }
    });
  },
};
