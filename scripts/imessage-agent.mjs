#!/usr/bin/env node
/**
 * Soar iMessage agent (study clone of flysoar's "text us" concierge).
 *
 * A local daemon that reads incoming iMessages from the Mac's Messages
 * database, runs an agent loop against the clone's APIs, and replies
 * in-thread via AppleScript. It covers the app's whole surface:
 *   search · offer details · seat maps · booking (multi-passenger, bags,
 *   seats, passports, Protect, loyalty auto-attach) · orders + details ·
 *   cancellation · price calendar · watches · profile (contact, travel
 *   documents, preferences, notifications) · friends · loyalty
 *   programmes · card vault (display-only) · feedback
 * Deliberately NOT offered: account deletion (the agent account is shared).
 * Everything runs on Duffel TEST fares — nothing real is ever ticketed.
 *
 *   node scripts/imessage-agent.mjs --repl    terminal REPL (no Messages)
 *   node scripts/imessage-agent.mjs           Messages daemon
 *
 * .env keys:
 *   SOAR_BASE               app origin        default http://localhost:3000
 *   SOAR_AGENT_EMAIL        booking account   optional -> search-only
 *   SOAR_AGENT_PASSWORD
 *   ANTHROPIC_API_KEY       optional -> natural language via Claude
 *   SOAR_AGENT_MODEL        default claude-sonnet-5
 *   GEMINI_API_KEY          natural language via Gemini when no Anthropic key
 *   SOAR_AGENT_MODEL_GEMINI default gemini-2.5-flash
 *   SOAR_AGENT_ALLOW        comma-separated handles (phone/email) allowed to
 *                           command the agent — REQUIRED in daemon mode.
 *                           "*" opens it to everyone (1:1 iMessage threads
 *                           only — group chats, SMS and short codes are
 *                           ignored, and senders are rate-limited). Keep
 *                           your own handle listed alongside "*" if you
 *                           text the agent from your own Apple ID.
 *   SOAR_AGENT_RATE         open-mode per-sender messages/hour (default 30)
 *   SOAR_AGENT_RATE_GLOBAL  open-mode total messages/hour (default 120)
 *   SOAR_AGENT_MARKER       reply prefix, default "✈️ " (self-chat loop guard)
 *   SOAR_AGENT_POLL_MS      default 3000
 *
 * macOS setup (daemon mode): Messages signed in; the terminal running this
 * needs Full Disk Access (chat.db) and Automation → Messages (first send
 * prompts). Booking/cancelling always requires an explicit "yes".
 */

import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createInterface } from "node:readline";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

/* --------------------------------- env ---------------------------------- */

function loadEnv() {
  const out = { ...process.env };
  try {
    for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && out[m[1]] === undefined) out[m[1]] = m[2].replace(/\s+#.*$/, "").trim();
    }
  } catch {
    // No .env — rely on process env.
  }
  return out;
}

const env = loadEnv();
const BASE = (env.SOAR_BASE ?? "http://localhost:3000").replace(/\/+$/, "");
const SUPA_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const MODEL = env.SOAR_AGENT_MODEL ?? "claude-sonnet-5";
const MARKER = env.SOAR_AGENT_MARKER ?? "✈️ ";
const POLL_MS = Number(env.SOAR_AGENT_POLL_MS ?? 3000);
const REPL = process.argv.includes("--repl");
const PROJECT_REF = SUPA_URL ? new URL(SUPA_URL).hostname.split(".")[0] : "";

/* ------------------------- Supabase agent session ------------------------ */

let session = null; // { access_token, refresh_token, expires_at, user }

async function grant(body) {
  const res = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=${body.grant_type}`, {
    method: "POST",
    headers: { apikey: SUPA_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return json.access_token ? json : null;
}

async function ensureSession() {
  if (!env.SOAR_AGENT_EMAIL || !env.SOAR_AGENT_PASSWORD) return null;
  const fresh = session && session.expires_at * 1000 - Date.now() > 60_000;
  if (fresh) return session;
  if (session?.refresh_token) {
    session = await grant({ grant_type: "refresh_token", refresh_token: session.refresh_token });
    if (session) return session;
  }
  session = await grant({
    grant_type: "password",
    email: env.SOAR_AGENT_EMAIL,
    password: env.SOAR_AGENT_PASSWORD,
  });
  return session;
}

const uid = () => session?.user?.id ?? null;

/** The app reads Supabase cookies; hand it our session in cookie form. */
function cookieHeader() {
  if (!session) return "";
  const value = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `sb-${PROJECT_REF}-auth-token=base64-${value}`;
}

async function api(path, init = {}) {
  await ensureSession();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(session ? { cookie: cookieHeader() } : {}),
      ...(init.headers ?? {}),
    },
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    // Stream or empty — callers that need raw use fetch directly.
  }
  return { ok: res.ok, status: res.status, body };
}

/** Direct Supabase REST (RLS-scoped to the agent user). */
async function rest(path, init = {}) {
  await ensureSession();
  if (!session) return { ok: false, body: { message: "not signed in" } };
  const res = await fetch(`${SUPA_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      Prefer: init.method && init.method !== "GET" ? "return=representation" : "count=none",
      ...(init.headers ?? {}),
    },
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, body };
}

const needsAccount = () =>
  env.SOAR_AGENT_EMAIL
    ? null
    : { error: "Account features are off — set SOAR_AGENT_EMAIL/SOAR_AGENT_PASSWORD in .env." };

/* ---------------------------- account linking ---------------------------- */
/*
 * Unknown senders get a sign-in link (/agent-link?token=…). Once claimed on
 * the website, their handle maps to their web account: bookings carry
 * on_behalf_user_id (so trips show on their My Flights) and contact details
 * prefill from their profile. The owner (explicit allowlist) keeps acting
 * directly on the agent account.
 */

const linkCache = new Map(); // handle -> { ts, ctx }

async function linkedContext(handle) {
  if (!handle || !env.SOAR_AGENT_EMAIL) return null;
  const hit = linkCache.get(handle);
  if (hit && Date.now() - hit.ts < 60_000) return hit.ctx;
  const res = await rest("/rpc/agent_context_for_handle", {
    method: "POST",
    body: JSON.stringify({ p_handle: handle }),
  });
  const ctx = res.ok && res.body?.linked ? res.body : null;
  linkCache.set(handle, { ts: Date.now(), ctx });
  return ctx;
}

async function makeLinkUrl(handle) {
  const token = randomBytes(18).toString("base64url");
  const res = await rest("/agent_link_tokens", {
    method: "POST",
    body: JSON.stringify({ token, handle }),
  });
  if (!res.ok) return null;
  return `${BASE}/agent-link?token=${token}`;
}

/** Gate for account actions: owner passes, linked senders pass where
 * supported, unknown senders get a fresh sign-in link. */
async function linkGate(state) {
  if (state.owner || state.behalf) return null;
  if (!state.handle) return needsAccount();
  const url = await makeLinkUrl(state.handle);
  return {
    error: url
      ? `Link your Soar account first, then try again: ${url} (link expires in 15 min)`
      : "Linking is unavailable right now — try again shortly.",
  };
}

/* ------------------------------ clone tools ------------------------------ */

