"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { sortOffers, type SortMode } from "@/lib/rank";
import { parseSSEStream } from "@/lib/sse";
import type { FlightOffer, SearchQuery, StreamEvent } from "@/lib/types";
import { searchQueryKey, toQueryString } from "@/lib/types";

export interface RequestProgress {
  origin: string;
  destination: string;
  totalBatches: number;
  remainingBatches: number;
  status: "streaming" | "ok" | "empty" | "error" | "timeout";
}

export interface FlightSearchState {
  /** Deduped offers, sorted by the current sort mode, re-ranked per event. */
  offers: FlightOffer[];
  /** One entry per Duffel offer request (metro searches fan out to several). */
  requests: Map<string, RequestProgress>;
  isStreaming: boolean;
  /** Fatal error (invalid params / HTTP failure) — not per-request errors. */
  error: string | null;
  elapsedMs: number | null;
  liveMode: boolean;
}

export function useFlightSearch(
  query: SearchQuery | null,
  sortMode: SortMode,
): FlightSearchState {
  const [offersByKey, setOffersByKey] = useState<Map<string, FlightOffer>>(
    () => new Map(),
  );
  const [requests, setRequests] = useState<Map<string, RequestProgress>>(
    () => new Map(),
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [liveMode, setLiveMode] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const key = query ? searchQueryKey(query) : null;
  const queryString = query ? toQueryString(query) : null;

  // Reset synchronously when the search changes (render-time derived state —
  // avoids a flash of stale results before the effect runs).
  const [lastKey, setLastKey] = useState<string | null>(null);
  if (key !== lastKey) {
    setLastKey(key);
    setOffersByKey(new Map());
    setRequests(new Map());
    setError(null);
    setElapsedMs(null);
    setLiveMode(false);
    setIsStreaming(Boolean(key));
  }

  useEffect(() => {
    if (!queryString) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const apply = (event: StreamEvent) => {
      switch (event.type) {
        case "created":
          setLiveMode((prev) => prev || event.liveMode);
          setRequests((prev) => {
            const next = new Map(prev);
            next.set(event.requestId, {
              origin: event.origin,
              destination: event.destination,
              totalBatches: event.totalBatches,
              remainingBatches: event.remainingBatches,
              status: "streaming",
            });
            return next;
          });
          break;
        case "batch":
          setRequests((prev) => {
            const existing = prev.get(event.requestId);
            if (!existing) return prev;
            const next = new Map(prev);
            next.set(event.requestId, {
              ...existing,
              remainingBatches: event.remainingBatches,
            });
            return next;
          });
          break;
        case "offer":
          setOffersByKey((prev) => {
            const existing = prev.get(event.offer.dedupeKey);
            // Keep the cheaper offer for an equivalent itinerary.
            if (existing && existing.totalUSD <= event.offer.totalUSD) {
              return prev;
            }
            const next = new Map(prev);
            next.set(event.offer.dedupeKey, event.offer);
            return next;
          });
          break;
        case "request_done":
          setRequests((prev) => {
            const existing = prev.get(event.requestId);
            const next = new Map(prev);
            next.set(event.requestId, {
              origin: existing?.origin ?? "",
              destination: existing?.destination ?? "",
              totalBatches: existing?.totalBatches ?? 0,
              remainingBatches: 0,
              status: event.status,
            });
            return next;
          });
          break;
        case "done":
          setElapsedMs(event.elapsedMs);
          break;
      }
    };

    (async () => {
      try {
        const res = await fetch(`/api/search/stream?${queryString}`, {
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

  return { offers, requests, isStreaming, error, elapsedMs, liveMode };
}
