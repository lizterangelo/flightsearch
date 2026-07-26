#!/usr/bin/env node
/**
 * Smoke test: streams /api/search/stream for canned routes and prints a
 * request × status × offers × min-price table. Nonzero exit if no request
 * returned ok on any route. Usage:
 *   node scripts/smoke.mjs [baseUrl]            stream-only check
 *   node scripts/smoke.mjs --book [baseUrl]     + full test booking.
 *     Auth is Google-only now, so --book needs a session cookie from a
 *     signed-in browser: set SMOKE_COOKIE to the request Cookie header
 *     (DevTools → any /api request → copy the sb-* cookies).
 */

const args = process.argv.slice(2);
const BOOK = args.includes("--book");
const BASE = args.find((a) => !a.startsWith("--")) ?? "http://localhost:3000";

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
console.log("\nStream smoke passed.");

/* ------------------------- booking flow (--book) ------------------------- */

if (BOOK) {
  console.log("\n=== booking flow ===");
  let cookie = "";
  const jfetch = async (path, init = {}) => {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { cookie } : {}),
        ...(init.headers ?? {}),
      },
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    let body = null;
    try {
      body = await res.json();
    } catch {
      // Non-JSON (stream) — caller handles.
    }
    return { res, body };
  };

  // 1. Session: Google-only auth means we borrow a browser session.
  cookie = process.env.SMOKE_COOKIE ?? "";
  if (!cookie) {
    console.error(
      "SMOKE_COOKIE not set — sign in with Google in the browser, copy the\n" +
      "sb-* cookie header from any /api request, and export SMOKE_COOKIE.",
    );
    process.exit(1);
  }
  console.log("using SMOKE_COOKIE session");

  // 2. Search LHR→JFK and prefer a Duffel Airways (ZZ) offer for seat maps.
  const params = new URLSearchParams({
    origin: "LHR",
    destination: "JFK",
    departDate: futureDate(30),
    returnDate: futureDate(37),
    tripType: "round_trip",
    adults: "1",
    cabin: "economy",
  });
  const streamRes = await fetch(`${BASE}/api/search/stream?${params}`);
  const offers = [];
  const reader = streamRes.body
    .pipeThrough(new TextDecoderStream())
    .getReader();
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
      try {
        const event = JSON.parse(dataLine.slice(6));
        if (event.type === "offer") offers.push(event.offer);
      } catch {}
    }
  }
  if (offers.length === 0) {
    console.error("No offers streamed");
    process.exit(1);
  }
  const offer =
    offers.find((o) => o.ownerCode === "ZZ") ??
    offers.find((o) => !o.liveMode) ??
    null;
  if (!offer) {
    console.error("Refusing: only live_mode offers available.");
    process.exit(1);
  }
  console.log(
    `offer ${offer.id} · ${offer.ownerName} · ${offer.totalAmount} ${offer.totalCurrency} · live_mode=${offer.liveMode}`,
  );
  if (offer.liveMode) {
    console.error("Refusing to book a live-mode offer.");
    process.exit(1);
  }

  // 3. Fresh offer + services + passengers.
  const detail = await jfetch(`/api/offers/${offer.id}`);
  if (!detail.res.ok) {
    console.error("Offer fetch failed:", detail.body);
    process.exit(1);
  }
  const passengers = detail.body.passengers;
  const bag = (detail.body.services ?? []).find((s) => s.type === "baggage");
  console.log(
    `services: ${detail.body.services.length} (bag: ${bag ? bag.id : "none"})`,
  );

  // 4. Seat map → first available seat for passenger 1.
  let seatService = null;
  const seatMap = await jfetch(`/api/offers/${offer.id}/seat-map`);
  if (seatMap.res.ok) {
    outer: for (const map of seatMap.body.maps ?? []) {
      for (const cabin of map.cabins) {
        for (const row of cabin.rows) {
          for (const section of row.sections) {
            for (const el of section.elements) {
              if (el.type === "seat" && el.services?.length) {
                const svc = el.services.find(
                  (s) => s.passengerId === passengers[0].id,
                );
                if (svc) {
                  seatService = { ...svc, designator: el.designator };
                  break outer;
                }
              }
            }
          }
        }
      }
    }
  }
  console.log(
    seatService
      ? `seat: ${seatService.designator} (${seatService.totalAmount} ${seatService.totalCurrency})`
      : "seat: none available",
  );

  // 5. Book with bag + seat + protect.
  const services = [
    ...(bag ? [{ id: bag.id, quantity: 1 }] : []),
    ...(seatService ? [{ id: seatService.id, quantity: 1 }] : []),
  ];
  const booked = await jfetch("/api/book", {
    method: "POST",
    body: JSON.stringify({
      offerId: offer.id,
      passengers: passengers.map((p, i) => ({
        id: p.id,
        title: "ms",
        given_name: "Amelia",
        family_name: `Tester${String.fromCharCode(65 + i)}`,
        born_on: "1990-04-01",
        gender: "f",
        email: "amelia.tester@example.com",
        phone_number: "+14155550123",
      })),
      services,
      protect: true,
      protectFeeUSD: 19,
      displayTotalUSD: offer.displayUSD + 19,
    }),
  });
  if (!booked.res.ok) {
    console.error("BOOKING FAILED:", booked.body);
    process.exit(1);
  }
  console.log(
    `BOOKED ✓ order ${booked.body.orderId} · PNR ${booked.body.bookingReference} · ${booked.body.totalAmount} ${booked.body.totalCurrency}`,
  );

  // 6. Cancel: quote then confirm.
  const quote = await jfetch(`/api/orders/${booked.body.orderId}/cancel`, {
    method: "POST",
  });
  if (!quote.res.ok) {
    console.error("Cancel quote failed:", quote.body);
    process.exit(1);
  }
  console.log(
    `cancel quote ${quote.body.cancellationId} · refund ${quote.body.refundAmount ?? "per fare rules"} ${quote.body.refundCurrency ?? ""}`,
  );
  const confirmed = await jfetch(
    `/api/orders/${booked.body.orderId}/cancel/confirm`,
    {
      method: "POST",
      body: JSON.stringify({ cancellationId: quote.body.cancellationId }),
    },
  );
  if (!confirmed.res.ok) {
    console.error("Cancel confirm failed:", confirmed.body);
    process.exit(1);
  }
  console.log("CANCELLED ✓ — booking flow passed.");
}
