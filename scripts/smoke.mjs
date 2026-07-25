#!/usr/bin/env node
/**
 * Smoke test: streams /api/search/stream for canned routes and prints a
 * request × status × offers × min-price table. Nonzero exit if no request
 * returned ok on any route. Usage:
 *   node scripts/smoke.mjs [baseUrl]     (default http://localhost:3000)
 */

const BASE = process.argv[2] ?? "http://localhost:3000";

function futureDate(daysAhead) {
  const d = new Date(Date.now() + daysAhead * 86400000);
  return d.toISOString().slice(0, 10);
}

const ROUTES = [
  { origin: "LHR", destination: "JFK", tripType: "round_trip" },
  { origin: "LAX", destination: "LAS", tripType: "one_way" },
];

let anyOk = false;

for (const route of ROUTES) {
  const params = new URLSearchParams({
    origin: route.origin,
    destination: route.destination,
    departDate: futureDate(21),
    tripType: route.tripType,
    adults: "1",
    cabin: "economy",
  });
  if (route.tripType === "round_trip") params.set("returnDate", futureDate(28));

  const label = `${route.origin}→${route.destination} (${route.tripType})`;
  console.log(`\n=== ${label} ===`);

  let res;
  try {
    res = await fetch(`${BASE}/api/search/stream?${params}`);
  } catch (err) {
    console.error(`  request failed: ${err.message}`);
    continue;
  }
  if (!res.ok || !res.body) {
    console.error(`  HTTP ${res.status}: ${await res.text()}`);
    continue;
  }

  const stats = new Map(); // requestId -> { route, status, offers, min, batches }
  let offerCount = 0;
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;
    let sep;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const dataLine = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (!dataLine) continue;
      let event;
      try {
        event = JSON.parse(dataLine.slice(6));
      } catch {
        continue;
      }
      if (event.type === "created") {
        stats.set(event.requestId, {
          route: `${event.origin}→${event.destination}`,
          batches: `0/${event.totalBatches}`,
        });
      } else if (event.type === "batch") {
        const prev = stats.get(event.requestId) ?? {};
        stats.set(event.requestId, {
          ...prev,
          batches: `${event.batchIndex} (${event.remainingBatches} left)`,
        });
      } else if (event.type === "offer") {
        offerCount += 1;
        const prev = stats.get(event.offer.requestId) ?? {};
        stats.set(event.offer.requestId, {
          ...prev,
          offers: (prev.offers ?? 0) + 1,
          min: Math.min(prev.min ?? Infinity, event.offer.totalUSD),
        });
      } else if (event.type === "request_done") {
        const prev = stats.get(event.requestId) ?? {};
        stats.set(event.requestId, {
          ...prev,
          status: event.status,
          message: event.message,
        });
        if (event.status === "ok") anyOk = true;
      } else if (event.type === "done") {
        console.log(
          `  done in ${(event.elapsedMs / 1000).toFixed(1)}s — ${event.offerCount} offers`,
        );
      }
    }
  }

  const rows = [...stats.entries()].map(([id, s]) => ({
    request: id.slice(0, 14),
    route: s.route ?? "",
    status: s.status ?? "?",
    offers: s.offers ?? 0,
    minUSD: s.min === undefined || s.min === Infinity ? "" : s.min.toFixed(0),
    batches: s.batches ?? "",
    ...(s.message ? { message: s.message.slice(0, 60) } : {}),
  }));
  console.table(rows);
  if (offerCount === 0) console.log("  (no offers)");
}

if (!anyOk) {
  console.error("\nSMOKE FAILED: no request returned ok on any route.");
  process.exit(1);
}
console.log("\nSmoke passed.");