async function resolvePlace(q) {
  if (/^[A-Za-z]{3}$/.test(q.trim())) return { iata: q.trim().toUpperCase() };
  const res = await fetch(`${BASE}/api/places?q=${encodeURIComponent(q)}`);
  if (!res.ok) return null;
  const { places } = await res.json();
  const hit = places?.[0];
  if (!hit) return null;
  if (hit.kind === "city") return { iata: hit.primary, cityKey: hit.key, label: hit.name };
  return { iata: hit.iata, label: hit.city || hit.name };
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function offerLine(offer, i) {
  const s = offer.slices[0];
  const stops = s.stops === 0 ? "direct" : `${s.stops} stop${s.stops > 1 ? "s" : ""}`;
  const dur = `${Math.floor(s.durationMinutes / 60)}h${String(s.durationMinutes % 60).padStart(2, "0")}`;
  const kind = offer.slices.length > 1 ? "round trip" : "one way";
  return `${i + 1}) ${offer.ownerName} · ${fmtTime(s.departure)}→${fmtTime(s.arrival)} · ${stops} · ${dur} · $${Math.round(offer.displayUSD)} ${kind}`;
}

const yymmdd = (iso) => iso.slice(2).replace(/-/g, "");

async function searchFlights(state, args) {
  const from = await resolvePlace(args.origin);
  const to = await resolvePlace(args.destination);
  if (!from || !to) return { error: "Couldn't resolve those places — try airport codes like CEB or HND." };
  const adults = Math.min(9, Math.max(1, args.adults ?? 1));
  const cabin = args.cabin ?? "economy";
  const params = new URLSearchParams({
    origin: from.iata,
    destination: to.iata,
    departDate: args.depart_date,
    tripType: args.return_date ? "round_trip" : "one_way",
    adults: String(adults),
    cabin,
  });
  if (args.return_date) params.set("returnDate", args.return_date);
  if (from.cityKey) params.set("origin_any", from.cityKey);
  if (to.cityKey) params.set("destination_any", to.cityKey);

  const res = await fetch(`${BASE}/api/search/stream?${params}`);
  if (!res.ok || !res.body) return { error: `Search failed (${res.status}).` };
  const offers = new Map();
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
      try {
        const event = JSON.parse(dataLine.slice(6));
        if (event.type === "offer") offers.set(event.offer.id, event.offer);
      } catch {
        // Partial frame — skip.
      }
    }
  }
  // Same-itinerary offers collapse to the cheapest (results UI parity).
  const byItinerary = new Map();
  for (const offer of offers.values()) {
    const key = offer.dedupeKey ?? offer.id;
    const kept = byItinerary.get(key);
    if (!kept || offer.displayUSD < kept.displayUSD) byItinerary.set(key, offer);
  }
  const sorted = [...byItinerary.values()]
    .sort((a, b) => a.displayUSD - b.displayUSD)
    .slice(0, 40);
  state.offers = sorted;

  // Remember the query — watches store a replayable search URL.
  const sp = new URLSearchParams();
  if (from.cityKey) sp.set("origin_any", from.cityKey);
  if (to.cityKey) sp.set("destination_any", to.cityKey);
  if (adults !== 1) sp.set("adults", String(adults));
  if (cabin !== "economy") sp.set("cabin", cabin);
  state.lastSearchUrl =
    `/flights/${from.iata.toLowerCase()}/${to.iata.toLowerCase()}/${yymmdd(args.depart_date)}` +
    (args.return_date ? `/${yymmdd(args.return_date)}` : "") +
    (sp.size ? `?${sp}` : "");
  state.lastRoute = { origin: from.iata, destination: to.iata, cabin };

  if (sorted.length === 0) return { error: "No flights found for that search." };
  return {
    route: `${from.iata}→${to.iata} ${args.depart_date}${args.return_date ? ` / ${args.return_date}` : ""}`,
    travelers: adults,
    count: sorted.length,
    top: sorted.slice(0, 8).map(offerLine),
  };
}

async function offerDetails(state, index) {
  const offer = state.offers[index - 1];
  if (!offer) return { error: `No option ${index} — search first.` };
  const { ok, body } = await api(`/api/offers/${offer.id}`);
  if (!ok) return { error: "That offer expired — search again for fresh prices." };
  const bags = (body.services ?? []).filter((s) => s.type === "baggage");
  return {
    option: index,
    airline: offer.ownerName,
    total_usd: Math.round(offer.displayUSD),
    live_mode: offer.liveMode,
    refundable: body.offer?.conditions?.refundBeforeDeparture?.allowed ?? null,
    changeable: body.offer?.conditions?.changeBeforeDeparture?.allowed ?? null,
    emissions_kg: body.offer?.totalEmissionsKg ?? null,
    add_on_bags: bags.map((b) => `${b.totalAmount} ${b.totalCurrency} (max ${b.maximumQuantity})`),
    travelers: (body.passengers ?? []).length,
    passport_required: body.offer?.passengerIdentityDocumentsRequired ?? false,
    protect_fee_usd: protectFee(offer.displayUSD),
    slices: offer.slices.map(
      (s) =>
        `${s.origin}→${s.destination} ${s.departure.slice(0, 16).replace("T", " ")} (${s.segments.map((seg) => seg.flightNumber).join(", ")})`,
    ),
  };
}

async function listSeats(state, index) {
  const offer = state.offers[index - 1];
  if (!offer) return { error: `No option ${index} — search first.` };
  const detail = await api(`/api/offers/${offer.id}`);
  if (!detail.ok) return { error: "Offer expired — search again." };
  const firstPax = detail.body.passengers?.[0]?.id;
  const seatMap = await api(`/api/offers/${offer.id}/seat-map`);
  if (!seatMap.ok) return { error: "No seat map for this flight (test mode: reliable on Duffel Airways only)." };
  const seats = [];
  for (const map of seatMap.body.maps ?? []) {
    for (const cabin of map.cabins ?? []) {
      for (const row of cabin.rows ?? []) {
        for (const section of row.sections ?? []) {
          for (const el of section.elements ?? []) {
            if (el.type === "seat" && el.services?.length) {
              const svc = el.services.find((s) => s.passengerId === firstPax) ?? el.services[0];
              seats.push(`${el.designator} (${svc.totalAmount} ${svc.totalCurrency})`);
            }
          }
        }
      }
    }
  }
  if (seats.length === 0) return { error: "No selectable seats on this flight." };
  return { available: seats.slice(0, 40), note: "Pass seat designators to book_flight (one per traveler, in order)." };
}

const protectFee = (usd) => Math.min(149, Math.max(19, Math.round(usd * 0.05)));

async function seatServicesFor(offerId, designators, passengerIds) {
  const seatMap = await api(`/api/offers/${offerId}/seat-map`);
  if (!seatMap.ok) throw new Error("Seat map unavailable for this flight.");
  const services = [];
  const wanted = designators.map((d) => d.toUpperCase());
  for (let i = 0; i < wanted.length; i++) {
    let found = null;
    for (const map of seatMap.body.maps ?? []) {
      for (const cabin of map.cabins ?? []) {
        for (const row of cabin.rows ?? []) {
          for (const section of row.sections ?? []) {
            for (const el of section.elements ?? []) {
              if (el.type === "seat" && el.designator?.toUpperCase() === wanted[i]) {
                found = el.services?.find((s) => s.passengerId === passengerIds[i]) ?? null;
              }
            }
          }
        }
      }
    }
    if (!found) throw new Error(`Seat ${wanted[i]} isn't available for traveler ${i + 1}.`);
    services.push({ id: found.id, quantity: 1 });
  }
  return services;
}

/** Non-owner senders must link before account actions; some stay web-only. */
function ownerOnly(state, what) {
  if (state.owner || !state.behalf) return null;
  return {
    error: `${what} lives on your web account — manage it at ${BASE}. This chat can search, book, cancel and show your trips.`,
  };
}

