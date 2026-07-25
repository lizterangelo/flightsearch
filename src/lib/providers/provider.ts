import { cacheGet, cacheSet, fixtureGet } from "../cache";
import { MOCK_FIXTURES } from "../env";
import type { FlightOffer, ProviderId, ProviderStatus, SearchParams } from "../types";

export interface FlightProvider {
  id: ProviderId;
  label: string;
  tier: 1 | 2;
  timeoutMs: number;
  cacheTtlMs: number;
  enabled(): boolean;
  search(params: SearchParams, signal: AbortSignal): Promise<FlightOffer[]>;
}

export type SettledStatus = Exclude<ProviderStatus, "pending" | "disabled">;

export interface ProviderResult {
  provider: ProviderId;
  status: SettledStatus;
  offers: FlightOffer[];
  fromCache: boolean;
  tookMs: number;
  message?: string;
}

/** Error subclasses providers throw to signal a specific settled status. */
export class BlockedError extends Error {}
export class CaptchaChallengeError extends Error {}

/* ------------------------------------------------------------------ */
/* Circuit breaker: N consecutive failures → skip provider for cooldown */
/* ------------------------------------------------------------------ */

interface BreakerState {
  consecutiveFailures: number;
  openUntil: number;
}

const breakers = new Map<ProviderId, BreakerState>();

const BREAKER_THRESHOLD = 2;
const BREAKER_COOLDOWN_MS = 30 * 60 * 1000;

function breakerOpen(id: ProviderId): boolean {
  const st = breakers.get(id);
  return Boolean(st && st.openUntil > Date.now());
}

function breakerRecord(id: ProviderId, failed: boolean): void {
  const st = breakers.get(id) ?? { consecutiveFailures: 0, openUntil: 0 };
  if (!failed) {
    breakers.set(id, { consecutiveFailures: 0, openUntil: 0 });
    return;
  }
  st.consecutiveFailures += 1;
  if (st.consecutiveFailures >= BREAKER_THRESHOLD) {
    st.openUntil = Date.now() + BREAKER_COOLDOWN_MS;
    st.consecutiveFailures = 0;
  }
  breakers.set(id, st);
}

/* ------------------------------------------------------------------ */
/* Guarded execution                                                    */
/* ------------------------------------------------------------------ */

/**
 * Run a provider with: fixture short-circuit, cache read/write, timeout via
 * AbortSignal, circuit breaker, and error→status normalization. Never throws.
 */
export async function runProvider(
  provider: FlightProvider,
  params: SearchParams,
  outerSignal: AbortSignal,
): Promise<ProviderResult> {
  const started = Date.now();
  const done = (
    status: SettledStatus,
    offers: FlightOffer[] = [],
    fromCache = false,
    message?: string,
  ): ProviderResult => ({
    provider: provider.id,
    status,
    offers,
    fromCache,
    tookMs: Date.now() - started,
    message,
  });

  try {
    if (MOCK_FIXTURES()) {
      const fixture = await fixtureGet(provider.id, params);
      if (fixture) return done("ok", fixture, true);
    }

    const cached = await cacheGet(provider.id, params);
    if (cached) return done(cached.length ? "ok" : "empty", cached, true);

    if (breakerOpen(provider.id)) {
      return done("error", [], false, "circuit breaker open (cooling down)");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), provider.timeoutMs);
    const onOuterAbort = () => controller.abort();
    outerSignal.addEventListener("abort", onOuterAbort, { once: true });

    try {
      const offers = await provider.search(params, controller.signal);
      breakerRecord(provider.id, false);
      // Cache even empty results (short-changed below) to avoid hammering.
      await cacheSet(
        provider.id,
        params,
        offers,
        offers.length ? provider.cacheTtlMs : Math.min(provider.cacheTtlMs, 5 * 60 * 1000),
      );
      return done(offers.length ? "ok" : "empty", offers);
    } finally {
      clearTimeout(timeout);
      outerSignal.removeEventListener("abort", onOuterAbort);
    }
  } catch (err) {
    const aborted =
      err instanceof DOMException && err.name === "AbortError";
    const timedOut = aborted && !outerSignal.aborted;

    if (err instanceof CaptchaChallengeError) {
      breakerRecord(provider.id, true);
      return done("captcha", [], false, err.message);
    }
    if (err instanceof BlockedError) {
      breakerRecord(provider.id, true);
      return done("blocked", [], false, err.message);
    }
    if (timedOut) {
      breakerRecord(provider.id, true);
      return done("timeout");
    }
    if (aborted) {
      // Outer abort (user cancelled) — report as timeout-ish, no breaker hit.
      return done("timeout", [], false, "search aborted");
    }
    breakerRecord(provider.id, true);
    return done(
      "error",
      [],
      false,
      err instanceof Error ? err.message : String(err),
    );
  }
}
