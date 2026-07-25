import { activeProviders, enabledAgentTargets } from "../env";
import { frontierProvider } from "../agent/targets/frontier";
import { googleFallbackProvider } from "../agent/targets/google-fallback";
import { navitaireProvider } from "../agent/targets/navitaire";
import { tripComProvider } from "../agent/targets/trip-com";
import { duffelProvider } from "./duffel";
import { fastFlightsProvider } from "./fast-flights";
import type { FlightProvider } from "./provider";
import { serpApiProvider } from "./serpapi";
import { skiplaggedProvider } from "./skiplagged";
import { skyscannerProvider } from "./skyscanner-rapidapi";
import { travelpayoutsProvider } from "./travelpayouts";

export interface ProviderSet {
  tier1: FlightProvider[];
  tier2: FlightProvider[];
  /** Providers held in reserve for the Google-source fallback chain. */
  fallbacks: FlightProvider[];
}

const AGENT_TARGET_PROVIDERS: Record<string, FlightProvider> = {
  frontier: frontierProvider,
  "trip-com": tripComProvider,
  navitaire: navitaireProvider,
};

export function buildProviders(): ProviderSet {
  const active = activeProviders();

  const tier1: FlightProvider[] = [];
  const fallbacks: FlightProvider[] = [];

  if (active.serpapi) {
    tier1.push(serpApiProvider);
    // fast-flights sits in reserve in case SerpAPI errors mid-search.
    fallbacks.push(fastFlightsProvider);
  } else {
    tier1.push(fastFlightsProvider);
  }
  if (active.travelpayouts) tier1.push(travelpayoutsProvider);
  if (active.skiplagged) tier1.push(skiplaggedProvider);
  if (active.skyscanner) tier1.push(skyscannerProvider);
  if (active.duffel) tier1.push(duffelProvider);

  // Frontier's fetch-first path runs keyless through the pooled Chrome;
  // LLM-extraction targets (Trip.com, Allegiant) additionally need Gemini.
  const tier2: FlightProvider[] = [];
  for (const target of enabledAgentTargets(active)) {
    const provider = AGENT_TARGET_PROVIDERS[target];
    if (provider) tier2.push(provider);
  }
  if (active.browserAgent) {
    // Google-page scrape is fallback-only: used when SerpAPI AND
    // fast-flights both fail to produce a baseline.
    fallbacks.push(googleFallbackProvider);
  }

  return { tier1, tier2, fallbacks };
}
