import type { CreateOfferRequestPassenger } from "@duffel/api/booking/OfferRequests/OfferRequestsTypes";
import type { FlightOffer, SearchQuery, StreamEvent } from "../types";
import { duffelClient, duffelErrorMessage, duffelErrorStatus } from "./client";
import { mapDuffelOffer } from "./map";

/**
 * Streams a search as StreamEvents. One Duffel batch offer request per
 * (origin, destination) target pair — metro "Any airport" searches fan out
 * to several targets. Falls back to a plain offer request (return_offers)
 * emitted through the same event contract when the batch API is off or
 * unavailable on this account.
 */

export interface SearchTarget {
  origin: string;
  destination: string;
}

const SUPPLIER_TIMEOUT_MS = 20000;
/** Duffel batch resources expire ~60s after create; stop polling before. */
const POLL_BUDGET_MS = 55000;
/** Emit at most this many offers per request over the stream. */
const MAX_OFFERS_PER_REQUEST = 120;
/** Keep at most this many offers in memory/cache per request (sandbox
 * searches can return thousands of near-identical fares). */
const MAX_COLLECTED_PER_REQUEST = 300;

function duffelPassengers(q: SearchQuery): CreateOfferRequestPassenger[] {
  return [
    ...Array.from({ length: q.passengers.adults }, () => ({
      type: "adult" as const,
    })),
    ...q.passengers.childAges.map((age) => ({ age })),
    ...Array.from({ length: q.passengers.infants }, () => ({ age: 1 })),
  ];
}

function duffelSlices(q: SearchQuery, target: SearchTarget) {
  const slices = [
    {
      origin: target.origin,
      destination: target.destination,
      departure_date: q.departDate,
      departure_time: null,
      arrival_time: null,
    },
  ];
  if (q.tripType === "round_trip" && q.returnDate) {
    slices.push({
      origin: target.destination,
      destination: target.origin,
      departure_date: q.returnDate,
      departure_time: null,
      arrival_time: null,
    });
  }
  return slices;
}

function createdEvent(
  target: SearchTarget,
  q: SearchQuery,
  requestId: string,
  totalBatches: number,
  remainingBatches: number,
  liveMode: boolean,
): StreamEvent {
  const slices = [
    { origin: target.origin, destination: target.destination, date: q.departDate },
  ];
  if (q.tripType === "round_trip" && q.returnDate) {
    slices.push({
      origin: target.destination,
      destination: target.origin,
      date: q.returnDate,
    });
  }
  return {
    type: "created",
    requestId,
    origin: target.origin,
    destination: target.destination,
    slices,
    totalBatches,
    remainingBatches,
    liveMode,
  };
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });

/**
 * Run one target through the BATCH API, pushing events via emit.
 * Returns the offers it produced (for caching/observations).
 */
async function runBatchTarget(
  q: SearchQuery,
  target: SearchTarget,
  emit: (e: StreamEvent) => void,
  signal: AbortSignal,
): Promise<FlightOffer[]> {
  const duffel = duffelClient();
  const started = Date.now();

  const created = await duffel.batchOfferRequests.create({
    slices: duffelSlices(q, target),
    passengers: duffelPassengers(q),
    cabin_class: q.cabin,
    supplier_timeout: SUPPLIER_TIMEOUT_MS,
  });
  const requestId = created.data.id;
  emit(
    createdEvent(
      target,
      q,
      requestId,
      created.data.total_batches,
      created.data.remaining_batches,
      created.data.live_mode,
    ),
  );

  const seen = new Set<string>();
  const collected: FlightOffer[] = [];
  let batchIndex = 0;

  while (Date.now() - started < POLL_BUDGET_MS) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    // The get() long-polls server-side: it returns when a batch is ready.
    const batch = await duffel.batchOfferRequests.get(requestId);
    batchIndex += 1;

    const raw = batch.data.offers ?? [];
    let newCount = 0;
    for (const rawOffer of raw) {
      if (seen.has(rawOffer.id)) continue;
      seen.add(rawOffer.id);
      if (collected.length >= MAX_COLLECTED_PER_REQUEST) continue;
      const offer = mapDuffelOffer(rawOffer, requestId);
      if (!offer) continue;
      newCount += 1;
      collected.push(offer);
      if (collected.length <= MAX_OFFERS_PER_REQUEST) {
        emit({ type: "offer", offer });
      }
    }
    emit({
      type: "batch",
      requestId,
      batchIndex,
      rawCount: raw.length,
      newCount,
      seenCount: seen.size,
      remainingBatches: batch.data.remaining_batches,
      elapsedMs: Date.now() - started,
    });

    if (batch.data.remaining_batches <= 0) break;
    // The endpoint long-polls, but guard against hot-looping on fast empties.
    await sleep(250, signal);
  }

  emit({
    type: "request_done",
    requestId,
    status: collected.length > 0 ? "ok" : "empty",
  });
  return collected;
}

