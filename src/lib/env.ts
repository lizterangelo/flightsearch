/**
 * Single source of truth for which providers are active, derived from the
 * environment. The app must boot and search with ANY subset of keys present —
 * including none.
 */

export interface ActiveProviders {
  serpapi: boolean;
  fastFlights: boolean;
  travelpayouts: boolean;
  skiplagged: boolean;
  skyscanner: boolean;
  /** Bookable offers via Duffel (in-site checkout). */
  duffel: boolean;
  /** LLM-driven extraction targets (Trip.com, Google page, Allegiant) — needs Gemini. */
  browserAgent: boolean;
  /**
   * Keyless Chrome use: raw-JSON/HTML fetches through the pooled browser
   * (Skiplagged Cloudflare fallback, Frontier fetch-first). Stagehand LOCAL
   * launches fine without an LLM key as long as extract()/act() are not used.
   */
  browserFetch: boolean;
  agentTargets: string[];
}

export function activeProviders(): ActiveProviders {
  const hasSerpApi = Boolean(process.env.SERPAPI_KEY);
  const hasGemini = Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
  const browserDisabled = process.env.ENABLE_BROWSER_AGENT === "false";

  return {
    serpapi: hasSerpApi,
    // fast-flights is the zero-key Google fallback; it also serves as an
    // in-search fallback when SerpAPI fails (orchestrator handles that case).
    fastFlights: !hasSerpApi,
    travelpayouts: Boolean(process.env.TRAVELPAYOUTS_TOKEN),
    skiplagged: process.env.SKIPLAGGED_ENABLED !== "false",
    skyscanner:
      process.env.ENABLE_SKYSCANNER === "true" &&
      Boolean(process.env.RAPIDAPI_KEY),
    duffel: Boolean(process.env.DUFFEL_API_TOKEN),
    browserAgent: !browserDisabled && hasGemini,
    browserFetch: !browserDisabled,
    agentTargets: (process.env.AGENT_TARGETS ?? "frontier,trip-com")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  };
}

export const MOCK_FIXTURES = () => process.env.MOCK_FIXTURES === "1";

/** Targets whose scrape needs LLM extraction (vs keyless fetch-first). */
const LLM_TARGETS = new Set(["trip-com", "navitaire"]);

export function enabledAgentTargets(a: ActiveProviders): string[] {
  return a.agentTargets.filter((t) =>
    LLM_TARGETS.has(t) ? a.browserAgent : a.browserFetch,
  );
}

/** Human-readable source list for the landing-page footer. */
export function activeSourceLabels(): string[] {
  const a = activeProviders();
  const labels: string[] = [];
  if (a.serpapi) labels.push("Google Flights");
  if (a.fastFlights) labels.push("Google (direct)");
  if (a.travelpayouts) labels.push("Aviasales");
  if (a.skiplagged) labels.push("Skiplagged");
  if (a.skyscanner) labels.push("Skyscanner");
  if (a.duffel) labels.push("Duffel (bookable)");
  const targets = enabledAgentTargets(a);
  if (targets.length > 0) labels.push(`Browser agent ×${targets.length}`);
  return labels;
}