async function bookFlight(state, args) {
  const gate = needsAccount() ?? (await linkGate(state));
  if (gate) return gate;
  const offer = state.offers[(args.index ?? 0) - 1];
  if (!offer) return { error: `No option ${args.index} — search first.` };
  if (offer.liveMode) return { error: "Refusing: that offer is live-mode. This clone books test fares only." };

  const detail = await api(`/api/offers/${offer.id}`);
  if (!detail.ok) return { error: "Offer expired — search again before booking." };
  const paxIds = (detail.body.passengers ?? []).map((p) => p.id);
  const travelers = args.passengers ?? [];
  if (travelers.length !== paxIds.length) {
    return {
      error: `This fare has ${paxIds.length} traveler${paxIds.length > 1 ? "s" : ""} — provide exactly that many passengers (search with adults=N to change).`,
    };
  }
  const passportRequired = detail.body.offer?.passengerIdentityDocumentsRequired ?? false;
  if (passportRequired && travelers.some((t) => !t.passport_number || !t.passport_country || !t.passport_expiry)) {
    return { error: "This airline requires passports: add passport_number, passport_country (2 letters) and passport_expiry (YYYY-MM-DD) for every traveler." };
  }

  const fee = args.protect ? protectFee(offer.displayUSD) : 0;
  const bagServices = [];
  if (args.bags) {
    const bag = (detail.body.services ?? []).find((s) => s.type === "baggage");
    if (!bag) return { error: "No add-on bags are offered on this fare." };
    bagServices.push({ id: bag.id, quantity: Math.min(args.bags, bag.maximumQuantity ?? 9) });
  }

  if (args.confirmed !== true) {
    const extras = [
      args.bags ? `${args.bags} bag(s)` : null,
      args.seats?.length ? `seats ${args.seats.join(", ")}` : null,
      args.protect ? `Protect $${fee}` : null,
    ].filter(Boolean);
    return {
      needs_confirmation: true,
      message: `Quote: $${Math.round(offer.displayUSD + fee)}${extras.length ? ` + ${extras.join(" + ")} (bag/seat prices added at checkout)` : ""} on test balance. The traveler must reply "yes" before you call book_flight with confirmed=true.`,
    };
  }

  let seatServices = [];
  if (args.seats?.length) {
    try {
      seatServices = await seatServicesFor(offer.id, args.seats, paxIds);
    } catch (err) {
      return { error: err.message };
    }
  }
  const loyalty = await rest("/loyalty_programmes?select=airline_iata,account_number");
  const loyaltyAccounts = (loyalty.ok ? loyalty.body : [])
    .filter((l) => /^[A-Z0-9]{2}$/.test(l.airline_iata ?? ""))
    .map((l) => ({ airline_iata_code: l.airline_iata, account_number: l.account_number }));

  const profile = (await rest("/profiles?select=email,phone")).body?.[0] ?? {};
  const contact = state.behalf ?? profile;
  const booked = await api("/api/book", {
    method: "POST",
    body: JSON.stringify({
      offerId: offer.id,
      ...(state.behalf ? { onBehalfUserId: state.behalf.user_id } : {}),
      passengers: paxIds.map((id, i) => {
        const t = travelers[i];
        return {
          id,
          title: t.gender === "m" ? "mr" : "ms",
          given_name: t.given_name,
          family_name: t.family_name,
          born_on: t.born_on,
          gender: t.gender,
          email: t.email || contact.email || env.SOAR_AGENT_EMAIL,
          phone_number: t.phone || contact.phone || "+14155550123",
          ...(t.passport_number
            ? {
                identity_documents: [
                  {
                    type: "passport",
                    unique_identifier: t.passport_number,
                    issuing_country_code: (t.passport_country ?? "").toUpperCase(),
                    expires_on: t.passport_expiry,
                  },
                ],
              }
            : {}),
        };
      }),
      services: [...bagServices, ...seatServices],
      loyaltyAccounts,
      protect: Boolean(args.protect),
      protectFeeUSD: fee,
      displayTotalUSD: offer.displayUSD + fee,
    }),
  });
  if (!booked.ok) return { error: `Booking failed: ${booked.body?.error ?? booked.status}` };
  return {
    booked: true,
    pnr: booked.body.bookingReference,
    order_id: booked.body.orderId,
    charged: `${booked.body.totalAmount} ${booked.body.totalCurrency} (test balance)`,
    loyalty_attached: loyaltyAccounts.length,
  };
}

async function myFlights(state) {
  const gate = needsAccount() ?? (await linkGate(state));
  if (gate) return gate;
  const rows = await rest(
    "/orders?select=duffel_order_id,booking_reference,status,total_amount,total_currency,created_at,on_behalf_user_id&order=created_at.desc&limit=30",
  );
  if (!rows.ok) return { error: "Sign-in for the agent account failed — check .env credentials." };
  const mine = state.behalf
    ? rows.body.filter((r) => r.on_behalf_user_id === state.behalf.user_id)
    : rows.body;
  return {
    flights: mine.slice(0, 8).map(
      (r) => `${r.booking_reference} · ${r.status} · ${r.total_amount} ${r.total_currency} · order ${r.duffel_order_id}`,
    ),
  };
}

async function orderDetails(state, orderId) {
  const gate = needsAccount() ?? (await linkGate(state));
  if (gate) return gate;
  const rows = await rest(
    `/orders?duffel_order_id=eq.${encodeURIComponent(orderId)}&select=booking_reference,status,total_amount,total_currency,protect,protect_fee_usd,refund_amount,refund_currency,created_at,offer_snapshot,on_behalf_user_id`,
  );
  if (!rows.ok || !rows.body?.[0]) return { error: "No such order on this account." };
  if (state.behalf && rows.body[0].on_behalf_user_id !== state.behalf.user_id) {
    return { error: "That order belongs to a different traveler." };
  }
  const o = rows.body[0];
  const slices = (o.offer_snapshot?.slices ?? []).map(
    (s) =>
      `${s.origin}→${s.destination} ${String(s.departure ?? "").slice(0, 16).replace("T", " ")} · ${(s.segments ?? []).map((x) => x.flightNumber).join(", ")}`,
  );
  return {
    pnr: o.booking_reference,
    status: o.status,
    total: `${o.total_amount} ${o.total_currency}`,
    protect: o.protect ? `yes ($${o.protect_fee_usd})` : "no",
    refund: o.refund_amount ? `${o.refund_amount} ${o.refund_currency}` : null,
    booked_at: o.created_at?.slice(0, 10),
    itinerary: slices,
  };
}

async function cancelOrder(state, args) {
  const gate = needsAccount() ?? (await linkGate(state));
  if (gate) return gate;
  if (state.behalf) {
    const check = await rest(
      `/orders?duffel_order_id=eq.${encodeURIComponent(args.order_id)}&select=on_behalf_user_id`,
    );
    if (check.body?.[0]?.on_behalf_user_id !== state.behalf.user_id) {
      return { error: "That order belongs to a different traveler." };
    }
  }
  if (args.confirmed !== true) {
    const quote = await api(`/api/orders/${args.order_id}/cancel`, { method: "POST" });
    if (!quote.ok) return { error: `Cancel quote failed: ${quote.body?.error ?? quote.status}` };
    return {
      needs_confirmation: true,
      cancellation_id: quote.body.cancellationId,
      refund: `${quote.body.refundAmount ?? "per fare rules"} ${quote.body.refundCurrency ?? ""}`.trim(),
      message: 'Ask the traveler to reply "yes" to confirm the cancellation.',
    };
  }
  const done = await api(`/api/orders/${args.order_id}/cancel/confirm`, {
    method: "POST",
    body: JSON.stringify({ cancellationId: args.cancellation_id }),
  });
  if (!done.ok) return { error: `Cancel failed: ${done.body?.error ?? done.status}` };
  return { cancelled: true };
}