/** Fallback: single offer request re-emitted as one synthetic batch. */
async function runPlainTarget(
  q: SearchQuery,
  target: SearchTarget,
  emit: (e: StreamEvent) => void,
  signal: AbortSignal,
): Promise<FlightOffer[]> {
  const duffel = duffelClient();
  const started = Date.now();

  const abortPromise = new Promise<never>((_, reject) => {
    const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });

  const res = await Promise.race([
    duffel.offerRequests.create({
      slices: duffelSlices(q, target),
      passengers: duffelPassengers(q),
      cabin_class: q.cabin,
      return_offers: true,
      supplier_timeout: SUPPLIER_TIMEOUT_MS,
    }),
    abortPromise,
  ]);

  const requestId = res.data.id;
  emit(
    createdEvent(target, q, requestId, 1, 1, res.data.live_mode ?? false),
  );

  const collected: FlightOffer[] = [];
  const rawOffers = res.data.offers ?? [];
  for (const rawOffer of rawOffers) {
    if (collected.length >= MAX_COLLECTED_PER_REQUEST) break;
    const offer = mapDuffelOffer(rawOffer, requestId);
    if (!offer) continue;
    collected.push(offer);
    if (collected.length <= MAX_OFFERS_PER_REQUEST) {
      emit({ type: "offer", offer });
    }
  }
  emit({
    type: "batch",
    requestId,
    batchIndex: 1,
    rawCount: rawOffers.length,
    newCount: collected.length,
    seenCount: collected.length,
    remainingBatches: 0,
    elapsedMs: Date.now() - started,
  });
  emit({
    type: "request_done",
    requestId,
    status: collected.length > 0 ? "ok" : "empty",
  });
  return collected;
}

const batchDisabledByEnv = () => process.env.DUFFEL_BATCH === "0";
/** Sticky fallback once the batch endpoint 4xxes (not entitled). */
let batchUnavailable = false;

/**
 * Run the full search (all targets in parallel) and push every event through
 * `emit`. Resolves with all offers once every target settles.
 */
export async function runSearchStream(
  q: SearchQuery,
  targets: SearchTarget[],
  emit: (e: StreamEvent) => void,
  signal: AbortSignal,
): Promise<FlightOffer[]> {
  const results = await Promise.all(
    targets.map(async (target) => {
      try {
        if (batchDisabledByEnv() || batchUnavailable) {
          return await runPlainTarget(q, target, emit, signal);
        }
        try {
          return await runBatchTarget(q, target, emit, signal);
        } catch (err) {
          const status = duffelErrorStatus(err);
          if (status !== null && status >= 400 && status < 500) {
            // Batch API not available on this account — fall back for good.
            batchUnavailable = true;
            return await runPlainTarget(q, target, emit, signal);
          }
          throw err;
        }
      } catch (err) {
        if (signal.aborted) return [];
        emit({
          type: "request_done",
          requestId: `${target.origin}-${target.destination}`,
          status: "error",
          message: duffelErrorMessage(err),
        });
        return [];
      }
    }),
  );
  return results.flat();
}
