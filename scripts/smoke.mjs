#!/usr/bin/env node
/**
 * Smoke test: streams /api/search for canned routes and prints a
 * provider × status × count × min-price table. Nonzero exit if every
 * provider failed on every route. Usage:
 *   node scripts/smoke.mjs [baseUrl]     (default http://localhost:3000)
 */

const BASE = process.argv[2] ?? "http://localhost:3000";

function futureDate(daysAhead) {
  const d = new Date(Date.now() + daysAhead * 86400000);
  return d.toISOString().slice(0, 10);
}

const ROUTES = [
  { origin: "JFK", destination: "MIA", tripType: "round_trip" },
  { origin: "LAX", destination: "LAS", tripType: "one_way" },
  { origin: "DEN", destination: "MCO", tripType: "one_way" },
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
    res = await fetch(`${BASE}/api/search?${params}`);
  } catch (err) {
    console.error(`  request failed: ${err.message}`);
    continue;
  }
  if (!res.ok || !res.body) {
    console.error(`  HTTP ${res.status}: ${await res.text()}`);
    continue;
  }

  const stats = new Map(); // provider -> { status, count, min }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let baseline = null;

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
      if (event.type === "results") {
        const min = Math.min(...event.offers.map((o) => o.price.totalUSD));
        const prev = stats.get(event.provider) ?? {};
        stats.set(event.provider, {
          ...prev,
          count: (prev.count ?? 0) + event.offers.length,
          min: Math.min(prev.min ?? Infinity, min),
          cached: event.fromCache,
        });
      } else if (event.type === "provider_done") {
        const prev = stats.get(event.provider) ?? {};
        stats.set(event.provider, { ...prev, status: event.status });
        if (event.status === "ok") anyOk = true;
      } else if (event.type === "baseline") {
        baseline = event.totalUSD;
      }
    }
  }

  const rows = [...stats.entries()].map(([provider, s]) => ({
    provider,
    status: s.status ?? "?",
    offers: s.count ?? 0,
    minUSD: s.min === undefined || s.min === Infinity ? "" : s.min.toFixed(0),
    cached: s.cached ? "yes" : "",
  }));
  console.table(rows);
  if (baseline !== null)
    console.log(`  Google baseline: $${baseline.toFixed(0)}`);
}

if (!anyOk) {
  console.error("\nSMOKE FAILED: no provider returned ok on any route.");
  process.exit(1);
}
console.log("\nSmoke passed.");
