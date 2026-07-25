import { cacheGet, cacheSet, fixtureGet } from "@/lib/cache";
import { duffelConfigured } from "@/lib/duffel/client";
import { runSearchStream, type SearchTarget } from "@/lib/duffel/search";
import { encodeEvent } from "@/lib/sse";
import type { SearchQuery, StreamEvent } from "@/lib/types";
import { parseSearchQuery, searchQueryKey } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Whole-search wall budget (fan-out included). */
const BUDGET_MS = 75_000;
/** Short TTL on purpose — Duffel offer ids perish quickly. */
const CACHE_TTL_MS = 60_000;
/** Fan-out ceiling: at most this many offer requests per search. */
const MAX_TARGETS = 4;

/**
 * Resolve the airport pairs to search. Metro "Any airport" fan-out lands in
 * Phase 2 with the cities dataset; until then a search is one target pair.
 */
function resolveTargets(q: SearchQuery): SearchTarget[] {
  const targets: SearchTarget[] = [
    { origin: q.origin, destination: q.destination },
  ];
  return targets.slice(0, MAX_TARGETS);
}

/** Replay a finished offers list through the live event contract. */
function replayEvents(
  q: SearchQuery,
  offers: NonNullable<Awaited<ReturnType<typeof cacheGet>>>,
  emit: (e: StreamEvent) => void,
): void {
  const requestId = offers[0]?.requestId ?? "cached";
  emit({
    type: "created",
    requestId,
    origin: q.origin,
    destination: q.destination,
    slices: [
      { origin: q.origin, destination: q.destination, date: q.departDate },
      ...(q.returnDate
        ? [{ origin: q.destination, destination: q.origin, date: q.returnDate }]
        : []),
    ],
    totalBatches: 1,
    remainingBatches: 0,
    liveMode: offers[0]?.liveMode ?? false,
  });
  for (const offer of offers) emit({ type: "offer", offer });
  emit({
    type: "batch",
    requestId,
    batchIndex: 1,
    rawCount: offers.length,
    newCount: offers.length,
    seenCount: offers.length,
    remainingBatches: 0,
    elapsedMs: 0,
  });
  emit({
    type: "request_done",
    requestId,
    status: offers.length > 0 ? "ok" : "empty",
  });
}

export async function GET(req: Request): Promise<Response> {
  let query: SearchQuery;
  try {
    query = parseSearchQuery(new URL(req.url).searchParams);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Invalid search" },
      { status: 400 },
    );
  }

  if (!duffelConfigured()) {
    return Response.json(
      { error: "Search is not configured (DUFFEL_API_TOKEN missing)" },
      { status: 503 },
    );
  }

  const started = Date.now();
  const cacheKey = searchQueryKey(query);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (event: StreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encodeEvent(event));
        } catch {
          closed = true;
        }
      };
      const finish = (offerCount: number) => {
        emit({ type: "done", elapsedMs: Date.now() - started, offerCount });
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // Already errored/cancelled.
          }
        }
      };

      // Budget + client-disconnect abort.
      const abort = new AbortController();
      const budgetTimer = setTimeout(() => abort.abort(), BUDGET_MS);
      req.signal.addEventListener("abort", () => abort.abort(), {
        once: true,
      });

      try {
        // Fixture replay (offline UI work), then short-TTL cache.
        if (process.env.MOCK_FIXTURES === "1") {
          const fixture = await fixtureGet(query.origin, query.destination);
          if (fixture) {
            replayEvents(query, fixture, emit);
            finish(fixture.length);
            return;
          }
        }
        const cached = await cacheGet(cacheKey);
        if (cached) {
          replayEvents(query, cached, emit);
          finish(cached.length);
          return;
        }

        const offers = await runSearchStream(
          query,
          resolveTargets(query),
          emit,
          abort.signal,
        );
        if (offers.length > 0) {
          await cacheSet(cacheKey, offers, CACHE_TTL_MS);
        }
        finish(offers.length);
      } catch (err) {
        if (!req.signal.aborted) {
          emit({
            type: "request_done",
            requestId: "search",
            status: abort.signal.aborted ? "timeout" : "error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
        finish(0);
      } finally {
        clearTimeout(budgetTimer);
      }
    },
    cancel() {
      // Client went away; abort listeners fire via req.signal.
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