async function priceCalendar(args) {
  const from = await resolvePlace(args.origin);
  const to = await resolvePlace(args.destination);
  if (!from || !to) return { error: "Couldn't resolve those places." };
  let { start, end } = args;
  if (args.month && /^\d{4}-\d{2}$/.test(args.month)) {
    start = `${args.month}-01`;
    const [y, m] = args.month.split("-").map(Number);
    end = `${args.month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
  }
  const params = new URLSearchParams({ origin: from.iata, destination: to.iata });
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  const res = await api(`/api/price-calendar?${params}`);
  if (!res.ok) return { error: "Calendar unavailable." };
  const prices = res.body.prices ?? [];
  if (prices.length === 0) return { error: "No data for that window." };
  const cheapest = [...prices].sort((a, b) => a.amount - b.amount).slice(0, 6);
  return {
    route: `${from.iata}→${to.iata}`,
    average_usd: res.body.average_amount,
    cheapest_days: cheapest.map(
      (p) => `${p.date} ${p.source === "estimate" ? "~" : ""}$${p.amount} (${p.tier})`,
    ),
    note: "~ marks estimates; searched days show observed fares.",
  };
}

async function manageWatches(state, args) {
  const gate = needsAccount() ?? ownerOnly(state, "Price watches") ?? (await linkGate(state));
  if (gate) return gate;
  if (args.action === "add") {
    const offer = state.offers[(args.index ?? 0) - 1];
    if (!offer) return { error: `No option ${args.index} — search first.` };
    const flights = offer.slices
      .flatMap((s) => s.segments.map((seg) => seg.flightNumber.replace(/\s/g, "")))
      .join(",");
    const dates = offer.slices.map((s) => s.departure.slice(0, 10)).join("|");
    const cabin = state.lastRoute?.cabin ?? "economy";
    const res = await api("/api/watches", {
      method: "POST",
      body: JSON.stringify({
        itineraryKey: `${flights}@${dates}@${cabin}`,
        searchUrl: state.lastSearchUrl ?? "/",
        label: `${offer.slices[0]?.origin} ${offer.slices.length > 1 ? "⇄" : "→"} ${offer.slices[0]?.destination} · ${offer.slices[0]?.departure.slice(0, 10)}`,
        cabin,
        priceUSD: Math.round(offer.displayUSD),
      }),
    });
    if (!res.ok) return { error: `Couldn't save the watch (${res.status}).` };
    return { watching: true, note: "Price changes surface in My Flights (and via list watches)." };
  }
  if (args.action === "remove") {
    if (!args.watch_id) return { error: "watch_id required." };
    const res = await api(`/api/watches/${args.watch_id}`, { method: "DELETE" });
    return res.ok ? { removed: true } : { error: `Couldn't remove (${res.status}).` };
  }
  if (args.action === "refresh") {
    const res = await api("/api/watches/refresh", { method: "POST" });
    return res.ok ? { refreshed: res.body?.refreshed ?? true } : { error: "Refresh failed." };
  }
  const rows = await rest(
    "/watches?select=id,label,cabin,last_price_usd,delta_usd,last_checked_at&order=created_at.desc&limit=12",
  );
  if (!rows.ok) return { error: "Couldn't load watches." };
  return {
    watches: rows.body.map(
      (w) =>
        `${w.label} · ${w.last_price_usd ? `$${w.last_price_usd}` : "unpriced"}${w.delta_usd ? ` (${w.delta_usd > 0 ? "+" : ""}$${w.delta_usd})` : ""} · id ${w.id}`,
    ),
  };
}

/* ------------------------------ account tools ---------------------------- */

const PROFILE_FIELDS = new Set([
  "full_name", "nickname", "describes", "phone", "legal_name", "born_on",
  "passport_number", "passport_country", "passport_expiry",
  "known_traveler_number", "currency", "theme", "confirm_before_booking",
  "summary_cards", "power_saver", "notif_flight_alerts", "notif_watched",
  "notif_checkin", "notif_marketing", "beta_auto_checkin", "beta_price_drop",
  "beta_agent_booking",
]);

async function getProfile(state) {
  const gate = needsAccount() ?? (await linkGate(state));
  if (gate) return gate;
  if (state.behalf) {
    const snapshot = Object.fromEntries(
      Object.entries(state.behalf).filter(
        ([k, v]) => !["linked", "user_id"].includes(k) && v !== null,
      ),
    );
    return { ...snapshot, note: "Read-only here — edit your profile on the website." };
  }
  const rows = await rest("/profiles?select=*");
  const p = rows.body?.[0];
  if (!p) return { error: "Profile not found." };
  const out = {};
  for (const [k, v] of Object.entries(p)) {
    if (v !== null && v !== "" && !["id", "avatar_url", "created_at"].includes(k)) out[k] = v;
  }
  return out;
}

async function updateProfile(state, fields) {
  const gate = needsAccount() ?? ownerOnly(state, "Profile editing") ?? (await linkGate(state));
  if (gate) return gate;
  const patch = {};
  for (const [k, v] of Object.entries(fields ?? {})) {
    if (!PROFILE_FIELDS.has(k)) return { error: `Unknown or protected field: ${k}` };
    patch[k] = v;
  }
  if (Object.keys(patch).length === 0) return { error: "Nothing to update." };
  if (patch.currency && !/^[A-Z]{3}$/.test(patch.currency)) return { error: "currency must be a 3-letter code like USD or PHP." };
  if (patch.theme && !["light", "dark", "system"].includes(patch.theme)) return { error: "theme must be light, dark or system." };
  if (patch.phone && !/^\+[1-9]\d{6,14}$/.test(patch.phone)) return { error: "phone must be international format, e.g. +639171234567." };
  const res = await rest(`/profiles?id=eq.${uid()}`, { method: "PATCH", body: JSON.stringify(patch) });
  if (!res.ok) return { error: `Update failed: ${res.body?.message ?? res.status}` };
  return { updated: Object.keys(patch) };
}

async function manageFriends(state, args) {
  const gate = needsAccount() ?? ownerOnly(state, "Saved friends") ?? (await linkGate(state));
  if (gate) return gate;
  if (args.action === "add") {
    const res = await rest("/friends", {
      method: "POST",
      body: JSON.stringify({
        user_id: uid(),
        given_name: args.given_name,
        family_name: args.family_name,
        born_on: args.born_on,
        gender: args.gender,
        email: args.email ?? "",
        phone: args.phone ?? "",
      }),
    });
    if (!res.ok) return { error: `Couldn't add: ${res.body?.message ?? res.status}` };
    return { added: `${args.given_name} ${args.family_name}`, id: res.body?.[0]?.id };
  }
  if (args.action === "remove") {
    const res = await rest(`/friends?id=eq.${args.friend_id}`, { method: "DELETE" });
    return res.ok ? { removed: true } : { error: "Couldn't remove." };
  }
  const rows = await rest("/friends?select=id,given_name,family_name,born_on,gender&order=created_at.desc&limit=20");
  if (!rows.ok) return { error: "Couldn't load friends." };
  return {
    friends: rows.body.map((f) => `${f.given_name} ${f.family_name} (${f.born_on}, ${f.gender}) · id ${f.id}`),
    note: "Use these details as passengers when booking for them.",
  };
}

