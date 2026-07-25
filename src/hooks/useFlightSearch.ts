"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { mergeOffer } from "@/lib/dedupe";
import { sortOffers, type SortMode } from "@/lib/rank";
import { parseSSEStream } from "@/lib/sse";
import type {
  FlightOffer,
  ProviderId,
  ProviderMeta,
  SearchParams,
  SSEEvent,
} from "@/lib/types";
import { toQueryString } from "@/lib/types";

export interface FlightSearchState {
  /** Deduped offers, sorted by the current sort mode, re-ranked per batch. */
  offers: FlightOffer[];
  providers: ProviderMeta[];
  baseline: { totalUSD: number; perTravelerUSD: number; source: ProviderId } | null;
  isStreaming: boolean;
  /** Fatal error (e.g. invalid params) — provider-level errors live in `providers`. */
  error: string | null;
  elapsedMs: number | null;
}

export function useFlightSearch(
  params: SearchParams | null,
  sortMode: SortMode,
): FlightSearchState {
  const [offersByKey, setOffersByKey] = useState<Map<string, FlightOffer>>(
    () => new Map(),
  );
  const [providers, setProviders] = useState<ProviderMeta[]>([]);
  const [baseline, setBaseline] =
    useState<FlightSearchState["baseline"]>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const queryString = params ? toQueryString(params) : null;

  // Reset synchronously when the search changes (render-time derived state —
  // avoids a flash of stale results before the effect runs).
  const [lastQuery, setLastQuery] = useState<string | null>(null);
  if (queryString !== lastQuery) {
    setLastQuery(queryString);
    setOffersByKey(new Map());
    setProviders([]);
    setBaseline(null);
    setError(null);
    setElapsedMs(null);
    setIsStreaming(Boolean(queryString));
  }

  useEffect(() => {
    if (!queryString) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const apply = (event: SSEEvent) => {
      switch (event.type) {
        case "providers":
          setProviders(event.providers);
          break;
        case "provider_added":
          setProviders((prev) =>
            prev.some((p) => p.id === event.provider.id)
              ? prev
              : [...prev, event.provider],
          );
          break;
        case "results":
          setOffersByKey((prev) => {
            const next = new Map(prev);
            for (const offer of event.offers) mergeOffer(next, offer);
            return next;
          });
          break;
        case "baseline":
          setBaseline({
            totalUSD: event.totalUSD,
            perTravelerUSD: event.perTravelerUSD,
            source: event.source,
          });
          break;
        case "provider_done":
          setProviders((prev) =>
            prev.map((p) =>
              p.id === event.provider ? { ...p, status: event.status } : p,
            ),
          );
          break;
        case "done":
          setElapsedMs(event.elapsedMs);
          break;
      }
    };

    (async () => {
      try {
        const res = await fetch(`/api/search?${queryString}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error ?? `Search failed (${res.status})`);
        }
        if (!res.body) throw new Error("No response stream");
        for await (const event of parseSSEStream(res.body)) {
          if (controller.signal.aborted) break;
          apply(event);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!controller.signal.aborted) setIsStreaming(false);
      }
    })();

    return () => controller.abort();
  }, [queryString]);

  const offers = useMemo(
    () => sortOffers([...offersByKey.values()], sortMode),
    [offersByKey, sortMode],
  );

  return { offers, providers, baseline, isStreaming, error, elapsedMs };
}
