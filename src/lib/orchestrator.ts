import { baselineFromOffers } from "./baseline";
import { buildProviders } from "./providers";
import { runProvider, type FlightProvider } from "./providers/provider";
import { findSplitTicket } from "./split-ticket";
import type {
  FlightOffer,
  ProviderId,
  ProviderMeta,
  SearchParams,
  SSEEvent,
} from "./types";

const GLOBAL_BUDGET_MS = 180_000;

/**
 * Two-tier fan-out. Tier 1 (APIs) and Tier 2 (browser agent) all start
 * immediately; results are emitted per-provider as they settle. The baseline
 * chain (SerpAPI → fast-flights → agent:google) decides which Google-sourced
 * result becomes the "price to beat". A provider failure can never kill the
 * stream.
 */
export async function runSearch(
  params: SearchParams,
  emit: (event: SSEEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const started = Date.now();
  const { tier1, tier2, fallbacks } = buildProviders();

  const active = [...tier1, ...tier2];
  const meta: ProviderMeta[] = active.map((p) => ({
    id: p.id,
    label: p.label,
    tier: p.tier,
    status: "pending",
  }));
  emit({ type: "providers", providers: meta });

  // Fallback providers (fast-flights when SerpAPI fails, agent:google) aren't
  // in the initial list; announce each once — as a single addition, never a
  // full re-emit — so the client can show it without wiping settled statuses.
  const announced = new Set<ProviderId>(active.map((p) => p.id));
  const announce = (provider: FlightProvider) => {
    if (announced.has(provider.id)) return;
    announced.add(provider.id);
    emit({
      type: "provider_added",
      provider: {
        id: provider.id,
        label: provider.label,
        tier: provider.tier,
        status: "pending",
      },
    });
  };

  let baselineEmitted = false;
  const emitBaseline = (offers: FlightOffer[], source: ProviderId) => {
    if (baselineEmitted) return;
    const baseline = baselineFromOffers(offers, source);
    if (baseline) {
      baselineEmitted = true;
      emit({ type: "baseline", ...baseline });
    }
  };

  // Cheapest real round-trip fare seen — the number a split ticket must beat.
  let cheapestRtUSD = Infinity;

  const execute = async (provider: FlightProvider): Promise<void> => {
    if (signal.aborted) return;
    const result = await runProvider(provider, params, signal);
    if (signal.aborted) return;
    if (result.offers.length > 0) {
      for (const o of result.offers) {
        if (o.price.totalUSD < cheapestRtUSD) cheapestRtUSD = o.price.totalUSD;
      }
      emit({
        type: "results",
        provider: provider.id,
        offers: result.offers,
        fromCache: result.fromCache,
        tookMs: result.tookMs,
      });
      emitBaseline(result.offers, provider.id);
    }
    emit({
      type: "provider_done",
      provider: provider.id,
      status: result.status,
      count: result.offers.length,
      message: result.message,
    });
  };

  /**
   * The Google-source fallback chain:
   *  - fast-flights runs as a fallback when SerpAPI is configured but fails
   *  - agent:google runs only when every other Google source came up empty
   */
  const runGoogleChain = async (): Promise<void> => {
    const primary = tier1.find((p) => p.id === "serpapi" || p.id === "fast-flights");
    if (primary) await execute(primary);
    if (baselineEmitted || signal.aborted) return;

    const fastFallback = fallbacks.find((p) => p.id === "fast-flights");
    if (fastFallback) {
      announce(fastFallback);
      await execute(fastFallback);
    }
    if (baselineEmitted || signal.aborted) return;

    const googleAgent = fallbacks.find((p) => p.id === "agent:google");
    if (googleAgent) {
      announce(googleAgent);
      await execute(googleAgent);
    }
  };

  const nonGoogleTier1 = tier1.filter(
    (p) => p.id !== "serpapi" && p.id !== "fast-flights",
  );

  // Split ticket runs concurrently (two one-way Google searches); its emit is
  // gated on the final round-trip minimum, so decide after the main fan-out.
  const splitPromise =
    params.tripType === "round_trip"
      ? findSplitTicket(params, signal).catch(() => null)
      : Promise.resolve(null);

  const work = [
    runGoogleChain(),
    ...nonGoogleTier1.map(execute),
    ...tier2.map(execute),
  ];

  const budget = new Promise<void>((resolve) => {
    const t = setTimeout(resolve, GLOBAL_BUDGET_MS);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    });
  });

  await Promise.race([Promise.allSettled(work), budget]);

  if (!signal.aborted) {
    const split = await Promise.race([
      splitPromise,
      budget.then(() => null),
    ]);
    // Only surface it when it genuinely undercuts the best round-trip fare —
    // two bookings aren't worth it otherwise.
    if (split && split.price.totalUSD < cheapestRtUSD - 1) {
      emit({
        type: "results",
        provider: "split",
        offers: [split],
        fromCache: false,
        tookMs: Date.now() - started,
      });
    }
  }

  emit({ type: "done", elapsedMs: Date.now() - started });
}