async function manageLoyalty(state, args) {
  const gate = needsAccount() ?? ownerOnly(state, "Loyalty programmes") ?? (await linkGate(state));
  if (gate) return gate;
  if (args.action === "add") {
    if (!/^[A-Z0-9]{2}$/i.test(args.airline_iata ?? "")) return { error: "airline_iata must be the 2-letter airline code (e.g. PR, ZZ)." };
    const res = await rest("/loyalty_programmes", {
      method: "POST",
      body: JSON.stringify({
        user_id: uid(),
        airline_iata: args.airline_iata.toUpperCase(),
        airline_name: args.airline_name ?? args.airline_iata.toUpperCase(),
        account_number: args.account_number,
      }),
    });
    if (!res.ok) return { error: `Couldn't add: ${res.body?.message ?? res.status}` };
    return { added: true, note: "Attached automatically to future bookings." };
  }
  if (args.action === "remove") {
    const res = await rest(`/loyalty_programmes?id=eq.${args.id}`, { method: "DELETE" });
    return res.ok ? { removed: true } : { error: "Couldn't remove." };
  }
  const rows = await rest("/loyalty_programmes?select=id,airline_iata,airline_name,account_number");
  if (!rows.ok) return { error: "Couldn't load loyalty programmes." };
  return { programmes: rows.body.map((l) => `${l.airline_name} (${l.airline_iata}) ${l.account_number} · id ${l.id}`) };
}

async function manageCards(state, args) {
  const gate = needsAccount() ?? ownerOnly(state, "The card vault") ?? (await linkGate(state));
  if (gate) return gate;
  if (args.action === "add") {
    if (!/^\d{4}$/.test(args.last4 ?? "")) return { error: "last4 must be 4 digits (the vault is display-only — never send full card numbers)." };
    const existing = await rest("/payment_cards?select=id");
    const res = await rest("/payment_cards", {
      method: "POST",
      body: JSON.stringify({
        user_id: uid(),
        brand: (args.brand ?? "visa").toLowerCase(),
        last4: args.last4,
        exp_month: args.exp_month,
        exp_year: args.exp_year,
        cardholder: args.cardholder ?? null,
        is_default: (existing.body?.length ?? 0) === 0,
      }),
    });
    if (!res.ok) return { error: `Couldn't add: ${res.body?.message ?? res.status}` };
    return { added: true, note: "Display-only vault — payments always use the Duffel test balance." };
  }
  if (args.action === "remove") {
    const res = await rest(`/payment_cards?id=eq.${args.id}`, { method: "DELETE" });
    return res.ok ? { removed: true } : { error: "Couldn't remove." };
  }
  const rows = await rest("/payment_cards?select=id,brand,last4,exp_month,exp_year,is_default");
  if (!rows.ok) return { error: "Couldn't load cards." };
  return {
    cards: rows.body.map(
      (c) => `${c.brand} •••• ${c.last4} ${String(c.exp_month).padStart(2, "0")}/${c.exp_year}${c.is_default ? " (default)" : ""} · id ${c.id}`,
    ),
  };
}

async function sendFeedback(state, message) {
  const gate = needsAccount() ?? (await linkGate(state));
  if (gate) return gate;
  const res = await rest("/feedback", {
    method: "POST",
    body: JSON.stringify({ user_id: uid(), message }),
  });
  return res.ok ? { sent: true } : { error: "Couldn't log feedback." };
}

/* ----------------------------- Claude agent ------------------------------ */

const PASSENGER_PROPS = {
  given_name: { type: "string" },
  family_name: { type: "string" },
  born_on: { type: "string", description: "YYYY-MM-DD" },
  gender: { type: "string", enum: ["m", "f"] },
  email: { type: "string" },
  phone: { type: "string" },
  passport_number: { type: "string" },
  passport_country: { type: "string", description: "2-letter country code" },
  passport_expiry: { type: "string", description: "YYYY-MM-DD" },
};

const TOOLS = [
  {
    name: "search_flights",
    description:
      "Search live flights. Origin/destination take city names or 3-letter codes. adults sets traveler count (1-9).",
    input_schema: {
      type: "object",
      properties: {
        origin: { type: "string" },
        destination: { type: "string" },
        depart_date: { type: "string" },
        return_date: { type: "string" },
        cabin: { type: "string", enum: ["economy", "premium_economy", "business", "first"] },
        adults: { type: "integer" },
      },
      required: ["origin", "destination", "depart_date"],
    },
  },
  {
    name: "offer_details",
    description: "Details for a numbered option: refund/change rules, bags, passport requirement, Protect fee, flights.",
    input_schema: { type: "object", properties: { index: { type: "integer" } }, required: ["index"] },
  },
  {
    name: "list_seats",
    description: "Available seats + prices for a numbered option (test mode: reliable on Duffel Airways).",
    input_schema: { type: "object", properties: { index: { type: "integer" } }, required: ["index"] },
  },
  {
    name: "book_flight",
    description:
      "Book a numbered option. passengers must match the fare's traveler count, in order. Optional: bags (count), seats (designators, one per traveler), protect. Set confirmed=true ONLY after the traveler explicitly agreed to the quoted total in this conversation. Saved loyalty programmes attach automatically.",
    input_schema: {
      type: "object",
      properties: {
        index: { type: "integer" },
        passengers: {
          type: "array",
          items: { type: "object", properties: PASSENGER_PROPS, required: ["given_name", "family_name", "born_on", "gender"] },
        },
        bags: { type: "integer" },
        seats: { type: "array", items: { type: "string" } },
        protect: { type: "boolean" },
        confirmed: { type: "boolean" },
      },
      required: ["index", "passengers", "confirmed"],
    },
  },
  { name: "my_flights", description: "List recent bookings on this account.", input_schema: { type: "object", properties: {} } },
  {
    name: "order_details",
    description: "Full detail for one booking (itinerary, totals, Protect, refund) by order id.",
    input_schema: { type: "object", properties: { order_id: { type: "string" } }, required: ["order_id"] },
  },
  {
    name: "cancel_order",
    description:
      "Cancel a booking. First call without confirmed for the refund quote; then confirmed=true plus cancellation_id after the traveler agreed.",
    input_schema: {
      type: "object",
      properties: { order_id: { type: "string" }, cancellation_id: { type: "string" }, confirmed: { type: "boolean" } },
      required: ["order_id"],
    },
  },
  {
    name: "price_calendar",
    description: "Cheapest days to fly a route. Give month=YYYY-MM or start/end dates.",
    input_schema: {
      type: "object",
      properties: {
        origin: { type: "string" },
        destination: { type: "string" },
        month: { type: "string" },
        start: { type: "string" },
        end: { type: "string" },
      },
      required: ["origin", "destination"],
    },
  },
  {
    name: "manage_watches",
    description: "Price watches: list, add (index from last search), remove (watch_id), or refresh stale prices.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list", "add", "remove", "refresh"] },
        index: { type: "integer" },
        watch_id: { type: "string" },
      },
      required: ["action"],
    },
  },
  { name: "get_profile", description: "Show the account profile (contact, travel documents, preferences, points).", input_schema: { type: "object", properties: {} } },
  {
    name: "update_profile",
    description:
      "Edit profile fields: full_name, nickname, describes, phone (+countrycode), legal_name, born_on, passport_number/passport_country/passport_expiry, known_traveler_number, currency (3 letters), theme (light|dark|system), and boolean toggles confirm_before_booking, summary_cards, power_saver, notif_flight_alerts, notif_watched, notif_checkin, notif_marketing, beta_auto_checkin, beta_price_drop, beta_agent_booking.",
    input_schema: { type: "object", properties: { fields: { type: "object" } }, required: ["fields"] },
  },
  {
    name: "manage_friends",
    description: "Saved co-travelers: list, add (name/dob/gender), remove (friend_id). Use their details as booking passengers.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list", "add", "remove"] },
        given_name: { type: "string" },
        family_name: { type: "string" },
        born_on: { type: "string" },
        gender: { type: "string", enum: ["m", "f"] },
        email: { type: "string" },
        phone: { type: "string" },
        friend_id: { type: "string" },
      },
      required: ["action"],
    },
  },
  {
    name: "manage_loyalty",
    description: "Frequent-flyer programmes: list, add (airline_iata 2 letters + account_number), remove (id). They auto-attach to bookings.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list", "add", "remove"] },
        airline_iata: { type: "string" },
        airline_name: { type: "string" },
        account_number: { type: "string" },
        id: { type: "string" },
      },
      required: ["action"],
    },
  },
  {
    name: "manage_cards",
    description:
      "Display-only card vault: list, add (brand + last4 + exp_month + exp_year — NEVER a full card number), remove (id). Payments always use test balance.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list", "add", "remove"] },
        brand: { type: "string" },
        last4: { type: "string" },
        exp_month: { type: "integer" },
        exp_year: { type: "integer" },
        cardholder: { type: "string" },
        id: { type: "string" },
      },
      required: ["action"],
    },
  },
  {
    name: "send_feedback",
    description: "Log feedback about the product.",
    input_schema: { type: "object", properties: { message: { type: "string" } }, required: ["message"] },
  },
];

const SYSTEM = `You are Soar's iMessage travel agent (a private STUDY CLONE running on Duffel's test sandbox — fares are fake, payments use test balance, no real tickets are issued; never claim otherwise).
Today is ${new Date().toISOString().slice(0, 10)}.
Style: text-message short. Plain text only — no markdown, no bullets, at most a few numbered lines. One question at a time.
Intro: when someone greets you or opens a new conversation, start with: "Hi, this is the Flysoar clone ✈️ I can search flights, compare prices and seats, book and cancel trips, watch fares, and manage your account — all over text." Then ask what they need. Don't repeat the intro once the conversation is underway.
You can do everything the app can: search, compare, seat maps, bags, multi-traveler bookings (friends' saved details help), Protect, cancellations, price calendars, watches, and full account management (profile, phone, travel documents, preferences, notifications, friends, loyalty, card vault, feedback).
Account linking: some tools reply with a sign-in link for unlinked travelers — pass that URL along verbatim and tell them to tap it, sign in, then text again. Linked travelers get bookings on their own Soar account; profile/friends/watch management happens on the website for them.
Hard rules: resolve vague dates to YYYY-MM-DD (ask if unsure). Before book_flight or a cancel confirmation you MUST state the exact quoted total/refund and get an explicit yes — only then pass confirmed=true. Collect every traveler's name, date of birth and gender (plus passports when required). NEVER accept full card numbers — the vault stores brand + last 4 only. Account deletion is not something you can do; point people to the web app's Settings.`;

async function runClaude(state, userText) {
  state.history.push({ role: "user", content: userText });
  while (state.history.length > 24) state.history.shift();
  if (state.history[0]?.role !== "user") state.history.shift();

  for (let round = 0; round < 10; round++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        system: SYSTEM,
        tools: TOOLS,
        messages: state.history,
      }),
    });
    const msg = await res.json();
    if (!res.ok) {
      return `Agent error: ${msg.error?.message ?? res.status}. Check ANTHROPIC_API_KEY.`;
    }
    state.history.push({ role: "assistant", content: msg.content });

    const toolUses = msg.content.filter((b) => b.type === "tool_use");
    if (toolUses.length === 0 || msg.stop_reason !== "tool_use") {
      return msg.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    }
    const results = [];
    for (const use of toolUses) {
      const result = await execTool(state, use.name, use.input);
      results.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(result) });
    }
    state.history.push({ role: "user", content: results });
  }
  return "Sorry — that took too many steps. Try a simpler request.";
}

/** Shared tool dispatch for both model providers. */
async function execTool(state, name, a) {
  try {
    if (name === "search_flights") return await searchFlights(state, a);
    if (name === "offer_details") return await offerDetails(state, a.index);
    if (name === "list_seats") return await listSeats(state, a.index);
    if (name === "book_flight") return await bookFlight(state, a);
    if (name === "my_flights") return await myFlights(state);
    if (name === "order_details") return await orderDetails(state, a.order_id);
    if (name === "cancel_order") return await cancelOrder(state, a);
    if (name === "price_calendar") return await priceCalendar(a);
    if (name === "manage_watches") return await manageWatches(state, a);
    if (name === "get_profile") return await getProfile(state);
    if (name === "update_profile") return await updateProfile(state, a.fields);
    if (name === "manage_friends") return await manageFriends(state, a);
    if (name === "manage_loyalty") return await manageLoyalty(state, a);
    if (name === "manage_cards") return await manageCards(state, a);
    if (name === "send_feedback") return await sendFeedback(state, a.message);
    return { error: `Unknown tool ${name}` };
  } catch (err) {
    return { error: String(err?.message ?? err) };
  }
}

/* ------------------------------ Gemini agent ------------------------------ */

const GEMINI_MODEL = env.SOAR_AGENT_MODEL_GEMINI ?? "gemini-2.5-flash";

/**
 * Same agent on Google's Gemini API (free tier available) — history kept in
 * Gemini's contents format on state.ghistory.
 */
async function runGemini(state, userText) {
  state.ghistory ??= [];
  state.ghistory.push({ role: "user", parts: [{ text: userText }] });
  while (state.ghistory.length > 30) state.ghistory.shift();
  if (state.ghistory[0]?.role !== "user") state.ghistory.shift();

  const declarations = TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.input_schema,
  }));

  for (let round = 0; round < 10; round++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM }] },
          tools: [{ functionDeclarations: declarations }],
          contents: state.ghistory,
          generationConfig: { maxOutputTokens: 700 },
        }),
      },
    );
    const msg = await res.json();
    if (!res.ok) {
      return `Agent error: ${msg.error?.message ?? res.status}. Check GEMINI_API_KEY.`;
    }
    const parts = msg.candidates?.[0]?.content?.parts ?? [];
    state.ghistory.push({ role: "model", parts });

    const calls = parts.filter((p) => p.functionCall);
    if (calls.length === 0) {
      return parts.map((p) => p.text ?? "").join("").trim() || "…";
    }
    const responses = [];
    for (const call of calls) {
      const result = await execTool(state, call.functionCall.name, call.functionCall.args ?? {});
      responses.push({
        functionResponse: { name: call.functionCall.name, response: { result } },
      });
    }
    state.ghistory.push({ role: "user", parts: responses });
  }
  return "Sorry — that took too many steps. Try a simpler request.";
}

/* --------------------------- command fallback ---------------------------- */

const HELP = `Soar agent commands:
search <from> <to> <YYYY-MM-DD> [return]   details <n>   seats <n>
book <n> <First> <Last> <YYYY-MM-DD> <m|f> [bags=N] [seat=12A] [protect]
flights   order <order id>   cancel <order id>
calendar <from> <to> <YYYY-MM>
watch <n>   watches   unwatch <id>
profile   set <field> <value>
friends   friend add <First> <Last> <YYYY-MM-DD> <m|f>   friend rm <id>
loyalty   loyalty add <XX> <number>   loyalty rm <id>
cards   card add <brand> <last4> <MM> <YYYY>   card rm <id>
feedback <text>   yes (confirms a pending booking/cancel)`;

async function runCommands(state, text) {
  const t = text.trim();
  const [cmd, ...rest_] = t.split(/\s+/);
  const lower = (cmd ?? "").toLowerCase();
  const sub = (rest_[0] ?? "").toLowerCase();

  if (lower === "yes" && state.pending) {
    const pending = state.pending;
    state.pending = null;
    const result =
      pending.kind === "book"
        ? await bookFlight(state, { ...pending.args, confirmed: true })
        : await cancelOrder(state, { ...pending.args, confirmed: true });
    if (result.error) return result.error;
    if (pending.kind === "book")
      return `Booked! PNR ${result.pnr} — charged ${result.charged}. Order ${result.order_id}.`;
    return "Cancelled. Any refund follows the quote.";
  }
  if (lower === "search" && rest_.length >= 3) {
    const [from, to, dep, ret] = rest_;
    const result = await searchFlights(state, { origin: from, destination: to, depart_date: dep, return_date: ret });
    if (result.error) return result.error;
    return `${result.route} — ${result.count} found (test fares):\n${result.top.join("\n")}\nReply "details <n>", "seats <n>" or "book <n> First Last YYYY-MM-DD m|f".`;
  }
  if (lower === "details" && rest_[0]) {
    const result = await offerDetails(state, Number(rest_[0]));
    return result.error ?? JSON.stringify(result, null, 1).replace(/[{}",[\]]/g, "").replace(/\n\s*\n/g, "\n").trim();
  }
  if (lower === "seats" && rest_[0]) {
    const result = await listSeats(state, Number(rest_[0]));
    return result.error ?? `Seats: ${result.available.join(", ")}`;
  }
  if (lower === "book" && rest_.length >= 5) {
    const [n, first, last_, dob, gender, ...extras] = rest_;
    const opts = Object.fromEntries(extras.filter((e) => e.includes("=")).map((e) => e.split("=")));
    const args = {
      index: Number(n),
      passengers: [{ given_name: first, family_name: last_, born_on: dob, gender }],
      bags: opts.bags ? Number(opts.bags) : undefined,
      seats: opts.seat ? [opts.seat] : undefined,
      protect: extras.includes("protect"),
    };
    const result = await bookFlight(state, { ...args, confirmed: false });
    if (result.error) return result.error;
    state.pending = { kind: "book", args };
    return result.message.replace("The traveler must reply", "Reply").replace(" before you call book_flight with confirmed=true", "");
  }
  if (lower === "flights") {
    const result = await myFlights(state);
    if (result.error) return result.error;
    return result.flights.length ? result.flights.join("\n") : "No bookings yet.";
  }
  if (lower === "order" && rest_[0]) {
    const result = await orderDetails(state, rest_[0]);
    return result.error ?? JSON.stringify(result, null, 1).replace(/[{}",[\]]/g, "").replace(/\n\s*\n/g, "\n").trim();
  }
  if (lower === "cancel" && rest_[0]) {
    const result = await cancelOrder(state, { order_id: rest_[0] });
    if (result.error) return result.error;
    state.pending = { kind: "cancel", args: { order_id: rest_[0], cancellation_id: result.cancellation_id } };
    return `Refund: ${result.refund}. Reply "yes" to confirm cancellation.`;
  }
  if (lower === "calendar" && rest_.length >= 3) {
    const result = await priceCalendar({ origin: rest_[0], destination: rest_[1], month: rest_[2] });
    return result.error ?? `${result.route} avg $${result.average_usd}\n${result.cheapest_days.join("\n")}`;
  }
  if (lower === "watch" && rest_[0]) {
    const result = await manageWatches(state, { action: "add", index: Number(rest_[0]) });
    return result.error ?? "Watching — price changes surface here and in My Flights.";
  }
  if (lower === "watches") {
    const result = await manageWatches(state, { action: "list" });
    return result.error ?? (result.watches.length ? result.watches.join("\n") : "No watches.");
  }
  if (lower === "unwatch" && rest_[0]) {
    const result = await manageWatches(state, { action: "remove", watch_id: rest_[0] });
    return result.error ?? "Watch removed.";
  }
  if (lower === "profile") {
    const result = await getProfile(state);
    return result.error ?? JSON.stringify(result, null, 1).replace(/[{}",]/g, "").trim();
  }
  if (lower === "set" && rest_.length >= 2) {
    const [field, ...value] = rest_;
    let v = value.join(" ");
    if (v === "true") v = true;
    else if (v === "false") v = false;
    const result = await updateProfile(state, { [field]: v });
    return result.error ?? `Updated ${result.updated.join(", ")}.`;
  }
  if (lower === "friends") {
    const result = await manageFriends(state, { action: "list" });
    return result.error ?? (result.friends.length ? result.friends.join("\n") : "No saved friends.");
  }
  if (lower === "friend" && sub === "add" && rest_.length >= 5) {
    const [, first, last_, dob, gender] = rest_;
    const result = await manageFriends(state, { action: "add", given_name: first, family_name: last_, born_on: dob, gender });
    return result.error ?? `Saved ${result.added}.`;
  }
  if (lower === "friend" && sub === "rm" && rest_[1]) {
    const result = await manageFriends(state, { action: "remove", friend_id: rest_[1] });
    return result.error ?? "Removed.";
  }
  if (lower === "loyalty" && rest_.length === 0) {
    const result = await manageLoyalty(state, { action: "list" });
    return result.error ?? (result.programmes.length ? result.programmes.join("\n") : "No loyalty programmes.");
  }
  if (lower === "loyalty" && sub === "add" && rest_.length >= 3) {
    const result = await manageLoyalty(state, { action: "add", airline_iata: rest_[1], account_number: rest_[2] });
    return result.error ?? "Added — it attaches to future bookings.";
  }
  if (lower === "loyalty" && sub === "rm" && rest_[1]) {
    const result = await manageLoyalty(state, { action: "remove", id: rest_[1] });
    return result.error ?? "Removed.";
  }
  if (lower === "cards") {
    const result = await manageCards(state, { action: "list" });
    return result.error ?? (result.cards.length ? result.cards.join("\n") : "No cards in the vault.");
  }
  if (lower === "card" && sub === "add" && rest_.length >= 5) {
    const [, brand, last4, mm, yyyy] = rest_;
    const result = await manageCards(state, { action: "add", brand, last4, exp_month: Number(mm), exp_year: Number(yyyy) });
    return result.error ?? "Card saved (display-only vault).";
  }
  if (lower === "card" && sub === "rm" && rest_[1]) {
    const result = await manageCards(state, { action: "remove", id: rest_[1] });
    return result.error ?? "Removed.";
  }
  if (lower === "feedback" && rest_.length > 0) {
    const result = await sendFeedback(state, rest_.join(" "));
    return result.error ?? "Thanks — feedback logged.";
  }
  return HELP;
}

/* ------------------------------ Messages IO ------------------------------ */

const CHAT_DB = `${homedir()}/Library/Messages/chat.db`;

async function sqlJson(query) {
  const { stdout } = await execFileP("/usr/bin/sqlite3", ["-json", "-readonly", CHAT_DB, query]);
  return stdout.trim() ? JSON.parse(stdout) : [];
}

function decodeAttributedBody(hexStr) {
  if (!hexStr) return "";
  const raw = Buffer.from(hexStr, "hex").toString("latin1");
  const at = raw.indexOf("NSString");
  const slice = at === -1 ? raw : raw.slice(at + 8);
  const runs = slice.match(/[\x20-\x7E -￿]{2,}/g) ?? [];
  return runs.sort((a, b) => b.length - a.length)[0]?.replace(/^[+]+/, "").trim() ?? "";
}

const normalize = (h) => (h ?? "").toLowerCase().replace(/[\s\-()]/g, "");

function allowed(handle, allowList) {
  const n = normalize(handle);
  return allowList.some((a) => {
    const na = normalize(a);
    if (n === na) return true;
    const digits = (s) => s.replace(/\D/g, "");
    return digits(na).length >= 7 && digits(n).endsWith(digits(na).slice(-10));
  });
}

/** Short codes (5–6 digit senders) are automated SMS — never a traveler. */
function isShortCode(handle) {
  const h = normalize(handle);
  return !h.includes("@") && h.replace(/\D/g, "").length < 8;
}

/** Sliding-window rate limiter for open mode. */
function makeLimiter(perSender, global) {
  const bySender = new Map();
  const all = [];
  const prune = (arr, now) => {
    while (arr.length && now - arr[0] > 3600_000) arr.shift();
  };
  return (sender) => {
    const now = Date.now();
    prune(all, now);
    if (all.length >= global) return false;
    const mine = bySender.get(sender) ?? [];
    prune(mine, now);
    if (mine.length >= perSender) return false;
    mine.push(now);
    all.push(now);
    bySender.set(sender, mine);
    return true;
  };
}

async function sendMessage(handle, text) {
  const script = `on run argv
  tell application "Messages"
    set svc to 1st account whose service type = iMessage
    send (item 2 of argv) to participant (item 1 of argv) of svc
  end tell
end run`;
  await execFileP("/usr/bin/osascript", ["-e", script, handle, text]);
}

/* --------------------------------- main ---------------------------------- */

const states = new Map();
const stateFor = (key) => {
  if (!states.has(key)) {
    // Open mode can accumulate stranger threads — drop the oldest.
    if (states.size >= 200) states.delete(states.keys().next().value);
    states.set(key, { history: [], offers: [], pending: null });
  }
  return states.get(key);
};

async function handleText(chatKey, text) {
  const state = stateFor(chatKey);
  try {
    if (env.ANTHROPIC_API_KEY) return await runClaude(state, text);
    if (env.GEMINI_API_KEY) return await runGemini(state, text);
    return await runCommands(state, text);
  } catch (err) {
    return `Something broke: ${String(err?.message ?? err).slice(0, 160)}`;
  }
}

async function replLoop() {
  const brain = env.ANTHROPIC_API_KEY
    ? `Claude (${MODEL})`
    : env.GEMINI_API_KEY
      ? `Gemini (${GEMINI_MODEL})`
      : "command mode (no API key)";
  console.log(
    `Soar agent REPL · ${brain} · booking ${env.SOAR_AGENT_EMAIL ? "on" : "off"} · base ${BASE}`,
  );
  if (!env.ANTHROPIC_API_KEY && !env.GEMINI_API_KEY) console.log(HELP);
  stateFor("repl").owner = true; // the terminal is the owner seat
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.setPrompt("you> ");
  rl.prompt();
  rl.on("line", async (line) => {
    if (!line.trim()) return rl.prompt();
    const reply = await handleText("repl", line);
    console.log(`\n${MARKER}${reply}\n`);
    rl.prompt();
  });
}

async function daemonLoop() {
  const allowList = (env.SOAR_AGENT_ALLOW ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (allowList.length === 0) {
    console.error(
      "SOAR_AGENT_ALLOW is required in daemon mode (comma-separated handles, or * to answer everyone).",
    );
    process.exit(1);
  }
  const openMode = allowList.includes("*");
  const explicit = allowList.filter((a) => a !== "*");
  const rateOk = makeLimiter(
    Number(env.SOAR_AGENT_RATE ?? 30),
    Number(env.SOAR_AGENT_RATE_GLOBAL ?? 120),
  );

  let last;
  try {
    last = (await sqlJson("SELECT COALESCE(MAX(ROWID),0) AS m FROM message"))[0].m;
  } catch (err) {
    console.error(
      `Cannot read ${CHAT_DB} — grant Full Disk Access to your terminal (System Settings → Privacy & Security), then retry.\n${err.message}`,
    );
    process.exit(1);
  }
  console.log(
    `Soar iMessage agent up · base ${BASE} · ${openMode ? "OPEN to everyone (1:1 iMessage only, rate-limited)" : `watching for ${explicit.join(", ")}`} · replies prefixed "${MARKER.trim()}"`,
  );

  setInterval(async () => {
    let rows;
    try {
      rows = await sqlJson(`
        SELECT m.ROWID AS rowid, m.is_from_me, m.text, m.service,
               hex(m.attributedBody) AS ab,
               h.id AS handle, c.chat_identifier AS chat, c.style AS style
        FROM message m
        JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
        JOIN chat c ON c.ROWID = cmj.chat_id
        LEFT JOIN handle h ON h.ROWID = m.handle_id
        WHERE m.ROWID > ${Number(last)}
        ORDER BY m.ROWID ASC LIMIT 50`);
    } catch {
      return; // transient lock — next tick
    }
    for (const row of rows) {
      last = Math.max(last, row.rowid);
      const text = (row.text ?? "").trim() || decodeAttributedBody(row.ab);
      if (!text || text.startsWith(MARKER.trim())) continue;
      // DMs only — never speak in group threads (style 43).
      if (row.style !== 45) continue;
      const sender = row.handle ?? row.chat;
      if (row.is_from_me) {
        // Our own outgoing texts count as commands only in an explicitly
        // listed self-chat — never in open mode (those are you texting
        // friends, not the agent).
        if (!allowed(row.chat, explicit)) continue;
      } else if (openMode) {
        if (!allowed(sender, explicit)) {
          if (row.service !== "iMessage") continue; // no SMS/short-code noise
          if (isShortCode(sender)) continue;
          if (!rateOk(normalize(sender))) {
            console.log(`[rate-limited] ${sender}`);
            continue;
          }
        }
      } else if (!allowed(sender, explicit)) {
        continue;
      }
      console.log(`[${new Date().toISOString()}] ${sender}: ${text}`);
      // Sender context: the owner acts on the agent account directly;
      // everyone else acts on their linked web account (or gets a link).
      const st = stateFor(row.chat ?? sender);
      st.handle = normalize(sender);
      st.owner = row.is_from_me ? true : allowed(sender, explicit);
      st.behalf = st.owner ? null : await linkedContext(st.handle);
      const reply = await handleText(row.chat ?? sender, text);
      try {
        await sendMessage(row.handle ?? row.chat, `${MARKER}${reply}`);
        console.log(`  → ${reply.split("\n")[0]}…`);
      } catch (err) {
        console.error(`  send failed: ${err.message}`);
      }
    }
  }, POLL_MS);
}

if (!SUPA_URL || !SUPA_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in .env");
  process.exit(1);
}
if (REPL) {
  await replLoop();
} else {
  await daemonLoop();
}
